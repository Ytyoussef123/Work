// Lancer : node tests/test_budget.js [fichier.html]   (Playwright requis ; « npm install » dans tests/ pour JSZip)
// Budgets : lignes qui partagent le même numéro (consommation par ligne, barres, arbre, export Excel,
// formulaire d'achat) et documents du budget (ajout, retrait, carte 📎, OPEX, limite 20 Mo, sauvegarde .zip).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const APP = process.argv[2] || path.join(__dirname, '..', 'plateforme.html');
const HTML = fs.readFileSync(APP, 'utf8');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock_firebase.js'), 'utf8');
const JSZIP = (() => { try { return fs.readFileSync(path.join(__dirname, 'node_modules/jszip/dist/jszip.min.js'), 'utf8'); } catch (e) { return null; } })();

const NUM = 'T4800021009-000';   // même n° sur toutes les lignes (cas réel : n° de commande client)
const settings = {
  projets: ['CX735'], fournisseurs: ['F1'], references: ['R1'], acheteurs: ['YT'],
  budgets: [
    { id: 'BC', projet: 'CX735', type: 'Costumer', label: 'FILLER NECK BUDGET - 4800021009', montant: 156554, devise: 'EUR',
      immobilisations: [
        { id: 'L1', numero: NUM, description: 'BLOW MOLD BLOW MOULDING MOULD', montant: 71773 },
        { id: 'L2', numero: NUM, description: 'DEBURRING FIXTURE', montant: 5976 },
        { id: 'L3', numero: NUM, description: 'BLOW MOLD CAP INJECTION MOULD', montant: 33388 }] },
    { id: 'BO', projet: 'CX735', type: 'OPEX', label: 'Budget OPEX essais', montant: 4000, devise: 'EUR' }
  ]
};
const base = (id, desc, pu, extra) => Object.assign({ id, line: +id.slice(1), dateCreation: '2026-10-01', projet: 'CX735', reference: 'R1', description: desc,
  capexOpex: 'Costumer', numCapex: 'FILLER NECK BUDGET - 4800021009', _budgetId: 'BC', fournisseur: 'F1', numDA: 'DA' + id, numPO: '', puHT: pu, quantite: 1,
  devise: 'EUR', acheteur: 'YT', numAsset: NUM, dateMIGO: '2026-10-05', recMIGO: 'ONGOING', observations: '', lienOffre: '', attachments: [] }, extra);
const purchases = [
  base('P1', 'Moule soufflage (ancienne répartition)', 20000, { immoAllocations: [{ immoNum: NUM, montant: 20000 }] }),
  base('P2', 'Retouche moule (ancienne répartition)', 5580, { immoAllocations: [{ immoNum: NUM, montant: 5580 }] }),
  base('P3', 'Outil ébavurage (nouvelle répartition)', 1000, { immoAllocations: [{ immoNum: NUM, montant: 1000, immoId: 'L2' }] }),
  base('P4', 'Très ancien achat (n° saisi à la main)', 300, { immoAllocations: null }),
  base('P5', 'Achat annulé', 500, { recMIGO: 'CANCELLED', immoAllocations: [{ immoNum: NUM, montant: 500, immoId: 'L3' }] })
];
const seed = { suivi_autosave: JSON.stringify(purchases), suivi_settings: JSON.stringify(settings), hp_user: 'YT' };

let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
const num = s => +String(s).replace(/[^\d-]/g, '');

async function open(browser, withSeed) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: HTML });
    if (JSZIP && /jszip/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: JSZIP });
    if (u.includes('/firebasejs/') || u.includes('npm/firebase@')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('-app-compat') ? MOCK : '' });
    return r.abort();
  });
  await page.exposeFunction('__be', async () => null);
  if (withSeed) await page.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); for (const k in s) localStorage.setItem(k, s[k]); } }, seed);
  await page.goto('http://app.test/plateforme.html');
  await page.waitForFunction(() => window.fbSync && document.getElementById('main-home'));
  await page.waitForTimeout(300);
  return { page, errors, ctx };
}
// Lignes du budget BC telles qu'affichées sur sa carte
const cardLines = page => page.evaluate(() => {
  const card = [...document.querySelectorAll('#budgetGrid .budget-card')].find(c => c.textContent.includes('FILLER'));
  return [...card.querySelectorAll('.pb-bar[style*="height:4px"]')].map(bar => {
    const blk = bar.parentElement, row = blk.children[1].querySelectorAll('span');
    return { desc: blk.children[0].textContent.replace(/\s+/g, ' ').trim(), used: row[0].textContent.trim(), width: bar.firstElementChild.style.width };
  });
});
const idbHas = (page, id) => page.evaluate(id => new Promise(res => { const r = indexedDB.open('hp_files', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => { const q = r.result.transaction('files').objectStore('files').get(id); q.onsuccess = () => res(!!(q.result && q.result.blob)); }; }), id);
const pdf = (name, txt) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 ' + txt) });

(async () => {
  const browser = await chromium.launch({ env: Object.assign({}, process.env, { LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' }) });   // noms de fichiers accentués gardés au téléchargement (Linux)
  const { page, errors } = await open(browser, true);

  console.log('1. Lignes client qui partagent le même numéro');
  await page.evaluate(() => { switchApp('achats'); goTo('budget'); });
  await page.waitForTimeout(300);
  let L = await cardLines(page);
  check('3 lignes affichées', L.length === 3, L);
  check('ligne 1 : anciennes répartitions + ancien n° saisi (20 000 + 5 580 + 300)', L[0] && num(L[0].used) === 25880, L[0]);
  check('ligne 2 : seulement l\'achat rattaché à elle (1 000)', L[1] && num(L[1].used) === 1000, L[1]);
  check('ligne 3 : rien (l\'achat annulé ne compte pas)', L[2] && num(L[2].used) === 0, L[2]);
  check('aucun montant négatif', L.every(l => !/-/.test(l.used)), L.map(l => l.used));
  check('barres entre 0 et 100 %', L.every(l => /^\d+%$/.test(l.width) && parseInt(l.width) <= 100), L.map(l => l.width));
  check('barre vide pour la ligne sans achat', L[2] && L[2].width === '0%', L[2]);

  // Arbre « détail par budget » : chaque ligne montre ses propres achats
  const tree = await page.evaluate(() => {
    toggleBudgetRow('BC'); toggleImmoRow('BC', 'L2'); toggleImmoRow('BC', 'L1');
    const rows = cls => [...document.querySelectorAll('.' + cls)].map(r => r.textContent.replace(/\s+/g, ' ').trim());
    return { l2: rows('pur-BC-L2'), l1: rows('pur-BC-L1') };
  });
  check('arbre : la ligne 2 montre seulement l\'outil d\'ébavurage', tree.l2.length === 1 && /ébavurage/.test(tree.l2[0]), tree.l2);
  check('arbre : la ligne 1 montre les 3 achats qui lui reviennent', tree.l1.length === 3, tree.l1);

  // Formulaire d'achat : une ancienne répartition (sans id) désigne la 1re ligne de ce numéro
  await page.evaluate(() => editRow('P1'));
  await page.waitForTimeout(300);
  const form = await page.evaluate(() => { const s = document.querySelector('#immoAllocList select'); return s ? { val: s.value, opts: [...s.options].map(o => o.value), labels: [...s.options].map(o => o.textContent.replace(/\s+/g, ' ').trim()) } : null; });
  check('formulaire : choix par ligne (id), pas par numéro', form && JSON.stringify(form.opts) === JSON.stringify(['', 'L1', 'L2', 'L3']), form);
  check('formulaire : ancienne répartition → 1re ligne du numéro', form && form.val === 'L1', form);
  check('formulaire : la description distingue les lignes', form && /DEBURRING/.test(form.labels[2]), form && form.labels);
  // L'utilisateur remet l'achat sur la bonne ligne, puis enregistre
  await page.evaluate(() => { const s = document.querySelector('#immoAllocList select'); s.value = 'L3'; s.dispatchEvent(new Event('change', { bubbles: true })); saveEntry(); });
  await page.waitForTimeout(300);
  const p1 = await page.evaluate(() => purchases.find(p => p.id === 'P1').immoAllocations);
  check('enregistré avec l\'id de la ligne choisie', p1 && p1.length === 1 && p1[0].immoId === 'L3' && p1[0].montant === 20000 && p1[0].immoNum === 'T4800021009-000', p1);
  await page.evaluate(() => { switchApp('achats'); goTo('budget'); });
  await page.waitForTimeout(300);
  L = await cardLines(page);
  check('après correction : ligne 1 = 5 880, ligne 3 = 20 000', L[0] && num(L[0].used) === 5880 && L[2] && num(L[2].used) === 20000, L.map(l => l.used));

  // Export Excel (librairie remplacée par un faux pour lire les lignes produites)
  const xl = await page.evaluate(async () => {
    let rows = null;
    window.XLSX = { utils: { aoa_to_sheet: r => { rows = r; return {}; }, book_new: () => ({}), book_append_sheet() {} }, writeFile() {} };
    await exportBudgetExcel();
    return rows;
  });
  const lignes = (xl || []).filter(r => r[0] === '  Ligne' && r[3] === 'T4800021009-000');
  check('Excel : 3 lignes avec leur dépensé propre (5 880 / 1 000 / 20 000)', lignes.length === 3 && lignes[0][6] === 5880 && lignes[1][6] === 1000 && lignes[2][6] === 20000, lignes.map(r => r[6]));
  const sousL3 = []; let cur = null;
  (xl || []).forEach(r => { if (r[0] === '  Ligne') cur = r[4]; else if (r[0] === '    Achat' && /CAP INJECTION/.test(cur || '')) sousL3.push(r); });
  check('Excel : l\'achat corrigé est sous la ligne 3, pour 20 000', sousL3.length === 2 && sousL3.some(r => r[6] === 20000), sousL3.map(r => [r[4], r[6]]));

  console.log('2. Documents du budget');
  await page.evaluate(() => { openAddBudget(); });
  const vis = async () => page.evaluate(() => getComputedStyle(document.getElementById('bAttSection')).display !== 'none');
  check('nouveau budget CAPEX : section « Documents du budget » visible', await vis());
  await page.evaluate(() => { document.getElementById('bType').value = 'OPEX'; onBudgetTypeChange(); });
  check('OPEX : section masquée (budget généré par le système)', !(await vis()));
  await page.evaluate(() => { document.getElementById('bType').value = 'Costumer'; onBudgetTypeChange(); });
  check('Costumer : section visible', await vis());
  await page.evaluate(() => closeOv('ovBudget'));

  await page.evaluate(() => openEditBudget('BC'));
  await page.setInputFiles('#b-att-box input[data-ba-up]', pdf('accord-budget.pdf', 'accord'));
  await page.waitForFunction(() => document.querySelectorAll('#b-att-box .xa-file').length === 1, null, { timeout: 5000 }).catch(() => {});
  check('fichier ajouté dans le formulaire du budget', (await page.evaluate(() => document.querySelectorAll('#b-att-box .xa-file').length)) === 1);
  await page.evaluate(() => confirmBudget());
  const att = await page.evaluate(() => (S.budgets.find(b => b.id === 'BC').attachments || []));
  check('enregistré dans le budget (nom, taille, type)', att.length === 1 && att[0].name === 'accord-budget.pdf' && att[0].size > 0 && att[0].type === 'application/pdf', att);
  check('fichier gardé sur ce poste (hp_files)', att[0] && await idbHas(page, att[0].id));
  check('sauvegardé dans suivi_settings', await page.evaluate(() => JSON.parse(localStorage.getItem('suivi_settings')).budgets.find(b => b.id === 'BC').attachments.length === 1));
  const chip = await page.evaluate(() => { const c = [...document.querySelectorAll('#budgetGrid .budget-card')].find(c => c.textContent.includes('FILLER')); const b = [...c.querySelectorAll('button')].find(b => /📎/.test(b.textContent)); return b ? b.textContent.trim() : null; });
  check('carte du budget : bouton « 📎 1 »', chip === '📎 1', chip);
  check('budget OPEX sans document : pas de bouton 📎', await page.evaluate(() => { const c = [...document.querySelectorAll('#budgetGrid .budget-card')].find(c => c.textContent.includes('OPEX essais')); return ![...c.querySelectorAll('button')].some(b => /📎/.test(b.textContent)); }));
  await page.evaluate(() => { const c = [...document.querySelectorAll('#budgetGrid .budget-card')].find(c => c.textContent.includes('FILLER')); [...c.querySelectorAll('button')].find(b => /📎/.test(b.textContent)).click(); });
  check('📎 ouvre le budget sur ses documents', await page.evaluate(() => document.getElementById('ovBudget').classList.contains('open') && document.querySelectorAll('#b-att-box .xa-file').length === 1));
  // Ouvrir le fichier (copie locale) : téléchargé sous son nom exact, ouvert par le logiciel du poste (V11 ; avant : onglet Chrome)
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.click('#b-att-box .xa-file-n')]);
  check('le fichier s\'ouvre (copie locale) : téléchargé sous son nom exact', dl.suggestedFilename() === 'accord-budget.pdf', dl.suggestedFilename());
  check('ordinateur : la marche à suivre pour le logiciel PDF s\'affiche (une fois)', !!(await page.$('#pdf-tip')));
  if (await page.$('#pdf-tip')) await page.click('#pdf-tip [data-ok]');
  // Retirer puis annuler : rien ne change
  await page.click('#b-att-box [data-ba="rm"]');
  check('retiré du formulaire', (await page.evaluate(() => document.querySelectorAll('#b-att-box .xa-file').length)) === 0);
  await page.evaluate(() => closeOv('ovBudget'));
  check('Annuler : le document reste dans le budget et sur le poste', (await page.evaluate(() => S.budgets.find(b => b.id === 'BC').attachments.length)) === 1 && await idbHas(page, att[0].id));
  // Retirer puis enregistrer
  await page.evaluate(() => openEditBudget('BC'));
  await page.click('#b-att-box [data-ba="rm"]');
  await page.evaluate(() => confirmBudget());
  await page.waitForTimeout(200);
  check('Enregistrer : document retiré du budget et effacé du poste', (await page.evaluate(() => S.budgets.find(b => b.id === 'BC').attachments.length)) === 0 && !(await idbHas(page, att[0].id)));
  // Fichier de 20 Mo : refusé (les règles Storage n'acceptent pas plus)
  await page.evaluate(() => openEditBudget('BC'));
  await page.setInputFiles('#b-att-box input[data-ba-up]', { name: 'trop-gros.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(20 * 1048576) });
  await page.waitForTimeout(400);
  check('fichier de 20 Mo refusé', (await page.evaluate(() => document.querySelectorAll('#b-att-box .xa-file').length)) === 0);

  console.log('3. Sauvegarde .zip avec les documents du budget');
  if (!JSZIP) console.log('  (ignoré : lancer « npm install » dans tests/ pour JSZip)');
  else {
    await page.setInputFiles('#b-att-box input[data-ba-up]', pdf('commande-client.pdf', 'commande'));
    await page.waitForFunction(() => document.querySelectorAll('#b-att-box .xa-file').length === 1, null, { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => confirmBudget());
    const id = await page.evaluate(() => S.budgets.find(b => b.id === 'BC').attachments[0].id);
    const z = await page.evaluate(async () => {
      if (typeof JSZip === 'undefined') await ensureLib('JSZip', LIB_URLS.JSZip);
      const blob = await window.buildPlatformZip();
      const zip = await JSZip.loadAsync(blob);
      const names = Object.keys(zip.files);
      const b64 = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result.split(',')[1]); f.readAsDataURL(blob); });
      return { names, b64 };
    });
    check('le .zip contient le document du budget', z.names.includes('attachments/' + id + '__commande-client.pdf'), z.names.filter(n => n.startsWith('attachments/')));
    // Restauration sur un poste vide
    const fresh = await open(browser, false);
    await fresh.page.evaluate(async b64 => {
      if (typeof JSZip === 'undefined') await ensureLib('JSZip', LIB_URLS.JSZip);
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      await window.loadPlatformZip(new Blob([bin], { type: 'application/zip' }));
    }, z.b64);
    await fresh.page.waitForTimeout(500);
    const rb = await fresh.page.evaluate(() => { const b = S.budgets.find(b => b.id === 'BC'); return b && b.attachments; });
    check('restauré : le budget retrouve son document', rb && rb.length === 1 && rb[0].id === id, rb);
    check('restauré : le fichier est sur le nouveau poste', await idbHas(fresh.page, id));
    check('restauré : les lignes et leurs ids sont intacts', await fresh.page.evaluate(() => S.budgets.find(b => b.id === 'BC').immobilisations.map(i => i.id).join() === 'L1,L2,L3'));
    check('aucune erreur JavaScript (poste restauré)', fresh.errors.length === 0, fresh.errors);
  }

  check('aucune erreur JavaScript', errors.length === 0, errors);
  console.log(`\n${pass} réussis, ${fail} échoués`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR', e); process.exit(2); });
