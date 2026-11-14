// Fonctions des rappels de Project Master (Firebase Cloud Functions, 2e génération). Toute la logique est dans rappels.js.
//  - rappelsQuotidiens : chaque matin, envoie aux appareils inscrits les rappels des échéances.
//  - rappelsTest (V19) : bouton « Tester » du panneau Rappels — envoie tout de suite une vraie notification à l'appareil
//    qui la demande, par le même chemin que le matin, et rend le résultat ; répond aussi au « ping » du panneau
//    (« serveur installé ? »). Fonction « callable » : l'app l'appelle avec le jeton de connexion Google.
// Mise en place : voir JOURNAL.md (section 7, V6 et V19) — à déployer une fois depuis Google Cloud Shell.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { onCall } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { run, test } = require('./rappels');

initializeApp();

// Envoi FCM d'un message « data » (titre, texte, lien, étiquette), affiché par sw.js ou par l'app ouverte
const send = (token, data, ttl) => getMessaging().send({ token, data, webpush: { headers: { Urgency: 'high', TTL: ttl || '86400' } } });

exports.rappelsQuotidiens = onSchedule(
  { schedule: '0 7 * * *', timeZone: 'Etc/UTC', region: 'europe-west1', memory: '256MiB', timeoutSeconds: 300, retryCount: 0 },
  async () => {
    const r = await run({ db: getFirestore(), send, ts: FieldValue.serverTimestamp(), now: new Date() });
    console.log('rappels', JSON.stringify(r));
  }
);

exports.rappelsTest = onCall(
  { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 30, maxInstances: 2, cors: true },
  async req => {
    const r = await test({ db: getFirestore(), send, auth: req.auth, data: req.data, ts: FieldValue.serverTimestamp() });
    if (!r.ok) console.warn('test de rappel', JSON.stringify(r));
    return r;
  }
);
