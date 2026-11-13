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
const JSZIP = (() => { try { return fs.readFileSync(require.resolve('jszip/dist/jszip.min.js'), 'utf8'); } catch (e) { return null; } })();   // « npm install » dans tests/
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
    if (JSZIP && /jszip/.test(u)) return r.fulfill({ contentType: 'text/javascript', body: JSZIP });
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
  const projBar = () => page.evaluate(() => {   // 3 boutons sur une ligne, les 2 filtres côte à côte sur la suivante, rien ne dépasse
    const bar = document.querySelector('#pproj-list > div:first-child'), mid = e => { const r = e.getBoundingClientRect(); return r.top + r.height / 2; };
    const bs = [...bar.querySelectorAll(':scope > .btn')].map(mid), ss = [...bar.querySelectorAll(':scope > select')].map(mid), sp = a => Math.max(...a) - Math.min(...a);
    const rl = document.getElementById('pmRootLabel');
    return bs.length === 3 && ss.length === 2 && sp(bs) <= 2 && sp(ss) <= 2 && ss[0] > bs[0] + 10 && bar.scrollWidth <= bar.clientWidth + 1 || { bs, ss, sw: bar.scrollWidth, cw: bar.clientWidth, rl: rl.textContent };
  });
  await page.evaluate(() => { pmProjTab('list'); pmGo('projects'); window.scrollTo(0, 0); });
  await page.waitForTimeout(200);
  await chk('Projets › liste : « ＋ Projet · 📁 Dossier · ⚙ Sous-dossiers » sur une ligne, les 2 filtres côte à côte (2 lignes au lieu de 4)', projBar);
  await page.evaluate(() => { pmRootDir = { name: 'Projets Akwel 2026 – dossier commun de l\'équipe' }; pmUpdateRootLabel(); });
  await page.waitForTimeout(100);
  await chk('Projets › liste : dossier lié au nom long → toujours 2 lignes, nom coupé « … »', async () => {
    const r = await projBar(); if (r !== true) return r;
    return page.evaluate(() => { const rl = document.getElementById('pmRootLabel'); return rl.scrollWidth > rl.clientWidth && getComputedStyle(rl).textOverflow === 'ellipsis' || rl.textContent; });
  });
  await page.evaluate(() => { pmRootDir = null; pmUpdateRootLabel(); });
  await page.evaluate(() => { switchApp('engineering'); engEditProject('ep1'); });
  await page.waitForTimeout(500);
  await chk('Engineering : aperçu en vraies pages réduites à la largeur de l\'écran (comme un PDF)', () => page.evaluate(() => {
    const w = document.getElementById('engSpecOutput'), pg = w.querySelector('.eng-page'), pz = parseFloat(w.style.getPropertyValue('--pz'));
    const cs = getComputedStyle(w), inner = w.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return pz > 0.3 && pz < 1 && Math.abs(pg.getBoundingClientRect().width - inner) <= 2 && w.scrollWidth <= w.clientWidth + 1 || { pz, page: pg.getBoundingClientRect().width, inner };
  }));
  // ─── V9 : barre du haut de Projets (🔎 seule), panneau ☁ (Actualiser, Réglages, Plein écran) ───
  await page.evaluate(() => { switchApp('projects'); pmGo('projects'); window.scrollTo(0, 0); });
  await page.waitForTimeout(200);
  await chk('Projets : seulement 🔎 dans la barre du haut, à côté de ☁ (titre entier, plus de boîte tronquée)', () => page.evaluate(() => {
    const q = document.getElementById('m-q').getBoundingClientRect(), s = document.getElementById('m-sync').getBoundingClientRect(), t = document.getElementById('pmTitle');
    return getComputedStyle(document.getElementById('pmSearch')).display === 'none' && q.width === 38 && Math.abs(q.top - s.top) <= 1 && q.right <= s.left - 4 && t.scrollWidth <= t.clientWidth || { q: q.width, qt: q.top, st: s.top, t: [t.scrollWidth, t.clientWidth] };
  }));
  await tap('#m-q');
  await chk('toucher 🔎 : boîte de recherche sur toute la barre, titre masqué, curseur dans la boîte', () => page.evaluate(() => {
    const i = document.getElementById('pmSearch'), r = i.getBoundingClientRect();
    return document.activeElement === i && r.width >= innerWidth - 54 - 54 - 38 - 6 - 2 && getComputedStyle(document.querySelector('#main-projects .topbar-title')).display === 'none' || { w: r.width, a: document.activeElement.id };
  }));
  await page.keyboard.type('CX735'); await page.waitForTimeout(200);
  const shown = await page.evaluate(() => getComputedStyle(document.getElementById('pmSearchResults')).display === 'block');
  await tap('#m-qx');
  await chk('recherche : résultats affichés ; ✕ vide la boîte, cache les résultats et remet 🔎', () => page.evaluate(sh => {
    const open = document.querySelector('#main-projects .topbar').classList.contains('m-q-open');
    return sh && !open && document.getElementById('pmSearch').value === '' && document.getElementById('pmSearchResults').style.display === 'none' && getComputedStyle(document.getElementById('m-q')).display === 'flex' || { sh, open };
  }, shown));
  await tap('#m-q'); await page.keyboard.type('CX735'); await page.waitForTimeout(200);
  await page.evaluate(() => document.querySelector('#pmSearchResults [onclick^="pmEditProject"]').click()); await page.waitForTimeout(200);
  await chk('recherche : choisir un résultat ouvre le projet et referme la boîte', () => page.evaluate(() => {
    const open = document.querySelector('#main-projects .topbar').classList.contains('m-q-open'), ed = document.getElementById('pproj-editor').style.display;
    return ed !== 'none' && !open && document.getElementById('pmSearch').value === '' || { ed, open };
  }));
  await page.evaluate(() => window.scrollTo(0, 0));
  await tap('#m-sync');
  const popPos = () => page.evaluate(() => { const p = {}; document.querySelectorAll('#fb-pop .fb-row > .btn').forEach(b => { if (getComputedStyle(b).display === 'none') return; const r = b.getBoundingClientRect(); p[b.dataset.a || b.dataset.m] = [Math.round(r.top), Math.round(r.left), Math.round(r.width)]; }); return p; });
  await chk('panneau ☁ (non connecté) : « ↻ Actualiser » · « ⚙ Réglages » côte à côte, puis « ⛶ Plein écran »', async () => {
    const p = await popPos(); return !!p.reload && p.reload[0] === p.reglages[0] && p.reglages[1] > p.reload[1] && (!p.fs || p.fs[0] > p.reload[0]) && (!p.in || p.in[0] < p.reload[0]) || p;
  });
  await page.evaluate(() => { document.getElementById('fb-pop').innerHTML = '<div class="fb-h">☁ Synchronisation</div><div class="fb-row"><button class="btn bs btn-sm" data-a="now">Synchroniser</button><button class="btn bs btn-sm" data-a="reset">Reprendre les données de l\'équipe</button><button class="btn bs btn-sm" data-a="rappels">🔔 Rappels</button><button class="btn bs btn-sm" data-a="out">Se déconnecter</button></div>'; });
  await page.waitForTimeout(50);   // comme un nouveau dessin du panneau par la synchro (connecté)
  await chk('panneau ☁ (connecté, redessiné) : Synchroniser | ↻ Actualiser, Reprendre… en entier, 🔔 Rappels | ⚙ Réglages', async () => {
    const p = await popPos(); return !!p.reload && p.now[0] === p.reload[0] && p.reload[1] > p.now[1] && p.reset[0] > p.now[0] && p.reset[2] > p.now[2] * 1.8 && p.rappels[0] === p.reglages[0] && p.reglages[1] > p.rappels[1] && p.rappels[0] > p.reset[0] || p;
  });
  await tap('#fb-pop [data-m="reglages"]');
  await chk('« ⚙ Réglages » ouvre Projets › Settings et ferme le panneau', () => page.evaluate(() =>
    document.body.dataset.app === 'projects' && document.getElementById('ppage-settings').style.display !== 'none' && !document.getElementById('fb-pop').classList.contains('on') || [document.body.dataset.app, document.getElementById('ppage-settings').style.display]));
  await tap('#m-sync'); await tap('#fb-pop [data-m="fs"]'); await page.waitForTimeout(300);
  const fsA = await page.evaluate(() => [!!document.fullscreenElement, localStorage.getItem('m_plein_ecran')]);
  await page.evaluate(() => document.fullscreenElement && document.exitFullscreen()); await page.waitForTimeout(300);   // le navigateur quitte le plein écran
  await tap('#m-tabbar [data-app="achats"]'); await page.waitForTimeout(300);
  const fsB = await page.evaluate(() => !!document.fullscreenElement);
  await tap('#m-sync');
  const fsLab = await page.evaluate(() => document.querySelector('#fb-pop [data-m="fs"]').textContent);
  await tap('#fb-pop [data-m="fs"]'); await page.waitForTimeout(300);
  await chk('« ⛶ Plein écran » : activé, rétabli au toucher suivant après une sortie ; « ⛶ Écran normal » le désactive', () => page.evaluate(([a, b, l]) =>
    a[0] && a[1] === '1' && b && l === '⛶ Écran normal' && !document.fullscreenElement && localStorage.getItem('m_plein_ecran') === '0' || { a, b, l, now: !!document.fullscreenElement }, [fsA, fsB, fsLab]));
  await ctx.setOffline(true);
  await page.evaluate(() => { window.__avant = 1; });
  await tap('#m-sync'); await tap('#fb-pop [data-m="reload"]'); await page.waitForTimeout(400);
  await chk('« ↻ Actualiser » hors ligne : pas de rechargement (l\'app resterait vide), message', () => page.evaluate(() =>
    window.__avant === 1 && /Hors ligne/.test(document.querySelector('.toast') ? document.querySelector('.toast').textContent : '') || document.querySelector('.toast') && document.querySelector('.toast').textContent));
  await ctx.setOffline(false);
  await page.evaluate(() => { switchApp('achats'); goTo('nouveau'); resetForm(); document.getElementById('f-desc').value = 'Achat en cours'; });
  let asked = '';
  page.once('dialog', d => { asked = d.message(); d.dismiss(); });
  await tap('#m-sync'); await tap('#fb-pop [data-m="reload"]'); await page.waitForTimeout(400);
  await chk('« ↻ Actualiser » sur un achat en cours de saisie : confirmation ; « Annuler » garde la saisie', () => page.evaluate(a =>
    /non sauvegardées/.test(a) && window.__avant === 1 && document.getElementById('f-desc').value === 'Achat en cours' || a, asked));
  await page.evaluate(() => { resetForm(); switchApp('home'); });
  await page.waitForTimeout(200);
  await tap('#m-sync');
  await Promise.all([page.waitForEvent('load'), page.click('#fb-pop [data-m="reload"]')]);
  await page.waitForFunction(() => window.fbSync && document.getElementById('main-home'));
  await chk('« ↻ Actualiser » recharge l\'app (les données restent)', () => page.evaluate(() => window.__avant === undefined && !!document.getElementById('m-q') && JSON.parse(localStorage.getItem('pm_db')).projects.length > 0));
  // ─── V10 : installer l'app sur l'écran d'accueil ; charger un ZIP en choisissant ce qu'on prend ───
  const IOS = /iPhone/.test(DEVICE);
  await tap('#m-sync');
  await chk('panneau ☁ : « 📲 Installer l\'app » sur toute la largeur, en dernier (app pas encore installée)', () => page.evaluate(() => {
    const row = document.querySelector('#fb-pop .fb-row'), b = row.querySelector('[data-m="install"]'), vis = [...row.children].filter(x => getComputedStyle(x).display !== 'none');
    return !!b && vis[vis.length - 1] === b && Math.abs(b.getBoundingClientRect().width - row.getBoundingClientRect().width) <= 1 || { b: !!b, w: b && b.getBoundingClientRect().width, rw: row.getBoundingClientRect().width };
  }));
  await tap('#fb-pop [data-m="install"]');
  await chk('« 📲 Installer l\'app » : mode d\'emploi ' + (IOS ? 'iPhone (Partager › Sur l\'écran d\'accueil)' : 'Android (menu ⋮ › Installer l\'application)'), () => page.evaluate(ios => {
    const t = (document.getElementById('m-install') || {}).textContent || '';
    return (ios ? /Partager/.test(t) && /Sur l'écran d'accueil/.test(t) : /menu ⋮/.test(t) && /Installer l'application/.test(t)) || t.slice(0, 160);
  }, IOS));
  await tap('#m-install .btn');
  await chk('mode d\'emploi refermé par « Compris »', () => page.evaluate(() => !document.getElementById('m-install')));
  await page.evaluate(() => { window.__mm0 = window.matchMedia; window.matchMedia = q => /display-mode: fullscreen/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : window.__mm0.call(window, q); });
  await tap('#m-sync');
  await chk('dans l\'app installée (plein écran) : ni « 📲 Installer l\'app » ni « ⛶ Plein écran »', () => page.evaluate(() =>
    !document.querySelector('#fb-pop [data-m="install"]') && !document.querySelector('#fb-pop [data-m="fs"]') && !!document.querySelector('#fb-pop [data-m="reload"]')));
  await page.evaluate(() => { window.matchMedia = window.__mm0; document.getElementById('fb-pop').classList.remove('on'); });
  if (!JSZIP) console.log('  (ZIP ignoré : lancer « npm install » dans tests/)');
  else {
    await page.waitForFunction(() => typeof JSZip !== 'undefined');
    await page.evaluate(async () => {
      const zip = await JSZip.loadAsync(await buildPlatformZip());
      const pm = JSON.parse(await zip.file('project_master.json').async('string'));
      pm.projects.push({ id: 'PpZ', name: 'Projet du ZIP avec un nom assez long pour passer à la ligne sur un petit écran', code: 'Z-1', tools: [] });
      pm.projects[0].oem = 'OEM du ZIP';
      zip.file('project_master.json', JSON.stringify(pm));
      window.__zpDone = hpRestore({ files: [new File([await zip.generateAsync({ type: 'blob' })], 'sauvegarde_du_portable_2026-11-13.zip')], value: '' });
    });
    await page.waitForSelector('#zp-ov .zp-dlg');
    await chk('charger un ZIP : fenêtre de choix en feuille du bas, dans la largeur, cases et boutons visibles, plus de « seront remplacées »', () => page.evaluate(() => {
      const d = document.querySelector('#zp-ov .zp-dlg').getBoundingClientRect(), ok = document.querySelector('#zp-ov [data-z="ok"]').getBoundingClientRect(), cb = document.querySelector('#zp-ov .zp-it input').getBoundingClientRect();
      return Math.abs(d.width - innerWidth) <= 1 && Math.abs(d.bottom - innerHeight) <= 1 && ok.top > d.top && ok.bottom <= innerHeight && cb.width >= 16 && document.documentElement.scrollWidth <= innerWidth &&
        !document.getElementById('zp-ov').textContent.includes('seront remplacées') || { d: [d.width, d.bottom, innerWidth, innerHeight], ok: [ok.top, ok.bottom], cb: cb.width, sw: document.documentElement.scrollWidth };
    }));
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'zip_choix.png') });
    await tap('#zp-ov [data-z="ok"]');
    await page.evaluate(() => window.__zpDone);
    await chk('« Ajouter la sélection » : le projet nouveau est ajouté, le projet modifié (non coché) reste tel quel', () => page.evaluate(() => pmDB.projects.some(p => p.id === 'PpZ') && pmDB.projects[0].oem !== 'OEM du ZIP' && !document.getElementById('zp-ov')));
  }
  // ─── V11 : documentation produit (fichier chargé) et plans du produit dans Engineering, dans la largeur du téléphone ───
  await page.evaluate(() => {
    switchApp('projects'); pmEditProject('Pp1'); pmShowTab('produits'); pmEditProduct(0); pmProductSubTab('doceng');
    const d = pmCurProj.products[0].docs[0]; d.type = 'Internal Drawing'; d.number = 'DWG-0042'; d.link = 'https://pdm.example.com/plan/42';
    d.file = { id: 'Fmob', name: 'Plan CX735 Tank — révision B avec un nom assez long.pdf', size: 145000, type: 'application/pdf' };
    document.getElementById('pm-docs-0').innerHTML = pmDocsHtml(0); window.scrollTo(0, 0);
  });
  await chk('documentation produit : le fichier chargé s\'affiche sous sa ligne, dans la largeur de l\'écran', () => page.evaluate(() => {
    const f = document.querySelector('#pm-docs-0 .pm-docf'), r = f && f.getBoundingClientRect();
    return !!f && r.width > 150 && r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth || { r: r && [r.left, r.right], sw: document.documentElement.scrollWidth };
  }));
  await page.evaluate(() => { pmAutosave.persist(); switchApp('engineering'); engEditProject(engDB.projects[0].id); const s = document.getElementById('ep-pmProj'); s.value = 'Pp1'; engPickPmProject(); const p = document.getElementById('ep-pmProd'); p.value = p.options[1].value; engPickPmProduct(); });
  await page.waitForTimeout(200);
  await chk('Engineering › projet : « Plans et documents du produit » (fichier et lien), dans la largeur de l\'écran', () => page.evaluate(() => {
    const b = document.getElementById('ep-pmDocs'), chips = [...b.querySelectorAll('.ep-doc')];
    return !b.hidden && chips.length >= 1 && chips.every(c => c.getBoundingClientRect().right <= innerWidth) && document.documentElement.scrollWidth <= innerWidth || { hidden: b.hidden, n: chips.length, sw: document.documentElement.scrollWidth };
  }));
  if (SHOTS) { await page.evaluate(() => document.getElementById('ep-pmDocs').scrollIntoView({ block: 'center' })); await page.screenshot({ path: path.join(SHOTS, 'eng_plans.png') }); }
  // ─── V12 : BOM en cartes avec libellés ; fenêtre du jalon : grande zone d'écriture ───
  await page.evaluate(() => {
    switchApp('projects'); pmEditProject('Pp1'); pmShowTab('produits'); pmEditProduct(0);
    pmCurProj.products[0].bom = [
      { id: 'tb1', ref: 'P1029491A', designation: 'RACCORD ENCLIQUETABLE 90°', type: 'CONNECTOR 2 WAYS', qty: '2', unit: 'PCE', photo: '', sub: null },
      { id: 'tb2', ref: 'S2001455B', designation: 'SOUS-ENSEMBLE', type: 'SEMI-FINISHED', qty: '1', unit: 'PCE', photo: '', _open: true, sub: [{ id: 'tb21', ref: 'P1040022A', designation: 'TUBE PA12', type: 'TUBE', qty: '0.85', unit: 'M', photo: '', _open: true,
        sub: [{ id: 'tb211', ref: 'P1040099C', designation: 'JOINT TORIQUE', type: 'SEAL', qty: '1000', unit: 'PCE', photo: '', sub: null }] }] }];   // 2ᵉ niveau : carte la plus étroite
    pmProductSubTab('bom'); window.scrollTo(0, 0);
  });
  await chk('BOM : une carte par composant, libellés (Référence, Désignation, Type, Qté, Unité), références, types, quantités (« 1000 ») et unités entiers, même au 2ᵉ niveau ; rien ne dépasse', () => page.evaluate(() => {
    const rows = [...document.querySelectorAll('#pm-bom-0 .pm-bomrow')], W = innerWidth;
    const labels = [...rows[0].querySelectorAll('.bf-l')].map(l => getComputedStyle(l, '::before').content.replace(/"/g, ''));
    const cut = rows.flatMap(r => [...r.querySelectorAll('.bf-l')].filter(l => l.dataset.l !== 'Désignation').map(l => l.querySelector('input')).filter(i => i.scrollWidth > i.clientWidth + 1).map(i => i.value));
    const inside = rows.every(r => r.getBoundingClientRect().right <= W + 0.5), card = getComputedStyle(rows[0]);
    return rows.length === 4 && labels.join('|') === 'Référence|Désignation|Type composant|Qté|Unité' && !cut.length && inside && parseFloat(card.borderTopLeftRadius) >= 10 && document.documentElement.scrollWidth <= W || { n: rows.length, labels, cut, inside, r: card.borderTopLeftRadius };
  }));
  await chk('BOM : sous-composant décalé avec une barre de couleur ; « SEMI-FINI » et ▼ en onglets sur le bord de la carte, sans toucher les libellés', () => page.evaluate(() => {
    const rows = [...document.querySelectorAll('#pm-bom-0 .pm-bomrow')], semi = rows[1], sub = rows[2];
    const lb = parseFloat(getComputedStyle(sub).borderLeftWidth), dx = sub.getBoundingClientRect().left - rows[0].getBoundingClientRect().left;
    const tag = semi.querySelector('.pm-bomsemi'), tog = semi.querySelector(':scope > span:first-child');
    const tabs = [tag, tog].map(e => e.getBoundingClientRect());   // un libellé sous un onglet : au moins 3 px d'écart
    const clear = [...semi.querySelectorAll('.bf-l')].every(l => { const b = l.getBoundingClientRect(); return tabs.every(t => t.right <= b.left || t.left >= b.right || t.bottom <= b.top - 3); });
    return lb >= 3 && dx > 0 && !!tag && getComputedStyle(tag).position === 'absolute' && getComputedStyle(tog).position === 'absolute' && clear || { lb, dx, tag: !!tag, clear };
  }));
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'bom_cartes.png') });
  await page.evaluate(() => { pmShowTab('outils'); pmToolsView = 'cards'; pmRenderTools(); pmOpenMsPopup('t:0', 0); });
  await page.waitForTimeout(200);
  await chk('fenêtre du jalon : zone de commentaire grande (taille d\'un commentaire), sur toute la largeur, « Ajouter » dessous', () => page.evaluate(() => {
    const t = document.getElementById('ms-pop-ctext').getBoundingClientRect(), box = document.querySelector('#ms-popup-ov > div').getBoundingClientRect();
    const add = [...document.querySelectorAll('#ms-popup-ov .btn')].find(b => /Ajouter/.test(b.textContent)).getBoundingClientRect();
    return t.height >= 150 && t.width >= box.width - 40 && add.top >= t.bottom - 1 || { t: [t.width, t.height], box: box.width, add: add.top };
  }));
  await page.fill('#ms-pop-ctext', 'dictée '.repeat(120));
  await chk('… elle grandit avec le texte dicté (jusqu\'à la moitié de l\'écran) ; les commentaires s\'affichent en entier', () => page.evaluate(() => {
    const h = document.getElementById('ms-pop-ctext').getBoundingClientRect().height, l = getComputedStyle(document.getElementById('ms-pop-clist')).maxHeight;
    return h > 175 && h <= innerHeight * 0.56 && l === 'none' || { h, l, max: innerHeight * 0.55 };
  }));
  await page.evaluate(() => document.getElementById('ms-popup-ov').remove());
  await tap('#m-tabbar [data-app="home"]');
  await chk('onglet Accueil : pas de bouton ☰ (pas de tiroir sur l\'accueil)', () => page.evaluate(() => document.body.dataset.app === 'home' && getComputedStyle(document.getElementById('mobileMenuBtn')).display === 'none'));
  if (errors.length) { console.log('  Erreurs JavaScript :\n    ' + [...new Set(errors)].join('\n    ')); bad++; }
  console.log(`\n${n - bad} vérifications réussies sur ${n}${errors.length ? ' (+ erreurs JS)' : ''}`);
  await browser.close();
  process.exit(bad ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
