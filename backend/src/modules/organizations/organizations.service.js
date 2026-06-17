'use strict';

const crypto = require('crypto');
const { query } = require('../../config/database');

// ── List orgs for user ─────────────────────────────────────────────────────

async function listForUser(userId, isSuperAdmin) {
  if (isSuperAdmin) {
    const r = await query(
      `SELECT o.*, COUNT(om.user_id)::int AS member_count
       FROM organizations o
       LEFT JOIN org_memberships om ON om.org_id = o.id
       GROUP BY o.id
       ORDER BY o.name`
    );
    return r.rows;
  }

  const r = await query(
    `SELECT o.*, om.role, COUNT(om2.user_id)::int AS member_count
     FROM org_memberships om
     JOIN organizations o ON o.id = om.org_id
     LEFT JOIN org_memberships om2 ON om2.org_id = o.id
     WHERE om.user_id = $1 AND o.is_active = true
     GROUP BY o.id, om.role
     ORDER BY o.name`,
    [userId]
  );
  return r.rows;
}

// ── Get single org ─────────────────────────────────────────────────────────

async function getById(orgId) {
  const r = await query('SELECT * FROM organizations WHERE id = $1', [orgId]);
  return r.rows[0] || null;
}

// ── Update org ─────────────────────────────────────────────────────────────

async function update(orgId, { name, logoUrl, plan, isActive }) {
  const fields = [];
  const vals   = [];
  let   idx    = 1;

  if (name      !== undefined) { fields.push(`name = $${idx++}`);       vals.push(name); }
  if (logoUrl   !== undefined) { fields.push(`logo_url = $${idx++}`);   vals.push(logoUrl); }
  if (plan      !== undefined) { fields.push(`plan = $${idx++}`);       vals.push(plan); }
  if (isActive  !== undefined) { fields.push(`is_active = $${idx++}`);  vals.push(isActive); }

  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });

  vals.push(orgId);
  const r = await query(
    `UPDATE organizations SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
    vals
  );
  return r.rows[0];
}

// ── Members ────────────────────────────────────────────────────────────────

async function listMembers(orgId, workspaceId = null) {
  // Se workspaceId for informado, filtra apenas membros que também
  // pertencem àquele workspace (evita mostrar membros de outros workspaces).
  if (workspaceId) {
    const r = await query(
      `SELECT u.id, u.name, u.email, u.avatar_url, u.last_login_at,
              om.role, om.created_at AS joined_at,
              wm.role AS workspace_role
       FROM org_memberships om
       JOIN users u ON u.id = om.user_id
       JOIN workspace_memberships wm ON wm.user_id = om.user_id AND wm.workspace_id = $2
       WHERE om.org_id = $1
       ORDER BY u.name`,
      [orgId, workspaceId]
    );
    return r.rows;
  }

  const r = await query(
    `SELECT u.id, u.name, u.email, u.avatar_url, u.last_login_at, om.role, om.created_at AS joined_at
     FROM org_memberships om
     JOIN users u ON u.id = om.user_id
     WHERE om.org_id = $1
     ORDER BY u.name`,
    [orgId]
  );
  return r.rows;
}

async function inviteMember(orgId, { email, role }, invitedByUserId) {
  const normalizedEmail = email.toLowerCase();
  const userRes = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);

  if (userRes.rows.length) {
    // Usuário já existe: adicionar diretamente
    const userId = userRes.rows[0].id;
    const r = await query(
      `INSERT INTO org_memberships (org_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING *`,
      [orgId, userId, role || 'member']
    );
    return { type: 'added', member: r.rows[0] };
  }

  // Usuário não existe: criar convite e enviar e-mail
  const token = crypto.randomBytes(32).toString('hex');

  // Upsert: reusa token existente se já houver convite pendente para este e-mail/org
  await query(
    `INSERT INTO invitations (org_id, email, role, token, invited_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [orgId, normalizedEmail, role || 'member', token, invitedByUserId]
  );

  // Pega o token real (pode ser de convite anterior não aceito)
  const invRes = await query(
    `SELECT token FROM invitations WHERE org_id = $1 AND email = $2 AND accepted_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [orgId, normalizedEmail]
  );
  const activeToken = invRes.rows[0]?.token || token;

  const orgRes     = await query('SELECT name FROM organizations WHERE id = $1', [orgId]);
  const inviterRes = await query('SELECT name FROM users WHERE id = $1', [invitedByUserId]);

  const mail    = require('../../services/mail');
  const appUrl  = process.env.APP_URL || process.env.FRONTEND_URL || 'https://app.imobi360.digital';
  await mail.sendMailSilent({
    to:      normalizedEmail,
    subject: `Convite para ${orgRes.rows[0]?.name || 'Imobi360'}`,
    html:    mail.tplInvite({
      orgName:     orgRes.rows[0]?.name     || 'Imobi360',
      inviterName: inviterRes.rows[0]?.name || 'Um administrador',
      role:        role || 'member',
      inviteUrl:   `${appUrl}/invite?token=${activeToken}`,
    }),
  });

  return { type: 'invited', email: normalizedEmail };
}

async function getInvitation(token) {
  const r = await query(
    `SELECT i.id, i.org_id, i.email, i.role, i.expires_at, i.accepted_at,
            o.name AS org_name, u.name AS inviter_name
     FROM invitations i
     JOIN organizations o ON o.id = i.org_id
     JOIN users u ON u.id = i.invited_by
     WHERE i.token = $1`,
    [token]
  );
  const inv = r.rows[0];
  if (!inv) throw Object.assign(new Error('Convite não encontrado ou inválido'), { status: 404 });
  if (inv.accepted_at) throw Object.assign(new Error('Este convite já foi aceito'), { status: 410 });
  if (new Date(inv.expires_at) < new Date()) throw Object.assign(new Error('Este convite expirou'), { status: 410 });
  return inv;
}

async function acceptInvitation(token, userId) {
  const inv = await getInvitation(token);

  await query(
    `INSERT INTO org_memberships (org_id, user_id, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (org_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
    [inv.org_id, userId, inv.role]
  );

  await query(
    'UPDATE invitations SET accepted_at = NOW() WHERE token = $1',
    [token]
  );

  return { ok: true, org_id: inv.org_id, role: inv.role };
}

async function removeMember(orgId, userId) {
  // Can't remove last owner
  const ownerRes = await query(
    `SELECT COUNT(*) FROM org_memberships WHERE org_id = $1 AND role = 'owner'`,
    [orgId]
  );
  const memberRes = await query(
    `SELECT role FROM org_memberships WHERE org_id = $1 AND user_id = $2`,
    [orgId, userId]
  );
  if (!memberRes.rows.length) throw Object.assign(new Error('Membro não encontrado'), { status: 404 });
  if (memberRes.rows[0].role === 'owner' && parseInt(ownerRes.rows[0].count, 10) <= 1) {
    throw Object.assign(new Error('Não é possível remover o único owner'), { status: 400 });
  }

  await query('DELETE FROM org_memberships WHERE org_id = $1 AND user_id = $2', [orgId, userId]);
}

async function updateMemberRole(orgId, userId, role) {
  const r = await query(
    `UPDATE org_memberships SET role = $1 WHERE org_id = $2 AND user_id = $3 RETURNING *`,
    [role, orgId, userId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Membro não encontrado'), { status: 404 });
  return r.rows[0];
}

module.exports = {
  listForUser, getById, update,
  listMembers, inviteMember, removeMember, updateMemberRole,
  getInvitation, acceptInvitation,
};
