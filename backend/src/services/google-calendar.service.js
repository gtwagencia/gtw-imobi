'use strict';

const { google } = require('googleapis');
const { query }  = require('../config/database');

function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

function getRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI ||
    `${process.env.API_URL || 'http://localhost:4000'}/api/v1/integrations/google/callback`;
}

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    getRedirectUri()
  );
}

function getAuthUrl(userId) {
  const client = getOAuthClient();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state:  userId,
    prompt: 'consent', // garante que o refresh_token sempre vem
  });
}

async function saveTokens(userId, tokens, googleEmail) {
  await query(
    `INSERT INTO user_google_integrations (user_id, access_token, refresh_token, token_expiry, google_email)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       access_token  = EXCLUDED.access_token,
       refresh_token = COALESCE(EXCLUDED.refresh_token, user_google_integrations.refresh_token),
       token_expiry  = EXCLUDED.token_expiry,
       google_email  = EXCLUDED.google_email,
       updated_at    = NOW()`,
    [userId, tokens.access_token, tokens.refresh_token || null,
     tokens.expiry_date ? new Date(tokens.expiry_date) : null, googleEmail || null]
  );
}

async function disconnect(userId) {
  await query('DELETE FROM user_google_integrations WHERE user_id = $1', [userId]);
}

async function isConnected(userId) {
  const r = await query(
    'SELECT id FROM user_google_integrations WHERE user_id = $1', [userId]
  );
  return r.rows.length > 0;
}

async function getStatus(userId) {
  const r = await query(
    'SELECT google_email FROM user_google_integrations WHERE user_id = $1', [userId]
  );
  if (!r.rows.length) return { connected: false, googleEmail: null };
  return { connected: true, googleEmail: r.rows[0].google_email };
}

// Cria um OAuth2 client autenticado para o usuário, com auto-refresh de token
async function getAuthorizedClient(userId) {
  const r = await query(
    `SELECT access_token, refresh_token, token_expiry
     FROM user_google_integrations WHERE user_id = $1`,
    [userId]
  );
  if (!r.rows.length) return null;

  const { access_token, refresh_token, token_expiry } = r.rows[0];
  const client = getOAuthClient();
  client.setCredentials({
    access_token,
    refresh_token,
    expiry_date: token_expiry ? new Date(token_expiry).getTime() : undefined,
  });

  // Persiste novos tokens quando o access_token for renovado automaticamente
  client.on('tokens', (tokens) => {
    const updates = [];
    const vals    = [];
    let   idx     = 1;
    if (tokens.access_token) { updates.push(`access_token = $${idx++}`); vals.push(tokens.access_token); }
    if (tokens.expiry_date)  { updates.push(`token_expiry = $${idx++}`); vals.push(new Date(tokens.expiry_date)); }
    if (updates.length) {
      vals.push(userId);
      query(
        `UPDATE user_google_integrations SET ${updates.join(', ')}, updated_at = NOW() WHERE user_id = $${idx}`,
        vals
      ).catch(err => console.error('[gcal] token refresh persist error:', err.message));
    }
  });

  return client;
}

// Retorna { start, end } no formato dateTime com 1h de duração
// Preserva o offset do ISO original para não distorcer o horário local
function toEventTimes(date) {
  const start = new Date(date);
  const end   = new Date(start.getTime() + 60 * 60 * 1000); // +1h
  return {
    start: { dateTime: start.toISOString() },
    end:   { dateTime: end.toISOString() },
  };
}

// ── Operações de evento ───────────────────────────────────────────────────────

async function createEvent(userId, ticketId, { title, description, dueDate }) {
  if (!isConfigured() || !dueDate) return;
  const client = await getAuthorizedClient(userId);
  if (!client) return;

  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const times    = toEventTimes(dueDate);

    const res = await calendar.events.insert({
      calendarId:  'primary',
      requestBody: {
        summary:     `[Ticket] ${title}`,
        description: description || '',
        ...times,
        extendedProperties: { private: { gtw_ticket_id: ticketId } },
      },
    });

    await query(
      `INSERT INTO ticket_google_events (ticket_id, user_id, event_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (ticket_id, user_id) DO UPDATE SET event_id = EXCLUDED.event_id`,
      [ticketId, userId, res.data.id]
    );
  } catch (err) {
    console.error('[gcal] createEvent error:', err.message);
  }
}

async function updateEvent(userId, ticketId, { title, description, dueDate }) {
  if (!isConfigured()) return;
  const client = await getAuthorizedClient(userId);
  if (!client) return;

  const evR = await query(
    'SELECT event_id FROM ticket_google_events WHERE ticket_id = $1 AND user_id = $2',
    [ticketId, userId]
  );
  if (!evR.rows.length) {
    // Evento ainda não existe — cria agora se tiver data
    if (dueDate) await createEvent(userId, ticketId, { title, description, dueDate });
    return;
  }

  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const patch = {};
    if (title !== undefined)       patch.summary     = `[Ticket] ${title}`;
    if (description !== undefined) patch.description = description || '';
    if (dueDate !== undefined && dueDate !== null) {
      const times  = toEventTimes(dueDate);
      patch.start  = times.start;
      patch.end    = times.end;
    }
    if (!Object.keys(patch).length) return;

    await calendar.events.patch({
      calendarId: 'primary',
      eventId:    evR.rows[0].event_id,
      requestBody: patch,
    });
  } catch (err) {
    if (err.code === 404 || err.status === 404) {
      // Evento foi deletado manualmente no Google — limpa o registro
      await query(
        'DELETE FROM ticket_google_events WHERE ticket_id = $1 AND user_id = $2',
        [ticketId, userId]
      );
    } else {
      console.error('[gcal] updateEvent error:', err.message);
    }
  }
}

async function deleteEvent(userId, ticketId) {
  if (!isConfigured()) return;
  const client = await getAuthorizedClient(userId);
  if (!client) return;

  const evR = await query(
    'SELECT event_id FROM ticket_google_events WHERE ticket_id = $1 AND user_id = $2',
    [ticketId, userId]
  );
  if (!evR.rows.length) return;

  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    await calendar.events.delete({
      calendarId: 'primary',
      eventId:    evR.rows[0].event_id,
    });
  } catch (err) {
    if (err.code !== 404 && err.status !== 404) {
      console.error('[gcal] deleteEvent error:', err.message);
    }
  }

  await query(
    'DELETE FROM ticket_google_events WHERE ticket_id = $1 AND user_id = $2',
    [ticketId, userId]
  );
}

async function listEvents(userId, from, to) {
  if (!isConfigured()) return [];
  const client = await getAuthorizedClient(userId);
  if (!client) return [];

  try {
    const calendar = google.calendar({ version: 'v3', auth: client });
    const res = await calendar.events.list({
      calendarId:   'primary',
      timeMin:      new Date(from).toISOString(),
      timeMax:      new Date(to).toISOString(),
      singleEvents: true,
      orderBy:      'startTime',
      maxResults:   250,
    });

    return (res.data.items || []).map(e => ({
      id:            e.id,
      title:         e.summary || '(sem título)',
      start:         e.start?.date || e.start?.dateTime,
      end:           e.end?.date   || e.end?.dateTime,
      isGoogleEvent: true,
      isTicket:      !!(e.extendedProperties?.private?.gtw_ticket_id),
    }));
  } catch (err) {
    console.error('[gcal] listEvents error:', err.message);
    return [];
  }
}

module.exports = {
  isConfigured,
  getAuthUrl,
  getOAuthClient,
  saveTokens,
  disconnect,
  isConnected,
  getStatus,
  createEvent,
  updateEvent,
  deleteEvent,
  listEvents,
};
