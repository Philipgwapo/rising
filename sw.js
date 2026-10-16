const V='tubig-v1', TILES='tubig-tiles', MAXTILES=3000;
const SHELL=['./','index.html','app.js','data.json','manifest.webmanifest','vendor/leaflet.js','vendor/leaflet.css','icons/icon-192.png','icons/icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k!==TILES&&k!=='tubig-fonts').map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
async function trimTiles(){const c=await caches.open(TILES);const k=await c.keys();for(let i=0;i<k.length-MAXTILES;i++)await c.delete(k[i]);}
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url); if(e.request.method!=='GET') return;
  if(u.hostname.endsWith('tile.openstreetmap.org')){
    e.respondWith(caches.open(TILES).then(async c=>{const hit=await c.match(e.request);if(hit)return hit;
      try{const r=await fetch(e.request);if(r.ok||r.type==='opaque'){c.put(e.request,r.clone());trimTiles();}return r;}catch(err){return new Response('',{status:504});}}));
    return;
  }
  if(u.hostname.includes('fonts.g')){
    e.respondWith(caches.open('tubig-fonts').then(async c=>{const hit=await c.match(e.request);if(hit)return hit;try{const r=await fetch(e.request);c.put(e.request,r.clone());return r;}catch(err){return new Response('',{status:504});}}));
    return;
  }
  if(u.origin===location.origin){
    e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(V).then(c=>c.put(e.request,cp));return r;}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))));
  }
});
