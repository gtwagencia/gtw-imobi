'use strict';

const { query } = require('../../config/database');

/**
 * Summary metrics for the workspace.
 */
async function getSummary(workspaceId, { startDate, endDate } = {}) {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end   = endDate   || new Date().toISOString();

  const r = await query(
    `SELECT
       COUNT(*)                                                    AS total_conversations,
       COUNT(*) FILTER (WHERE status = 'resolved')                AS resolved,
       COUNT(*) FILTER (WHERE status = 'open')                    AS open,
       COUNT(*) FILTER (WHERE status = 'pending')                 AS pending,
       AVG(response_time_seconds) FILTER (WHERE response_time_seconds IS NOT NULL) AS avg_response_time_seconds,
       COUNT(*) FILTER (WHERE sla_breached = true)                AS sla_breached_count,
       AVG(csat_rating) FILTER (WHERE csat_rating IS NOT NULL)    AS avg_csat
     FROM conversations
     WHERE workspace_id = $1
       AND created_at BETWEEN $2 AND $3`,
    [workspaceId, start, end]
  );

  const msgR = await query(
    `SELECT COUNT(*) AS total_messages
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE c.workspace_id = $1
       AND m.created_at BETWEEN $2 AND $3`,
    [workspaceId, start, end]
  );

  return {
    ...r.rows[0],
    total_messages: msgR.rows[0].total_messages,
  };
}

/**
 * Per-agent performance metrics.
 */
async function getAgentPerformance(workspaceId, { startDate, endDate } = {}) {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end   = endDate   || new Date().toISOString();

  const r = await query(
    `SELECT
       u.id,
       u.name,
       u.avatar_url,
       COUNT(c.id)::int                                                         AS total_conversations,
       COUNT(c.id) FILTER (WHERE c.status = 'resolved')::int                   AS resolved,
       AVG(c.response_time_seconds) FILTER (WHERE c.response_time_seconds IS NOT NULL) AS avg_response_time_seconds,
       AVG(c.csat_rating) FILTER (WHERE c.csat_rating IS NOT NULL)             AS avg_csat,
       COUNT(m.id) FILTER (WHERE m.direction = 'outbound')::int                AS messages_sent
     FROM users u
     JOIN workspace_memberships wm ON wm.user_id = u.id AND wm.workspace_id = $1
     LEFT JOIN conversations c
       ON c.assignee_id = u.id AND c.workspace_id = $1
       AND c.created_at BETWEEN $2 AND $3
     LEFT JOIN messages m
       ON m.sender_id = u.id AND m.conversation_id = c.id
     GROUP BY u.id, u.name, u.avatar_url
     ORDER BY total_conversations DESC`,
    [workspaceId, start, end]
  );

  return r.rows;
}

/**
 * Conversation volume by day.
 */
async function getVolumeByDay(workspaceId, { startDate, endDate } = {}) {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end   = endDate   || new Date().toISOString();

  const r = await query(
    `SELECT
       DATE(created_at) AS date,
       COUNT(*)::int    AS total,
       COUNT(*) FILTER (WHERE status = 'resolved')::int AS resolved
     FROM conversations
     WHERE workspace_id = $1
       AND created_at BETWEEN $2 AND $3
     GROUP BY DATE(created_at)
     ORDER BY date`,
    [workspaceId, start, end]
  );

  return r.rows;
}

/**
 * Leads por campanha Meta Ads no período.
 */
async function getCampaignBreakdown(workspaceId, { startDate, endDate } = {}) {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end   = endDate   || new Date().toISOString();

  const r = await query(
    `SELECT
       COALESCE(meta_campaign_name, meta_ad_name, meta_ref, 'Sem nome') AS campaign,
       meta_ad_name,
       meta_adset_name,
       COUNT(*)::int                                                     AS total_leads,
       COUNT(*) FILTER (WHERE status = 'resolved')::int                 AS resolved,
       COUNT(*) FILTER (WHERE status = 'open')::int                     AS open,
       MIN(created_at)                                                   AS first_lead_at,
       MAX(created_at)                                                   AS last_lead_at
     FROM conversations
     WHERE workspace_id = $1
       AND meta_source = 'paid'
       AND created_at BETWEEN $2 AND $3
     GROUP BY meta_campaign_name, meta_ad_name, meta_adset_name, meta_ref
     ORDER BY total_leads DESC`,
    [workspaceId, start, end]
  );

  const totals = await query(
    `SELECT
       COUNT(*) FILTER (WHERE meta_source = 'paid')::int    AS total_paid,
       COUNT(*) FILTER (WHERE meta_source = 'organic')::int AS total_organic,
       COUNT(*)::int                                         AS total
     FROM conversations
     WHERE workspace_id = $1
       AND created_at BETWEEN $2 AND $3`,
    [workspaceId, start, end]
  );

  return {
    campaigns: r.rows,
    totals: totals.rows[0],
  };
}

/**
 * Performance de negócios (deals) por corretor: ganhos, perdidos, valor
 * fechado e tempo médio até o fechamento.
 */
async function getBrokerDealPerformance(workspaceId, { startDate, endDate } = {}) {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end   = endDate   || new Date().toISOString();

  const r = await query(
    `WITH deal_owner AS (
       SELECT d.*,
              COALESCE(d.assignee_id, conv.assignee_id) AS owner_id,
              ks.is_purchase
       FROM deals d
       LEFT JOIN conversations conv  ON conv.id = d.conversation_id
       LEFT JOIN kanban_stages ks    ON ks.id   = d.stage_id
       WHERE d.workspace_id = $1
         AND d.created_at BETWEEN $2 AND $3
     )
     SELECT
       u.id,
       u.name,
       u.avatar_url,
       COUNT(do.id)::int                                                       AS total_deals,
       COUNT(do.id) FILTER (WHERE do.is_purchase = true)::int                  AS won_deals,
       COUNT(do.id) FILTER (WHERE do.lost_reason IS NOT NULL)::int             AS lost_deals,
       COALESCE(SUM(do.value) FILTER (WHERE do.is_purchase = true), 0)         AS won_value,
       AVG(EXTRACT(EPOCH FROM (do.closed_at - do.created_at)) / 86400.0)
         FILTER (WHERE do.closed_at IS NOT NULL)                                AS avg_days_to_close
     FROM users u
     JOIN workspace_memberships wm ON wm.user_id = u.id AND wm.workspace_id = $1
     LEFT JOIN deal_owner do        ON do.owner_id = u.id
     GROUP BY u.id, u.name, u.avatar_url
     ORDER BY won_value DESC, total_deals DESC`,
    [workspaceId, start, end]
  );

  return r.rows;
}

/**
 * Performance de negócios por origem do lead (site, anúncio, orgânico).
 */
async function getLeadSourcePerformance(workspaceId, { startDate, endDate } = {}) {
  const start = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const end   = endDate   || new Date().toISOString();

  const r = await query(
    `WITH deal_src AS (
       SELECT d.*, ks.is_purchase,
         CASE
           WHEN d.lead_source = 'site_form'     THEN 'Site (formulário)'
           WHEN d.lead_source = 'site_whatsapp' THEN 'Site (WhatsApp)'
           WHEN d.meta_source = 'paid'          THEN 'WhatsApp (Anúncio)'
           ELSE 'WhatsApp (Orgânico)'
         END AS source_label
       FROM deals d
       LEFT JOIN kanban_stages ks ON ks.id = d.stage_id
       WHERE d.workspace_id = $1
         AND d.created_at BETWEEN $2 AND $3
     )
     SELECT
       source_label,
       COUNT(*)::int                                                AS total_deals,
       COUNT(*) FILTER (WHERE is_purchase = true)::int              AS won_deals,
       COUNT(*) FILTER (WHERE lost_reason IS NOT NULL)::int         AS lost_deals,
       COALESCE(SUM(value) FILTER (WHERE is_purchase = true), 0)    AS won_value
     FROM deal_src
     GROUP BY source_label
     ORDER BY total_deals DESC`,
    [workspaceId, start, end]
  );

  return r.rows;
}

module.exports = {
  getSummary, getAgentPerformance, getVolumeByDay, getCampaignBreakdown,
  getBrokerDealPerformance, getLeadSourcePerformance,
};
