const CACHE='tmfl-fan-v9-fast-shell';
const ASSETS=['./index.html','./manifest.webmanifest','./tmfl-icon-512.png','./tmfl-news.json','./tmfl-draft.json'];
self.addEventListener('install',event=>{
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  // Cache the app shell first so optional feeds cannot delay offline activation.
  try{
   const response=await fetch('./index.html',{cache:'reload'});
   if(response.ok)await cache.put('./index.html',response);
  }catch(error){console.warn('TMFL shell cache:',error)}
  await self.skipWaiting();
 })());
});
self.addEventListener('activate',event=>{
 event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('tmfl-fan-')&&key!==CACHE).map(key=>caches.delete(key)));
  await self.clients.claim();
 })());
});
self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 const url=new URL(req.url);
 if(req.mode==='navigate'){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   const cached=await cache.match('./index.html');
   const refresh=fetch(req).then(async response=>{
    if(response.ok)await cache.put('./index.html',response.clone());
    return response;
   });
   if(cached){event.waitUntil(refresh.catch(()=>{}));return cached}
   return refresh.catch(()=>new Response('<h1>TMFL offline setup not finished</h1><p>Connect to the internet once and reload to save the portal.</p>',{status:503,headers:{'Content-Type':'text/html'}}));
  })());
  return;
 }
 if(/\/(tmfl-news|tmfl-draft)\.json$/.test(url.pathname)||/\/(manifest\.webmanifest|tmfl-icon-512\.png)$/.test(url.pathname)){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   const cached=await cache.match(req,{ignoreSearch:true});
   const refresh=fetch(req).then(async response=>{
    if(response.ok)await cache.put(req,response.clone());
    return response;
   });
   if(cached){event.waitUntil(refresh.catch(()=>{}));return cached}
   return refresh.catch(()=>new Response('{}',{status:503,headers:{'Content-Type':'application/json'}}));
  })());
  return;
 }
 event.respondWith(fetch(req).catch(()=>caches.match(req)));
});
