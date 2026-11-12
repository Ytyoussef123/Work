// Lancer : node tests/test_sync.js   (Playwright requis ; aucun accès réseau ni compte Firebase nécessaire)
// Test de la synchro Firebase de plateforme.html avec un faux serveur (plusieurs "postes").
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const APP = process.argv[2] || path.join(__dirname, '..', 'plateforme.html');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock_firebase.js'), 'utf8');
const HTML = fs.readFileSync(APP, 'utf8');
const JSZIP = (() => { try { return fs.readFileSync(path.join(__dirname, 'node_modules/jszip/dist/jszip.min.js'), 'utf8'); } catch (e) { return null; } })();

// ─── Faux serveur ───
const docs = new Map(), files = new Map(), listens = [];
const members = new Set(['a@test.fr', 'b@test.fr', 'c@test.fr']);
const stats = { writes: 0, puts: 0 };
const pages = new Map();
async function broadcast(path, changes) {
  for (const l of listens) if (l.path === path) {
    const p = pages.get(l.pid); if (!p || p.isClosed()) continue;
    p.evaluate(([lid, ch]) => window.__mockFire && window.__mockFire(lid, ch), [l.lid, changes]).catch(() => {});
  }
}
function backend(pid) {
  return async (op, a) => {
    if (op === 'getDoc') { if (a.path.startsWith('membres/')) return members.has(a.path.slice(8)) ? { ok: 1 } : null; return docs.get(a.path) || null; }
    if (op === 'list') return [...docs.entries()].filter(([p]) => p.startsWith(a.path + '/') && !p.slice(a.path.length + 1).includes('/')).map(([p, d]) => ({ id: p.split('/').pop(), data: d }));
    if (op === 'listen') {
      listens.push({ pid, path: a.path, lid: a.lid });
      const init = [...docs.entries()].filter(([p]) => p.startsWith(a.path + '/') && !p.slice(a.path.length + 1).includes('/')).map(([p, d]) => ({ type: 'added', id: p.split('/').pop(), data: d }));
      setTimeout(() => pages.get(pid).evaluate(([lid, ch]) => window.__mockFire(lid, ch), [a.lid, init]).catch(() => {}), 5);
      return true;
    }
    if (op === 'unlisten') { const i = listens.findIndex(l => l.lid === a.lid); if (i >= 0) listens.splice(i, 1); return true; }
    if (op === 'commit') {
      if (!members.has(a.email)) return { error: 'permission-denied' };
      const byColl = {};
      for (const o of a.ops) {
        stats.writes++;
        const coll = o.path.split('/').slice(0, -1).join('/'), id = o.path.split('/').pop();
        const had = docs.has(o.path);
        if (o.t === 'merge') o.data = Object.assign({}, docs.get(o.path) || {}, o.data);   // set(..., { merge: true })
        if (o.t === 'set' || o.t === 'merge') { docs.set(o.path, o.data); (byColl[coll] = byColl[coll] || []).push({ type: had ? 'modified' : 'added', id, data: o.data }); }
        else if (had) { docs.delete(o.path); (byColl[coll] = byColl[coll] || []).push({ type: 'removed', id }); }
      }
      for (const c in byColl) await broadcast(c, byColl[c]);
      return true;
    }
    if (op === 'put') { stats.puts++; files.set(a.path, a.data); return true; }
    if (op === 'url') return files.has(a.path) ? 'https://firebasestorage.googleapis.com/v0/b/work-75094.firebasestorage.app/o/' + encodeURIComponent(a.path) + '?alt=media&token=t1' : null;
  };
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const PNG2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYPj/n4GBgYGJAQoAGRUBA0bdtZ8AAAAASUVORK5CYII=';

let browser;
const errors = [];
async function device(name, seed, email) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  pages.set(name, page);
  page.on('pageerror', e => errors.push(name + ': ' + e.message));
  page.on('dialog', d => { const h = page.__dialog || 'accept'; h === 'accept' ? d.accept() : d.dismiss(); });
  await page.exposeFunction('__be', backend(name));
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith('http://app.test/')) return route.fulfill({ contentType: 'text/html', body: HTML });
    if (JSZIP && /jszip/.test(u)) return route.fulfill({ contentType: 'text/javascript', body: JSZIP });
    if (u.includes('/firebasejs/') || u.includes('npm/firebase@')) return route.fulfill({ contentType: 'text/javascript', body: u.includes('-app-compat') ? MOCK : '' });
    if (u.startsWith('https://firebasestorage.googleapis.com/')) {
      const p = decodeURIComponent(u.split('/o/')[1].split('?')[0]); const d = files.get(p);
      if (!d) return route.fulfill({ status: 404, body: '' });
      const [h, b64] = d.split(','); return route.fulfill({ status: 200, contentType: h.slice(5).split(';')[0], headers: { 'access-control-allow-origin': '*' }, body: Buffer.from(b64, 'base64') });
    }
    return route.abort();
  });
  if (seed) await page.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); for (const k in s) localStorage.setItem(k, s[k]); } }, seed);
  await page.addInitScript(e => { window.__mockEmail = e; }, email);
  await page.goto('http://app.test/plateforme.html');
  await page.waitForFunction(() => window.fbSync && typeof window.fbSync.state === 'function');
  return page;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitState(p, s, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(() => fbSync.state()) === s) return true; await sleep(100); } throw new Error('state ' + s + ' not reached, got ' + await p.evaluate(() => fbSync.state())); }
const login = async (p, e) => { await p.waitForFunction(() => typeof window.__mockLogin === 'function'); return p.evaluate(e => window.__mockLogin(e), e); };   // attendre le chargement du (faux) SDK
const getLS = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k)), k);
let pass = 0, fail = 0;
const canon = v => JSON.stringify(v, function (k, x) { if (Array.isArray(x)) return x.every(e => e && e.id) ? [...x].sort((a, b) => String(a.id).localeCompare(String(b.id))) : x; if (x && typeof x === 'object') return Object.keys(x).sort().reduce((o, kk) => (o[kk] = x[kk], o), {}); return x; });
function check(name, ok, extra) { if (ok) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 300) : ''); } }
async function settle(...ps) { await sleep(400); for (const p of ps) { const t = Date.now(); while (Date.now() - t < 8000 && (await p.evaluate(() => fbSync.dirty().length || fbSync.state() === 'sync'))) await sleep(100); } await sleep(500); }

(async () => {
  browser = await chromium.launch();
  // Données de départ du poste A
  const purchasesA = [1, 2, 3].map(i => ({ id: 'ID100' + i, line: i, projet: 'P' + i, description: 'Achat ' + i, puHT: 10 * i, quantite: 1, capexOpex: 'OPEX', attachments: i === 1 ? [{ id: 'Fatt1', name: 'offre.pdf', size: 5, type: 'application/pdf' }] : [] }));
  const engA = { companies: [{ id: 'ec1', name: 'Akwel' }], types: [{ id: 'et1', name: 'Sensor', fields: [] }], solutions: [{ id: 'es1', name: 'Sol 1', specHtml: '<p>Texte</p><img src="' + PNG + '" width="120">' }], projects: [], acceptances: [], branding: { logo: PNG2, docname: 'Doc', label: 'TS', conf: '', code: '' } };
  const pmA = { projects: [{ id: 'Pp1', name: 'Projet 1', products: [{ id: 'pr1', name: 'Tube', bom: [{ id: 'b1', ref: 'R1', photo: PNG2, sub: null }] }], tools: [] }], customers: [{ id: 'Pc1', name: 'FORD' }], lines: [], actions: [] };
  const SA = { projets: ['P1', 'P2', 'P3'], fournisseurs: ['F1'], references: [], acheteurs: ['YT'], budgets: [{ id: 'B1', projet: 'P1', type: 'OPEX', label: 'Budget 1', montant: 1000 }] };
  const seedA = { suivi_autosave: JSON.stringify(purchasesA), eng_db: JSON.stringify(engA), pm_db: JSON.stringify(pmA), suivi_settings: JSON.stringify(SA), hp_suppliers: JSON.stringify({ F1: { delai: '2 sem' } }) };

  console.log('1. Poste A : première connexion, serveur vide → envoi de tout');
  const A = await device('A', seedA, 'a@test.fr');
  await waitState(A, 'out');
  check('état « non connecté » avant connexion', true);
  check('les achats locaux sont affichés', (await A.evaluate(() => purchases.length)) === 3);
  // pièce jointe locale dans hp_files
  await A.evaluate(() => new Promise(res => { const r = indexedDB.open('hp_files', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => { const t = r.result.transaction('files', 'readwrite'); t.objectStore('files').put({ blob: new Blob(['%PDF-'], { type: 'application/pdf' }), name: 'offre.pdf', type: 'application/pdf' }, 'Fatt1'); t.oncomplete = res; }; }));
  await login(A, 'a@test.fr');
  await settle(A);
  check('état « synchronisé »', (await A.evaluate(() => fbSync.state())) === 'ok', await A.evaluate(() => fbSync.state()));
  const pdocs = [...docs.keys()].filter(p => p.startsWith('app/suivi_autosave/r/'));
  check('un document par achat (3)', pdocs.length === 3, pdocs);
  const sol = docs.get('app/eng_db/r/solutions:es1');
  check('solution envoyée avec l\'image remplacée par un jeton', sol && /fbimg:[0-9a-f]{16}/.test(sol.j) && !sol.j.includes('base64'), sol && sol.j.slice(0, 200));
  check('images envoyées dans Storage', [...files.keys()].filter(k => k.startsWith('app/img/')).length === 2, [...files.keys()]);
  check('pièce jointe envoyée dans Storage', files.has('app/files/Fatt1'));
  check('aucun document > 1 Mo', [...docs.values()].every(d => JSON.stringify(d).length < 1000000));

  console.log('2. Poste B vide : reçoit tout');
  const B = await device('B', null, 'b@test.fr');
  await login(B, 'b@test.fr');
  await settle(B);
  const pb = await getLS(B, 'suivi_autosave');
  check('B a les 3 achats', pb && pb.length === 3, pb);
  check('variable purchases de B à jour', (await B.evaluate(() => purchases.length)) === 3);
  const eb = await getLS(B, 'eng_db');
  check('B : image de la solution redevenue data URL', eb && eb.solutions[0].specHtml.includes(PNG), eb && eb.solutions[0].specHtml.slice(0, 120));
  check('B : logo identique', eb && eb.branding.logo === PNG2);
  const pmb = await getLS(B, 'pm_db');
  check('B : photo BOM identique', pmb && pmb.projects[0].products[0].bom[0].photo === PNG2);
  check('B : paramètres et budgets', JSON.stringify(await getLS(B, 'suivi_settings')) === JSON.stringify(SA), await getLS(B, 'suivi_settings'));
  check('B : fiches fournisseurs', (await getLS(B, 'hp_suppliers')).F1.delai === '2 sem');
  await sleep(500);
  const hasAtt = await B.evaluate(() => new Promise(res => { const r = indexedDB.open('hp_files', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => { const q = r.result.transaction('files').objectStore('files').get('Fatt1'); q.onsuccess = () => res(!!(q.result && q.result.blob)); }; }));
  check('B : pièce jointe téléchargée dans hp_files', hasAtt);
  const w0 = stats.writes;
  check('B n\'a rien renvoyé au serveur', stats.writes === w0);

  console.log('3. A ajoute un achat → B le reçoit');
  await A.evaluate(() => { purchases.push({ id: 'ID2001', line: 4, projet: 'P1', description: 'Nouveau', puHT: 5, quantite: 2, capexOpex: 'OPEX' }); autosave(); });
  await settle(A, B);
  check('B a 4 achats', (await B.evaluate(() => purchases.length)) === 4);
  check('tableau de B mis à jour (badge)', (await B.evaluate(() => document.getElementById('totalBadge').textContent)) === '4', await B.evaluate(() => document.getElementById('totalBadge').textContent));
  check('une seule écriture pour un ajout', stats.writes - w0 === 1, stats.writes - w0);

  console.log('4. Modifications croisées : B modifie l\'achat 2, A supprime l\'achat 3');
  await B.evaluate(() => { const p = purchases.find(p => p.id === 'ID1002'); p.description = 'Modifié par B'; autosave(); });
  await A.evaluate(() => { const i = purchases.findIndex(p => p.id === 'ID1003'); purchases.splice(i, 1); autosave(); });
  await settle(A, B);
  const pa = await getLS(A, 'suivi_autosave'), pb2 = await getLS(B, 'suivi_autosave');
  check('A et B identiques', JSON.stringify(pa) === JSON.stringify(pb2), [pa.map(p => p.id), pb2.map(p => p.id)]);
  check('modification de B présente chez A', pa.find(p => p.id === 'ID1002').description === 'Modifié par B');
  check('achat 3 supprimé chez B', !pb2.find(p => p.id === 'ID1003'));

  console.log('5. Engineering : A modifie une solution (projet ouvert chez B)');
  await B.evaluate(() => { switchApp('engineering'); });
  await A.evaluate(() => { switchApp('engineering'); const s = engDB.solutions[0]; s.name = 'Sol 1 bis'; s.specHtml += '<img src="' + 'data:image/png;base64,' + btoa('nouvelle-image-' + 'x'.repeat(50)) + '">'; engSave(); });
  await settle(A, B);
  check('engDB de B à jour', (await B.evaluate(() => engDB.solutions[0].name)) === 'Sol 1 bis');
  check('bandeau « mis à jour par l\'équipe » chez B', await B.evaluate(() => !!document.querySelector('#fb-banner.on')));
  check('nouvelle image envoyée', [...files.keys()].filter(k => k.startsWith('app/img/')).length === 3);
  await B.click('#fb-banner-go');
  check('actualisation sans erreur', true);

  console.log('6. Gros enregistrement (> 900 000 caractères) découpé');
  await A.evaluate(() => { pmDB.projects[0].comments = 'x'.repeat(2100000); pmSave(); });
  await settle(A, B);
  const chunks = [...docs.keys()].filter(k => k.startsWith('app/pm_db/r/projects:Pp1'));
  check('projet découpé en 3 documents', chunks.length === 3, chunks);
  check('B a le projet complet', (await B.evaluate(() => JSON.parse(localStorage.getItem('pm_db')).projects[0].comments.length)) === 2100000);
  await A.evaluate(() => { pmDB.projects[0].comments = 'court'; pmSave(); });
  await settle(A, B);
  check('morceaux en trop effacés après réduction', [...docs.keys()].filter(k => k.startsWith('app/pm_db/r/projects:Pp1')).length === 1);
  check('B a la version courte', (await B.evaluate(() => JSON.parse(localStorage.getItem('pm_db')).projects[0].comments)) === 'court');

  console.log('7. Poste C avec ses propres données : fusion');
  const seedC = { suivi_autosave: JSON.stringify([{ id: 'IDC1', line: 1, projet: 'PC', description: 'Achat de C', puHT: 1, quantite: 1 }]), suivi_settings: JSON.stringify({ projets: ['PC'], fournisseurs: [], references: [], acheteurs: [], budgets: [] }) };
  const C = await device('C', seedC, 'c@test.fr');
  await login(C, 'c@test.fr');
  await C.waitForSelector('.fb-dlg', { timeout: 8000 });
  check('question fusionner / remplacer affichée', true);
  await C.click('.fb-dlg [data-m="merge"]');
  await settle(C, A, B);
  const pc = await getLS(C, 'suivi_autosave'), pa2 = await getLS(A, 'suivi_autosave');
  check('C a les achats de l\'équipe + le sien (4)', pc.length === 4, pc.map(p => p.id));
  check('A reçoit l\'achat de C', !!pa2.find(p => p.id === 'IDC1'));
  check('liste des projets fusionnée', JSON.stringify((await getLS(A, 'suivi_settings')).projets.sort()) === JSON.stringify(['P1', 'P2', 'P3', 'PC']), (await getLS(A, 'suivi_settings')).projets);

  console.log('8. Garde-fou : A efface tous les achats, puis annule');
  A.__dialog = 'dismiss';
  await A.evaluate(() => { purchases.length = 0; autosave(); });
  await settle(A);
  A.__dialog = 'accept';
  check('rien n\'a été effacé sur le serveur', [...docs.keys()].filter(p => p.startsWith('app/suivi_autosave/r/')).length === 4);
  check('A a récupéré les achats de l\'équipe', (await A.evaluate(() => purchases.length)) === 4);

  console.log('9. Hors ligne puis retour du réseau');
  await B.evaluate(() => { window.__mockOffline = true; });
  await B.evaluate(() => { purchases.find(p => p.id === 'ID1001').observations = 'hors ligne'; autosave(); });
  await sleep(2000);
  check('A ne voit pas encore la modif', !(await getLS(A, 'suivi_autosave')).find(p => p.id === 'ID1001').observations);
  // relance simulée : Firestore renvoie la file d'attente au retour du réseau
  await B.evaluate(() => { window.__mockOffline = false; });
  await B.evaluate(() => { const b = fbSync.base(); delete b.suivi_autosave['r:ID1001']; localStorage.setItem('fb_base', JSON.stringify(b)); });
  await B.evaluate(() => { purchases.find(p => p.id === 'ID1001').observations = 'hors ligne'; autosave(); });
  await settle(B, A);
  check('A reçoit la modif après retour', (await getLS(A, 'suivi_autosave')).find(p => p.id === 'ID1001').observations === 'hors ligne');

  console.log('10. Compte non autorisé');
  const D = await device('D', null, 'x@inconnu.fr');
  await login(D, 'x@inconnu.fr');
  await waitState(D, 'denied');
  check('état « non autorisé »', true);

  console.log('11. Rechargement de A : pas de renvoi, données intactes');
  const w1 = stats.writes;
  await A.reload(); await A.waitForFunction(() => window.fbSync);
  await waitState(A, 'out'); await login(A, 'a@test.fr');
  await settle(A);
  check('A rechargé : synchronisé sans question', (await A.evaluate(() => fbSync.state())) === 'ok' && !(await A.$('.fb-dlg')));
  check('aucune écriture au rechargement', stats.writes === w1, stats.writes - w1);
  for (const k of ['suivi_autosave','suivi_settings','eng_db','pm_db','hp_suppliers']) check('A, B, C identiques : ' + k, canon(await getLS(A, k)) === canon(await getLS(B, k)) && canon(await getLS(B, k)) === canon(await getLS(C, k)));


  console.log('12. Restauration d\'un ZIP pendant la synchro');
  if (!JSZIP) console.log('  (ignoré : lancer « npm install » dans tests/ pour JSZip)');
  else {
    await A.waitForFunction(() => typeof JSZip !== 'undefined', null, { timeout: 8000 });
    const before = [...docs.keys()].filter(p => p.startsWith('app/suivi_autosave/r/')).sort().join();
    const w2 = stats.writes;
    A.__dialog = 'dismiss';
    await A.evaluate(async () => { const z = new JSZip(); z.file('purchasing_followup.csv', '﻿"ID","Ligne","Projet","Description"\r\n"IDZIP1","1","ZIPPROJ","Achat du ZIP"'); z.file('purchasing_extras.json', JSON.stringify({ version: 1, extras: { IDZIP1: { line: 1, wf: 'Commandé' } }, suppliers: { ZIPF: { delai: '9' } } })); await window.loadPlatformZip(await z.generateAsync({ type: 'blob' })); });
    await settle(A); await sleep(800);
    A.__dialog = 'accept';
    check('ZIP refusé : rien envoyé au serveur', stats.writes === w2 && [...docs.keys()].filter(p => p.startsWith('app/suivi_autosave/r/')).sort().join() === before, stats.writes - w2);
    check('ZIP refusé : achats de l\'équipe repris', (await A.evaluate(() => purchases.map(p => p.id).sort().join())) === (await getLS(B, 'suivi_autosave')).map(p => p.id).sort().join());
    check('ZIP refusé : fournisseurs de l\'équipe repris', !(await getLS(A, 'hp_suppliers')).ZIPF);
    await A.evaluate(async () => { const z = new JSZip(); z.file('purchasing_followup.csv', '﻿"ID","Ligne","Projet","Description"\r\n"IDZIP1","1","ZIPPROJ","Achat du ZIP"'); z.file('purchasing_extras.json', JSON.stringify({ version: 1, extras: { IDZIP1: { line: 1, wf: 'Commandé' } }, suppliers: { ZIPF: { delai: '9' } } })); await window.loadPlatformZip(await z.generateAsync({ type: 'blob' })); });
    await settle(A, B); await sleep(800);
    check('ZIP accepté : B reçoit l\'achat du ZIP avec ses extras', ((await getLS(B, 'suivi_autosave')).find(p => p.id === 'IDZIP1') || {}).wf === 'Commandé');
    check('ZIP accepté : B reçoit les fournisseurs du ZIP', !!((await getLS(B, 'hp_suppliers')) || {}).ZIPF);
  }

  console.log('13. Pièces jointes : en ligne dès l\'ajout, état affiché, un fichier refusé ne bloque pas le reste');
  const pdf = (name, txt) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 ' + txt) });
  const attTxt = (p, i) => p.evaluate(i => { const r = document.querySelectorAll('#xa-box .xa-file')[i || 0], s = r && r.querySelector('.fb-att'); return s ? s.textContent : null; }, i);
  async function waitAtt(p, txt, i, ms = 8000) { const t = Date.now(); let s; while (Date.now() - t < ms) { s = await attTxt(p, i); if (s === txt) return true; await sleep(100); } return s; }
  async function waitFor(fn, ms = 8000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(150); } return false; }
  const idb = (p, op, id) => p.evaluate(([op, id]) => new Promise(res => { const r = indexedDB.open('hp_files', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => { const t = r.result.transaction('files', op === 'has' ? 'readonly' : 'readwrite'), s = t.objectStore('files'); if (op === 'has') { const q = s.get(id); q.onsuccess = () => res(!!(q.result && q.result.blob)); } else { s.delete(id); t.oncomplete = () => res(true); } }; }), [op, id]);
  const recB = async id => ((await getLS(B, 'suivi_autosave')) || []).find(p => p.id === id) || {};
  await A.evaluate(() => { purchases.push({ id: 'IDPJ1', line: 91, projet: 'P1', description: 'Achat PJ 1', puHT: 3, quantite: 1, capexOpex: 'OPEX', attachments: [] }, { id: 'IDPJ2', line: 92, projet: 'P2', description: 'Achat PJ 2', puHT: 4, quantite: 1, capexOpex: 'OPEX', attachments: [] }); autosave(); });
  await settle(A, B);
  // a) achat existant
  await A.evaluate(() => { switchApp('achats'); editRow('IDPJ1'); });
  await sleep(300);
  await A.setInputFiles('#xa-box input[data-xa-up]', pdf('devis.pdf', 'devis'));
  let r = await waitAtt(A, '☁ en ligne');
  check('achat existant : « ☁ en ligne » à côté du fichier', r === true, r);
  const id1 = await A.evaluate(() => ((purchases.find(p => p.id === 'IDPJ1').attachments || [])[0] || {}).id);
  check('achat existant : fichier dans Storage', !!id1 && files.has('app/files/' + id1), id1);
  check('note « envoyés en ligne dès l\'ajout »', /en ligne dès l'ajout/.test(await A.evaluate(() => document.getElementById('xa-box').textContent)));
  await settle(A, B);
  check('B reçoit la fiche et le fichier', ((await recB('IDPJ1')).attachments || []).some(a => a.id === id1) && await idb(B, 'has', id1));
  // b) nouvel achat, pas encore sauvegardé
  const puts1 = stats.puts;
  await A.evaluate(() => { resetForm(); goTo('nouveau'); });
  await sleep(300);
  await A.setInputFiles('#xa-box input[data-xa-up]', pdf('offre.pdf', 'offre'));
  r = await waitAtt(A, '☁ en ligne');
  const id2 = await A.evaluate(() => (getForm().attachments[0] || {}).id);
  check('nouvel achat pas encore sauvegardé : fichier déjà en ligne', r === true && !!id2 && files.has('app/files/' + id2), [r, id2]);
  await A.evaluate(() => {
    const s = (id, v) => { document.getElementById(id).value = v; };
    s('f-type', 'OPEX'); onTypeChange();
    s('f-fourn', [...document.getElementById('f-fourn').options].find(o => o.value).value);
    s('f-pu', '7'); s('f-da', 'DA-PJ'); s('f-qty', '1'); s('f-dmigo', '2026-11-01');
    saveEntry();
  });
  await settle(A, B);
  const nb2 = ((await getLS(B, 'suivi_autosave')) || []).find(p => (p.attachments || []).some(a => a.id === id2));
  check('nouvel achat sauvegardé : B le reçoit avec son fichier', !!nb2 && await idb(B, 'has', id2));
  check('fichier envoyé une seule fois', stats.puts - puts1 === 1, stats.puts - puts1);
  // c) Storage refuse les envois (règles Storage fermées)
  await A.evaluate(() => { window.__mockStorageFail = true; editRow('IDPJ2'); });
  await sleep(300);
  await A.setInputFiles('#xa-box input[data-xa-up]', pdf('facture.pdf', 'facture'));
  r = await waitAtt(A, '⚠ non envoyé');
  check('Storage refuse : « ⚠ non envoyé » à côté du fichier', r === true, r);
  check('Storage refuse : ☁ en erreur avec le motif', await waitFor(() => A.evaluate(() => fbSync.state() === 'error' && /règles Storage/.test(fbSync.msg ? fbSync.msg() : ''))), await A.evaluate(() => fbSync.state()));
  const id3 = await A.evaluate(() => ((purchases.find(p => p.id === 'IDPJ2').attachments || [])[0] || {}).id);
  await A.evaluate(() => { purchases.find(p => p.id === 'IDPJ1').observations = 'pendant la panne'; autosave(); });
  check('Storage refuse : les autres achats partent quand même', await waitFor(async () => (await recB('IDPJ1')).observations === 'pendant la panne'));
  check('Storage refuse : l\'achat concerné attend', !((await recB('IDPJ2')).attachments || []).length && (await A.evaluate(() => fbSync.dirty())).includes('suivi_autosave'));
  // d) Storage rétabli : « Synchroniser » (ou l'essai automatique toutes les 30 s)
  await A.evaluate(() => { window.__mockStorageFail = false; document.getElementById('fb-btn').click(); document.querySelector('#fb-pop [data-a="now"]').click(); });
  await settle(A, B);
  check('Storage rétabli : fichier envoyé, B reçoit l\'achat', !!id3 && files.has('app/files/' + id3) && ((await recB('IDPJ2')).attachments || []).some(a => a.id === id3));
  check('Storage rétabli : « synchronisé »', (await A.evaluate(() => fbSync.state())) === 'ok', await A.evaluate(() => fbSync.state()));
  r = await waitAtt(A, '☁ en ligne');
  check('Storage rétabli : « ☁ en ligne » à côté du fichier', r === true, r);
  // e) B : fichier absent de ce poste → ouvert depuis sa copie en ligne
  await idb(B, 'del', id1);
  await B.evaluate(() => { switchApp('achats'); editRow('IDPJ1'); });
  r = await waitAtt(B, '☁ en ligne');
  check('B : fichier absent du poste marqué « ☁ en ligne »', r === true, r);
  const reqs = [], onReq = q => reqs.push(q.url());
  B.context().on('request', onReq);
  const [tab] = await Promise.all([B.context().waitForEvent('page', { timeout: 8000 }).catch(() => null), B.click('#xa-box .xa-file-n')]);
  const opened = await waitFor(async () => reqs.some(u => u.startsWith('https://firebasestorage.googleapis.com/') && u.includes(encodeURIComponent('app/files/' + id1))));
  B.context().off('request', onReq);
  check('B : ouvert depuis sa copie en ligne (pas « introuvable »)', opened, reqs);
  if (tab) await tab.close().catch(() => {});
  // f) badge « Non sauvegardé » (export CSV) et note quand on n'est pas connecté
  check('connecté : badge « Non sauvegardé » masqué', await A.evaluate(() => document.body.classList.contains('fb-on') && getComputedStyle(document.getElementById('unsavedBadge')).display === 'none'));
  check('compte non autorisé : note « sur ce poste pour l\'instant »', await D.evaluate(() => !document.body.classList.contains('fb-on') && /Sur ce poste pour l'instant/.test(document.getElementById('xa-box').textContent)));

  console.log('14. Documents des budgets (en ligne dès l\'ajout, reçus par les autres postes) ; fichier de plus de 20 Mo');
  const battTxt = p => p.evaluate(() => { const r = document.querySelector('#b-att-box .xa-file'), s = r && r.querySelector('.fb-att'); return s ? s.textContent : null; });
  async function waitBatt(p, txt, ms = 8000) { const t = Date.now(); let s; while (Date.now() - t < ms) { s = await battTxt(p); if (s === txt) return true; await sleep(100); } return s; }
  await A.evaluate(() => { S.budgets.push({ id: 'BCX', projet: 'P1', type: 'CAPEX', label: 'Budget CAPEX test', montant: 5000, devise: 'EUR', immobilisations: [] }); saveSettings(); });
  await settle(A, B);
  await A.evaluate(() => { switchApp('achats'); goTo('budget'); openEditBudget('BCX'); });
  await sleep(200);
  await A.setInputFiles('#b-att-box input[data-ba-up]', pdf('accord-capex.pdf', 'accord'));
  r = await waitBatt(A, '☁ en ligne');
  const bid = await A.evaluate(() => (budgetFormAtts()[0] || {}).id);
  check('budget : document en ligne avant même d\'enregistrer', r === true && !!bid && files.has('app/files/' + bid), [r, bid]);
  await A.evaluate(() => confirmBudget());
  await settle(A, B);
  const bB = (((await getLS(B, 'suivi_settings')) || {}).budgets || []).find(b => b.id === 'BCX') || {};
  check('B reçoit le budget avec son document, fichier compris', (bB.attachments || []).some(a => a.id === bid) && await idb(B, 'has', bid));
  await idb(B, 'del', bid);
  await B.evaluate(() => { switchApp('achats'); goTo('budget'); openEditBudget('BCX'); });
  r = await waitBatt(B, '☁ en ligne');
  check('B : document absent du poste marqué « ☁ en ligne »', r === true, r);
  const reqs2 = [], onReq2 = q => reqs2.push(q.url());
  B.context().on('request', onReq2);
  const [tab2] = await Promise.all([B.context().waitForEvent('page', { timeout: 8000 }).catch(() => null), B.click('#b-att-box .xa-file-n')]);
  const opened2 = await waitFor(async () => reqs2.some(u => u.includes(encodeURIComponent('app/files/' + bid))));
  B.context().off('request', onReq2);
  check('B : document ouvert depuis sa copie en ligne', opened2, reqs2);
  if (tab2) await tab2.close().catch(() => {});
  await B.evaluate(() => closeOv('ovBudget'));
  // Pièce jointe de plus de 20 Mo ajoutée avant la limite : refusée par Storage, mais l'achat part quand même
  await A.evaluate(() => { closeOv('ovBudget'); return new Promise(res => { const q = indexedDB.open('hp_files', 1); q.onsuccess = () => { const t = q.result.transaction('files', 'readwrite'); t.objectStore('files').put({ blob: new Blob([new Uint8Array(21 * 1048576)], { type: 'application/pdf' }), name: 'gros.pdf', type: 'application/pdf' }, 'Fbig1'); t.oncomplete = res; }; }); });
  await A.evaluate(() => { const p = purchases.find(p => p.id === 'IDPJ2'); p.attachments.push({ id: 'Fbig1', name: 'gros.pdf', size: 21 * 1048576, type: 'application/pdf' }); autosave(); });
  await settle(A, B);
  check('plus de 20 Mo : l\'achat part quand même', ((await recB('IDPJ2')).attachments || []).some(a => a.id === 'Fbig1'));
  check('plus de 20 Mo : fichier non envoyé, synchro sans erreur', !files.has('app/files/Fbig1') && (await A.evaluate(() => fbSync.state())) === 'ok', await A.evaluate(() => fbSync.state()));
  await A.evaluate(() => editRow('IDPJ2'));
  r = await waitAtt(A, '⚠ trop gros (20 Mo max)', 1);
  check('plus de 20 Mo : « ⚠ trop gros (20 Mo max) » à côté du fichier', r === true, r);

  console.log('15. Rappels : inscription de l\'appareil, préférences, test, lien des notifications');
  // Le faux site (http://app.test) n'est pas « sécurisé » : service worker et notifications simulés
  const stubPush = p => p.evaluate(() => {
    window.__notifs = [];
    const reg = { showNotification: async (t, o) => { window.__notifs.push([t, o]); } };
    const sw = { register: async u => { window.__swUrl = u; return reg; }, ready: Promise.resolve(reg), addEventListener() {} };
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, get: () => sw });
    if (!window.PushManager) window.PushManager = function () {};
    if (!window.Notification) window.Notification = {};
    Object.defineProperty(window.Notification, 'permission', { configurable: true, get: () => 'granted' });
    window.Notification.requestPermission = async () => 'granted';
  });
  await stubPush(A); await stubPush(D);
  await A.evaluate(() => {
    const d = n => { const x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    pmDB.projects[0].tools = [{ id: 'Trp', name: 'Moule test', status: 'En cours',
      milestones: [{ id: 'Mrp1', label: 'RFQ moule', status: 'À faire', date: d(3) }, { id: 'Mrp2', label: 'PO moule', status: 'Fait', date: d(1) }, { id: 'Mrp3', label: 'Trial Run', status: 'À faire', date: d(30) }],
      notes: [{ id: 'Nrp1', kind: 'Action', text: 'Relancer le fournisseur', status: 'À faire', urgency: 'Haute', dueDate: d(5) }], subtools: [] }];
    pmSave(); switchApp('projects'); pmGo('settings');
  });
  await settle(A, B);
  let panel = await A.evaluate(() => document.getElementById('rp-panel').textContent);
  check('panneau Rappels dans Projets › Settings, avec le bouton Activer', /Rappels/.test(panel) && !!(await A.$('#rp-panel [data-rap="on"]')), panel.slice(0, 200));
  check('à venir : jalon et action des 7 jours (pas le jalon fait, pas celui à 30 jours)', /RFQ moule/.test(panel) && /Relancer le fournisseur/.test(panel) && !/PO moule/.test(panel) && !/Trial Run/.test(panel) && /dans 3 jours/.test(panel), panel);
  await A.click('#rp-panel [data-rap="on"]');
  const devKey = () => [...docs.keys()].find(k => k.startsWith('app/_rappels/appareils/'));
  await waitFor(async () => !!devKey());
  const dev = docs.get(devKey() || '') || {};
  check('Activer : appareil inscrit (jeton, préférences, fuseau, compte)', dev.token === 'tok-a@test.fr' && dev.prefs && dev.prefs.j7 === true && dev.prefs.actions === true && !!dev.tz && dev.email === 'a@test.fr', dev);
  check('service worker « sw.js » enregistré', (await A.evaluate(() => window.__swUrl)) === 'sw.js');
  check('panneau : « ✓ Activé sur cet appareil »', /Activé sur cet appareil/.test(await A.evaluate(() => document.getElementById('rp-panel').textContent)));
  await A.click('#rp-panel input[data-rap-pref="j3"]');
  check('préférence « 3 jours avant » enregistrée en ligne', await waitFor(async () => ((docs.get(devKey()) || {}).prefs || {}).j3 === true));
  await A.click('#rp-panel [data-rap="test"]');
  check('Tester : notification affichée sur l\'appareil', await waitFor(async () => (await A.evaluate(() => window.__notifs.map(n => n[0]))).includes('🔔 Test des rappels')));
  await A.evaluate(() => window.__mockMessaging.onMessage({ data: { title: 'Jalon demain (13/11)', body: 'RFQ', url: 'plateforme.html#rappel=liste', tag: 'rappel-m:Mrp1' } }));
  check('rappel reçu app ouverte : notification affichée quand même', await waitFor(async () => (await A.evaluate(() => window.__notifs.map(n => n[0]))).includes('Jalon demain (13/11)')));
  // Clé Web Push enregistrée pour l'équipe, puis utilisée à la prochaine inscription
  await A.evaluate(() => { document.getElementById('rp-vapid').value = 'BCLEPUBLIQUE'; document.querySelector('#rp-panel [data-rap="vapid"]').click(); });
  check('clé Web Push enregistrée dans app/_rappels', await waitFor(async () => (docs.get('app/_rappels') || {}).vapid === 'BCLEPUBLIQUE'));
  await A.click('#rp-panel [data-rap="off"]');
  check('Désactiver : appareil retiré, jeton supprimé', await waitFor(async () => !devKey()) && (await A.evaluate(() => window.__mockMessaging.deleted)) >= 1 && !(await A.evaluate(() => fbSync.rappels.local().on)));
  await A.click('#rp-panel [data-rap="on"]');
  await waitFor(async () => !!devKey());
  check('nouvelle inscription : avec la clé Web Push de l\'équipe', (await A.evaluate(() => window.__mockMessaging.vapid)) === 'BCLEPUBLIQUE' && !!devKey());
  check('le même appareil garde son identifiant', [...docs.keys()].filter(k => k.startsWith('app/_rappels/appareils/')).length === 1);
  // Lien d'une notification : ouvre l'outil (poste B, qui a reçu le projet)
  await B.evaluate(() => { location.hash = '#rappel=p/Pp1/t/Trp'; });
  await waitFor(async () => (await B.evaluate(() => typeof pmEditingTool !== 'undefined' && pmEditingTool === 0)), 5000);
  const opened3 = await B.evaluate(() => ({ proj: pmCurProj && pmCurProj.id, tool: pmEditingTool, page: document.getElementById('ppage-projects').style.display, hash: location.hash }));
  check('lien de notification : projet et outil ouverts, adresse nettoyée', opened3.proj === 'Pp1' && opened3.tool === 0 && opened3.page === 'block' && opened3.hash === '', opened3);
  await B.evaluate(() => fbSync.rappels.fromUrl('https://ytyoussef123.github.io/Work/plateforme.html#rappel=a'));
  check('lien vers une action générale : plan d\'actions', (await B.evaluate(() => document.getElementById('ppage-actions').style.display)) === 'block');
  await D.evaluate(() => { switchApp('projects'); pmGo('settings'); });
  await sleep(200);
  panel = await D.evaluate(() => document.getElementById('rp-panel').textContent);
  check('compte non autorisé : « Connectez-vous », pas de bouton Activer', /Connectez-vous avec ☁/.test(panel) && !(await D.$('#rp-panel [data-rap="on"]')), panel.slice(0, 200));

  check('aucune erreur JavaScript', errors.length === 0, errors);
  console.log(`\n${pass} réussis, ${fail} échoués`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error('ERREUR', e); console.error(errors); try { await browser.close(); } catch (x) {} process.exit(2); });
