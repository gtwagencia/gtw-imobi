'use strict';

// Gera um par de chaves VAPID para as notificações push (web-push).
// Rode uma única vez por ambiente e copie a saída para o .env:
//
//   node scripts/generate-vapid-keys.js
//
const webpush = require('web-push');

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log('Adicione estas linhas ao seu .env:\n');
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VAPID_SUBJECT=mailto:contato@gtwagencia.com.br`);
