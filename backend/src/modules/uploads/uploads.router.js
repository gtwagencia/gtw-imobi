'use strict';

/**
 * Upload de arquivos/mídias
 * POST /api/v1/uploads  →  { url, type, name, size, mime }
 */

const { Router } = require('express');
const multer     = require('multer');
const path       = require('path');
const { v4: uuidv4 } = require('uuid');
const { authenticate }  = require('../../middleware/auth');
const storageSvc = require('../../services/storage.service');

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/mpeg', 'audio/ogg', 'audio/webm', 'audio/mp4',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const MIME_EXT = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/gif': '.gif', 'image/webp': '.webp',
  'image/heic': '.heic', 'image/heif': '.heif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
  'audio/mpeg': '.mp3', 'audio/ogg': '.ogg', 'audio/webm': '.weba', 'audio/mp4': '.m4a',
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
};

// Fallback pelo nome do arquivo: alguns navegadores/SOs reportam mimetype genérico ou
// incorreto para arquivos HEIC/MOV exportados de iPhone (ex: imagem identificada como
// "video/quicktime" ou "application/octet-stream"). Nesse caso, confia na extensão.
const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([mime, ext]) => [ext, mime]));

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    const extMime = EXT_MIME[path.extname(file.originalname).toLowerCase()];
    if (extMime) {
      file.mimetype = extMime;
      return cb(null, true);
    }
    cb(Object.assign(new Error('Tipo de arquivo não permitido'), { status: 415 }));
  },
});

const router = Router();

router.post('/', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    const mimeType = req.file.mimetype;
    const ext      = MIME_EXT[mimeType] || path.extname(req.file.originalname).toLowerCase() || '.bin';
    const filename = `${uuidv4()}${ext}`;

    const url = await storageSvc.uploadFile(req.file.buffer, filename, mimeType);

    let type = 'document';
    if (mimeType.startsWith('image/')) type = 'image';
    if (mimeType.startsWith('video/')) type = 'video';
    if (mimeType.startsWith('audio/')) type = 'audio';

    res.json({ url, type, name: req.file.originalname, size: req.file.size, mime: mimeType });
  } catch (err) { next(err); }
});

module.exports = router;
