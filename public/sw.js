/* eslint-env serviceworker */
/**
 * Service Worker — EduCenter Pro
 *
 * بيخلي التطبيق يشتغل أوفلاين (PWA):
 *  - بيسبق تحميل "الغلاف" (index.html + الأيقونات + المانيفست)
 *  - التنقّلات: network-first مع fallback للنسخة المخزّنة (أوفلاين)
 *  - موارد نفس الأصل: stale-while-revalidate
 *  - موارد خارجية (خطوط): cache-first مع حد أقصى للمخزّن
 */
const VERSION = 'v1.1.0';
const SHELL_CACHE = `educenter-shell-${VERSION}`;
const RUNTIME_CACHE = `educenter-runtime-${VERSION}`;

const SHELL_ASSETS = ['/', '/index.html', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png'];

// أقصى عدد عناصر في كاش الوقت-تشغيلي (عشان ما يكبرش للأبد)
const RUNTIME_MAX = 60;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== RUNTIME_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function trimRuntimeCache(cache) {
  const keys = await cache.keys();
  if (keys.length > RUNTIME_MAX) {
    // نشيل الأقدم (الأول دخولاً)
    const excess = keys.length - RUNTIME_MAX;
    for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // تنقّلات (فتح صفحة): network-first مع fallback للغلاف المخزّن
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/').then((hit) => hit || caches.match('/index.html')))
    );
    return;
  }

  // نفس الأصل: stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.ok) cache.put(req, res.clone()).then(() => trimRuntimeCache(cache));
            return res;
          })
          .catch(() => hit);
        return hit || network;
      })
    );
    return;
  }

  // خارجي (خطوط Google مثلاً): cache-first
  event.respondWith(
    caches.open(RUNTIME_CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          cache.put(req, res.clone()).then(() => trimRuntimeCache(cache));
        }
        return res;
      } catch (e) {
        return hit || Response.error();
      }
    })
  );
});

// رسائل من التطبيق (تحديث يدوي للكاش)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
