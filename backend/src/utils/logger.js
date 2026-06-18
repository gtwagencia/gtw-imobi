'use strict';

const winston = require('winston');

const LOG_BUFFER_SIZE = 300;
const logBuffer = [];

/** Transport customizado que mantém os últimos N logs em memória */
class RingBufferTransport extends winston.Transport {
  log(info, callback) {
    logBuffer.push({
      ts:      info.timestamp || new Date().toISOString(),
      level:   info.level,
      message: info.message,
      meta:    info.stack || (info[Symbol.for('splat')] ? JSON.stringify(info[Symbol.for('splat')]) : undefined),
    });
    if (logBuffer.length > LOG_BUFFER_SIZE) logBuffer.shift();
    callback();
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    process.env.NODE_ENV === 'production'
      ? winston.format.json()
      : winston.format.combine(
          winston.format.colorize(),
          winston.format.printf(({ level, message, timestamp, ...meta }) => {
            const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
            return `${timestamp} [${level}]: ${message}${extra}`;
          })
        )
  ),
  transports: [
    new winston.transports.Console(),
    new RingBufferTransport(),
  ],
});

/** Retorna os últimos registros do buffer (mais recentes por último). */
logger.getRecentLogs = (limit = 200) => logBuffer.slice(-limit);

module.exports = logger;
