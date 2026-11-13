// Lancer : node tests/test_install.js
// App installable sur l'écran d'accueil (V10) : manifeste, icônes, balises de la page, puis l'avis de Chrome lui-même
// (DevTools : Page.getAppManifest, Page.getInstallabilityErrors) sur la page servie comme sur GitHub Pages (/Work/).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function check(name, ok, extra) { if (ok) { pass++; console.log('  ✓', name); } else { fail++; console.log('  ✗', name, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : ''); } }
const png = f => { try { const b = fs.readFileSync(path.join(ROOT, f)); return b.readUInt32BE(0) === 0x89504e47 ? b.readUInt32BE(16) + 'x' + b.readUInt32BE(20) : null; } catch (e) { return null; } };

(async () => {
  console.log('1. Manifeste et icônes');
  const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  check('nom, nom court, langue', !!m.name && m.short_name === 'Plateforme' && m.lang === 'fr', m);
  check('ouverture sur plateforme.html, portée = le site, en plein écran', m.start_url === './plateforme.html' && m.scope === './' && m.display === 'fullscreen', m);
  check('couleurs du fond et de la barre = fond de l\'app', m.background_color === '#0d0f14' && m.theme_color === '#0d0f14');
  const icons = (m.icons || []).map(i => Object.assign({ real: png(i.src) }, i));
  check('icônes 192 et 512 (« any ») et 512 (« maskable ») : fichiers PNG de la bonne taille',
    [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']].every(([s, p]) => icons.some(i => i.sizes === s && i.purpose === p && i.type === 'image/png' && i.real === s)), icons);
  check('icône iPhone 180 × 180', png('icons/apple-touch-icon.png') === '180x180', png('icons/apple-touch-icon.png'));

  console.log('2. Balises de la page');
  const lines = fs.readFileSync(path.join(ROOT, 'plateforme.html'), 'utf8').split('\n');
  check('ligne 58 : manifeste, icônes, balises iPhone — sur la même ligne (le titre reste ligne 59 : numéros du journal inchangés)',
    /<link rel="manifest" href="manifest\.webmanifest">/.test(lines[57]) && /rel="apple-touch-icon" href="icons\/apple-touch-icon\.png"/.test(lines[57]) &&
    /name="apple-mobile-web-app-capable" content="yes"/.test(lines[57]) && /^<title>/.test(lines[58]), lines[57].slice(0, 200));

  console.log('3. Chrome : la page est-elle installable ?');
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const MOCK = fs.readFileSync(path.join(__dirname, 'mock_firebase.js'), 'utf8');
  const TYPES = { '.html': 'text/html', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.hostname === 'localhost') {   // localhost : contexte sûr, comme le https de GitHub Pages
      const f = path.join(ROOT, decodeURIComponent(u.pathname).replace(/^\/Work\//, ''));
      if (f.startsWith(ROOT) && fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ contentType: TYPES[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
      return r.fulfill({ status: 404, body: '' });
    }
    if (u.href.includes('/firebasejs/') || u.href.includes('npm/firebase@')) return r.fulfill({ contentType: 'text/javascript', body: u.href.includes('-app-compat') ? MOCK : '' });
    return r.abort();
  });
  await page.exposeFunction('__be', async () => null);
  await page.goto('http://localhost:8123/Work/plateforme.html');
  await page.waitForFunction(() => window.fbSync);
  const cdp = await ctx.newCDPSession(page);
  const man = await cdp.send('Page.getAppManifest');
  check('Chrome lit le manifeste sans erreur', /\/Work\/manifest\.webmanifest$/.test(man.url) && !(man.errors || []).length, { url: man.url, errors: man.errors });
  // (Page.getInstallabilityErrors ne sert pas ici : Chrome sans écran ne fait pas ce contrôle, il répond « rien »
  //  même pour une page sans manifeste.) Critères d'installation de Chrome : name/short_name, icônes 192 et 512,
  //  start_url, display plein écran/standalone/minimal-ui, pas de prefer_related_applications ; https (ici localhost).
  const data = JSON.parse(man.data || '{}');
  check('critères d\'installation de Chrome remplis par le manifeste lu par Chrome', !!(data.short_name || data.name) && !!data.start_url && ['fullscreen', 'standalone', 'minimal-ui'].includes(data.display) &&
    ['192x192', '512x512'].every(s => (data.icons || []).some(i => i.sizes === s)) && !data.prefer_related_applications, data);
  const loaded = await page.evaluate(srcs => Promise.all(srcs.map(s => new Promise(res => { const im = new Image(); im.onload = () => res(im.naturalWidth + 'x' + im.naturalHeight); im.onerror = () => res('erreur'); im.src = s; }))), icons.map(i => i.src).concat('icons/apple-touch-icon.png'));
  check('les icônes se chargent depuis la page (chemins justes)', loaded.join() === icons.map(i => i.sizes).concat('180x180').join(), loaded);
  check('aucune erreur JavaScript', !errors.length, errors);
  await browser.close();
  console.log(`\n${pass} réussis, ${fail} échoués`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERREUR', e); process.exit(2); });
