// Lancer : node tests/test_sync.js   (Playwright requis ; aucun accès réseau ni compte Firebase nécessaire)
// Test de la synchro Firebase de plateforme.html avec un faux serveur (plusieurs "postes").
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const APP = process.argv[2] || path.join(__dirname, '..', 'plateforme.html');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock_firebase.js'), 'utf8');
const HTML = fs.readFileSync(APP, 'utf8');
const JSZIP = (() => { try { return fs.readFileSync(path.join(__dirname, 'node_modules/jszip/dist/jszip.min.js'), 'utf8'); } catch (e) { return null; } })();

// ─── Faux serveur ───
const docs = new Map(), files = new Map(), fileMeta = new Map(), listens = [];   // fileMeta : métadonnées d'envoi (nom de téléchargement, V11)
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
    if (op === 'put') { stats.puts++; files.set(a.path, a.data); fileMeta.set(a.path, a.meta || {}); return true; }
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
      const [h, b64] = d.split(','), cd = (fileMeta.get(p) || {}).contentDisposition;
      return route.fulfill({ status: 200, contentType: h.slice(5).split(';')[0], headers: Object.assign({ 'access-control-allow-origin': '*' }, cd ? { 'content-disposition': cd } : {}), body: Buffer.from(b64, 'base64') });
    }
    return route.abort();
  });
  if (seed) await page.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); for (const k in s) localStorage.setItem(k, s[k]); } }, seed);
  await page.addInitScript(e => { window.__mockEmail = e; try { if (!sessionStorage.getItem('tipv')) { sessionStorage.setItem('tipv', '1'); localStorage.setItem('astuce_pdf', '1'); } } catch (x) {} }, email);   // astuce PDF déjà vue (section 18 la teste)
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
  browser = await chromium.launch({ env: Object.assign({}, process.env, { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }) });   // noms de fichiers accentués gardés au téléchargement (Linux)
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
    const loadZip = (id, proj, sup) => A.evaluate(async ([id, proj, sup]) => { const z = new JSZip(); z.file('purchasing_followup.csv', '\ufeff"ID","Ligne","Projet","Description"\r\n"' + id + '","1","' + proj + '","Achat du ZIP"'); z.file('purchasing_extras.json', JSON.stringify({ version: 1, extras: { [id]: { line: 1, wf: 'Commandé' } }, suppliers: { [sup]: { delai: '9' } } })); await window.loadPlatformZip(await z.generateAsync({ type: 'blob' })); }, [id, proj, sup]);
    await loadZip('IDZIP1', 'ZIPPROJ', 'ZIPF');
    await A.waitForSelector('.fb-dlg [data-z="ignore"]', { timeout: 8000 });
    check('ZIP chargé : question Fusionner / Remplacer / Ignorer (plus de OK / Annuler)', !!(await A.$('.fb-dlg [data-z="merge"]')) && !!(await A.$('.fb-dlg [data-z="send"]')));
    await A.click('.fb-dlg [data-z="ignore"]');
    await settle(A); await sleep(800);
    check('ZIP ignoré : rien envoyé au serveur', stats.writes === w2 && [...docs.keys()].filter(p => p.startsWith('app/suivi_autosave/r/')).sort().join() === before, stats.writes - w2);
    check('ZIP ignoré : achats de l\'équipe repris', (await A.evaluate(() => purchases.map(p => p.id).sort().join())) === (await getLS(B, 'suivi_autosave')).map(p => p.id).sort().join());
    check('ZIP ignoré : fournisseurs de l\'équipe repris', !(await getLS(A, 'hp_suppliers')).ZIPF);
    const teamIds = (await getLS(B, 'suivi_autosave')).map(p => p.id);
    await loadZip('IDZIP2', 'ZIPPROJ', 'ZIPG');
    await A.waitForSelector('.fb-dlg [data-z="merge"]', { timeout: 8000 });
    await A.click('.fb-dlg [data-z="merge"]');
    await settle(A, B); await sleep(800);
    const afterMerge = (await getLS(B, 'suivi_autosave')).map(p => p.id);
    check('ZIP fusionné : B reçoit l\'achat du ZIP et garde tous ceux de l\'équipe', afterMerge.includes('IDZIP2') && teamIds.every(id => afterMerge.includes(id)), [teamIds, afterMerge]);
    check('ZIP fusionné : fournisseurs du ZIP et de l\'équipe réunis', !!((await getLS(B, 'hp_suppliers')) || {}).ZIPG && !!((await getLS(B, 'hp_suppliers')) || {}).F1, await getLS(B, 'hp_suppliers'));
    await loadZip('IDZIP1', 'ZIPPROJ', 'ZIPF');
    await A.waitForSelector('.fb-dlg [data-z="send"]', { timeout: 8000 });
    await A.click('.fb-dlg [data-z="send"]');   // « Remplacer » : le garde-fou d'effacement demande confirmation (accepté)
    await settle(A, B); await sleep(800);
    check('ZIP « Remplacer » : B reçoit l\'achat du ZIP avec ses extras', ((await getLS(B, 'suivi_autosave')).find(p => p.id === 'IDZIP1') || {}).wf === 'Commandé');
    check('ZIP « Remplacer » : B reçoit les fournisseurs du ZIP', !!((await getLS(B, 'hp_suppliers')) || {}).ZIPF);
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
  // Panneau ☁ (V9) : les boutons du téléphone sont remis à chaque dessin, à leur place ; masqués sur ordinateur
  r = await A.evaluate(async () => {
    document.getElementById('fb-btn').click(); await new Promise(res => setTimeout(res, 0));
    const row = document.querySelector('#fb-pop .fb-row'), keys = [...row.children].map(b => b.dataset.a || 'm:' + b.dataset.m).join(',');
    const hidden = [...row.querySelectorAll('.m-pop')].every(b => getComputedStyle(b).display === 'none');
    document.getElementById('fb-pop').classList.remove('on');
    return { keys, hidden, fs: !!document.fullscreenEnabled };
  });
  check('panneau ☁ : « ↻ Actualiser » après « Synchroniser », « ⚙ Réglages » après « 🔔 Rappels », « 📲 Installer l\'app » en dernier ; masqués sur ordinateur',
    r.keys === 'now,m:reload,reset,rappels,m:reglages,' + (r.fs ? 'm:fs,' : '') + 'out,m:install' && r.hidden, r);
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

  console.log('16. Données sûres : enregistrement automatique des projets, fusion au lieu d\'écraser');
  const m3 = (b, a, c, keep) => A.evaluate(([b, a, c, keep]) => fbSync.merge3(b, a, c, keep), [b, a, c, keep]);
  let mr = await m3({ c: [{ text: 'x', date: '1' }] }, { c: [{ text: 'x', date: '1' }, { text: 'mien', date: '2' }] }, { c: [{ text: 'x', date: '1' }, { text: 'autre', date: '3' }] });
  check('fusion : commentaires des deux côtés gardés', JSON.stringify(mr.c.map(x => x.text)) === '["x","mien","autre"]', mr);
  mr = await m3({ t: [{ id: 'T1', name: 'a', status: 'En cours' }] }, { t: [{ id: 'T1', name: 'a2', status: 'En cours' }] }, { t: [{ id: 'T1', name: 'a', status: 'Bloqué' }, { id: 'T2', name: 'neuf' }] });
  check('fusion : par id, chaque côté garde sa modification, l\'ajout de l\'autre arrive', mr.t.length === 2 && mr.t[0].name === 'a2' && mr.t[0].status === 'Bloqué' && mr.t[1].id === 'T2', mr);
  mr = await m3({ n: [{ id: 'N1' }, { id: 'N2' }] }, { n: [{ id: 'N1' }, { id: 'N2' }] }, { n: [{ id: 'N1' }] });
  check('fusion : suppression d\'un côté appliquée si l\'autre n\'y a pas touché', mr.n.length === 1, mr);
  mr = await m3({ n: [{ id: 'N1' }, { id: 'N2' }] }, { n: [{ id: 'N1' }, { id: 'N2' }], x: 1 }, { n: [{ id: 'N1' }] }, true);
  check('fusion « projet ouvert » : rien n\'est retiré de l\'écran', mr.n.length === 2 && mr.x === 1, mr);
  mr = await m3(undefined, { s: 'mien', l: ['a'] }, { s: 'autre', l: ['b'] });
  check('fusion sans base : valeur simple = la sienne, listes réunies', mr.s === 'mien' && JSON.stringify(mr.l) === '["a","b"]', mr);
  const pmOf = async (p, k = 'pm_db') => ((await getLS(p, k)) || {}).projects.find(x => x.id === 'Pp1');
  const noteTexts = pr => ((pr && pr.tools && pr.tools[0] && pr.tools[0].notes) || []).map(n => n.text);
  // a) Note ajoutée dans un outil, sans « Sauvegarder »
  await A.evaluate(() => { switchApp('projects'); pmEditProject('Pp1'); pmShowTab('outils'); pmEditTool(0); });
  await sleep(300);
  check('projet ouvert : « Enregistrement automatique » affiché', /Enregistrement automatique/.test(await A.evaluate(() => (document.getElementById('pm-autosave') || {}).textContent || '')));
  await A.fill('[id="pm-note-input-t:0"]', 'Note sans Sauvegarder');
  await A.click('button[onclick="pmAddNote(\'t:0\')"]');
  check('note enregistrée toute seule (sans « Sauvegarder »)', await waitFor(async () => noteTexts(await pmOf(A)).includes('Note sans Sauvegarder'), 5000), noteTexts(await pmOf(A)));
  await settle(A, B);
  check('… et reçue par B', noteTexts(await pmOf(B)).includes('Note sans Sauvegarder'));
  // b) Jalon modifié puis départ immédiat du projet
  await A.evaluate(() => pmOpenMsPopup('t:0', 0));
  await A.selectOption('#ms-pop-status', 'Fait');
  await A.evaluate(() => { document.querySelector('#ms-popup-ov button[onclick^="pmSaveMsPopup"]').click(); pmProjTab('list'); });
  check('jalon modifié puis « Retour à la liste » aussitôt : enregistré', ((await pmOf(A)).tools[0].milestones[0] || {}).status === 'Fait', (await pmOf(A)).tools[0].milestones[0]);
  // c) Projet ouvert chez A, B ajoute un commentaire : A le voit sans rouvrir
  await settle(A, B);
  await A.evaluate(() => { pmEditProject('Pp1'); pmShowTab('outils'); });
  await B.evaluate(() => { switchApp('projects'); pmEditProject('Pp1'); pmShowTab('outils'); pmOpenMsPopup('t:0', 1); document.getElementById('ms-pop-ctext').value = 'Commentaire de B'; pmMsAddComment('t:0', 1); document.getElementById('ms-popup-ov').remove(); });
  await settle(B, A);
  check('projet ouvert chez A : le commentaire de B y arrive', await waitFor(async () => (await A.evaluate(() => ((pmCurProj.tools[0].milestones[1] || {}).comments || []).map(c => c.text))).includes('Commentaire de B'), 5000));
  // d) Conflit : A modifie hors connexion pendant que B modifie le même projet, puis A se reconnecte
  await A.evaluate(() => window.__mockLogin(null));
  await waitState(A, 'out');
  await A.evaluate(() => { pmEditTool(0); });
  await sleep(200);
  await A.fill('[id="pm-note-input-t:0"]', 'Note de A hors ligne');
  await A.click('button[onclick="pmAddNote(\'t:0\')"]');
  await waitFor(async () => noteTexts(await pmOf(A)).includes('Note de A hors ligne'), 5000);
  await B.evaluate(() => { pmOpenMsPopup('t:0', 2); document.getElementById('ms-pop-ctext').value = 'Commentaire de B pendant ce temps'; pmMsAddComment('t:0', 2); document.getElementById('ms-popup-ov').remove(); });
  await settle(B);
  await login(A, 'a@test.fr');
  await settle(A, B); await sleep(600); await settle(A, B);
  const both = async p => { const pr = await pmOf(p); return noteTexts(pr).includes('Note de A hors ligne') && ((pr.tools[0].milestones[2] || {}).comments || []).some(c => c.text === 'Commentaire de B pendant ce temps') && noteTexts(pr).includes('Note sans Sauvegarder'); };
  check('reconnexion : la note de A ET le commentaire de B sont gardés (B)', await both(B), [noteTexts(await pmOf(B)), (await pmOf(B)).tools[0].milestones[2]]);
  check('… et chez A', await both(A));
  const srv = JSON.parse(docs.get('app/pm_db/r/projects:Pp1').j);
  check('… et en ligne', noteTexts(srv).includes('Note de A hors ligne') && (srv.tools[0].milestones[2].comments || []).some(c => c.text === 'Commentaire de B pendant ce temps'));
  // e) Première connexion d'un poste dont le projet diffère de celui de l'équipe : question, puis fusion
  const pmE = await getLS(B, 'pm_db');
  pmE.projects.find(p => p.id === 'Pp1').tools[0].notes.push({ id: 'NE1', kind: 'Note', text: 'Note du poste E', ts: 1, jalon: '', status: '', urgency: '', dueDate: '' });
  pmE.projects.find(p => p.id === 'Pp1').modified = 1;   // version plus ancienne
  const E = await device('E', { pm_db: JSON.stringify(pmE) }, 'c@test.fr');
  await login(E, 'c@test.fr');
  const askedE = await E.waitForSelector('.fb-dlg [data-m="merge"]', { timeout: 8000 }).then(() => true, () => false);
  check('première connexion, même projet mais contenu différent : la question est posée (avant : remplacé sans rien dire)', askedE);
  if (askedE) await E.click('.fb-dlg [data-m="merge"]');
  await settle(E, A, B); await sleep(600); await settle(E, A, B);
  const prB = await pmOf(B);
  check('fusion : la note du poste E arrive chez B, rien de l\'équipe n\'est perdu', noteTexts(prB).includes('Note du poste E') && noteTexts(prB).includes('Note de A hors ligne') && (prB.tools[0].milestones[0] || {}).status === 'Fait', noteTexts(prB));

  console.log('17. Charger un ZIP en choisissant ce qu\'on prend (V10) : rien d\'autre n\'est écrasé');
  if (!JSZIP) console.log('  (ignoré : lancer « npm install » dans tests/ pour JSZip)');
  else {
    await settle(A, B);
    const rt = await A.evaluate(async () => { const it = zipImport.itemsOf(await zipImport.readZip(await buildPlatformZip())); return { n: it.length, diff: it.filter(i => i.status !== 'same').map(i => i.coll + ':' + i.id) }; });
    check('ZIP exporté par l\'app puis relu : tout est « identique » (rien à ajouter)', rt.n > 5 && !rt.diff.length, rt);
    // ZIP « d'un autre poste » : l'export de A, avec des éléments nouveaux et un projet modifié
    await A.evaluate(async () => {
      const zip = await JSZip.loadAsync(await buildPlatformZip());
      const pm = JSON.parse(await zip.file('project_master.json').async('string'));
      pm.customers.push({ id: 'PcZ', name: 'TESLA' });
      pm.projects.push({ id: 'PpZ', name: 'Projet du ZIP', customerId: 'PcZ', tools: [] }, { id: 'PpX', name: 'Projet non voulu', tools: [] });
      const p1 = pm.projects.find(x => x.id === 'Pp1'); p1.oem = 'OEM du ZIP'; p1.tools = (p1.tools || []).concat([{ id: 'TZ', name: 'Outil du ZIP', milestones: [], notes: [] }]);
      zip.file('project_master.json', JSON.stringify(pm));
      const eng = JSON.parse(await zip.file('engineering.json').async('string'));
      eng.solutions.push({ id: 'esZ', name: 'Solution du ZIP', specHtml: '<p>Z</p>' });
      zip.file('engineering.json', JSON.stringify(eng));
      let csv = await zip.file('purchasing_followup.csv').async('string'); if (csv.charCodeAt(0) === 0xFEFF) csv = csv.slice(1);
      const nl = csv.indexOf('\n'), set = JSON.parse(csv.slice(10, nl).replace(/\r$/, '').trim());
      set.budgets.push({ id: 'BZ', projet: 'P1', type: 'OPEX', label: 'Budget du ZIP', montant: 500 });
      const rest = csv.slice(nl + 1), hl = rest.indexOf('\n'), heads = parseCSV(rest.slice(0, hl).replace(/\r$/, ''))[0].map(h => CSV_HEADER_MAP[h.trim().toLowerCase()] || h.trim().toLowerCase());
      const row = o => heads.map(k => '"' + String(o[k] == null ? '' : o[k]).replace(/"/g, '""') + '"').join(',');
      zip.file('purchasing_followup.csv', '﻿#SETTINGS:' + JSON.stringify(set) + '\r\n' + rest.replace(/\s*$/, '') + '\r\n' +
        row({ id: 'IDZIPN', projet: 'P1', description: 'Achat du ZIP', fournisseur: 'ZSUP', _budgetId: 'BZ', puHT: 50, quantite: 2 }) + '\r\n' + row({ id: 'IDZIPX', projet: 'P2', description: 'Achat non voulu', puHT: 5, quantite: 1 }) + '\r\n');
      const ex = JSON.parse(await zip.file('purchasing_extras.json').async('string'));
      ex.extras.IDZIPN = { line: 999, wf: 'Commandé', attachments: [{ id: 'FattZ', name: 'zip.pdf', size: 10, type: 'application/pdf' }] };
      ex.suppliers = Object.assign(ex.suppliers || {}, { ZSUP: { delai: '3 sem' } });
      zip.file('purchasing_extras.json', JSON.stringify(ex));
      zip.file('attachments/FattZ__zip.pdf', '%PDF-1.4 Z');
      window.__zpFile = new File([await zip.generateAsync({ type: 'blob' })], 'autre_poste.zip');
    });
    // après l'export, A ajoute un outil au projet Pp1 : la fusion doit garder les deux outils
    await A.evaluate(() => { const p = pmDB.projects.find(x => x.id === 'Pp1'); p.tools = p.tools || []; p.tools.push({ id: 'TL', name: 'Outil local', milestones: [], notes: [] }); pmSave(); });
    await settle(A, B);
    const cnt = () => A.evaluate(() => ({ pm: pmDB.projects.length, cust: pmDB.customers.length, ach: purchases.length, bud: S.budgets.length, sol: engDB.solutions.length, sup: Object.keys(JSON.parse(localStorage.getItem('hp_suppliers') || '{}')).length }));
    const c0 = await cnt();
    const openZp = () => A.evaluate(() => { window.__zpDone = window.hpRestore({ files: [window.__zpFile], value: '' }); });
    await openZp();
    await A.waitForSelector('#zp-ov .zp-dlg', { timeout: 8000 });
    const K = { 'Projet du ZIP': 'pm:projects|PpZ', 'Projet non voulu': 'pm:projects|PpX', TESLA: 'pm:customers|PcZ', 'Projet 1': 'pm:projects|Pp1', 'Solution du ZIP': 'eng:solutions|esZ', 'Achat du ZIP': 'ach:achats|IDZIPN', 'Achat non voulu': 'ach:achats|IDZIPX', 'Budget du ZIP': 'ach:budgets|BZ', ZSUP: 'ach:fournisseurs|ZSUP', 'Sol 1': 'eng:solutions|es1' };
    const rowOf = t => A.locator('#zp-ov .zp-it[data-k="' + K[t] + '"]');
    const st = async t => { const r = rowOf(t); return (await r.count()) ? (await r.locator('input').isChecked() ? '☑' : '☐') + (await r.locator('.zp-b').textContent()) : 'absent'; };
    const seen = {}; for (const t of ['Projet du ZIP', 'Projet non voulu', 'TESLA', 'Projet 1', 'Solution du ZIP', 'Achat du ZIP', 'Achat non voulu', 'Budget du ZIP', 'ZSUP', 'Sol 1']) seen[t] = await st(t);
    check('fenêtre : les nouveautés du ZIP cochées, le projet modifié proposé sans être coché, les identiques seulement comptés',
      seen['Projet du ZIP'] === '☑nouveau' && seen['Projet non voulu'] === '☑nouveau' && seen.TESLA === '☑nouveau' && seen['Projet 1'] === '☐différent' && seen['Solution du ZIP'] === '☑nouveau' &&
      seen['Achat du ZIP'] === '☑nouveau' && seen['Achat non voulu'] === '☑nouveau' && seen['Budget du ZIP'] === '☑nouveau' && seen.ZSUP === '☑nouveau' && seen['Sol 1'] === 'absent' && !!(await A.$('#zp-ov .zp-same')), seen);
    check('fenêtre : plus de « Les données actuelles des 3 applications seront remplacées »', !(await A.evaluate(() => /seront remplacées/.test(document.getElementById('zp-ov').textContent))));
    for (const t of ['Projet non voulu', 'Achat non voulu', 'TESLA', 'Budget du ZIP', 'ZSUP', 'Projet 1']) await rowOf(t).locator('input').click();   // on ne prend qu'une partie (+ le projet modifié)
    await A.click('#zp-ov [data-z="ok"]');
    await A.evaluate(() => window.__zpDone);
    const c1 = await cnt();
    const a = await A.evaluate(() => ({ pp: pmDB.projects.map(p => p.id), cust: pmDB.customers.map(c => c.id), p1: pmDB.projects.find(p => p.id === 'Pp1'), ach: purchases.map(p => p.id), zn: purchases.find(p => p.id === 'IDZIPN') || {}, bud: S.budgets.map(b => b.id), sup: JSON.parse(localStorage.getItem('hp_suppliers') || '{}'), sol: engDB.solutions.map(s => s.id), dlg: !!document.querySelector('.fb-dlg') }));
    check('ajouté : seulement ce qui est coché (projet, solution, achat) ; le reste du ZIP non', a.pp.includes('PpZ') && !a.pp.includes('PpX') && a.sol.includes('esZ') && a.ach.includes('IDZIPN') && !a.ach.includes('IDZIPX'), a);
    check('ce dont les éléments cochés ont besoin est pris d\'office : client du projet, budget et fiche fournisseur de l\'achat', a.cust.includes('PcZ') && a.bud.includes('BZ') && !!a.sup.ZSUP, [a.cust, a.bud, Object.keys(a.sup)]);
    check('rien d\'ici n\'est perdu : chaque base garde tous ses éléments (+ les ajouts)', c1.pm === c0.pm + 1 && c1.cust === c0.cust + 1 && c1.ach === c0.ach + 1 && c1.bud === c0.bud + 1 && c1.sol === c0.sol + 1 && c1.sup === c0.sup + 1, [c0, c1]);
    check('projet modifié coché : fusionné (outil d\'ici ET outil du ZIP, case du ZIP)', a.p1.tools.some(t => t.id === 'TL') && a.p1.tools.some(t => t.id === 'TZ') && a.p1.oem === 'OEM du ZIP', a.p1.tools.map(t => t.id));
    check('achat du ZIP avec ses données étendues (workflow, pièce jointe)', a.zn.wf === 'Commandé' && (a.zn.attachments || []).some(x => x.id === 'FattZ'), a.zn);
    check('pas de fenêtre « ZIP chargé » de la synchro (rien n\'a été remplacé)', !a.dlg);
    const fileA = await A.evaluate(() => new Promise(res => { const r = indexedDB.open('hp_files', 1); r.onsuccess = () => { const q = r.result.transaction('files').objectStore('files').get('FattZ'); q.onsuccess = () => res(!!q.result && q.result.name === 'zip.pdf'); q.onerror = () => res(false); }; r.onerror = () => res(false); }));
    check('pièce jointe de l\'achat pris enregistrée sur ce poste', fileA);
    await settle(A, B); await sleep(600); await settle(A, B);
    const pmB = await getLS(B, 'pm_db'), achB = await getLS(B, 'suivi_autosave'), engB = await getLS(B, 'eng_db');
    check('B reçoit ce qui a été pris (projet, client, outil fusionné, achat, solution), pas le reste', pmB.projects.some(p => p.id === 'PpZ') && !pmB.projects.some(p => p.id === 'PpX') && pmB.customers.some(c => c.id === 'PcZ') &&
      pmB.projects.find(p => p.id === 'Pp1').tools.some(t => t.id === 'TL') && pmB.projects.find(p => p.id === 'Pp1').tools.some(t => t.id === 'TZ') && achB.some(p => p.id === 'IDZIPN') && !achB.some(p => p.id === 'IDZIPX') && engB.solutions.some(s => s.id === 'esZ'));
    check('pièce jointe envoyée en ligne', files.has('app/files/FattZ'));
    // « Annuler » et « Tout remplacer… » refusé : rien ne change
    await openZp();
    await A.waitForSelector('#zp-ov .zp-dlg', { timeout: 8000 });
    const again = { voulu: await st('Projet du ZIP'), nonVoulu: await st('Projet non voulu') };
    await A.click('#zp-ov [data-z="cancel"]'); await A.evaluate(() => window.__zpDone);
    A.__dialog = 'dismiss';
    await openZp(); await A.waitForSelector('#zp-ov .zp-dlg', { timeout: 8000 });
    await A.click('#zp-ov [data-z="all"]'); await A.evaluate(() => window.__zpDone);
    A.__dialog = 'accept';
    const c2 = await cnt();
    check('rechargé : ce qui a été pris est « identique », le reste encore proposé ; Annuler et « Tout remplacer » refusé ne changent rien', again.voulu === 'absent' && again.nonVoulu === '☑nouveau' && JSON.stringify(c2) === JSON.stringify(c1) && !(await A.$('#zp-ov')), [again, c1, c2]);
  }

  console.log('18. Fichiers ouverts sous leur nom exact ; documentation produit chargée dans l\'app ; plans dans Engineering (V11)');
  await settle(A, B);
  let popups = 0; const countPop = () => popups++;
  A.context().on('page', countPop);
  // a) achat : la pièce jointe est téléchargée sous son nom exact (logiciel du poste), plus d'onglet Chrome
  await A.evaluate(() => localStorage.removeItem('astuce_pdf'));
  await A.evaluate(() => { switchApp('achats'); editRow('IDPJ1'); });
  await A.waitForTimeout(300);
  await A.setInputFiles('#xa-box input[data-xa-up]', pdf('Offre – révision B.pdf', 'offre B'));
  await A.waitForTimeout(400);
  const ixB = await A.evaluate(() => window.getForm().attachments.findIndex(a => a.name === 'Offre – révision B.pdf'));
  const [dlA] = await Promise.all([A.waitForEvent('download', { timeout: 8000 }), A.click('#xa-box [data-xa="open"][data-i="' + ixB + '"]')]);
  check('pièce jointe d\'un achat : téléchargée sous son nom exact (accents, tirets), sans onglet Chrome', dlA.suggestedFilename() === 'Offre – révision B.pdf' && popups === 0, [dlA.suggestedFilename(), popups]);
  check('ordinateur : la marche à suivre (réglage Chrome pour le logiciel PDF) s\'affiche une fois', await A.evaluate(() => !!document.getElementById('pdf-tip')));
  await A.click('#pdf-tip [data-ok]');
  const [dlA2] = await Promise.all([A.waitForEvent('download', { timeout: 8000 }), A.click('#xa-box [data-xa="open"][data-i="' + ixB + '"]')]);
  check('… puis plus jamais sur ce poste', !(await A.$('#pdf-tip')) && dlA2.suggestedFilename() === 'Offre – révision B.pdf');
  const fidB = await A.evaluate(i => window.getForm().attachments[i].id, ixB);
  await waitFor(async () => files.has('app/files/' + fidB));
  check('envoyé en ligne avec son nom de téléchargement (Content-Disposition)', /filename\*=UTF-8''Offre%20%E2%80%93%20r%C3%A9vision%20B\.pdf/.test((fileMeta.get('app/files/' + fidB) || {}).contentDisposition || ''), fileMeta.get('app/files/' + fidB));
  // b) Project Master › produit › Documentation Engineering : « ⬆ Charger » met le fichier dans l'app
  await A.evaluate(() => { switchApp('projects'); pmEditProject('Pp1'); pmShowTab('produits'); pmEditProduct(0); pmProductSubTab('doceng'); });
  await A.waitForTimeout(300);
  await A.evaluate(() => { const pr = pmCurProj.products[0]; pr.docs = pr.docs || []; if (!pr.docs.length) pr.docs.push({ type: '', number: '', owner: '', link: '' }); pr.docs[0].type = 'Internal Drawing'; pr.docs[0].number = 'DWG-0042'; document.getElementById('pm-docs-0').innerHTML = pmDocsHtml(0); });
  await A.waitForTimeout(1500);   // l'enregistrement automatique de ces deux cases passe d'abord
  const [fc] = await Promise.all([A.waitForEvent('filechooser'), A.click('#pm-docs-0 button[onclick="pmDocUpload(0,0)"]')]);
  await fc.setFiles(pdf('Plan CX735 Tank — rév. B.pdf', 'plan B'));
  await A.waitForTimeout(600);
  const dA = await A.evaluate(() => { const f1 = d => d && ((d.files || [])[0] || d.file);   // V13 : doc.files (avant : doc.file)
    return { f: f1(pmCurProj.products[0].docs[0]), chip: (document.querySelector('#pm-docs-0 .pm-docf-n') || {}).textContent, saved: f1((JSON.parse(localStorage.getItem('pm_db')).projects.find(p => p.id === 'Pp1').products[0].docs || [])[0]), st: (document.getElementById('pm-autosave') || {}).textContent }; });
  check('documentation produit : « ⬆ Charger » met le fichier dans l\'app (nom exact), affiché sous la ligne, enregistré', !!dA.f && dA.f.name === 'Plan CX735 Tank — rév. B.pdf' && dA.chip === dA.f.name && !!dA.saved && dA.saved.id === dA.f.id, dA);
  check('… enregistrement normal du projet (pas de fusion « ↻ »)', /✓/.test(dA.st || ''), dA.st);
  const [dlD] = await Promise.all([A.waitForEvent('download', { timeout: 8000 }), A.click('#pm-docs-0 button[onclick="pmOpenDocLink(0,0)"]')]);
  check('« ↗ Ouvrir » ouvre le fichier chargé, sous son nom exact', dlD.suggestedFilename() === 'Plan CX735 Tank — rév. B.pdf', dlD.suggestedFilename());
  await settle(A, B); await sleep(600); await settle(A, B);
  const docB = (((await getLS(B, 'pm_db')).projects.find(p => p.id === 'Pp1').products[0] || {}).docs || [])[0] || {}, fB = (docB.files || [])[0] || docB.file;
  check('le fichier part en ligne avec le projet (nom de téléchargement compris) ; l\'autre poste reçoit la ligne et son fichier', !!fB && fB.id === dA.f.id && files.has('app/files/' + dA.f.id) && /attachment/.test((fileMeta.get('app/files/' + dA.f.id) || {}).contentDisposition || ''), [docB, files.has('app/files/' + dA.f.id)]);
  const idbHas = (p, id) => p.evaluate(id => new Promise(res => { const r = indexedDB.open('hp_files', 1); r.onsuccess = () => { const q = r.result.transaction('files').objectStore('files').get(id); q.onsuccess = () => res(!!(q.result && q.result.blob)); q.onerror = () => res(false); }; r.onerror = () => res(false); }), id);
  check('… et en garde une copie sur ce poste-là', await waitFor(() => idbHas(B, dA.f.id)));
  // c) Engineering (autre poste) : les plans du produit choisi, ouverts d'un clic
  await B.evaluate(() => { switchApp('engineering'); engNewProject(); const s = document.getElementById('ep-pmProj'); s.value = 'Pp1'; engPickPmProject(); const d = document.getElementById('ep-pmProd'); d.value = d.options[1].value; engPickPmProduct(); });
  await B.waitForTimeout(200);
  const engB = await B.evaluate(() => ({ hidden: document.getElementById('ep-pmDocs').hidden, chips: [...document.querySelectorAll('#ep-pmDocs .ep-doc')].map(b => b.textContent) }));
  check('Engineering › projet lié à un produit : ses plans chargés sont proposés', !engB.hidden && engB.chips.some(t => /Internal Drawing/.test(t) && /DWG-0042/.test(t) && t.includes('Plan CX735 Tank — rév. B.pdf')), engB);
  const [dlE] = await Promise.all([B.waitForEvent('download', { timeout: 8000 }), B.click('#ep-pmDocs .ep-doc')]);
  check('… un clic sur le plan l\'ouvre sous son nom exact', dlE.suggestedFilename() === 'Plan CX735 Tank — rév. B.pdf', dlE.suggestedFilename());
  await B.evaluate(id => new Promise(res => { const r = indexedDB.open('hp_files', 1); r.onsuccess = () => { const tx = r.result.transaction('files', 'readwrite'); tx.objectStore('files').delete(id); tx.oncomplete = () => res(); }; }), dA.f.id);
  const [pop] = await Promise.all([B.context().waitForEvent('page'), B.click('#ep-pmDocs .ep-doc')]);
  const dlR = await pop.waitForEvent('download', { timeout: 8000 }).catch(() => null);
  check('fichier absent de ce poste : ouvert depuis sa copie en ligne, téléchargé sous son nom exact', !!dlR && dlR.suggestedFilename() === 'Plan CX735 Tank — rév. B.pdf', dlR && dlR.suggestedFilename());
  // d) lien qui n'est qu'un nom de fichier (ancien « Charger ») ; sauvegarde .zip
  const msg = await A.evaluate(() => { const pr = pmCurProj.products[0]; pr.docs.push({ type: 'CAD Model', number: '', owner: '', link: 'ancien plan.pdf' }); pmOpenDocLink(0, pr.docs.length - 1); pr.docs.pop(); return (document.querySelector('.toast') || {}).textContent || ''; });
  check('lien qui n\'est qu\'un nom de fichier (ancien « Charger ») : message clair au lieu d\'une page « https://… » cassée', /dossier du produit/.test(msg) && popups === 0, [msg, popups]);
  if (JSZIP) check('sauvegarde .zip : le fichier de la documentation produit est inclus', await A.evaluate(async id => { const z = await JSZip.loadAsync(await buildPlatformZip()); return Object.keys(z.files).some(n => n.startsWith('attachments/' + id + '__')); }, dA.f.id));
  A.context().off('page', countPop);

  console.log('19. Plusieurs fichiers dans une même ligne de la Documentation Engineering (V13)');
  await settle(A, B);
  await A.evaluate(() => { switchApp('projects'); pmEditProject('Pp1'); pmShowTab('produits'); pmEditProduct(0); pmProductSubTab('doceng'); });
  await A.waitForTimeout(300);
  const ci = await A.evaluate(() => { const pr = pmCurProj.products[0]; pr.docs.push({ type: 'CAD Model', number: 'C1185572', owner: 'YT', link: '' }); document.getElementById('pm-docs-0').innerHTML = pmDocsHtml(0); return pr.docs.length - 1; });
  await A.waitForTimeout(1500);   // l'enregistrement automatique de la ligne passe d'abord
  const upTo = async (di, fl) => { const [c] = await Promise.all([A.waitForEvent('filechooser'), A.click('#pm-docs-0 button[onclick="pmDocUpload(0,' + di + ')"]')]); await c.setFiles(fl); await A.waitForTimeout(700); };
  const rowA = di => A.evaluate(di => {
    const pr = pmCurProj.products[0], d = pr.docs[di] || {}, row = document.querySelectorAll('#pm-docs-0 > div')[di];
    const sv = ((JSON.parse(localStorage.getItem('pm_db')).projects.find(p => p.id === 'Pp1').products[0].docs || [])[di]) || {};
    return { n: pr.docs.length, files: (d.files || []).map(f => f.name), ids: (d.files || []).map(f => f.id), old: !!d.file, lines: row ? [...row.querySelectorAll('.pm-docf-n')].map(e => e.textContent) : [], saved: (sv.files || []).map(f => f.name) };
  }, di);
  const S1 = 'C1185572.CATDrawing_Sheet_1.pdf', S2 = 'C1185572.CATDrawing_Sheet_2_(Detail).pdf', S3 = 'C1185572.CATDrawing_Sheet_3.pdf';
  const n0 = (await rowA(ci)).n;
  await upTo(ci, [pdf(S1, 'feuille 1'), pdf(S2, 'feuille 2')]);
  const r1 = await rowA(ci);
  check('deux PDF choisis d\'un coup : tous les deux dans LA MÊME ligne (plus de ligne en plus), affichés sous elle, enregistrés', r1.n === n0 && r1.files.join('|') === S1 + '|' + S2 && r1.lines.join('|') === r1.files.join('|') && r1.saved.join('|') === r1.files.join('|'), r1);
  let asked = 0; const countDlg = () => asked++; A.on('dialog', countDlg);
  await upTo(ci, pdf(S3, 'feuille 3'));
  const r2 = await rowA(ci);
  check('un 3e PDF chargé plus tard : ajouté à la même ligne, sans question', r2.n === n0 && r2.files.join('|') === [S1, S2, S3].join('|') && asked === 0, [r2, asked]);
  A.__dialog = 'dismiss'; await upTo(ci, pdf(S1, 'feuille 1 rév. B')); const r3 = await rowA(ci);
  A.__dialog = 'accept'; await upTo(ci, pdf(S1, 'feuille 1 rév. B')); const r4 = await rowA(ci);
  A.off('dialog', countDlg);
  check('même nom déjà dans la ligne : la question est posée ; « Annuler » garde l\'ancien, « OK » le remplace à sa place (pas de doublon)', asked === 2 && r3.ids.join() === r2.ids.join() && r4.files.join('|') === r2.files.join('|') && r4.ids[0] !== r2.ids[0] && r4.ids[1] === r2.ids[1], [asked, r3.ids, r4.ids]);
  await A.click('#pm-docs-0 button[onclick="pmOpenDocLink(0,' + ci + ')"]');
  const mn = await A.evaluate(() => [...document.querySelectorAll('#pm-docmenu button')].map(b => b.textContent));
  const [dlM] = await Promise.all([A.waitForEvent('download', { timeout: 8000 }), A.click('#pm-docmenu button[data-k="1"]')]);
  check('« ↗ Ouvrir » d\'une ligne à plusieurs fichiers : un menu les propose tous ; celui choisi s\'ouvre sous son nom exact', mn.length === 3 && [S1, S2, S3].every((s, k) => (mn[k] || '').includes(s)) && dlM.suggestedFilename() === S2 && !(await A.$('#pm-docmenu')), [mn, dlM.suggestedFilename()]);
  await A.click('#pm-docs-0 button[onclick="pmOpenDocLink(0,' + ci + ')"]'); await A.keyboard.press('Escape');
  const escOk = !(await A.$('#pm-docmenu'));
  const [dlN] = await Promise.all([A.waitForEvent('download', { timeout: 8000 }), A.locator('#pm-docs-0 > div').nth(ci).locator('.pm-docf-n', { hasText: S3 }).click()]);
  check('… Échap ferme le menu ; un clic sur le nom d\'un fichier sous la ligne ouvre CE fichier', escOk && dlN.suggestedFilename() === S3, [escOk, dlN.suggestedFilename()]);
  await A.locator('#pm-docs-0 > div').nth(ci).locator('.pm-docf', { hasText: S3 }).locator('.set-del').click();
  await A.waitForTimeout(300);
  const r5 = await rowA(ci);
  check('✕ d\'un fichier : seul ce fichier est retiré, les autres restent (enregistré)', r5.files.join('|') === S1 + '|' + S2 && r5.saved.join('|') === S1 + '|' + S2, r5);
  // ligne d'avant la V13 : un seul fichier dans doc.file
  const li = await A.evaluate(() => new Promise(res => { const r = indexedDB.open('hp_files', 1); r.onsuccess = () => { const tx = r.result.transaction('files', 'readwrite'); tx.objectStore('files').put({ blob: new Blob(['%PDF-1.4 ancien'], { type: 'application/pdf' }), name: 'Plan ancien V12.pdf', type: 'application/pdf' }, 'Fleg13');
    tx.oncomplete = () => { const pr = pmCurProj.products[0]; pr.docs.push({ type: 'STEP Model', number: 'S-9', owner: '', link: '', file: { id: 'Fleg13', name: 'Plan ancien V12.pdf', size: 15, type: 'application/pdf', at: new Date().toISOString() } }); document.getElementById('pm-docs-0').innerHTML = pmDocsHtml(0); res(pr.docs.length - 1); }; }; }));
  await A.waitForTimeout(1500);
  const r6 = await rowA(li);
  await upTo(li, pdf('Modèle 3D.pdf', '3d'));
  const r7 = await rowA(li);
  check('ligne d\'avant la V13 (un seul fichier) : affichée ; un nouveau fichier s\'ajoute à côté de l\'ancien, rien de perdu', r6.lines.join('|') === 'Plan ancien V12.pdf' && r7.files.join('|') === 'Plan ancien V12.pdf|Modèle 3D.pdf' && !r7.old && r7.lines.join('|') === r7.files.join('|'), [r6, r7]);
  let msgDel = ''; const grab = d => { msgDel = d.message(); }; A.on('dialog', grab);
  A.__dialog = 'dismiss'; await A.click('#pm-docs-0 > div:nth-child(' + (li + 1) + ') > button.set-del'); A.__dialog = 'accept'; A.off('dialog', grab);
  check('✕ d\'une ligne qui a des fichiers : confirmation (« ses 2 fichiers ») ; « Annuler » la garde', /ses 2 fichiers/.test(msgDel) && (await rowA(li)).files.length === 2, msgDel);
  await settle(A, B); await sleep(600); await settle(A, B);
  const allIds = await A.evaluate(ix => ix.flatMap(i => (pmCurProj.products[0].docs[i].files || []).map(f => f.id)), [ci, li]);
  const docsB2 = (((await getLS(B, 'pm_db')).projects.find(p => p.id === 'Pp1').products[0] || {}).docs || []);
  const cadB = docsB2.find(d => d.type === 'CAD Model' && d.number === 'C1185572') || {}, stepB = docsB2.find(d => d.type === 'STEP Model' && d.number === 'S-9') || {};
  check('l\'autre poste reçoit les lignes avec TOUS leurs fichiers', (cadB.files || []).map(f => f.name).join('|') === S1 + '|' + S2 && (stepB.files || []).map(f => f.name).join('|') === 'Plan ancien V12.pdf|Modèle 3D.pdf', [cadB, stepB]);
  check('… tous envoyés en ligne, et l\'autre poste en garde une copie', allIds.length === 4 && allIds.every(id => files.has('app/files/' + id)) && await waitFor(async () => { for (const id of allIds) if (!(await idbHas(B, id))) return false; return true; }), allIds.map(id => files.has('app/files/' + id)));
  await B.evaluate(() => engPmDocs.render());
  const chipsB = await B.evaluate(() => [...document.querySelectorAll('#ep-pmDocs .ep-doc')].map(b => b.textContent));
  const [dlE2] = await Promise.all([B.waitForEvent('download', { timeout: 8000 }), B.locator('#ep-pmDocs .ep-doc', { hasText: S2 }).click()]);
  check('Engineering : un bouton par fichier (feuille 1, feuille 2…) ; un clic ouvre ce fichier-là sous son nom exact', [S1, S2, 'Plan ancien V12.pdf', 'Modèle 3D.pdf'].every(n => chipsB.some(t => t.includes(n))) && chipsB.filter(t => /CAD Model/.test(t) && /C1185572/.test(t)).length === 2 && dlE2.suggestedFilename() === S2, [chipsB, dlE2.suggestedFilename()]);
  if (JSZIP) {
    check('sauvegarde .zip : tous les fichiers des lignes sont inclus', await A.evaluate(async ids => { const n = Object.keys((await JSZip.loadAsync(await buildPlatformZip())).files); return ids.every(id => n.some(x => x.startsWith('attachments/' + id + '__'))); }, allIds));
    await A.evaluate(async ids => {   // ZIP « d'un autre poste » : le même projet sous un autre id ; les fichiers ne sont plus sur ce poste
      const zip = await JSZip.loadAsync(await buildPlatformZip()), pm = JSON.parse(await zip.file('project_master.json').async('string'));
      const p = JSON.parse(JSON.stringify(pm.projects.find(x => x.id === 'Pp1'))); p.id = 'PpM13'; p.name = 'Projet à plusieurs fichiers'; pm.projects.push(p);
      zip.file('project_master.json', JSON.stringify(pm));
      window.__zpFile = new File([await zip.generateAsync({ type: 'blob' })], 'plusieurs_fichiers.zip');
      await Promise.all(ids.map(id => new Promise(res => { const r = indexedDB.open('hp_files', 1); r.onsuccess = () => { const tx = r.result.transaction('files', 'readwrite'); tx.objectStore('files').delete(id); tx.oncomplete = () => res(); }; })));
    }, allIds);
    await A.evaluate(() => { window.__zpDone = window.hpRestore({ files: [window.__zpFile], value: '' }); });
    await A.waitForSelector('#zp-ov .zp-dlg', { timeout: 8000 });
    const proposed = await A.locator('#zp-ov .zp-it[data-k="pm:projects|PpM13"] input').isChecked().catch(() => false);
    await A.click('#zp-ov [data-z="ok"]'); await A.evaluate(() => window.__zpDone);
    const back = []; for (const id of allIds) back.push(await idbHas(A, id));
    check('chargement d\'un ZIP en choisissant (V10) : le projet pris revient avec TOUS les fichiers de ses lignes', proposed && back.every(Boolean), [proposed, back]);
  }

  console.log('20. Outils & Suivi : commentaires du jalon triés et corrigés, dossier de documents gardé, notes compactes (V15)');
  await settle(A, B);
  await A.evaluate(() => {
    switchApp('projects'); pmEditProject('Pp1'); pmShowTab('outils');
    const m = pmCurProj.tools[0].milestones[0];   // ajoutés dans le désordre
    m.comments = [{ text: 'Cotation reçue (03/03)', date: '2026-03-03T17:18:00.000Z' }, { text: 'Cotation séparée (12/03)', date: '2026-03-12T12:00:00.000Z' }, { text: 'TO incomplet (11/03)', date: '2026-03-11T13:23:00.000Z' }];
    pmMsPersist(); pmOpenMsPopup('t:0', 0); pmMsToggleComments('t:0', 0);
  });
  await A.waitForTimeout(200);
  const ordV15 = await A.evaluate(() => [...document.querySelectorAll('#ms-pop-clist > div')].map(d => d.lastElementChild.textContent.trim()));
  check('commentaires du jalon : triés par date, le plus récent en haut (même ajoutés dans le désordre)', ordV15.join('|') === 'Cotation séparée (12/03)|TO incomplet (11/03)|Cotation reçue (03/03)', ordV15);
  const editBtn = '#ms-pop-clist > div:nth-child(2) button[title^="Modifier le texte"]', hasEdit = !!(await A.$(editBtn));
  let preV15 = null;
  if (hasEdit) {
    await A.click(editBtn); preV15 = await A.inputValue('#ms-pop-clist textarea');
    await A.fill('#ms-pop-clist textarea', 'TO incomplet de Ford : offre étude + réalisation séparées (11/03)');
    await A.click('#ms-pop-clist [data-ok]'); await A.waitForTimeout(300);
  }
  const ed = await A.evaluate(() => { const c = pmCurProj.tools[0].milestones[0].comments, sv = JSON.parse(localStorage.getItem('pm_db')).projects.find(p => p.id === 'Pp1').tools[0].milestones[0].comments;
    return { n: c.length, c: c.find(x => /Ford/.test(x.text)), sv: !!sv.find(x => /Ford/.test(x.text)), old: c.some(x => x.text === 'TO incomplet (11/03)'), pos: [...document.querySelectorAll('#ms-pop-clist > div')].findIndex(d => /Ford/.test(d.textContent)) }; });
  check('✎ : le texte d\'un commentaire se corrige (prérempli), sa date ne change pas, il reste à sa place, enregistré', hasEdit && preV15 === 'TO incomplet (11/03)' && ed.n === 3 && !ed.old && !!ed.c && ed.c.date === '2026-03-11T13:23:00.000Z' && ed.sv && ed.pos === 1, [hasEdit, preV15, ed]);
  await A.selectOption('#ms-pop-folder', '2- Offres');
  await A.evaluate(() => { document.getElementById('ms-popup-ov').remove(); pmOpenMsPopup('t:0', 0); });
  const fo = await A.evaluate(() => ({ sel: document.getElementById('ms-pop-folder').value, sv: JSON.parse(localStorage.getItem('pm_db')).projects.find(p => p.id === 'Pp1').tools[0].milestones[0].folder }));
  check('« Documents de l\'équipement » : le dossier choisi est gardé (fenêtre rouverte) et enregistré (avant : revenait au dossier déduit du nom)', fo.sel === '2- Offres' && fo.sv === '2- Offres', fo);
  await A.evaluate(() => document.getElementById('ms-popup-ov').remove());
  await settle(A, B); await sleep(600); await settle(A, B);
  const mB = ((((await getLS(B, 'pm_db')).projects.find(p => p.id === 'Pp1').tools || [])[0] || {}).milestones || [])[0] || {};
  check('l\'autre poste reçoit le commentaire corrigé (sans l\'ancien texte en double) et le dossier choisi', (mB.comments || []).length === 3 && mB.comments.some(c => /Ford/.test(c.text) && c.date === '2026-03-11T13:23:00.000Z') && !mB.comments.some(c => c.text === 'TO incomplet (11/03)') && mB.folder === '2- Offres', mB);
  await A.evaluate(() => { const t = pmCurProj.tools[0]; t.notes = t.notes || []; t.notes.unshift({ id: 'NV15', text: 'Action de test V15', ts: Date.now(), jalon: '', kind: 'Action', status: 'À faire', urgency: 'Critique', dueDate: '2026-12-01', comments: [] }); pmEditTool(0); });
  await A.waitForTimeout(200);
  const nt = await A.evaluate(() => { const c = [...document.querySelectorAll('.pm-note')].find(x => /Action de test V15/.test(x.textContent)); if (!c) return null;
    const h = c.querySelector('.pm-note-head'), kids = [...h.children].filter(k => k.offsetParent), sel = [...c.querySelectorAll('.pm-note-sel')].map(s => Math.round(s.getBoundingClientRect().width));
    return { sel, oneLine: Math.max(...kids.map(k => k.getBoundingClientRect().top)) < Math.min(...kids.map(k => k.getBoundingClientRect().bottom)) }; });
  check('notes d\'un outil (ordinateur) : statut et urgence en petites pastilles, tout l\'en-tête sur une ligne (avant : barres pleine largeur)', !!nt && nt.sel.length === 2 && nt.sel.every(x => x < 160) && nt.oneLine, nt);
  await A.evaluate(() => { pmCurProj.tools[0].notes = pmCurProj.tools[0].notes.filter(n => n.id !== 'NV15'); pmCloseTool(); });

  console.log('21. Versions des volumes (onglet Volumes) et capacité par version (onglet Production) (V16)');
  await settle(A, B);
  await A.evaluate(() => { switchApp('projects'); pmEditProject('Pp1'); Object.assign(pmCurProj, { volumes: [{ year: 2027, volume: 150000 }, { year: 2028, volume: 220000 }], openHoursDay: 8, shiftsWeek: 15, weeksYear: 47 }); pmRenderProjectForm(); pmShowTab('volumes'); });
  await A.waitForTimeout(1500);   // enregistrement automatique des volumes de départ
  const hasNV = !!(await A.$('#pm-vol-newver'));
  if (hasNV) {
    await A.click('#pm-vol-newver'); await A.waitForTimeout(300);
    await A.fill('#pm-volumes tbody tr:nth-child(2) td:nth-child(2) input', '260000'); await A.press('#pm-volumes tbody tr:nth-child(2) td:nth-child(2) input', 'Tab');
    await A.waitForTimeout(1600);
  }
  const vv = await A.evaluate(() => { const sv = JSON.parse(localStorage.getItem('pm_db')).projects.find(p => p.id === 'Pp1');
    return { volVer: pmCurProj.volVer, vv: (pmCurProj.volumeVersions || []).map(v => v.n + ':' + v.volumes.map(x => x.year + '=' + x.volume).join(',')), cur: pmCurProj.volumes.map(x => x.year + '=' + x.volume).join(','), saved: (sv.volumeVersions || []).length, savedVer: sv.volVer }; });
  check('« 🗂 Nouvelle version » : les volumes actuels (V1) sont archivés tels quels ; la V2 part des mêmes chiffres et se modifie seule ; enregistré', hasNV && vv.volVer == 2 && vv.vv.join() === '1:2027=150000,2028=220000' && vv.cur === '2027=150000,2028=260000' && vv.saved === 1 && vv.savedVer == 2, [hasNV, vv]);
  if (hasNV) await A.click('.pm-vol-vh');
  const av = await A.evaluate(() => ({ rows: [...document.querySelectorAll('.pm-vol-t tbody tr')].map(r => [...r.cells].map(c => c.textContent.replace(/\s/g, '')).join('|')), inputs: document.querySelectorAll('.pm-vol-arch input').length }));
  check('version archivée : un clic l\'ouvre en lecture seule (année, volume, volume actuel, écart)', av.rows.join(';') === '2027|150000|150000|0;2028|220000|260000|+40000' && av.inputs === 0, av);
  await A.evaluate(() => pmShowTab('production')); await A.waitForTimeout(200);
  const capOf = () => A.evaluate(() => { const s = document.getElementById('pm-cap-ver'), t = document.querySelector('#pm-capacity table');
    return { opts: s ? s.options.length : 0, val: s ? s.value : null, vols: t ? t.textContent.replace(/\s/g, '') : '', note: !!document.querySelector('.pm-cap-old'), cur: pmCurProj.volumes.map(x => x.volume).join(',') }; });
  const k1 = await capOf();
  let csvV1 = false;
  if (k1.opts) {
    await A.selectOption('#pm-cap-ver', { index: 1 }); await A.waitForTimeout(200);
    const [dlV] = await Promise.all([A.waitForEvent('download', { timeout: 8000 }), A.evaluate(() => pmExportCapacityCSV())]);
    const txt = fs.readFileSync(await dlV.path(), 'utf8'); csvV1 = /220000/.test(txt) && !/260000/.test(txt);
  }
  const k2 = await capOf();
  await A.evaluate(() => { pmShowTab('volumes'); pmShowTab('production'); });
  const k3 = await capOf();
  check('Production : liste des versions, la dernière par défaut ; V1 choisie : charge et Extraction CSV avec ses volumes, ceux du projet inchangés ; onglet rouvert : de nouveau la dernière', k1.opts === 2 && k1.val === '' && k1.vols.includes('260000') && k2.vols.includes('220000') && !k2.vols.includes('260000') && k2.note && k2.cur === '150000,260000' && csvV1 && k3.val === '' && !k3.note, [k1, k2, csvV1, k3]);
  await settle(A, B); await sleep(600); await settle(A, B);
  const pB = (await getLS(B, 'pm_db')).projects.find(p => p.id === 'Pp1') || {};
  check('l\'autre poste reçoit la version archivée et la version actuelle', pB.volVer == 2 && (pB.volumeVersions || []).length === 1 && (pB.volumeVersions[0].volumes.find(x => x.year == 2028) || {}).volume == 220000 && ((pB.volumes || []).find(x => x.year == 2028) || {}).volume == 260000, { volVer: pB.volVer, vv: pB.volumeVersions, vols: pB.volumes });

  console.log('22. Plan d\'actions : mise en page sur ordinateur (V17)');
  await A.evaluate(() => { switchApp('projects'); pmDB.actions.unshift({ id: 'AV17', text: 'Action V17 au texte assez long pour passer à la ligne dans la colonne Action du plan d\'actions sans élargir le tableau', ts: Date.now(), jalon: '', kind: 'Action', status: 'En cours', urgency: 'Critique', dueDate: '2026-12-01', comments: [] }); pmGo('actions'); });
  await A.waitForTimeout(300);
  const apd = await A.evaluate(() => {
    const host = document.getElementById('pm-actionplan'), panels = host.querySelectorAll('.panel'), list = panels[panels.length - 1], pr = list.getBoundingClientRect();
    const filt = [...list.querySelectorAll('.ph select')].map(s => s.getBoundingClientRect()), rows = [...host.querySelectorAll('tbody tr')].filter(r => r.querySelector('select'));
    return { n: rows.length, filters: filt.length, filtIn: filt.every(r => r.right <= pr.right + 1 && r.left >= pr.left - 1), delIn: rows.every(r => r.querySelector('.set-del').getBoundingClientRect().right <= pr.right + 1),
      sel: Math.min(...rows.flatMap(r => [...r.querySelectorAll('select')].map(s => Math.round(s.getBoundingClientRect().width)))) };
  });
  check('Plan d\'actions (ordinateur) : les 4 filtres visibles, urgence et statut en entier, ✕ de chaque ligne dans le panneau (avant : 3 filtres et ✕ cachés à droite, « Critiqu », « En c »)', apd.n > 0 && apd.filters === 4 && apd.filtIn && apd.delIn && apd.sel >= 70, apd);
  await A.evaluate(() => { pmDB.actions = pmDB.actions.filter(a => a.id !== 'AV17'); pmRenderActionPlan(); });

  console.log('23. Planning (Gantt) : cases à cocher visibles, colonne des noms sur ordinateur (V18)');
  await A.evaluate(() => { switchApp('projects'); pmGo('planning'); });
  await A.waitForTimeout(300);
  const gt1 = await A.evaluate(() => { const c = document.getElementById('gt-late'), lbl = document.querySelector('#gt-wrap .gt-row .gt-lbl'); return { app: c ? getComputedStyle(c).appearance : null, lbl: lbl ? Math.round(lbl.getBoundingClientRect().width) : 0 }; });
  if (await A.$('#gt-late')) { await A.check('#gt-late'); await A.waitForTimeout(200); }
  const gt2 = await A.evaluate(() => ({ checked: !!(document.getElementById('gt-late') || {}).checked, app: getComputedStyle(document.getElementById('gt-late')).appearance }));
  if (await A.$('#gt-late')) { await A.uncheck('#gt-late'); await A.waitForTimeout(200); }
  check('Planning : la coche des filtres « Retards uniquement » / « Masquer les jalons faits » se voit (avant : invisible, appearance:none) ; ordinateur : colonne des noms inchangée (380 px)', gt1.app && gt1.app !== 'none' && gt2.checked && gt2.app !== 'none' && gt1.lbl === 380, [gt1, gt2]);

  console.log('24. Rappels : état de chaque étape et vrai test par le serveur (V19)');
  // Faux serveur des rappels : la vraie logique de functions/rappels.js (test) sur les documents du faux Firestore ;
  // l'envoi FCM « arrive » sur le poste A comme un rappel reçu app ouverte. fnMode : 'down' (pas installé), 'ok', 'fcmerr'.
  const RJ = require('../functions/rappels.js');
  let fnMode = 'down'; const fnCalls = [];
  const dref = p => ({ path: p, id: p.split('/').pop(), collection: n => ({ doc: id => dref(p + '/' + n + '/' + id) }),
    get: async () => ({ exists: docs.has(p), data: () => docs.get(p) }),
    set: async (v, o) => { docs.set(p, o && o.merge ? Object.assign({}, docs.get(p) || {}, v) : v); }, delete: async () => { docs.delete(p); } });
  const fdb = { collection: c => ({ doc: id => dref(c + '/' + id) }) };
  const nowTs = (h = 0) => ({ seconds: Math.floor(Date.now() / 1000) - h * 3600, nanoseconds: 0 });   // horodatage Firestore (lu en JSON)
  await A.route('https://europe-west1-work-75094.cloudfunctions.net/**', async route => {
    const rq = route.request(), cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'POST' };
    if (rq.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors, body: '' });
    if (fnMode === 'down') return route.abort();
    const body = JSON.parse(rq.postData() || '{}'), m = /^Bearer idtok-(.+)$/.exec(rq.headers()['authorization'] || '');
    fnCalls.push({ data: body.data, email: m && m[1] });
    const r = await RJ.test({ db: fdb, auth: m ? { uid: 'u-' + m[1], token: { email: m[1] } } : null, data: body.data, ts: nowTs(),
      send: async (token, msg) => {
        if (fnMode === 'fcmerr') { const e = new Error('Auth error from APNS or Web Push Service'); e.code = 'messaging/third-party-auth-error'; throw e; }
        setTimeout(() => A.evaluate(d => window.__mockMessaging.onMessage({ data: d }), msg).catch(() => {}), 50);   // l'app ouverte reçoit la notification
      } });
    return route.fulfill({ status: 200, headers: Object.assign({ 'content-type': 'application/json' }, cors), body: JSON.stringify({ result: r }) });
  });
  await stubPush(A);
  const rpText = () => A.evaluate(() => (document.getElementById('rp-panel') || {}).textContent || '');
  const click24 = async sel => { if (await A.$(sel)) { await A.click(sel); return true; } return false; };
  await A.evaluate(() => { switchApp('projects'); pmGo('settings'); });
  let ok24 = await waitFor(async () => /Ne répond pas\s: il n'est pas encore installé/.test(await rpText()));
  const setup24 = await A.evaluate(() => { const d = document.querySelector('#rp-panel details[data-k="setup"]'), c = document.querySelector('#rp-panel .rp19-cmd'); return { open: !!(d && d.open), cmd: c ? c.textContent : '', copy: !!document.querySelector('#rp-panel [data-rp19="copy"]') }; });
  check('serveur pas installé : étape 1 « Ne répond pas », marche à suivre ouverte avec la commande Cloud Shell (branche publiée, projet) et « Copier » (avant : rien ne le disait)',
    ok24 && setup24.open && setup24.copy && /^npx -y firebase-tools@latest login --no-localhost && D=\$\(mktemp -d\) && git clone -q --depth 1 -b ccr-fcfbd0a0-m1mkvy https:\/\/github\.com\/ytyoussef123\/Work\.git /.test(setup24.cmd) && /npx -y firebase-tools@latest deploy --only functions --project work-75094$/.test(setup24.cmd), [ok24, setup24]);
  await A.evaluate(() => { window.__notifs = []; });
  await click24('#rp-panel [data-rap="test"]');
  ok24 = await waitFor(async () => /Notification affichée par cet appareil seulement/.test(await rpText()));
  const n24 = await A.evaluate(() => window.__notifs.map(n => n[0] + ' | ' + (n[1] && n[1].body)));
  check('Tester sans serveur : notification locale qui le dit, et explication dans le panneau', ok24 && n24.some(s => /^🔔 Test des rappels \| Affichée par cet appareil seulement/.test(s)), [ok24, n24]);
  fnMode = 'ok';
  await click24('#rp-panel [data-rp19="srv"]');
  ok24 = await waitFor(async () => /Installé · premier passage le prochain matin/.test(await rpText()));
  check('serveur installé, pas encore passé : « Installé · premier passage le prochain matin »', ok24, (await rpText()).slice(0, 300));
  docs.set('app/_rappels', Object.assign({}, docs.get('app/_rappels') || {}, { dernierPassage: nowTs(2), appareils: 1, envoyes: 1 }));
  await click24('#rp-panel [data-rp19="srv"]');
  ok24 = await waitFor(async () => /En service · dernier passage le \d\d\/\d\d à \d\d:\d\d/.test(await rpText()));
  const st24 = await A.evaluate(() => { const s = document.querySelector('#rp-panel .rp19-step'), d = document.querySelector('#rp-panel details[data-k="setup"]'); return { ok: !!(s && s.classList.contains('ok')), open: !!(d && d.open) }; });
  check('serveur passé ce matin : « En service · dernier passage le JJ/MM à HH:MM », étape 1 au vert, marche à suivre refermée', ok24 && st24.ok && !st24.open, [ok24, st24]);
  await A.evaluate(() => { window.__notifs = []; });
  fnCalls.length = 0;
  await click24('#rp-panel [data-rap="test"]');
  ok24 = await waitFor(async () => /✓ Envoyée par le serveur à \d\d:\d\d/.test(await rpText()));
  const got24 = await waitFor(async () => (await A.evaluate(() => window.__notifs.map(n => n[1] && n[1].body))).some(b => /^Envoyé par le serveur/.test(b || '')));
  const myId = await A.evaluate(() => fbSync.rappels.local().id);
  check('Tester avec le serveur : appel avec le jeton Google et l\'identifiant de l\'appareil, vraie notification reçue, « ✓ Envoyée par le serveur »', ok24 && got24 && fnCalls.length === 1 && fnCalls[0].email === 'a@test.fr' && fnCalls[0].data.id === myId, [ok24, got24, fnCalls]);
  ok24 = await waitFor(async () => /Dernier test envoyé par le serveur le \d\d\/\d\d/.test(await rpText()));
  check('date du test notée par le serveur (app/_rappels/envois/<appareil>) et affichée sous « Cet appareil »', ok24 && !!(docs.get('app/_rappels/envois/' + myId) || {}).dernierTest, docs.get('app/_rappels/envois/' + myId));
  fnMode = 'fcmerr';
  await click24('#rp-panel [data-rap="test"]');
  ok24 = await waitFor(async () => /✕ envoi refusé par Firebase Cloud Messaging\s: messaging\/third-party-auth-error/.test(await rpText()));
  const ok24b = await waitFor(async () => /⚠ Dernier envoi refusé par Firebase le .*third-party-auth-error/.test(await rpText()));
  check('envoi refusé par Firebase : le code s\'affiche au test et sous « Cet appareil »', ok24 && ok24b, (await rpText()).slice(0, 600));
  fnMode = 'ok';
  docs.delete('app/_rappels/appareils/' + myId);
  await click24('#rp-panel [data-rp19="srv"]');
  ok24 = await waitFor(async () => /pas inscrit côté serveur/.test(await rpText()) && !!(await A.$('#rp-panel [data-rap="on"]')));
  check('appareil effacé côté serveur (jeton expiré) : « pas inscrit côté serveur » et bouton « Réactiver » (avant : « ✓ Activé »)', ok24, (await rpText()).slice(0, 400));
  await click24('#rp-panel [data-rap="on"]');
  ok24 = await waitFor(async () => docs.has('app/_rappels/appareils/' + myId) && /✓ Activé sur cet appareil · notifications autorisées · inscrit côté serveur/.test(await rpText()));
  check('« Réactiver » : appareil réinscrit, étape 2 au vert (« inscrit côté serveur »)', ok24, (await rpText()).slice(0, 400));
  members.delete('a@test.fr');
  await click24('#rp-panel [data-rap="off"]');
  await waitFor(async () => !!(await A.$('#rp-panel [data-rap="on"]')));
  await click24('#rp-panel [data-rap="on"]');
  ok24 = await waitFor(async () => /Firebase a refusé l'inscription \(permission-denied\)/.test(await rpText()));
  members.add('a@test.fr');
  check('inscription refusée par Firestore : affichée avec « Réactiver » (avant : « ✓ Activé » quand même)', ok24 && !!(await A.$('#rp-panel [data-rap="on"]')), (await rpText()).slice(0, 400));
  await click24('#rp-panel [data-rap="on"]');
  ok24 = await waitFor(async () => /✓ Activé sur cet appareil/.test(await rpText()) && !/refusé l'inscription/.test(await rpText()));
  check('accès rendu : « Réactiver » réinscrit l\'appareil', ok24 && docs.has('app/_rappels/appareils/' + myId), (await rpText()).slice(0, 400));

  check('aucune erreur JavaScript', errors.length === 0, errors);
  console.log(`\n${pass} réussis, ${fail} échoués`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(async e => { console.error('ERREUR', e); console.error(errors); try { await browser.close(); } catch (x) {} process.exit(2); });
