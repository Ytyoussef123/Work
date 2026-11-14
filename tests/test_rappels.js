// Lancer : node tests/test_rappels.js   (Node seul : ni navigateur, ni Firebase)
// Rappels (V6) : logique de la fonction planifiée (functions/rappels.js), un passage complet sur un faux
// Firestore, et le service worker (sw.js) exécuté dans un bac à sable.
const fs = require('fs'), path = require('path'), vm = require('vm');
const R = require('../functions/rappels.js');

let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
const plus = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TODAY = '2026-11-12';

// Base Project Master de test
const pm = {
  projects: [
    { id: 'Pp1', name: 'Projet réservoir', status: 'Development', tools: [
      { id: 'T1', name: 'Moule', status: 'En cours',
        milestones: [
          { id: 'M1', label: 'RFQ', status: 'À faire', date: plus(TODAY, 7) },
          { id: 'M2', label: 'PO', status: 'Fait', date: plus(TODAY, 2) },
          { id: 'M3', label: 'Livraison', status: 'En cours', date: plus(TODAY, 2) },
          { id: 'M4', label: 'Trial Run', status: 'N-A', date: plus(TODAY, 1) },
          { id: 'M5', label: 'APP', status: 'À faire', date: '' },
          { id: 'M6', label: 'CDC', status: 'À faire', date: plus(TODAY, -3) }],
        notes: [
          { id: 'N1', kind: 'Action', text: 'Relancer le fournisseur', status: 'À faire', dueDate: TODAY },
          { id: 'N2', kind: 'Note', text: 'Simple note', status: '', dueDate: TODAY }],
        subtools: [{ id: 'S1', name: 'Préhenseur', status: 'En cours', milestones: [{ id: 'SM1', label: 'Study review', status: 'À faire', date: plus(TODAY, 3) }], notes: [] }] },
      { id: 'T2', name: 'Outil terminé', status: 'Terminé', milestones: [{ id: 'M9', label: 'Ignoré', status: 'À faire', date: plus(TODAY, 1) }], notes: [], subtools: [] }] },
    { id: 'Pp2', name: 'Projet archivé', status: 'Archived', tools: [{ id: 'T9', name: 'X', milestones: [{ id: 'MX', label: 'Ignoré aussi', status: 'À faire', date: plus(TODAY, 1) }] }] }
  ],
  actions: [
    { id: 'A1', kind: 'Action', text: 'Préparer la revue', status: 'En cours', dueDate: plus(TODAY, 10) },
    { id: 'A2', kind: 'Action', text: 'Valider le budget', status: 'À faire', dueDate: plus(TODAY, 1) },
    { id: 'A3', kind: 'Action', text: 'Déjà faite', status: 'Fait', dueDate: plus(TODAY, 1) }]
};

console.log('1. Documents Firestore → base Project Master');
const p1 = JSON.stringify(pm.projects[0]);
const docs = {
  'projects:Pp1': { j: p1.slice(0, 200), n: 2, v: 'v1', o: 0 }, 'projects:Pp1~1': { j: p1.slice(200), of: 'projects:Pp1', i: 1, v: 'v1' },
  'projects:Pp2': { j: JSON.stringify(pm.projects[1]), n: 1, v: 'x' },
  'projects:Pbad': { j: '{"id":"Pbad"', n: 2, v: 'v2' }, 'projects:Pbad~1': { j: ',"name":"x"}', i: 1, v: 'AUTRE' },   // morceau d'une autre version
  'actions:A1': { j: JSON.stringify(pm.actions[0]), n: 1, v: 'a' }, 'actions:A2': { j: JSON.stringify(pm.actions[1]), n: 1, v: 'a' }, 'actions:A3': { j: JSON.stringify(pm.actions[2]), n: 1, v: 'a' },
  'customers:Pc1': { j: '{"id":"Pc1","name":"FORD"}', n: 1, v: 'c' }, '_main': { j: '{}', n: 1, v: 'm' }
};
const rebuilt = R.pmFromRecords(R.reassemble(docs));
check('projet découpé en 2 morceaux recollé', rebuilt.projects.some(p => p.id === 'Pp1' && JSON.stringify(p) === p1));
check('morceaux de versions différentes : enregistrement ignoré', !rebuilt.projects.some(p => p.id === 'Pbad'));
check('actions générales lues, clients ignorés', rebuilt.actions.length === 3 && rebuilt.projects.length === 2);

console.log('2. Échéances suivies');
const items = R.collectItems(pm);
const keys = items.map(i => i.key).sort();
check('jalons non faits datés, action d\'outil, sous-outil, actions générales non faites', JSON.stringify(keys) === JSON.stringify(['a:A1', 'a:A2', 'm:M1', 'm:M3', 'm:M6', 'm:SM1', 'n:N1'].sort()), keys);
check('lien vers le sous-outil', (items.find(i => i.key === 'm:SM1') || {}).link.s === 'S1');
check('« où » : projet › outil › sous-outil', (items.find(i => i.key === 'm:SM1') || {}).where === 'Projet réservoir › Moule › Préhenseur');

console.log('3. Rappels du jour selon les choix de l\'appareil');
const ids = list => list.map(x => x.key + '@' + x.stage).sort();
let due = R.dueFor(items, R.DEFAULT_PREFS, TODAY, {});
check('par défaut (7 jours avant + actions) : tout ce qui tombe dans les 7 jours', JSON.stringify(ids(due)) === JSON.stringify(['a:A2@j7', 'm:M1@j7', 'm:M3@j7', 'm:SM1@j7', 'n:N1@j7'].sort()), ids(due));
check('triés du plus proche au plus lointain', due[0].d === 0 && due[due.length - 1].d === 7, due.map(x => x.d));
const sent = {}; due.forEach(x => { sent[x.sentKey] = TODAY; });
check('lendemain : rien de nouveau (déjà rappelé)', R.dueFor(items, R.DEFAULT_PREFS, plus(TODAY, 1), sent).length === 0);
due = R.dueFor(items, { j7: true, j3: true, j0: true, retard: true, actions: false }, TODAY, {});
check('toutes les étapes, sans les actions : l\'étape la plus précise', JSON.stringify(ids(due)) === JSON.stringify(['m:M1@j7', 'm:M3@j3', 'm:SM1@j3', 'm:M6@retard'].sort()), ids(due));
const s2 = {}; R.dueFor(items, { j7: true, j3: true }, TODAY, {}).forEach(x => { s2[x.sentKey] = TODAY; });
const later = R.dueFor(items, { j7: true, j3: true }, plus(TODAY, 4), s2);
check('4 jours plus tard : le RFQ passe à « 3 jours avant », l\'action à J+10 entre dans les 7 jours', JSON.stringify(ids(later)) === JSON.stringify(['a:A1@j7', 'm:M1@j3']), ids(later));
const moved = items.map(x => x.key === 'm:M3' ? Object.assign({}, x, { date: plus(TODAY, 5) }) : x);
check('date d\'un jalon changée : nouveau rappel', R.dueFor(moved, R.DEFAULT_PREFS, TODAY, sent).map(x => x.key).join() === 'm:M3');
check('jours calendaires sans fuseau', R.days('2026-03-28', '2026-03-30') === 2 && R.days('2026-12-31', '2027-01-01') === 1);
const instant = new Date('2026-11-12T23:30:00Z');
check('« aujourd\'hui » dans le fuseau de l\'appareil', R.todayIn('Europe/Paris', instant) === '2026-11-13' && R.todayIn('America/New_York', instant) === '2026-11-12', [R.todayIn('Europe/Paris', instant), R.todayIn('America/New_York', instant)]);

console.log('4. Texte des notifications');
let msg = R.message([Object.assign({}, items.find(i => i.key === 'm:SM1'), { d: 3 })]);
check('un rappel : titre, texte, lien vers le sous-outil', msg.title === 'Jalon dans 3 jours (' + plus(TODAY, 3).slice(8, 10) + '/' + plus(TODAY, 3).slice(5, 7) + ')' && msg.body === 'Study review\nProjet réservoir › Moule › Préhenseur' && msg.url === 'plateforme.html#rappel=p/Pp1/t/T1/s/S1', msg);
msg = R.message(R.dueFor(items, R.DEFAULT_PREFS, TODAY, {}).concat(R.dueFor(items, { j7: false, retard: true }, TODAY, {})));
check('plusieurs : un seul message groupé (5 lignes au plus) vers la liste', /^6 échéances à suivre$/.test(msg.title) && msg.body.split('\n').length === 6 && /… et 1 autre/.test(msg.body) && msg.url === 'plateforme.html#rappel=liste', msg);
check('action générale : lien vers le plan d\'actions', R.message([Object.assign({}, items.find(i => i.key === 'a:A2'), { d: 1 })]).url === 'plateforme.html#rappel=a');
check('que du texte (exigé par FCM)', Object.values(msg).every(v => typeof v === 'string'));
check('les envois de plus de 90 jours sont oubliés', JSON.stringify(R.prune({ a: '2026-01-01', b: '2026-11-01' }, TODAY)) === '{"b":"2026-11-01"}');

console.log('5. Passage complet sur un faux Firestore');
function fakeDb(init) {
  const store = new Map(Object.entries(init));
  const docRef = p => ({
    id: p.split('/').pop(), path: p,
    collection: c => collRef(p + '/' + c),
    async get() { return { exists: store.has(p), id: p.split('/').pop(), data: () => store.get(p) }; },
    async set(v, o) { store.set(p, o && o.merge ? Object.assign({}, store.get(p) || {}, v) : v); },
    async delete() { store.delete(p); }
  });
  const collRef = c => ({
    doc: id => docRef(c + '/' + id),
    async get() {
      const list = [...store.keys()].filter(k => k.startsWith(c + '/') && !k.slice(c.length + 1).includes('/'))
        .map(k => ({ id: k.split('/').pop(), data: () => store.get(k), ref: docRef(k) }));
      return { docs: list, size: list.length, forEach: f => list.forEach(f) };
    }
  });
  return { store, collection: c => collRef(c) };
}
(async () => {
  const init = {};
  for (const id in docs) init['app/pm_db/r/' + id] = docs[id];
  init['app/_rappels/appareils/dev1'] = { token: 'TOK1', tz: 'Europe/Paris', prefs: R.DEFAULT_PREFS };
  init['app/_rappels/appareils/dev2'] = { token: 'TOK2', tz: 'Europe/Paris', prefs: { j7: false, j0: true, actions: true } };
  init['app/_rappels/appareils/dev3'] = { token: 'MORT', tz: 'Europe/Paris', prefs: R.DEFAULT_PREFS };
  init['app/_rappels/appareils/dev4'] = { tz: 'Europe/Paris' };   // sans jeton : ignoré
  init['app/_rappels'] = { vapid: 'BCLE' };
  const db = fakeDb(init);
  const sends = [];
  const send = async (token, data) => {
    if (token === 'MORT') { const e = new Error('gone'); e.code = 'messaging/registration-token-not-registered'; throw e; }
    sends.push({ token, data });
  };
  const now = new Date(TODAY + 'T07:00:00Z');
  const r1 = await R.run({ db, send, ts: 'TS', now });
  check('passage : un message par appareil concerné', sends.length === 2 && sends.some(s => s.token === 'TOK1') && sends.some(s => s.token === 'TOK2'), sends.map(s => s.token));
  check('appareil 1 (7 jours) : 5 échéances groupées', (sends.find(s => s.token === 'TOK1') || {}).data.title === '5 échéances à suivre', sends.find(s => s.token === 'TOK1'));
  check('appareil 2 (le jour même) : l\'action du jour seule', (sends.find(s => s.token === 'TOK2') || {}).data.title === 'Action aujourd\'hui (12/11)', sends.find(s => s.token === 'TOK2'));
  check('appareil désinscrit (jeton mort) : retiré', !db.store.has('app/_rappels/appareils/dev3') && r1.retires === 1, r1);
  check('compte rendu dans app/_rappels, clé Web Push conservée', JSON.stringify(db.store.get('app/_rappels')) === JSON.stringify({ vapid: 'BCLE', dernierPassage: 'TS', appareils: 4, envoyes: 2, retires: 1, erreurs: 0 }), db.store.get('app/_rappels'));
  check('journal des envois par appareil', Object.keys((db.store.get('app/_rappels/envois/dev1') || {}).cles || {}).length === 5);
  sends.length = 0;
  await R.run({ db, send, ts: 'TS2', now: new Date(TODAY + 'T15:00:00Z') });
  check('deuxième passage le même jour : rien n\'est renvoyé', sends.length === 0, sends);
  const pDoc = JSON.parse(db.store.get('app/pm_db/r/projects:Pp2').j);   // un nouveau jalon arrive (projet non archivé)
  pDoc.status = 'Development'; db.store.set('app/pm_db/r/projects:Pp2', { j: JSON.stringify(pDoc), n: 1, v: 'y' });
  await R.run({ db, send, ts: 'TS3', now: new Date(plus(TODAY, 1) + 'T07:00:00Z') });
  const t1 = sends.find(s => s.token === 'TOK1'), t2 = sends.find(s => s.token === 'TOK2');
  check('lendemain, appareil 1 : seulement la nouvelle échéance', sends.length === 2 && t1 && t1.data.title === 'Jalon aujourd\'hui (13/11)' && /Ignoré aussi/.test(t1.data.body), sends);
  check('lendemain, appareil 2 (le jour même) : la nouvelle + l\'action due ce jour-là', t2 && t2.data.title === '2 échéances à suivre' && /Valider le budget — aujourd'hui/.test(t2.data.body), t2);

  console.log('6. Service worker (sw.js) dans un bac à sable');
  const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
  const listeners = {}, shown = [], opened = [], posted = [];
  let bg = null, imported = [];
  const clientsList = [];
  const self = {
    registration: { scope: 'https://ytyoussef123.github.io/Work/', showNotification: async (t, o) => { shown.push([t, o]); } },
    clients: { matchAll: async () => clientsList, openWindow: async u => { opened.push(u); }, claim: async () => {} },
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); }, skipWaiting: () => {}
  };
  const sandbox = { self, URL, importScripts: (...u) => { imported.push(...u); },
    firebase: { initializeApp: c => { sandbox.cfg = c; }, messaging: () => ({ onBackgroundMessage: f => { bg = f; } }) } };
  vm.runInNewContext(src, sandbox);
  check('charge Firebase 12.19.0 (app + messaging)', imported.length === 2 && imported.every(u => /firebasejs\/12\.19\.0\/firebase-(app|messaging)-compat\.js$/.test(u)), imported);
  check('même projet Firebase que l\'app', sandbox.cfg && sandbox.cfg.projectId === 'work-75094' && sandbox.cfg.messagingSenderId === '960808610888');
  const page = fs.readFileSync(path.join(__dirname, '..', 'plateforme.html'), 'utf8');
  check('clé et appId identiques à plateforme.html', page.includes("apiKey: '" + sandbox.cfg.apiKey + "'") && page.includes("appId: '" + sandbox.cfg.appId + "'"));
  await bg({ data: { title: 'Jalon demain (13/11)', body: 'RFQ\nProjet › Moule', url: 'plateforme.html#rappel=p/Pp1/t/T1', tag: 'rappel-m:M1' } });
  check('rappel reçu application fermée : notification affichée', shown.length === 1 && shown[0][0] === 'Jalon demain (13/11)' && shown[0][1].body === 'RFQ\nProjet › Moule' && shown[0][1].tag === 'rappel-m:M1' && shown[0][1].data.url === 'plateforme.html#rappel=p/Pp1/t/T1', shown);
  const click = async () => { let w; const ev = { notification: { data: { url: 'plateforme.html#rappel=p/Pp1/t/T1' }, close() { ev.closed = true; } }, waitUntil: p => { w = p; } }; listeners.notificationclick.forEach(f => f(ev)); await w; return ev; };
  let ev = await click();
  check('clic, app fermée : ouvre l\'app sur l\'échéance', ev.closed && opened[0] === 'https://ytyoussef123.github.io/Work/plateforme.html#rappel=p/Pp1/t/T1', opened);
  clientsList.push({ url: 'https://ytyoussef123.github.io/Work/plateforme.html', postMessage: m => posted.push(m), focus: async () => { posted.push('focus'); } });
  ev = await click();
  check('clic, app déjà ouverte : elle reçoit le lien et passe au premier plan', opened.length === 1 && posted[0].rappel === 'https://ytyoussef123.github.io/Work/plateforme.html#rappel=p/Pp1/t/T1' && posted[1] === 'focus', posted);
  check('pas d\'interception des pages (aucun « fetch »)', !listeners.fetch);

  console.log('7. V19 : résultat d\'envoi par appareil, bouton « Tester » (fonction rappelsTest)');
  const init7 = {};
  for (const id in docs) init7['app/pm_db/r/' + id] = docs[id];
  init7['app/_rappels/appareils/devA'] = { token: 'TOKA', email: 'A@Test.fr', tz: 'Europe/Paris', prefs: R.DEFAULT_PREFS };
  init7['app/_rappels/appareils/devE'] = { token: 'ERR', email: 'e@test.fr', tz: 'Europe/Paris', prefs: R.DEFAULT_PREFS };
  init7['app/_rappels/appareils/devM'] = { token: 'MORT', email: 'm@test.fr', tz: 'Europe/Paris', prefs: R.DEFAULT_PREFS };
  init7['app/_rappels/envois/devA'] = { cles: { 'm:OLD|2026-01-02|j7': '2026-01-02' }, dernierTest: 'T0' };
  const db7 = fakeDb(init7), sends7 = [];
  const send7 = async (token, data, ttl) => {
    if (token === 'MORT') { const e = new Error('gone'); e.code = 'messaging/registration-token-not-registered'; throw e; }
    if (token === 'ERR') { const e = new Error('Auth error from APNS or Web Push Service'); e.code = 'messaging/third-party-auth-error'; throw e; }
    sends7.push({ token, data, ttl });
  };
  const r7 = await R.run({ db: db7, send: send7, ts: 'TS7', now: new Date(TODAY + 'T07:00:00Z') });
  const eA = db7.store.get('app/_rappels/envois/devA') || {}, eE = db7.store.get('app/_rappels/envois/devE') || {};
  check('envoi réussi : « dernierEnvoi » noté, test précédent conservé, vieux envois oubliés', eA.dernierEnvoi === 'TS7' && eA.derniereErreur === '' && eA.dernierTest === 'T0' && !eA.cles['m:OLD|2026-01-02|j7'] && Object.keys(eA.cles).length === 5, eA);
  check('envoi refusé par Firebase : erreur notée pour l\'appareil (code + texte), pas d\'envoi marqué', /third-party-auth-error : Auth error/.test(eE.derniereErreur || '') && eE.erreurLe === 'TS7' && !eE.cles, eE);
  check('compte rendu : erreurs comptées', r7.erreurs === 1 && r7.retires === 1 && (db7.store.get('app/_rappels') || {}).erreurs === 1, r7);
  const A7 = { uid: 'u1', token: { email: 'a@test.fr' } };
  let t7 = await R.test({ db: db7, send: send7, data: { ping: true } });
  check('ping (sans connexion) : « serveur installé »', t7.ok === true && t7.ping === true && t7.v === 19, t7);
  t7 = await R.test({ db: db7, send: send7, auth: null, data: { id: 'devA' } });
  check('test sans connexion : refusé', t7.ok === false && t7.code === 'unauthenticated', t7);
  t7 = await R.test({ db: db7, send: send7, auth: A7, data: { id: '../x' } });
  check('identifiant d\'appareil invalide : refusé', t7.code === 'invalid-argument', t7);
  t7 = await R.test({ db: db7, send: send7, auth: A7, data: { id: 'devInconnu' } });
  check('appareil pas inscrit côté serveur : « Réactiver »', t7.code === 'not-found' && /Réactiver/.test(t7.message), t7);
  t7 = await R.test({ db: db7, send: send7, auth: { uid: 'u2', token: { email: 'autre@test.fr' } }, data: { id: 'devA' } });
  check('appareil d\'un autre compte : refusé, rien envoyé', t7.code === 'permission-denied' && !sends7.some(s => s.data === R.TEST_MSG), t7);
  sends7.length = 0;
  t7 = await R.test({ db: db7, send: send7, auth: A7, data: { id: 'devA' }, ts: 'TS8' });
  check('test : vraie notification envoyée à cet appareil (validité 10 min), date du test notée', t7.ok === true && sends7.length === 1 && sends7[0].token === 'TOKA' && sends7[0].data.title === '🔔 Test des rappels' && sends7[0].ttl === '600' && db7.store.get('app/_rappels/envois/devA').dernierTest === 'TS8' && db7.store.get('app/_rappels/envois/devA').dernierEnvoi === 'TS7', [t7, sends7]);
  check('message du test : que du texte (exigé par FCM)', Object.values(R.TEST_MSG).every(v => typeof v === 'string'));
  db7.store.set('app/_rappels/appareils/devM', { token: 'MORT', email: 'a@test.fr' });
  t7 = await R.test({ db: db7, send: send7, auth: A7, data: { id: 'devM' } });
  check('jeton expiré : appareil oublié, « Réactiver »', t7.code === 'token' && /Réactiver/.test(t7.message) && !db7.store.has('app/_rappels/appareils/devM'), t7);
  db7.store.set('app/_rappels/appareils/devE', { token: 'ERR', email: 'a@test.fr' });
  t7 = await R.test({ db: db7, send: send7, auth: A7, data: { id: 'devE' }, ts: 'TS9' });
  check('autre refus de Firebase : message avec le code, erreur notée', t7.code === 'fcm' && /third-party-auth-error/.test(t7.message) && db7.store.get('app/_rappels/envois/devE').erreurLe === 'TS9', t7);

  // La vraie fonction « callable » (index.js) derrière un serveur HTTP local : même protocole que l'app
  // (POST { data }, jeton Google en « Authorization: Bearer », réponse { result }) ; Firestore et FCM remplacés
  // par les faux ; jeton non vérifié (mode test de firebase-functions), CORS pour l'adresse GitHub Pages.
  process.env.FIREBASE_DEBUG_MODE = 'true';
  process.env.FIREBASE_DEBUG_FEATURES = JSON.stringify({ skipTokenVerification: true });
  process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-test';
  const FN = path.join(__dirname, '..', 'functions');
  const fcm = [];
  const stub = (mod, exp) => { const f = require.resolve(mod, { paths: [FN] }); require.cache[f] = { id: f, filename: f, loaded: true, exports: exp }; };
  stub('firebase-admin/firestore', { getFirestore: () => db7, FieldValue: { serverTimestamp: () => 'TSH' } });
  stub('firebase-admin/messaging', { getMessaging: () => ({ send: async m => { fcm.push(m); return 'projects/x/messages/1'; } }) });
  const fns = require(path.join(FN, 'index.js'));
  check('index.js : rappelsTest « callable » en europe-west1 (2e génération), rappelsQuotidiens toujours planifiée à 07:00 UTC',
    !!(fns.rappelsTest.__endpoint || {}).callableTrigger && fns.rappelsTest.__endpoint.region[0] === 'europe-west1' && fns.rappelsTest.__endpoint.platform === 'gcfv2' &&
    ((fns.rappelsQuotidiens.__endpoint || {}).scheduleTrigger || {}).schedule === '0 7 * * *', fns.rappelsTest.__endpoint);
  const express = require(path.join(FN, 'node_modules', 'express'));
  const app = express(); app.use(express.json()); app.use((req, res) => fns.rappelsTest(req, res));
  const srv = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const URL0 = 'http://127.0.0.1:' + srv.address().port + '/', ORIGIN = 'https://ytyoussef123.github.io';
  const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const idTok = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({ sub: 'u1', user_id: 'u1', email: 'a@test.fr' }) + '.c2ln';
  const call = (data, tok) => fetch(URL0, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Origin: ORIGIN }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: JSON.stringify({ data }) });
  try {
    const pre = await fetch(URL0, { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    const ah = (pre.headers.get('access-control-allow-headers') || '').toLowerCase();
    check('CORS : l\'app (GitHub Pages) peut appeler la fonction avec son jeton', pre.status === 204 && [ORIGIN, '*'].includes(pre.headers.get('access-control-allow-origin')) && ah.includes('authorization') && ah.includes('content-type'), [pre.status, pre.headers.get('access-control-allow-origin'), ah]);
    let res = await call({ ping: true });
    let body = await res.json();
    check('HTTP : ping sans jeton → { result: { ok, ping } }', res.status === 200 && body.result && body.result.ok === true && body.result.ping === true && !!res.headers.get('access-control-allow-origin'), [res.status, body]);
    res = await call({ id: 'devA' }, idTok); body = await res.json();
    const m0 = fcm[fcm.length - 1] || {};
    check('HTTP : test avec le jeton Google → notification FCM à cet appareil (message « data », urgent, 10 min)', res.status === 200 && body.result && body.result.ok === true && m0.token === 'TOKA' && m0.data && m0.data.title === '🔔 Test des rappels' && m0.webpush.headers.Urgency === 'high' && m0.webpush.headers.TTL === '600', [res.status, body, m0]);
    res = await call({ id: 'devA' }); body = await res.json();
    check('HTTP : test sans jeton → refus lisible par le panneau', res.status === 200 && body.result && body.result.code === 'unauthenticated', [res.status, body]);
  } finally { srv.close(); }

  console.log(`\n${pass} réussis, ${fail} échoués`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR', e); process.exit(2); });
