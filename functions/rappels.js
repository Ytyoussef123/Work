'use strict';
// Rappels des échéances de Project Master (jalons d'outils, actions datées) — logique sans Firebase,
// utilisée par la fonction planifiée (index.js) et testée par tests/test_rappels.js.
// Mêmes règles que le panneau « Rappels » de plateforme.html (couche Firebase, section RAPPELS) :
// garder les deux d'accord.

const DEFAULT_PREFS = { j7: true, j3: false, j0: false, retard: false, actions: true };
const DONE = new Set(['Fait', 'N-A']);   // jalon / action terminé(e) ou sans objet
const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Documents Firestore d'une base (app/<clé>/r/<id>) → enregistrements JSON (morceaux <id>~i recollés)
function reassemble(docs) {
  const recs = {};
  for (const id of Object.keys(docs || {})) {
    if (/~\d+$/.test(id)) continue;
    const d = docs[id] || {};
    let j = d.j || '', ok = true;
    for (let i = 1; i < (d.n || 1); i++) {
      const p = docs[id + '~' + i];
      if (!p || p.v !== d.v) { ok = false; break; }   // morceaux pas tous à jour : repris au prochain passage
      j += p.j;
    }
    if (!ok) continue;
    try { recs[id] = JSON.parse(j); } catch (e) { /* enregistrement illisible : ignoré */ }
  }
  return recs;
}
function pmFromRecords(recs) {
  const pm = { projects: [], actions: [] };
  for (const id of Object.keys(recs || {})) {
    if (id.startsWith('projects:')) pm.projects.push(recs[id]);
    else if (id.startsWith('actions:')) pm.actions.push(recs[id]);
  }
  return pm;
}

// Échéances suivies : jalons non faits des outils et sous-outils, actions datées non faites
function collectItems(pm) {
  const items = [];
  const add = (pre, kind, x, date, label, where, link) => {
    if (!ISO.test(date || '')) return;
    const id = x.id || [link.p, link.t, link.s, label].filter(Boolean).join('/');
    items.push({ key: pre + id, kind, date, label: String(label || '').slice(0, 120), where, link });
  };
  for (const p of (pm && pm.projects) || []) {
    if (!p || p.status === 'Archived') continue;
    for (const t of p.tools || []) {
      if (!t || t.status === 'Terminé') continue;
      const owners = [[t, (p.name || '') + ' › ' + (t.name || ''), { p: p.id, t: t.id }]];
      for (const s of t.subtools || []) if (s && s.status !== 'Terminé') owners.push([s, (p.name || '') + ' › ' + (t.name || '') + ' › ' + (s.name || ''), { p: p.id, t: t.id, s: s.id }]);
      for (const [o, where, link] of owners) {
        for (const m of o.milestones || []) if (m && !DONE.has(m.status)) add('m:', 'jalon', m, m.date, m.label, where, link);
        for (const n of o.notes || []) if (n && n.kind === 'Action' && !DONE.has(n.status)) add('n:', 'action', n, n.dueDate, n.text, where, link);
      }
    }
  }
  for (const a of (pm && pm.actions) || []) if (a && a.kind !== 'Note' && !DONE.has(a.status)) add('a:', 'action', a, a.dueDate, a.text, 'Plan d\'actions', { a: 1 });
  return items;
}

// Date du jour 'AAAA-MM-JJ' dans le fuseau de l'appareil
function todayIn(tz, now) {
  const at = now || new Date();
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at); }
  catch (e) { return at.toISOString().slice(0, 10); }
}
// Jours entre deux dates 'AAAA-MM-JJ' (calendrier : ni heure ni fuseau)
function days(from, to) {
  const t = s => { const [y, m, d] = String(s).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(to) - t(from)) / 86400000);
}
// Étapes, de la plus précise à la plus large : parmi celles choisies, la plus précise qui s'applique
const STAGES = [
  { id: 'retard', ok: d => d < 0 },
  { id: 'j0', ok: d => d === 0 },
  { id: 'j3', ok: d => d >= 0 && d <= 3 },
  { id: 'j7', ok: d => d >= 0 && d <= 7 }
];
// Rappels à envoyer aujourd'hui à un appareil ; sent : { '<échéance>|<date>|<étape>': jour d'envoi }
function dueFor(items, prefs, today, sent) {
  const P = Object.assign({}, DEFAULT_PREFS, prefs || {}), out = [];
  for (const it of items) {
    if (it.kind === 'action' && !P.actions) continue;
    const d = days(today, it.date);
    const st = STAGES.find(s => P[s.id] && s.ok(d));
    if (!st) continue;
    const sentKey = it.key + '|' + it.date + '|' + st.id;   // date changée → nouveau rappel
    if (sent && sent[sentKey]) continue;
    out.push(Object.assign({}, it, { d, stage: st.id, sentKey }));
  }
  return out.sort((a, b) => a.d - b.d || a.label.localeCompare(b.label));
}

const fmt = iso => iso.slice(8, 10) + '/' + iso.slice(5, 7);
const when = d => d < 0 ? 'en retard de ' + (-d) + ' j' : d === 0 ? 'aujourd\'hui' : d === 1 ? 'demain' : 'dans ' + d + ' jours';
const linkOf = l => l && l.p ? ['p', l.p, 't', l.t].concat(l.s ? ['s', l.s] : []).map(encodeURIComponent).join('/') : 'a';
// Contenu de la notification (que du texte, comme l'exigent les messages « data » de FCM) ; lien relatif à l'app
function message(due) {
  if (due.length === 1) {
    const x = due[0];
    return { title: (x.kind === 'jalon' ? 'Jalon ' : 'Action ') + when(x.d) + ' (' + fmt(x.date) + ')', body: x.label + '\n' + x.where,
      url: 'plateforme.html#rappel=' + linkOf(x.link), tag: 'rappel-' + x.key };
  }
  const lines = due.slice(0, 5).map(x => '• ' + x.label + ' — ' + when(x.d));
  if (due.length > 5) lines.push('… et ' + (due.length - 5) + ' autre(s)');
  return { title: due.length + ' échéances à suivre', body: lines.join('\n'), url: 'plateforme.html#rappel=liste', tag: 'rappels' };
}
function prune(sent, today) {   // oublie les envois de plus de 90 jours
  const out = {};
  for (const k of Object.keys(sent || {})) if (days(sent[k], today) <= 90) out[k] = sent[k];
  return out;
}

// Un passage (chaque matin). db : Firestore (admin) ; send(token, data) : envoi FCM ; ts : horodatage serveur
async function run({ db, send, ts, now }) {
  const root = db.collection('app').doc('_rappels');
  const pmSnap = await db.collection('app').doc('pm_db').collection('r').get();
  const docs = {}; pmSnap.forEach(d => { docs[d.id] = d.data(); });
  const items = collectItems(pmFromRecords(reassemble(docs)));
  const devs = await root.collection('appareils').get();
  let envoyes = 0, retires = 0;
  for (const dev of devs.docs) {
    const a = dev.data() || {};
    if (!a.token) continue;
    const sentRef = root.collection('envois').doc(dev.id);
    const sDoc = await sentRef.get();
    const sent = (sDoc.exists && (sDoc.data() || {}).cles) || {};
    const today = todayIn(a.tz, now);
    const due = dueFor(items, a.prefs, today, sent);
    if (!due.length) continue;
    try {
      await send(a.token, message(due));
      due.forEach(x => { sent[x.sentKey] = today; });
      await sentRef.set({ cles: prune(sent, today) });
      envoyes++;
    } catch (e) {
      const c = (e && (e.code || (e.errorInfo && e.errorInfo.code))) || '';
      if (/registration-token-not-registered|invalid-registration-token/.test(c)) {   // appareil désinscrit : on l'oublie
        await dev.ref.delete(); await sentRef.delete().catch(() => {}); retires++;
      } else console.error('rappel non envoyé', dev.id, c || e);
    }
  }
  await root.set({ dernierPassage: ts, appareils: devs.size, envoyes, retires }, { merge: true });
  return { echeances: items.length, appareils: devs.size, envoyes, retires };
}

module.exports = { DEFAULT_PREFS, reassemble, pmFromRecords, collectItems, todayIn, days, dueFor, message, prune, run };
