// Fonction planifiée (Firebase Cloud Functions, 2e génération) : chaque matin, envoie aux appareils
// inscrits les rappels des échéances de Project Master. Toute la logique est dans rappels.js.
// Mise en place : voir JOURNAL.md (section 7, V6) — à déployer une fois depuis Google Cloud Shell.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { run } = require('./rappels');

initializeApp();

exports.rappelsQuotidiens = onSchedule(
  { schedule: '0 7 * * *', timeZone: 'Etc/UTC', region: 'europe-west1', memory: '256MiB', timeoutSeconds: 300, retryCount: 0 },
  async () => {
    const r = await run({
      db: getFirestore(),
      send: (token, data) => getMessaging().send({ token, data, webpush: { headers: { Urgency: 'high', TTL: '86400' } } }),
      ts: FieldValue.serverTimestamp(),
      now: new Date()
    });
    console.log('rappels', JSON.stringify(r));
  }
);
