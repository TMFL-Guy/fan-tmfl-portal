const CACHE='tmfl-fan-v6-fast-data';
const ASSETS=['./index.html','./manifest.webmanifest','./tmfl-icon-512.png'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
 self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));
 self.clients.claim();
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 if(event.request.mode==='navigate'){
  const refresh=fetch(event.request,{cache:'no-store'}).then(response=>{
   if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy)).catch(()=>{});}
   return response;
  });
  event.respondWith(refresh.catch(()=>caches.match('./index.html')));
  return;
 }
 // Published JSON is safe to show immediately from cache while refreshing it.
 const path=new URL(event.request.url).pathname;
 if(/\/(tmfl-news|tmfl-draft)\.json$/.test(path)){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   const cached=await cache.match(event.request,{ignoreSearch:true});
   const update=fetch(event.request).then(response=>{
    if(response.ok)cache.put(event.request,response.clone()).catch(()=>{});
    return response;
   });
   if(cached){event.waitUntil(update.catch(()=>{}));return cached}
   return update.catch(()=>new Response('{}',{headers:{'Content-Type':'application/json'},status:503}));
  })());
  return;
 }
 event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
