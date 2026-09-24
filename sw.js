/* Service worker Puisi
   - Halaman: jaringan dulu (update langsung terpakai), cadangan dari cache saat offline
   - Ikon, manifest, pustaka & font: dari cache sambil diperbarui di latar belakang
   - Permintaan ke Supabase TIDAK pernah disentuh: selalu langsung ke jaringan
   - Notifikasi push: teks generik (isi pesan tidak pernah dikirim), digabung per ruang, dengan lencana ikon
   Naikkan VERSION jika daftar SHELL berubah. */
const VERSION = 'rk-v2';
// Teks notifikasi ditetapkan DI SINI (bukan dari server), sama untuk pesan dari siapa pun.
const NOTIF_TITLE = 'Puisi Cinta';
const NOTIF_TEXT = 'Ada puisi baru hari ini?';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/badge-96.png'];
const CDN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSION);
    await Promise.all(SHELL.map(u => c.add(u).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSION) await caches.delete(k);
    await self.clients.claim();
  })());
});

const keep = res => !!res && (res.ok || res.type === 'opaque');

async function networkFirst(req) {
  const c = await caches.open(VERSION);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))]);
    if (keep(res)) c.put(req, res.clone());
    return res;
  } catch (e) {
    return (await c.match(req, { ignoreSearch: true })) || (await c.match('index.html')) || (await c.match('./')) || Response.error();
  }
}

async function staleWhileRevalidate(e) {
  const c = await caches.open(VERSION);
  const hit = await c.match(e.request);
  const net = fetch(e.request).then(res => { if (keep(res)) c.put(e.request, res.clone()); return res; }).catch(() => null);
  e.waitUntil(net);
  return hit || (await net) || Response.error();
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' && url.origin === location.origin) { e.respondWith(networkFirst(req)); return; }
  if (url.origin === location.origin || CDN.includes(url.hostname)) e.respondWith(staleWhileRevalidate(e));
});

/* ---------- Notifikasi push ---------- */
// Total angka pada lencana ikon = jumlah pemberitahuan yang belum dibuka.
async function updateBadge() {
  try {
    const all = await self.registration.getNotifications();
    const n = all.reduce((s, x) => s + ((x.data && x.data.count) || 1), 0);
    const nav = self.navigator;
    if (nav && nav.setAppBadge) { if (n) await nav.setAppBadge(n); else await nav.clearAppBadge(); }
  } catch (err) {}
}

// PENTING: setiap push HARUS menampilkan notifikasi (iOS mencabut izin jika tidak).
// Karena itu penekanan "sedang dibaca" dilakukan di server, bukan di sini.
async function showPush(d) {
  const tag = 'rk-' + (d.room || 'x');
  const old = await self.registration.getNotifications({ tag });
  const count = old.reduce((n, x) => Math.max(n, (x.data && x.data.count) || 1), 0) + 1;
  await self.registration.showNotification(NOTIF_TITLE, {
    body: NOTIF_TEXT, tag, renotify: true,
    icon: 'icons/icon-192.png', badge: 'icons/badge-96.png',
    data: { room: d.room || null, count },
    timestamp: Number(d.ts) || Date.now(),
    vibrate: [70, 40, 70]
  });
  await updateBadge();
}

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = {}; }
  e.waitUntil(showPush(d));
});

self.addEventListener('notificationclick', e => {
  const room = e.notification.data && e.notification.data.room;
  e.notification.close();
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const win = list.find(c => 'focus' in c);
    if (win) { await win.focus(); win.postMessage({ type: 'open-room', room }); }
    else await self.clients.openWindow(new URL('./', self.registration.scope).href + (room ? '?room=' + encodeURIComponent(room) : ''));
    await updateBadge();
  })());
});
