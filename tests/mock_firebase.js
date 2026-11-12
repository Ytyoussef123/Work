// Faux SDK Firebase "compat" pour les tests : les opérations passent par window.__be (exposé par Node).
(function () {
  const be = (op, a) => window.__be(op, a);
  const listeners = {};
  window.__mockFire = (lid, changes) => { const l = listeners[lid]; if (l) l(changes); };
  let authCb = null, cur = null;
  window.__mockLogin = email => { cur = email ? { email, displayName: 'Test ' + email } : null; if (authCb) authCb(cur); };
  class DocRef {
    constructor(path) { this.path = path; this.id = path.split('/').pop(); }
    collection(n) { return new CollRef(this.path + '/' + n); }
    async get() { const d = await be('getDoc', { path: this.path, email: cur && cur.email }); if (d && d.error) { const e = new Error(d.error); e.code = d.error; throw e; } return { exists: !!d, data: () => d }; }
  }
  class CollRef {
    constructor(path) { this.path = path; }
    doc(id) { return new DocRef(this.path + '/' + id); }
    async get() { const r = await be('list', { path: this.path }); return { forEach: f => r.forEach(x => f({ id: x.id, data: () => x.data })) }; }
    onSnapshot(next, err) {
      const lid = Math.random().toString(36).slice(2);
      listeners[lid] = changes => next({ docChanges: () => changes.map(c => ({ type: c.type, doc: { id: c.id, data: () => c.data } })) });
      be('listen', { path: this.path, lid });
      return () => { delete listeners[lid]; be('unlisten', { lid }); };
    }
  }
  const db = {
    collection: n => new CollRef(n),
    doc: p => new DocRef(p),
    enablePersistence: async () => {},
    batch() {
      const ops = [];
      return {
        set: (ref, data) => ops.push({ t: 'set', path: ref.path, data: JSON.parse(JSON.stringify(data)) }),
        delete: ref => ops.push({ t: 'del', path: ref.path }),
        commit: async () => { if (window.__mockOffline) return new Promise(() => {}); const r = await be('commit', { ops, email: cur && cur.email }); if (r && r.error) { const e = new Error(r.error); e.code = r.error; throw e; } }
      };
    }
  };
  const ref = path => ({
    putString: async d => be('put', { path, data: d }),
    put: async (blob, meta) => { const d = await new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(blob); }); return be('put', { path, data: d, meta }); },
    getDownloadURL: async () => { const r = await be('url', { path }); if (!r) { const e = new Error('not found'); e.code = 'storage/object-not-found'; throw e; } return r; }
  });
  const fs = () => db; fs.FieldValue = { serverTimestamp: () => 'TS' };
  const auth = () => ({
    onAuthStateChanged: cb => { authCb = cb; setTimeout(() => cb(cur), 0); },
    signInWithPopup: async () => { window.__mockLogin(window.__mockEmail || 'a@test.fr'); },
    signInWithRedirect: async () => {}, getRedirectResult: async () => null,
    signOut: async () => window.__mockLogin(null)
  });
  auth.GoogleAuthProvider = class {};
  window.firebase = { initializeApp: () => ({}), firestore: fs, auth, storage: () => ({ ref }) };
})();
