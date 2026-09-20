/* Service worker Ruang Kita
   - Halaman: jaringan dulu (update langsung terpakai), cadangan dari cache saat offline
   - Ikon, manifest, pustaka & font: dari cache sambil diperbarui di latar belakang
   - Permintaan ke Supabase TIDAK pernah disentuh: selalu langsung ke jaringan
   Naikkan VERSION jika daftar SHELL berubah. */
const VERSION = 'rk-v1';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
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
    return (await c.match(req)) || (await c.match('index.html')) || (await c.match('./')) || Response.error();
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
