const CACHE = 'mi-ingles-v40';
const AUDIO = 'mi-ingles-audio';   // los audios descargados van aparte: la actualización de la app no los borra
const SHELL = ['./', './index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE && k !== AUDIO).map(k => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (/\/audio\/[^/]+\.mp3$/.test(new URL(e.request.url).pathname) && new URL(e.request.url).origin === self.location.origin) { e.respondWith(audioDe(e.request)); return; }
  if (new URL(e.request.url).origin !== self.location.origin) return;   // la nube (Supabase) y las librerías: siempre en vivo, nunca desde la caché
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});

// Audios: si están descargados suenan sin conexión; si no, van a la red y, sin red, devuelven 503 (la app avisa «Este audio necesita conexión»)
async function audioDe(req) {
  try {
    if (!(await caches.has(AUDIO))) throw 0;
    const c = await caches.open(AUDIO);
    const hit = await c.match(req.url, {ignoreSearch: true});
    if (hit) return conRango(req, hit);
  } catch (e) {}
  try { return await fetch(req); }
  catch (e) { return new Response('', {status: 503, statusText: 'Sin conexion'}); }
}
// el reproductor pide los audios por trozos (Range): se responde con el trozo pedido
async function conRango(req, res) {
  const r = req.headers.get('range');
  const m = r && /^bytes=(\d*)-(\d*)$/.exec(r);
  if (!m) return res;
  const buf = await res.arrayBuffer(), total = buf.byteLength;
  const ini = m[1] === '' ? Math.max(0, total - Number(m[2])) : Number(m[1]);
  const fin = (m[1] === '' || m[2] === '') ? total - 1 : Math.min(Number(m[2]), total - 1);
  if (ini > fin || ini >= total) return new Response('', {status: 416, headers: {'Content-Range': 'bytes */' + total}});
  return new Response(buf.slice(ini, fin + 1), {status: 206, headers: {
    'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
    'Content-Range': `bytes ${ini}-${fin}/${total}`,
    'Content-Length': String(fin - ini + 1),
    'Accept-Ranges': 'bytes'}});
}
