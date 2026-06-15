'use strict';

const { query } = require('../../config/database');

const STATUSES = ['pendente', 'em_andamento', 'concluida'];

async function assertDevelopmentExists(developmentId, workspaceId) {
  const r = await query('SELECT id FROM developments WHERE id = $1 AND workspace_id = $2', [developmentId, workspaceId]);
  if (!r.rows.length) throw Object.assign(new Error('Empreendimento não encontrado'), { status: 404 });
}

async function assertStageExists(stageId, developmentId) {
  const r = await query(
    'SELECT id FROM development_construction_stages WHERE id = $1 AND development_id = $2',
    [stageId, developmentId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Etapa não encontrada'), { status: 404 });
}

// ── Etapas ────────────────────────────────────────────────────────────────

async function listStages(developmentId, workspaceId) {
  await assertDevelopmentExists(developmentId, workspaceId);

  const stagesRes = await query(
    `SELECT * FROM development_construction_stages WHERE development_id = $1 ORDER BY position ASC, created_at ASC`,
    [developmentId]
  );
  const stages = stagesRes.rows;
  if (!stages.length) return [];

  const photosRes = await query(
    `SELECT * FROM construction_stage_photos WHERE stage_id = ANY($1) ORDER BY position ASC, created_at ASC`,
    [stages.map(s => s.id)]
  );

  const photosByStage = {};
  for (const photo of photosRes.rows) {
    (photosByStage[photo.stage_id] ||= []).push(photo);
  }

  return stages.map(s => ({ ...s, photos: photosByStage[s.id] || [] }));
}

async function createStage(developmentId, workspaceId, { name, description, status, plannedDate, completedDate }) {
  await assertDevelopmentExists(developmentId, workspaceId);
  if (!name) throw Object.assign(new Error('name é obrigatório'), { status: 400 });

  const posRes = await query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM development_construction_stages WHERE development_id = $1',
    [developmentId]
  );

  const r = await query(
    `INSERT INTO development_construction_stages
       (workspace_id, development_id, name, description, status, planned_date, completed_date, position)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      workspaceId, developmentId, name, description || null,
      STATUSES.includes(status) ? status : 'pendente',
      plannedDate || null, completedDate || null, posRes.rows[0].next,
    ]
  );
  return { ...r.rows[0], photos: [] };
}

const UPDATE_FIELD_MAP = {
  name: 'name', description: 'description', status: 'status',
  plannedDate: 'planned_date', completedDate: 'completed_date',
};

async function updateStage(stageId, developmentId, workspaceId, body) {
  await assertDevelopmentExists(developmentId, workspaceId);

  const fields = [];
  const vals   = [];
  let   idx    = 1;

  for (const [k, col] of Object.entries(UPDATE_FIELD_MAP)) {
    if (body[k] === undefined) continue;
    if (k === 'status' && !STATUSES.includes(body[k])) continue;
    fields.push(`${col} = $${idx++}`);
    vals.push(body[k]);
  }
  if (!fields.length) throw Object.assign(new Error('Nenhum campo para atualizar'), { status: 400 });

  fields.push('updated_at = NOW()');
  vals.push(stageId, developmentId);

  const r = await query(
    `UPDATE development_construction_stages SET ${fields.join(', ')}
     WHERE id = $${idx} AND development_id = $${idx + 1} RETURNING *`,
    vals
  );
  if (!r.rows.length) throw Object.assign(new Error('Etapa não encontrada'), { status: 404 });

  const photosRes = await query(
    'SELECT * FROM construction_stage_photos WHERE stage_id = $1 ORDER BY position ASC, created_at ASC',
    [stageId]
  );
  return { ...r.rows[0], photos: photosRes.rows };
}

async function removeStage(stageId, developmentId, workspaceId) {
  await assertDevelopmentExists(developmentId, workspaceId);
  const r = await query(
    'DELETE FROM development_construction_stages WHERE id = $1 AND development_id = $2 RETURNING id',
    [stageId, developmentId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Etapa não encontrada'), { status: 404 });
}

async function reorderStages(developmentId, workspaceId, orderedIds) {
  await assertDevelopmentExists(developmentId, workspaceId);

  for (let i = 0; i < orderedIds.length; i++) {
    await query(
      'UPDATE development_construction_stages SET position = $1 WHERE id = $2 AND development_id = $3',
      [i, orderedIds[i], developmentId]
    );
  }
}

// ── Fotos da etapa ────────────────────────────────────────────────────────

async function addPhoto(stageId, developmentId, workspaceId, { url, caption }) {
  await assertDevelopmentExists(developmentId, workspaceId);
  await assertStageExists(stageId, developmentId);

  const posRes = await query(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM construction_stage_photos WHERE stage_id = $1',
    [stageId]
  );

  const r = await query(
    `INSERT INTO construction_stage_photos (stage_id, url, caption, position)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [stageId, url, caption || null, posRes.rows[0].next]
  );
  return r.rows[0];
}

async function removePhoto(photoId, stageId, developmentId, workspaceId) {
  await assertDevelopmentExists(developmentId, workspaceId);
  await assertStageExists(stageId, developmentId);

  const r = await query(
    'DELETE FROM construction_stage_photos WHERE id = $1 AND stage_id = $2 RETURNING id',
    [photoId, stageId]
  );
  if (!r.rows.length) throw Object.assign(new Error('Foto não encontrada'), { status: 404 });
}

module.exports = {
  STATUSES, listStages, createStage, updateStage, removeStage, reorderStages,
  addPhoto, removePhoto,
};
