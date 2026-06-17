'use strict';

const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { query } = require('../../config/database');
const { logAudit } = require('../../services/audit.service');

const SALT_ROUNDS       = 12;
const ACCESS_TOKEN_TTL  = '15m';
const REFRESH_TOKEN_TTL = 30; // days

const MAX_FAILED_ATTEMPTS      = 5;
const LOCKOUT_MINUTES           = 15;
const TWO_FACTOR_CHALLENGE_TTL  = '5m';

// ── Token helpers ──────────────────────────────────────────────────────────

function signAccess(user) {
  return jwt.sign(
    { sub: user.id, isSuperAdmin: user.is_super_admin },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

function signTwoFactorChallenge(userId) {
  return jwt.sign(
    { sub: userId, type: '2fa_challenge' },
    process.env.JWT_SECRET,
    { expiresIn: TWO_FACTOR_CHALLENGE_TTL }
  );
}

async function createRefreshToken(userId) {
  const raw  = crypto.randomBytes(64).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const exp  = new Date(Date.now() + REFRESH_TOKEN_TTL * 86400 * 1000);

  await query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, hash, exp]
  );
  return raw;
}

function hashBackupCode(code) {
  return crypto.createHash('sha256').update(String(code).trim().toLowerCase()).digest('hex');
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function getUserWithOrgs(userId) {
  const userRes = await query(
    'SELECT id, name, email, avatar_url, is_super_admin, is_active, two_factor_enabled FROM users WHERE id = $1',
    [userId]
  );
  if (!userRes.rows.length) return null;
  const user = userRes.rows[0];

  const orgsRes = await query(
    `SELECT o.id, o.name, o.slug, o.logo_url, o.plan, om.role
     FROM org_memberships om
     JOIN organizations o ON o.id = om.org_id
     WHERE om.user_id = $1 AND o.is_active = true
     ORDER BY o.name`,
    [userId]
  );
  user.orgs = orgsRes.rows;
  return user;
}

/**
 * Emite tokens de sessão (access + refresh) e atualiza last_login_at.
 * Usado após autenticação bem-sucedida (com ou sem 2FA).
 */
async function issueSession(user) {
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  const accessToken  = signAccess(user);
  const refreshToken = await createRefreshToken(user.id);
  const fullUser     = await getUserWithOrgs(user.id);
  return { accessToken, refreshToken, user: fullUser };
}

// ── Register ───────────────────────────────────────────────────────────────

async function register({ name, email, password, orgName }) {
  // Registro público só é permitido enquanto não existe nenhum usuário (setup inicial).
  // Após o primeiro cadastro, novos usuários são criados pelo painel admin.
  const countRes = await query('SELECT COUNT(*) FROM users');
  const userCount = parseInt(countRes.rows[0].count, 10);

  if (userCount > 0) {
    throw Object.assign(
      new Error('Registro público desativado. Solicite acesso ao administrador.'),
      { status: 403 }
    );
  }

  // Check duplicate email
  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  if (existing.rows.length) throw Object.assign(new Error('E-mail já cadastrado'), { status: 409 });

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  // Primeiro usuário sempre vira super admin
  const isSuperAdmin = true;

  // Create user
  const userRes = await query(
    `INSERT INTO users (name, email, password_hash, is_super_admin)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [name, email.toLowerCase(), passwordHash, isSuperAdmin]
  );
  const user = userRes.rows[0];

  // Create org
  const slug = (orgName || name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  const slugUnique = `${slug}-${Date.now().toString(36)}`;

  const orgRes = await query(
    `INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING *`,
    [orgName || `${name}'s Org`, slugUnique]
  );
  const org = orgRes.rows[0];

  // Owner membership
  await query(
    'INSERT INTO org_memberships (org_id, user_id, role) VALUES ($1, $2, $3)',
    [org.id, user.id, 'owner']
  );

  return issueSession(user);
}

// ── Login ──────────────────────────────────────────────────────────────────

async function login({ email, password }) {
  const res = await query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = res.rows[0];

  if (!user || !user.is_active) {
    throw Object.assign(new Error('Credenciais inválidas'), { status: 401 });
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    const minutes = Math.max(1, Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000));
    throw Object.assign(
      new Error(`Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em ${minutes} min.`),
      { status: 423 }
    );
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    const attempts = (user.failed_login_attempts || 0) + 1;
    if (attempts >= MAX_FAILED_ATTEMPTS) {
      await query(
        `UPDATE users SET failed_login_attempts = $1, locked_until = NOW() + INTERVAL '${LOCKOUT_MINUTES} minutes' WHERE id = $2`,
        [attempts, user.id]
      );
      await logAudit({ userId: user.id, action: 'auth.account_locked', metadata: { email: user.email, attempts } });
      throw Object.assign(
        new Error(`Muitas tentativas de login. Conta bloqueada por ${LOCKOUT_MINUTES} minutos.`),
        { status: 423 }
      );
    }
    await query('UPDATE users SET failed_login_attempts = $1 WHERE id = $2', [attempts, user.id]);
    throw Object.assign(new Error('Credenciais inválidas'), { status: 401 });
  }

  if (user.failed_login_attempts > 0 || user.locked_until) {
    await query('UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
  }

  if (user.two_factor_enabled) {
    return { twoFactorRequired: true, challenge: signTwoFactorChallenge(user.id) };
  }

  return issueSession(user);
}

// ── 2FA — verificação no login ───────────────────────────────────────────────

async function verifyTwoFactorLogin({ challenge, code }) {
  if (!challenge || !code) throw Object.assign(new Error('Dados incompletos'), { status: 400 });

  let payload;
  try {
    payload = jwt.verify(challenge, process.env.JWT_SECRET);
  } catch {
    throw Object.assign(new Error('Sessão de verificação expirada. Faça login novamente.'), { status: 401 });
  }
  if (payload.type !== '2fa_challenge') {
    throw Object.assign(new Error('Token inválido'), { status: 401 });
  }

  const res  = await query('SELECT * FROM users WHERE id = $1', [payload.sub]);
  const user = res.rows[0];
  if (!user || !user.is_active || !user.two_factor_enabled) {
    throw Object.assign(new Error('Usuário inválido'), { status: 401 });
  }

  const cleanCode = String(code).replace(/\s+/g, '');
  let validTotp = false;
  try { validTotp = authenticator.check(cleanCode, user.two_factor_secret); } catch { /* ignore */ }

  if (!validTotp) {
    // Tenta código de backup (uso único, gerado na ativação do 2FA)
    const codes = user.two_factor_backup_codes || [];
    const hash  = hashBackupCode(cleanCode);
    const idx   = codes.indexOf(hash);
    if (idx === -1) {
      throw Object.assign(new Error('Código de verificação inválido'), { status: 401 });
    }
    const remaining = [...codes.slice(0, idx), ...codes.slice(idx + 1)];
    await query('UPDATE users SET two_factor_backup_codes = $1 WHERE id = $2', [remaining, user.id]);
  }

  return issueSession(user);
}

// ── Refresh ────────────────────────────────────────────────────────────────

async function refresh(rawToken) {
  if (!rawToken) throw Object.assign(new Error('Token não fornecido'), { status: 401 });

  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const res  = await query(
    `SELECT rt.*, u.id as uid, u.is_super_admin, u.is_active
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = $1`,
    [hash]
  );

  const row = res.rows[0];
  if (!row || !row.is_active) throw Object.assign(new Error('Token inválido'), { status: 401 });
  if (new Date(row.expires_at) < new Date()) {
    await query('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);
    throw Object.assign(new Error('Token expirado'), { status: 401 });
  }

  // Rotate: delete old, issue new
  await query('DELETE FROM refresh_tokens WHERE id = $1', [row.id]);
  const newRefresh = await createRefreshToken(row.user_id);
  const userRes    = await query('SELECT * FROM users WHERE id = $1', [row.user_id]);
  const accessToken = signAccess(userRes.rows[0]);

  return { accessToken, refreshToken: newRefresh };
}

// ── Logout ─────────────────────────────────────────────────────────────────

async function logout(rawToken) {
  if (!rawToken) return;
  const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
  await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [hash]);
}

// ── Me ─────────────────────────────────────────────────────────────────────

async function me(userId) {
  const user = await getUserWithOrgs(userId);
  if (!user) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });
  return user;
}

// ── Change password ────────────────────────────────────────────────────────

async function changePassword(userId, { currentPassword, newPassword }) {
  const res  = await query('SELECT * FROM users WHERE id = $1', [userId]);
  const user = res.rows[0];

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) throw Object.assign(new Error('Senha atual incorreta'), { status: 400 });

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);

  // Revoke all refresh tokens
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

// ── Update profile ─────────────────────────────────────────────────────────

async function updateProfile(userId, { name, avatarUrl }) {
  const fields = [];
  const vals   = [];
  let   idx    = 1;

  if (name      !== undefined) { fields.push(`name = $${idx++}`);       vals.push(name); }
  if (avatarUrl !== undefined) { fields.push(`avatar_url = $${idx++}`); vals.push(avatarUrl); }

  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });

  vals.push(userId);
  await query(
    `UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`,
    vals
  );
  return getUserWithOrgs(userId);
}

// ── 2FA — configuração (owners/admins) ────────────────────────────────────────

async function getTwoFactorStatus(userId) {
  const r = await query('SELECT two_factor_enabled FROM users WHERE id = $1', [userId]);
  return { enabled: !!r.rows[0]?.two_factor_enabled };
}

async function setupTwoFactor(userId) {
  const userRes = await query('SELECT email, two_factor_enabled FROM users WHERE id = $1', [userId]);
  const user = userRes.rows[0];
  if (!user) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });
  if (user.two_factor_enabled) {
    throw Object.assign(new Error('A verificação em duas etapas já está ativada'), { status: 400 });
  }

  const secret = authenticator.generateSecret();
  await query('UPDATE users SET two_factor_secret = $1 WHERE id = $2', [secret, userId]);

  const otpUrl = authenticator.keyuri(user.email, 'GTW Imobi', secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpUrl);

  return { secret, qrCodeDataUrl };
}

async function enableTwoFactor(userId, code) {
  const r = await query('SELECT two_factor_secret FROM users WHERE id = $1', [userId]);
  const secret = r.rows[0]?.two_factor_secret;
  if (!secret) throw Object.assign(new Error('Configure a verificação em duas etapas antes de ativar'), { status: 400 });

  const valid = authenticator.check(String(code).replace(/\s+/g, ''), secret);
  if (!valid) throw Object.assign(new Error('Código inválido'), { status: 400 });

  const backupCodes = Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex'));
  const hashed = backupCodes.map(hashBackupCode);

  await query(
    'UPDATE users SET two_factor_enabled = true, two_factor_backup_codes = $1 WHERE id = $2',
    [hashed, userId]
  );

  await logAudit({ userId, action: '2fa.enable' });
  return { backupCodes };
}

async function disableTwoFactor(userId, password) {
  const r = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const user = r.rows[0];
  if (!user) throw Object.assign(new Error('Usuário não encontrado'), { status: 404 });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw Object.assign(new Error('Senha incorreta'), { status: 400 });

  await query(
    'UPDATE users SET two_factor_enabled = false, two_factor_secret = NULL, two_factor_backup_codes = NULL WHERE id = $1',
    [userId]
  );
  await logAudit({ userId, action: '2fa.disable' });
}

// ── Register via invitation ────────────────────────────────────────────────

async function registerViaInvite({ name, email, password, token }) {
  const orgSvc = require('../organizations/organizations.service');

  // Valida convite (lança 404/410 se inválido/expirado)
  const inv = await orgSvc.getInvitation(token);

  if (inv.email.toLowerCase() !== email.toLowerCase()) {
    throw Object.assign(
      new Error('O e-mail informado não corresponde ao convite'),
      { status: 400 }
    );
  }

  // Cria conta (pode já existir se o usuário tenta de novo)
  const existing = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  let userId;
  if (existing.rows.length) {
    userId = existing.rows[0].id;
  } else {
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const userRes = await query(
      `INSERT INTO users (name, email, password_hash, is_super_admin)
       VALUES ($1, $2, $3, false) RETURNING *`,
      [name, email.toLowerCase(), passwordHash]
    );
    userId = userRes.rows[0].id;
  }

  // Aceita convite (add to org)
  await orgSvc.acceptInvitation(token, userId);

  const userRes = await query('SELECT * FROM users WHERE id = $1', [userId]);
  return issueSession(userRes.rows[0]);
}

// ── Recuperação de senha ───────────────────────────────────────────────────

async function forgotPassword(email) {
  const normalizedEmail = email.toLowerCase().trim();
  const { rows } = await query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
  if (!rows.length) return; // Não revela se o e-mail existe ou não

  const token   = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
  await query(
    'UPDATE users SET reset_password_token = $1, reset_password_expires = $2 WHERE id = $3',
    [token, expires, rows[0].id]
  );

  const appUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'https://app.imobi360.digital';
  const link   = `${appUrl}/nova-senha?token=${token}`;
  const mail   = require('../../services/mail');
  await mail.sendMailSilent({
    to:      normalizedEmail,
    subject: 'Recuperação de senha — Imobi360',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:24px">
        <h2 style="color:#1a1a2e;margin-bottom:8px">Recuperação de senha</h2>
        <p style="color:#555;margin-bottom:24px">
          Recebemos uma solicitação para redefinir a senha da sua conta.<br>
          Clique no botão abaixo para criar uma nova senha. O link é válido por <strong>1 hora</strong>.
        </p>
        <a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
          Redefinir minha senha
        </a>
        <p style="color:#999;font-size:12px;margin-top:24px">
          Se você não solicitou a recuperação, ignore este e-mail — sua senha continua a mesma.<br>
          <a href="${link}" style="color:#999">${link}</a>
        </p>
      </div>
    `,
  });
}

async function resetPassword(token, newPassword) {
  const { rows } = await query(
    `SELECT id FROM users
     WHERE reset_password_token = $1 AND reset_password_expires > NOW()`,
    [token]
  );
  if (!rows.length) throw Object.assign(new Error('Link inválido ou expirado'), { status: 400 });

  const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await query(
    `UPDATE users
     SET password_hash = $1, reset_password_token = NULL, reset_password_expires = NULL
     WHERE id = $2`,
    [hash, rows[0].id]
  );
}

module.exports = {
  register, login, verifyTwoFactorLogin, refresh, logout, me, changePassword, updateProfile,
  getTwoFactorStatus, setupTwoFactor, enableTwoFactor, disableTwoFactor,
  registerViaInvite, forgotPassword, resetPassword,
};
