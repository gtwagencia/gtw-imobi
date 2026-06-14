'use strict';

const { query } = require('../../config/database');
const { PERMISSION_MODULE_KEYS, DEFAULT_PROFILES } = require('../../config/permissionModules');

// ── Seed ──────────────────────────────────────────────────────────────────

async function ensureDefaultProfiles(workspaceId) {
  for (const profile of DEFAULT_PROFILES) {
    await query(
      `INSERT INTO permission_profiles (workspace_id, slug, name, is_system, permissions)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (workspace_id, slug) DO NOTHING`,
      [workspaceId, profile.slug, profile.name, profile.is_system, JSON.stringify(profile.permissions)]
    );
  }
}

// ── List ──────────────────────────────────────────────────────────────────

async function listProfiles(workspaceId) {
  const r = await query(
    'SELECT * FROM permission_profiles WHERE workspace_id = $1 ORDER BY is_system DESC, name',
    [workspaceId]
  );
  if (!r.rows.length) {
    await ensureDefaultProfiles(workspaceId);
    return listProfiles(workspaceId);
  }
  return r.rows;
}

// ── Effective permissions for a given workspace role ────────────────────────

async function getEffectivePermissions(workspaceId, role) {
  if (role === 'admin') {
    return PERMISSION_MODULE_KEYS.reduce((acc, key) => ({ ...acc, [key]: true }), {});
  }

  const r = await query(
    'SELECT permissions FROM permission_profiles WHERE workspace_id = $1 AND slug = $2',
    [workspaceId, role]
  );

  if (!r.rows.length) {
    return PERMISSION_MODULE_KEYS.reduce((acc, key) => ({ ...acc, [key]: false }), {});
  }

  return r.rows[0].permissions;
}

// ── Update ────────────────────────────────────────────────────────────────

async function updateProfile(workspaceId, profileId, permissions) {
  const r = await query(
    'SELECT * FROM permission_profiles WHERE id = $1 AND workspace_id = $2',
    [profileId, workspaceId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Perfil não encontrado'), { status: 404 });
  if (r.rows[0].is_system) throw Object.assign(new Error('Este perfil é travado e não pode ser editado'), { status: 400 });

  const merged = { ...r.rows[0].permissions };
  for (const [key, value] of Object.entries(permissions || {})) {
    if (!PERMISSION_MODULE_KEYS.includes(key)) continue;
    merged[key] = !!value;
  }

  const updated = await query(
    'UPDATE permission_profiles SET permissions = $1 WHERE id = $2 AND workspace_id = $3 RETURNING *',
    [JSON.stringify(merged), profileId, workspaceId]
  );
  return updated.rows[0];
}

module.exports = { ensureDefaultProfiles, listProfiles, getEffectivePermissions, updateProfile };
