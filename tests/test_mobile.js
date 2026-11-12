// Vue téléphone : chaque page doit tenir dans la largeur de l'écran (iPhone 13 par défaut, 390 px),
// puis vérification des interactions (onglets, menu ☰, cartes, barre d'actions, ☁, tiroir, pastilles).
// Lancer : node tests/test_mobile.js [fichier.html] [--device "iPhone SE"] [--shots dossier] [--quiet]
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const args = process.argv.slice(2);
const APP = args.find(a => a.endsWith('.html')) || path.join(__dirname, '..', 'plateforme.html');
const SHOTS = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null;
const QUIET = args.includes('--quiet');
const HTML = fs.readFileSync(APP, 'utf8');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock_firebase.js'), 'utf8');
const { seed } = require('./seed_data');
const DEVICE = args.includes('--device') ? args[args.indexOf('--device') + 1] : 'iPhone 13';
const W = devices[DEVICE].viewport.width;

// Pages à vérifier : [nom, code exécuté dans la page]
const STATES = [
  ['Accueil', `switchApp('home')`],
  ['Accueil › Rapport', `switchApp('report')`],
  ['Recherche (Ctrl K)', `switchApp('home'); hpOpenPal()`],
  ['Achats › Nouvel achat', `hpClosePal(); switchApp('achats')`],
  ['Achats › Modifier un achat', `switchApp('achats'); editRow(purchases[2].id)`],
  ['Achats › Liste', `switchApp('achats'); goTo('liste')`],
  ['Achats › Budget', `switchApp('achats'); goTo('budget')`],
  ['Achats › Nouveau budget', `switchApp('achats'); goTo('budget'); openAddBudget()`],
  ['Achats › Livraisons', `closeOv('ovBudget'); switchApp('achats'); goTo('livraisons')`],
  ['Achats › Fournisseurs', `switchApp('achats'); goTo('fournisseurs')`],
  ['Achats › Statistiques', `switchApp('achats'); goTo('stats')`],
  ['Achats › Paramètres', `switchApp('achats'); goTo('params')`],
  ['Engineering › Projets', `switchApp('engineering')`],
  ['Engineering › Éditeur projet', `switchApp('engineering'); engEditProject('ep1')`],
  ['Engineering › Bibliothèque', `switchApp('engineering'); engGo('library')`],
  ['Engineering › Éditeur solution', `switchApp('engineering'); engGo('library'); engEditSolution('es1')`],
  ['Engineering › Réception', `switchApp('engineering'); engGo('acceptance')`],
  ['Engineering › Éditeur réception', `switchApp('engineering'); engGo('acceptance'); engEditAcceptance('ea1')`],
  ['Engineering › Entreprises', `switchApp('engineering'); engGo('companies')`],
  ['Engineering › Mise en page', `switchApp('engineering'); engGo('branding')`],
  ['Engineering › Paramètres', `switchApp('engineering'); engGo('params')`],
  ['Projets › Dashboard', `switchApp('projects')`],
  ['Projets › Liste', `switchApp('projects'); pmGo('projects')`],
  ['Projets › Fiche › Identité', `switchApp('projects'); pmEditProject('Pp1')`],
  ['Projets › Fiche › Volumes', `pmShowTab('volumes')`],
  ['Projets › Fiche › Production', `pmShowTab('production')`],
  ['Projets › Fiche › Produits', `pmShowTab('produits')`],
  ['Projets › Fiche › Produit (détail)', `pmShowTab('produits'); pmEditProduct(0)`],
  ['Projets › Fiche › Outils', `pmCloseProduct(); pmShowTab('outils')`],
  ['Projets › Fiche › Outils (tableau)', `pmShowTab('outils'); pmToggleToolsView()`],
  ['Projets › Fiche › Outil (détail)', `pmToggleToolsView(); pmEditTool(0)`],
  ['Projets › Fiche › Budget', `pmCloseTool(); pmShowTab('budget')`],
  ["Projets › Plan d'actions", `switchApp('projects'); pmGo('actions')`],
  ['Projets › Planning', `switchApp('projects'); pmGo('planning')`],
  ['Projets › Clients', `switchApp('projects'); pmGo('customers')`],
  ['Projets › Product Lines', `switchApp('projects'); pmGo('lines')`],
  ['Projets › Reports', `switchApp('projects'); pmGo('reports')`],
  ['Projets › Settings', `switchApp('projects'); pmGo('settings')`],
  ['Achats › Modifier un budget (immos)', `switchApp('achats'); goTo('budget'); openEditBudget('B1')`],
  ['Projets › Produit › BOM', `closeOv('ovBudget'); switchApp('projects'); pmEditProject('Pp1'); pmShowTab('produits'); pmEditProduct(0); pmProductSubTab('bom')`],
  ['Projets › Produit › Documentation', `pmProductSubTab('doceng')`],
  ['Projets › Outil › Sous-outils', `pmCloseProduct(); pmShowTab('outils'); pmEditTool(0); pmToolSubTab = 'sous'; pmRenderTools()`],
  ['Projets › Jalon (fenêtre)', `pmToolSubTab = 'suivi'; pmRenderTools(); pmOpenMsPopup('t:0', 0)`],
  ['Engineering › Réception (points)', `document.getElementById('ms-popup-ov')?.remove(); switchApp('engineering'); engGo('acceptance'); engEditAcceptance('ea1'); engToggleAccBox('Station 1')`],
  ['Tiroir (☰)', `switchApp('achats'); toggleMobileMenu()`],
  ['Panneau ☁', `closeMobileMenu(); document.getElementById('m-sync').click()`],
  ['Mode clair › Accueil', `document.getElementById('fb-pop').classList.remove('on'); pmSetTheme('light'); switchApp('home')`],
  ['Mode clair › Liste des achats', `switchApp('achats'); goTo('liste')`],
];

// Éléments qui dépassent à droite de l'écran (les plus extérieurs), en ignorant ceux rognés par un parent qui défile
const MEASURE = `(() => {
  const W = ${W}, out = [];
  const clipped = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const cs = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX) && p.getBoundingClientRect().right <= W + 1) return true; } return false; };
  const vis = el => { const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const over = el => vis(el) && el.getBoundingClientRect().right > W + 1 && !clipped(el);
  document.querySelectorAll('body *').forEach(el => {
    if (!over(el)) return;
    if (el.parentElement && el.parentElement !== document.body && over(el.parentElement)) return;   // garder le plus extérieur
    const r = el.getBoundingClientRect();
    out.push((el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '')) + ' → ' + Math.round(r.right) + ' px (larg. ' + Math.round(r.width) + ')');
  });
  return { sw: document.documentElement.scrollWidth, items: out.slice(0, 8) };
})()`;

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices[DEVICE] });
  console.log('Appareil : ' + DEVICE + ' (' + W + ' px)');
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await ctx.route('**/*', r => {
    const u = r.request().url();
    if (u.startsWith('http://app.test/')) return r.fulfill({ contentType: 'text/html', body: HTML });
    if (u.includes('/firebasejs/') || u.includes('npm/firebase@')) return r.fulfill({ contentType: 'text/javascript', body: u.includes('-app-compat') ? MOCK : '' });
    return r.abort();
  });
  await page.exposeFunction('__be', async () => null);
  await page.addInitScript(s => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); for (const k in s) localStorage.setItem(k, s[k]); } }, seed());
  await page.goto('http://app.test/plateforme.html');
  await page.waitForFunction(() => window.fbSync && document.getElementById('main-home'));
  await page.waitForTimeout(400);
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  let bad = 0, n = 0;
  for (const [name, code] of STATES) {
    n++;
    try { await page.evaluate(code); } catch (e) { console.log('  ! ' + name + ' : ' + e.message.split('\n')[0]); bad++; continue; }
    await page.waitForTimeout(250);
    const m = await page.evaluate(MEASURE);
    const ok = m.sw <= W + 1 && !m.items.length;
    if (!ok) bad++;
    if (!ok || !QUIET) console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : ' — page ' + m.sw + ' px') + (m.items.length ? '\n      ' + m.items.join('\n      ') : ''));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, String(n).padStart(2, '0') + '_' + name.replace(/[^\w]+/g, '_') + '.png') });
  }
  // ─── Interactions (téléphone) ───
  console.log('\nInteractions :');
  await page.evaluate(() => { pmSetTheme('dark'); closeMobileMenu(); document.getElementById('fb-pop').classList.remove('on'); switchApp('home'); });
  await page.waitForTimeout(200);
  const chk = async (name, fn) => { n++; let ok = false, info = ''; try { const r = await fn(); ok = r === true; if (!ok) info = JSON.stringify(r); } catch (e) { info = e.message.split('\n')[0]; } if (!ok) bad++; console.log((ok ? '  ✓ ' : '  ✗ ') + name + (ok ? '' : ' — ' + info)); };
  const tap = async sel => { await page.click(sel); await page.waitForTimeout(250); };
  await chk('barre d\'onglets visible (4 onglets), barre du haut d\'origine masquée', () => page.evaluate(() => {
    const t = document.getElementById('m-tabbar'), r = t.getBoundingClientRect();
    return getComputedStyle(t).display !== 'none' && t.querySelectorAll('.m-tab').length === 4 && Math.round(r.bottom) === innerHeight && getComputedStyle(document.querySelector('.app-rail')).display === 'none' || { r: r.bottom, h: innerHeight };
  }));
  await tap('#m-tabbar [data-app="achats"]');  await chk('onglet Achats : app ouverte, onglet actif, pas de rangée de puces (pages dans le menu ☰)', () => page.evaluate(() =>
    document.body.dataset.app === 'achats' && document.querySelector('#m-tabbar [data-app="achats"]').classList.contains('on') && !document.querySelector('.m-subnav, .m-chip') || document.body.dataset.app));
  await page.evaluate(() => window.scrollTo(0, 400));
  await tap('#mobileMenuBtn'); await page.waitForTimeout(300);   // le tiroir glisse en 0,25 s
  await page.evaluate(() => [...document.querySelectorAll('#sidebar-achats nav .nav-item')].find(b => b.textContent.includes('Liste')).click());
  await page.waitForTimeout(350);
  await chk('menu ☰ › « Liste des achats » : page affichée, menu refermé, retour en haut', () => page.evaluate(() =>
    document.getElementById('page-liste').classList.contains('active') && !document.body.classList.contains('menu-open') && window.scrollY === 0 || [document.body.classList.contains('menu-open'), window.scrollY]));

  await tap('#m-tabbar [data-app="projects"]');
  await tap('#m-tabbar [data-app="achats"]');
  await chk('retour sur Achats : la dernière page (Liste) est rouverte', () => page.evaluate(() => document.getElementById('page-liste').classList.contains('active')));
  await chk('liste en cartes : en-tête masqué, colonnes étiquetées', () => page.evaluate(() => {
    const th = document.querySelector('#page-liste thead'), td = document.querySelector('#tbody tr td:nth-child(7)');
    return getComputedStyle(th).display === 'none' && td.getAttribute('data-label') === 'Fournisseur' && getComputedStyle(document.querySelector('#tbody tr')).display === 'grid';
  }));
  await page.evaluate(() => document.querySelector('#tbody tr td:nth-child(3)').click());
  await page.waitForTimeout(300);
  await chk('toucher une carte ouvre l\'achat en modification', () => page.evaluate(() => document.getElementById('page-nouveau').classList.contains('active') && getComputedStyle(document.getElementById('editBadge')).display !== 'none'));
  await chk('boutons Sauvegarder / Nouveau collés au-dessus de la barre d\'onglets', () => page.evaluate(() => {
    const a = document.querySelector('#page-nouveau .btn-actions').getBoundingClientRect(), t = document.getElementById('m-tabbar').getBoundingClientRect();
    return Math.abs(a.bottom - t.top) <= 1 && a.top > innerHeight / 2 || { a: a.bottom, t: t.top };
  }));
  await chk('cartes de chiffres masquées sur « Nouvel achat »', () => page.evaluate(() => getComputedStyle(document.querySelector('#main-achats .content > .stats-grid')).display === 'none'));
  await chk('bouton ☁ : même couleur que celui de la synchro', () => page.evaluate(() => document.getElementById('m-sync').style.color === document.getElementById('fb-btn').style.color));
  await tap('#m-sync');
  await chk('bouton ☁ : ouvre le panneau de synchronisation', () => page.evaluate(() => document.getElementById('fb-pop').classList.contains('on')));
  await page.evaluate(() => document.getElementById('fb-pop').classList.remove('on'));
  await tap('#mobileMenuBtn'); await page.waitForTimeout(300);   // le tiroir glisse en 0,25 s
  await chk('☰ ouvre le tiroir (outils, fichiers, utilisateur)', () => page.evaluate(() => document.body.classList.contains('menu-open') && document.getElementById('sidebar-achats').getBoundingClientRect().left >= 0));
  await page.click('#mobileBackdrop', { position: { x: W - 15, y: 400 } }); await page.waitForTimeout(250);   // la bande visible à droite du tiroir
  await chk('toucher à côté ferme le tiroir', () => page.evaluate(() => !document.body.classList.contains('menu-open')));
  await chk('pastille de l\'onglet Accueil = nombre d\'alertes graves', () => page.evaluate(() => {
    const d = document.getElementById('hp-rail-dot'), b = document.querySelector('#m-tabbar [data-app="home"] .m-bd');
    return (d.style.display === 'none' ? '' : d.textContent.trim()) === b.textContent.trim();
  }));
  await chk('pastille de l\'onglet Achats = livraisons en retard', () => page.evaluate(() => document.querySelector('#m-tabbar [data-app="achats"] .m-bd').textContent.trim() === document.getElementById('xa-nc-liv').textContent.trim()));
  await page.evaluate(() => { switchApp('projects'); pmEditProject('Pp1'); pmShowTab('outils'); pmToolsView = 'bom'; pmRenderTools(); });
  await page.waitForTimeout(300);
  await chk('Outils & Suivi (Transformer) : grille, jalons en lignes, outils en colonnes sous leur groupe', () => page.evaluate(() => {
    const w = document.querySelector('#pm-tools .pmx-wrap'); if (!w) return 'pas de grille';
    const rows = document.querySelectorAll('.pmx tbody tr').length, cols = document.querySelectorAll('.pmx thead tr:nth-child(2) th').length;
    const first = document.querySelector('.pmx tbody tr th.pmx-l').textContent, grp = document.querySelector('.pmx th.pmx-g').textContent;
    return rows === 11 && cols === 2 && first === 'Drawing release' && /hors pack/.test(grp) && document.documentElement.scrollWidth <= innerWidth || { rows, cols, first, grp };
  }));
  await tap('.pmx tbody tr:nth-child(3) td');
  await chk('grille : toucher une case ouvre la fenêtre du jalon', () => page.evaluate(() => { const o = document.getElementById('ms-popup-ov'); const ok = !!o; if (o) o.remove(); return ok; }));
  await tap('.pmx thead tr:nth-child(2) th > div');
  const inTool = await page.evaluate(() => pmEditingTool === 0);
  await page.evaluate(() => pmCloseTool()); await page.waitForTimeout(200);
  await chk('grille : toucher un nom ouvre l\'outil, « Retour » ramène à la grille', () => page.evaluate(ok => ok && !!document.querySelector('#pm-tools .pmx-wrap') || ok, inTool));
  const oneLine = sel => page.evaluate(sel => {   // éléments visibles sur une seule ligne, sans dépasser
    const box = document.querySelector(sel); if (!box) return 'introuvable';
    const kids = [...box.children].filter(k => getComputedStyle(k).display !== 'none' && k.getBoundingClientRect().width > 0);
    const mids = kids.map(k => { const r = k.getBoundingClientRect(); return r.top + r.height / 2; });
    return Math.max(...mids) - Math.min(...mids) <= 4 && box.scrollWidth <= box.clientWidth + 1 || { mids, sw: box.scrollWidth, cw: box.clientWidth };
  }, sel);
  await page.evaluate(() => { pmShowTab('identite'); window.scrollTo(0, 0); });
  await chk('projet ouvert : Sauvegarder · Liste · état · ✕ sur une seule ligne', () => oneLine('#pproj-editor > div:first-child'));
  await page.evaluate(() => pmShowTab('outils'));
  await chk('Outils & Suivi : les 4 boutons sur une seule ligne', () => oneLine('.pm-tabpane[data-tab="outils"] .ph > div[style*="display:flex"]'));
  await page.evaluate(() => { switchApp('engineering'); engEditProject('ep1'); });
  await page.waitForTimeout(500);
  await chk('Engineering : aperçu en vraies pages réduites à la largeur de l\'écran (comme un PDF)', () => page.evaluate(() => {
    const w = document.getElementById('engSpecOutput'), pg = w.querySelector('.eng-page'), pz = parseFloat(w.style.getPropertyValue('--pz'));
    const cs = getComputedStyle(w), inner = w.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return pz > 0.3 && pz < 1 && Math.abs(pg.getBoundingClientRect().width - inner) <= 2 && w.scrollWidth <= w.clientWidth + 1 || { pz, page: pg.getBoundingClientRect().width, inner };
  }));
  await tap('#m-tabbar [data-app="home"]');
  await chk('onglet Accueil : pas de bouton ☰ (pas de tiroir sur l\'accueil)', () => page.evaluate(() => document.body.dataset.app === 'home' && getComputedStyle(document.getElementById('mobileMenuBtn')).display === 'none'));
  if (errors.length) { console.log('  Erreurs JavaScript :\n    ' + [...new Set(errors)].join('\n    ')); bad++; }
  console.log(`\n${n - bad} vérifications réussies sur ${n}${errors.length ? ' (+ erreurs JS)' : ''}`);
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
