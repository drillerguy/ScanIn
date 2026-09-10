const CACHE_NAME = "scanin-v0.2.6";
const APP_VERSION = "0.2.6";
const APP_SHELL = ["./","./index.html","./styles.css","./iphone-fix.css","./location.css","./ios-input-fix.css","./app.js","./location.js","./ui-fixes.js","./manifest.webmanifest","./icon.svg"];

self.addEventListener("install",(event)=>{
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache)=>cache.addAll(APP_SHELL))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",(event)=>{
  event.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter((key)=>key!==CACHE_NAME).map((key)=>caches.delete(key)));
    await self.clients.claim();

    const clients = await self.clients.matchAll({type:"window",includeUncontrolled:true});
    for (const client of clients) {
      try { client.postMessage({ type:"SCANIN_UPDATE_READY", version:APP_VERSION }); } catch (_) {}
    }
  })());
});

self.addEventListener("fetch",(event)=>{
  if(event.request.method!=="GET") return;
  const url = new URL(event.request.url);
  if(url.origin!==self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response)=>{
        const copy=response.clone();
        caches.open(CACHE_NAME).then((cache)=>cache.put(event.request,copy));
        return response;
      })
      .catch(()=>caches.match(event.request).then((cached)=>cached||caches.match("./index.html")))
  );
});
