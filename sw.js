// Service worker de la plateforme (V6) : affiche les rappels envoyés par Firebase Cloud Messaging,
// même application fermée, et ouvre l'app sur l'échéance quand on touche la notification.
// Pas de cache ni d'interception des pages : l'app se charge toujours du réseau, comme avant.
// La configuration Firebase est la même que dans plateforme.html (FB_CONFIG) : les garder identiques.

// Clic sur une notification (déclaré avant Firebase pour passer en premier)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || 'plateforme.html', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(w => w.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ rappel: url }); return c.focus(); }   // l'app est ouverte : elle va sur l'échéance
    return self.clients.openWindow(url);
  }));
});
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

const V = '12.19.0';
try {
  importScripts('https://www.gstatic.com/firebasejs/' + V + '/firebase-app-compat.js', 'https://www.gstatic.com/firebasejs/' + V + '/firebase-messaging-compat.js');
} catch (e) {
  importScripts('https://cdn.jsdelivr.net/npm/firebase@' + V + '/firebase-app-compat.js', 'https://cdn.jsdelivr.net/npm/firebase@' + V + '/firebase-messaging-compat.js');
}
firebase.initializeApp({
  apiKey: 'AIzaSyDh7UxWOW0pqbfnOL3T78LHjCL0QPZ_Iuk',
  authDomain: 'work-75094.firebaseapp.com',
  projectId: 'work-75094',
  storageBucket: 'work-75094.firebasestorage.app',
  messagingSenderId: '960808610888',
  appId: '1:960808610888:web:a3cef56f14a75c43dc3c7d'
});
// Rappel reçu application fermée ou en arrière-plan (messages « data » : titre, texte, lien, étiquette)
firebase.messaging().onBackgroundMessage(p => {
  const d = (p && p.data) || {};
  return self.registration.showNotification(d.title || 'Rappel', {
    body: d.body || '', tag: d.tag || 'rappel', renotify: true, data: { url: d.url || 'plateforme.html' }
  });
});
