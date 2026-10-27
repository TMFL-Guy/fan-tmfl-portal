const CACHE='tmfl-fan-v3-network';
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
  event.respondWith((async()=>{
   const cached=await caches.match('./index.html');
   const refresh=fetch(event.request,{cache:'no-store'}).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));}
    return response;
   });
   if(cached){event.waitUntil(refresh.then(()=>{}).catch(()=>{}));return cached;}
   try{return await refresh}catch{return caches.match('./index.html')}
  })());
  return;
 }
 event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));
});
