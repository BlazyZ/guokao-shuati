/* 国考刷题本 Service Worker
   策略：联网时一律取服务器最新文件并更新缓存（保证 GitHub 上改完即生效），
   断网时用缓存兜底（保证离线可刷）。 */
var CACHE = "gk-shuati-v2";
var PRECACHE = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./data/part1-zy-jichu.js",
  "./data/part2-zy-bigdata.js",
  "./data/part3-jinrong.js"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(PRECACHE); }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 网络优先：成功则刷新缓存，失败（断网）则回落到缓存
  e.respondWith(
    fetch(req).then(function (res) {
      if (res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        // 导航请求兜底到首页缓存
        if (req.mode === "navigate") return caches.match("./index.html");
        return Response.error();
      });
    })
  );
});
