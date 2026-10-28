const CACHE='tmfl-fan-v13-fresh-notifications';
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
   // Fresh page online, cached page offline. A timeout avoids hanging on poor connections.
   try{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),3500);
    try{
     const response=await fetch(req,{signal:controller.signal,cache:'no-store'});
     if(response.ok){event.waitUntil(cache.put('./index.html',response.clone()));return response}
    }finally{clearTimeout(timeout)}
   }catch(error){console.warn('TMFL using offline page:',error)}
   return cached||new Response('<h1>TMFL offline</h1><p>Connect once to save the latest portal.</p>',{status:503,headers:{'Content-Type':'text/html'}});
  })());
  return;
 }
 // Always request fresh news and alerts; only use cached copies offline.
 if(/\/(tmfl-news|tmfl-alerts)\.json$/.test(url.pathname)){
  event.respondWith((async()=>{
   const cache=await caches.open(CACHE);
   try{
    const response=await fetch(req,{cache:'no-store'});
    if(response.ok){await cache.put(req,response.clone());return response}
    throw Error('News or alerts feed unavailable');
   }catch(error){
    return await cache.match(req,{ignoreSearch:true})||new Response('{"articles":[],"entries":[]}',{status:503,headers:{'Content-Type':'application/json'}});
   }
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
