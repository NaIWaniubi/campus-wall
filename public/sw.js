/*
 * 校园墙 Service Worker（保守策略 v1，A-T7）
 * - /assets/（Vite 指纹文件，内容不可变）→ cache-first
 * - 页面导航 → network-first，离线回退缓存的首页 shell
 * - /api、/uploads 永不缓存（数据实时性优先）
 * - 仅生产环境注册（见 src/main.ts）；升级换名：CACHE 版本号 +1 即可清旧缓存
 */
const CACHE = 'campus-wall-v1';
const ASSET_RE = /\/assets\/[\w.-]+\.(js|css|woff2?|png|jpg|jpeg|webp|svg|ico)$/;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(['/', '/manifest.webmanifest']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // 只处理同源 GET；API 与用户上传内容永远直连
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/uploads')) return;

  // 指纹静态资源：cache-first
  if (ASSET_RE.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((resp) => {
            if (resp.ok) {
              const copy = resp.clone();
              caches.open(CACHE).then((c) => c.put(e.request, copy));
            }
            return resp;
          })
      )
    );
    return;
  }

  // 页面导航：network-first，断网回退缓存的首页 shell
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then((resp) => {
        const copy = resp.clone();
        caches.open(CACHE).then((c) => c.put('/', copy));
        return resp;
      }).catch(() => caches.match('/'))
    );
  }
});
