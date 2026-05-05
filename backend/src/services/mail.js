'use strict';

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendMail({ to, subject, html }) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return;
  // Deixa o erro propagar — quem chama decide se engole ou não
  await transporter.sendMail({
    from: process.env.SMTP_FROM || '"GTW Platform" <noreply@gtwagencia.com.br>',
    to,
    subject,
    html,
  });
}

// Versão silenciosa para uso em background (notificações)
async function sendMailSilent(opts) {
  try {
    await sendMail(opts);
  } catch (err) {
    console.error('[mail] Falha ao enviar e-mail:', err.message);
  }
}

async function testConnection(toEmail) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    throw new Error('Variáveis SMTP_HOST e SMTP_USER não estão definidas no servidor.');
  }
  // Verifica a conexão antes de enviar
  await transporter.verify();
  await transporter.sendMail({
    from:    process.env.SMTP_FROM || '"GTW Platform" <noreply@gtwagencia.com.br>',
    to:      toEmail,
    subject: '[GTW Platform] Teste de e-mail ✓',
    html:    baseLayout(`
      <h2 style="margin:0 0 12px;font-size:20px;color:#111;">Tudo funcionando!</h2>
      <p style="color:#555;font-size:14px;margin:0 0 20px;line-height:1.6;">
        Este é um e-mail de teste do <strong>GTW Platform</strong>.<br>
        Se você está lendo isso, o envio de e-mails está configurado corretamente.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;font-size:13px;color:#166534;">
        <strong>Configurações ativas:</strong><br>
        Host: ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587}<br>
        Remetente: ${process.env.SMTP_FROM || 'padrão'}
      </div>
    `),
  });
}

// ── Templates ─────────────────────────────────────────────────────────────────

function baseLayout(content) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
        <!-- Header -->
        <tr>
          <td style="background:#E31E24;padding:18px 28px;border-radius:8px 8px 0 0;">
            <span style="color:#fff;font-size:18px;font-weight:700;">GTW Platform</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="background:#fff;border:1px solid #e5e7eb;border-top:none;padding:28px;border-radius:0 0 8px 8px;">
            ${content}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 0;text-align:center;color:#9ca3af;font-size:12px;">
            GTW Agência · Você recebeu este e-mail porque faz parte de um ticket na plataforma.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(url, label) {
  return `<a href="${url}" style="display:inline-block;padding:12px 24px;background:#E31E24;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:700;">${label}</a>`;
}

function ticketBadge(priority) {
  const colors = { urgent: '#dc2626', high: '#ea580c', medium: '#d97706', low: '#16a34a' };
  const labels = { urgent: 'Urgente', high: 'Alta', medium: 'Média', low: 'Baixa' };
  const c = colors[priority] || colors.medium;
  const l = labels[priority] || priority;
  return `<span style="display:inline-block;padding:2px 10px;background:${c};color:#fff;border-radius:20px;font-size:11px;font-weight:700;">${l}</span>`;
}

// ── Template: ticket atribuído ────────────────────────────────────────────────

function tplAssigned({ assigneeName, actorName, ticketTitle, boardName, priority, ticketUrl }) {
  return baseLayout(`
    <h2 style="margin:0 0 6px;font-size:20px;color:#111;">Você foi atribuído a um ticket</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">
      <strong>${actorName}</strong> atribuiu o ticket a você.
    </p>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <div style="margin-bottom:8px;">${ticketBadge(priority)}</div>
      <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:4px;">${ticketTitle}</div>
      <div style="font-size:13px;color:#6b7280;">Board: <strong>${boardName}</strong></div>
    </div>

    ${btn(ticketUrl, 'Ver Ticket')}
  `);
}

// ── Template: novo comentário ─────────────────────────────────────────────────

function tplComment({ recipientName, actorName, ticketTitle, boardName, commentContent, ticketUrl }) {
  const preview = commentContent ? commentContent.substring(0, 200) + (commentContent.length > 200 ? '…' : '') : '';
  return baseLayout(`
    <h2 style="margin:0 0 6px;font-size:20px;color:#111;">Novo comentário no ticket</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">
      <strong>${actorName}</strong> comentou em um ticket que você participa.
    </p>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:16px;">
      <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:4px;">${ticketTitle}</div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:12px;">Board: <strong>${boardName}</strong></div>
      ${preview ? `<div style="font-size:14px;color:#374151;border-left:3px solid #E31E24;padding-left:12px;">${preview}</div>` : ''}
    </div>

    ${btn(ticketUrl, 'Ver Comentário')}
  `);
}

// ── Template: status/coluna alterado ─────────────────────────────────────────

function tplStatusChanged({ actorName, ticketTitle, boardName, columnName, ticketUrl }) {
  return baseLayout(`
    <h2 style="margin:0 0 6px;font-size:20px;color:#111;">Status do ticket atualizado</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">
      <strong>${actorName}</strong> moveu o ticket para <strong>${columnName}</strong>.
    </p>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:4px;">${ticketTitle}</div>
      <div style="font-size:13px;color:#6b7280;">Board: <strong>${boardName}</strong></div>
    </div>

    ${btn(ticketUrl, 'Ver Ticket')}
  `);
}

// ── Template: prazo alterado ──────────────────────────────────────────────────

function tplDueDateChanged({ actorName, ticketTitle, boardName, dueDate, ticketUrl }) {
  const dateStr = dueDate
    ? new Date(dueDate).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : 'Sem prazo definido';
  return baseLayout(`
    <h2 style="margin:0 0 6px;font-size:20px;color:#111;">Prazo do ticket alterado</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">
      <strong>${actorName}</strong> atualizou o prazo do ticket.
    </p>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:24px;">
      <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:4px;">${ticketTitle}</div>
      <div style="font-size:13px;color:#6b7280;">Board: <strong>${boardName}</strong></div>
      <div style="margin-top:10px;font-size:14px;color:#374151;">
        Novo prazo: <strong>${dateStr}</strong>
      </div>
    </div>

    ${btn(ticketUrl, 'Ver Ticket')}
  `);
}

// ── Template: mencionado em comentário ───────────────────────────────────────

function tplMention({ mentionedName, actorName, ticketTitle, boardName, commentContent, ticketUrl }) {
  const preview = commentContent ? commentContent.substring(0, 200) + (commentContent.length > 200 ? '…' : '') : '';
  return baseLayout(`
    <h2 style="margin:0 0 6px;font-size:20px;color:#111;">Você foi mencionado em um comentário</h2>
    <p style="margin:0 0 20px;color:#6b7280;font-size:14px;">
      <strong>${actorName}</strong> mencionou você em um ticket.
    </p>

    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin-bottom:16px;">
      <div style="font-size:15px;font-weight:700;color:#111;margin-bottom:4px;">${ticketTitle}</div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:12px;">Board: <strong>${boardName}</strong></div>
      ${preview ? `<div style="font-size:14px;color:#374151;border-left:3px solid #6366f1;padding-left:12px;">${preview}</div>` : ''}
    </div>

    ${btn(ticketUrl, 'Ver Comentário')}
  `);
}

module.exports = {
  sendMail,
  sendMailSilent,
  testConnection,
  tplAssigned,
  tplComment,
  tplMention,
  tplStatusChanged,
  tplDueDateChanged,
};
