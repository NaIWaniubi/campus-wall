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

/* ---------- Web Push（spec-C T9 预埋；VAPID 未配置时服务端不发推送，以下仅是端上接收器） ---------- */
self.addEventListener('push', (e) => {
  let payload = { title: '校园墙', body: '你有新的消息', url: '/message' };
  try {
    payload = { ...payload, ...(e.data ? e.data.json() : {}) };
  } catch {
    /* 非 JSON 数据用默认文案 */
  }
  e.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url || '/message' },
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/message';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // 已有打开的窗口则聚焦并跳转，否则新开
      for (const client of list) {
        if (client.url.includes(location.origin)) {
          client.navigate(url).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
