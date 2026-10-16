let D = {w:[],t:[],p:[]};
const TYPES = {
  f:{n:'Waterfall',g:'falls',s:'warn'}, s:{n:'Spring',g:'spring',s:'okish'}, w:{n:'Well',g:'spring',s:'okish'},
  p:{n:'Tap / waterworks',g:'tap',s:'safe'}, t:{n:'Water tank',g:'tap',s:'okish'},
  r:{n:'Reservoir',g:'res',s:'warn'}, d:{n:'Dam',g:'res',s:'warn'}, l:{n:'Lake',g:'lake',s:'warn'},
  o:{n:'Pond',g:'lake',s:'warn'}, g:{n:'Lagoon',g:'lake',s:'bad'}, v:{n:'River / creek',g:'river',s:'warn'},
  i:{n:'Seasonal stream',g:'river',s:'warn'}, c:{n:'Canal',g:'river',s:'warn'}
};
const GROUPS = [['falls','Falls'],['spring','Springs & wells'],['tap','Taps & tanks'],['res','Reservoirs & dams'],['lake','Lakes & ponds'],['river','Rivers & creeks']];
const SAFE = {
  safe:['safe','Treated supply if flowing'],
  okish:['warn','Usually cleaner, still boil'],
  warn:['warn','Boil, filter or disinfect'],
  bad:['bad','May be salty, not drinkable']
};
const ICONS = {
  falls:'<path d="M5 3h14M8 3v6c0 2-2 3-2 6M12 3v12M16 3v6c0 2 2 3 2 6M4 20c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 4-1.5"/>',
  spring:'<path d="M12 3c-3 4.5-5 7-5 10a5 5 0 0 0 10 0c0-3-2-5.5-5-10z"/>',
  tap:'<path d="M4 8h9a3 3 0 0 1 3 3v2M8 8V5h4v3M16 15v1M16 19v1"/>',
  res:'<path d="M3 6h18M5 6l2 14h10l2-14M7 12h10"/>',
  lake:'<path d="M3 14c3-2 6-2 9 0s6 2 9 0M3 18c3-2 6-2 9 0s6 2 9 0M8 9a4 4 0 0 1 8 0"/>',
  river:'<path d="M5 3c4 3-4 6 0 9s-4 6 0 9M13 3c4 3-4 6 0 9s-4 6 0 9"/>'
};
const $ = s => document.querySelector(s);
const state = { areas:loadAreas(), map:null, layer:null, view:'map', here:null, label:'', r:15, groups:new Set(GROUPS.map(g=>g[0])), live:[], liveKey:'', sel:null, mine:loadMine() };

function loadAreas(){ try{ return JSON.parse(localStorage.getItem('tubig-areas')||'[]'); }catch(e){ return []; } }
function saveAreas(){ try{ localStorage.setItem('tubig-areas', JSON.stringify(state.areas.slice(-20))); return true; }catch(e){ return false; } }
function loadMine(){ try{ return JSON.parse(localStorage.getItem('tubig-mine')||'[]'); }catch(e){ return []; } }
function saveMine(){ try{ localStorage.setItem('tubig-mine', JSON.stringify(state.mine)); }catch(e){} }

function hav(a1,o1,a2,o2){
  const R=6371, r=Math.PI/180, dA=(a2-a1)*r, dO=(o2-o1)*r;
  const h=Math.sin(dA/2)**2+Math.cos(a1*r)*Math.cos(a2*r)*Math.sin(dO/2)**2;
  return 2*R*Math.asin(Math.sqrt(h));
}
function bearing(a1,o1,a2,o2){
  const r=Math.PI/180, y=Math.sin((o2-o1)*r)*Math.cos(a2*r),
    x=Math.cos(a1*r)*Math.sin(a2*r)-Math.sin(a1*r)*Math.cos(a2*r)*Math.cos((o2-o1)*r);
  return (Math.atan2(y,x)/r+360)%360;
}
const DIRS=['N','NE','E','SE','S','SW','W','NW'];
const dir = b => DIRS[Math.round(b/45)%8];
const fmt = km => km<1 ? Math.round(km*1000)+' m' : (km<10?km.toFixed(1):Math.round(km))+' km';

// chips
GROUPS.forEach(([k,label])=>{
  const b=document.createElement('button'); b.className='chip'; b.type='button';
  b.textContent=label; b.setAttribute('aria-pressed','true');
  b.onclick=()=>{ state.groups.has(k)?state.groups.delete(k):state.groups.add(k); b.setAttribute('aria-pressed',state.groups.has(k)); render(); };
  $('#chips').appendChild(b);
});
Object.entries(TYPES).forEach(([k,t])=>{ const o=document.createElement('option'); o.value=k; o.textContent=t.n; $('#sType').appendChild(o); });
$('#sType').value='s';

$('#rad').oninput=e=>{ state.r=+e.target.value; $('#radOut').textContent=state.r+' km'; render(); clearTimeout(state.rt); state.rt=setTimeout(fetchLive,800); };

$('#gps').onclick=()=>{
  if(!navigator.geolocation){ status('This browser cannot share location. Type your town instead.'); return; }
  status('Getting your location…');
  navigator.geolocation.getCurrentPosition(
    p=>setHere(p.coords.latitude,p.coords.longitude,'Your location (±'+Math.round(p.coords.accuracy)+' m)'),
    err=>status(err.code===1 ? 'Location is blocked here. Type your town instead, or allow location for this page.' : 'Could not get a GPS fix. Type your town instead.'),
    {enableHighAccuracy:true,timeout:15000,maximumAge:60000});
};

$('#town').oninput=e=>{
  const q=e.target.value.trim().toLowerCase(), ul=$('#sugg'); ul.innerHTML='';
  if(q.length<2) return;
  const hits=D.t.filter(t=>t[0].toLowerCase().startsWith(q)).concat(D.t.filter(t=>!t[0].toLowerCase().startsWith(q)&&t[0].toLowerCase().includes(q))).slice(0,8);
  if(!hits.length){ ul.innerHTML='<li><button type="button" disabled>No town found. Try the municipality name.</button></li>'; return; }
  hits.forEach(t=>{
    const li=document.createElement('li'), b=document.createElement('button'); b.type='button';
    b.textContent=t[0]+(D.p[t[3]]?', '+D.p[t[3]]:'');
    b.onclick=()=>{ ul.innerHTML=''; $('#town').value=b.textContent; setHere(t[1],t[2],'Center of '+b.textContent); };
    li.appendChild(b); ul.appendChild(li);
  });
};

function status(m){ $('#status').textContent=m; }
function setHere(lat,lon,label){ state.here=[lat,lon]; state.label=label; state.sel=null; $('#results').hidden=false; render(); fetchLive(); }

function collect(){
  const [la,lo]=state.here, out=[], dLat=state.r/111, dLon=state.r/(111*Math.cos(la*Math.PI/180));
  const push=(name,a,o,t,prov,src)=>{
    if(Math.abs(a-la)>dLat||Math.abs(o-lo)>dLon) return;
    if(!TYPES[t]||!state.groups.has(TYPES[t].g)) return;
    const km=hav(la,lo,a,o); if(km>state.r) return;
    out.push({name,a,o,t,prov,src,km,b:bearing(la,lo,a,o)});
  };
  D.w.forEach(w=>push(w[0],w[1],w[2],w[3],D.p[w[4]],'GeoNames'));
  const liveSeen=new Set();
  const addLive=w=>{ const k=w.a.toFixed(5)+w.o.toFixed(5); if(liveSeen.has(k)) return; liveSeen.add(k); push(w.name,w.a,w.o,w.t,'','OpenStreetMap'); };
  state.live.forEach(addLive);
  state.areas.forEach(ar=>{ if(hav(la,lo,ar.lat,ar.lon)<=ar.r/1000+state.r) ar.items.forEach(addLive); });
  state.mine.forEach(w=>push(w.name,w.a,w.o,w.t,'', 'Saved by you'));
  // drop OSM duplicates of named built-in entries within 300 m
  const seen=out.filter(x=>x.src!=='OpenStreetMap');
  const res=out.filter(x=>x.src!=='OpenStreetMap'||!seen.some(y=>y.t===x.t&&hav(x.a,x.o,y.a,y.o)<0.3));
  return res.sort((x,y)=>x.km-y.km);
}

function render(){
  if(!state.here) return;
  const all=collect(), shown=all.slice(0,150);
  $('#where').textContent=state.label+' · searching '+state.r+' km';
  const cnt=g=>all.filter(x=>TYPES[x.t].g===g).length;
  $('#summary').innerHTML=`<div><b>${all.length}</b>sources</div>`+
    (all[0]?`<div><b>${fmt(all[0].km)}</b>nearest</div>`:'')+
    `<div><b>${cnt('falls')+cnt('spring')}</b>falls & springs</div>`;
  drawRadar(shown); drawMap(shown);
  const ul=$('#list'); ul.innerHTML='';
  if(!all.length){ ul.innerHTML=`<li class="empty">Nothing within ${state.r} km for the selected types. Widen the radius or turn more types on.</li>`; }
  shown.forEach((x,i)=>{
    const T=TYPES[x.t], S=SAFE[T.s], li=document.createElement('li');
    li.className='item'+(state.sel===i?' sel':''); li.id='it'+i;
    const gm=`https://www.google.com/maps/dir/?api=1&destination=${x.a},${x.o}`;
    li.innerHTML=`<div class="ico" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[T.g]}</svg></div>
      <div><div class="name"></div><div class="meta"></div>
        <span class="tag ${S[0]}">${S[1]}</span>${x.t==='i'?'<span class="tag warn">Can dry up in summer</span>':''}${x.t==='v'||x.t==='i'?'<span class="tag src">Point marks river mouth</span>':''}<span class="tag src">${x.src}</span></div>
      <div class="dist">${fmt(x.km)}<small>${dir(x.b)} ${Math.round(x.b)}°</small></div>
      <div class="acts"><a href="${gm}" target="_blank" rel="noopener">Google Maps directions</a><button type="button" data-f="${i}">Show on map</button><button type="button" data-c="${x.a.toFixed(5)}, ${x.o.toFixed(5)}">Copy coordinates</button></div>`;
    li.querySelector('.name').textContent=x.name||'Unnamed '+T.n.toLowerCase();
    li.querySelector('.meta').textContent=T.n+(x.prov?' in '+x.prov:'');
    ul.appendChild(li);
  });
  ul.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{ const x=shown[+b.dataset.f]; setView('map'); state.map.setView([x.a,x.o],15); state.markers[+b.dataset.f]?.openPopup(); $('#map').scrollIntoView({behavior:'smooth',block:'center'}); });
  ul.querySelectorAll('[data-c]').forEach(b=>b.onclick=async()=>{
    try{ await navigator.clipboard.writeText(b.dataset.c); b.textContent='Copied'; }
    catch(e){ b.textContent=b.dataset.c; }
  });
  if(all.length>150) ul.insertAdjacentHTML('beforeend',`<li class="empty">Showing the nearest 150 of ${all.length}. Shrink the radius to see the rest.</li>`);
}

function drawRadar(items){
  const R=140, svg=$('#radar');
  let h=`<circle r="${R}" fill="var(--water-soft)" stroke="var(--line)"/>`;
  [1/3,2/3].forEach(f=>h+=`<circle r="${R*f}" fill="none" stroke="var(--line)" stroke-dasharray="3 4"/>`);
  h+=`<line x1="0" y1="${-R}" x2="0" y2="${R}" stroke="var(--line)"/><line x1="${-R}" y1="0" x2="${R}" y2="0" stroke="var(--line)"/>`;
  h+=`<text x="0" y="${-R-6}" text-anchor="middle">N</text><text x="${R+6}" y="4">E</text><text x="0" y="${R+15}" text-anchor="middle">S</text><text x="${-R-14}" y="4">W</text>`;
  h+=`<text x="4" y="${-R/3-4}">${fmt(state.r/3)}</text><text x="4" y="${-R*2/3-4}">${fmt(state.r*2/3)}</text>`;
  items.slice().reverse().forEach((x,ri)=>{
    const i=items.length-1-ri, d=x.km/state.r*R, a=x.b*Math.PI/180, cx=Math.sin(a)*d, cy=-Math.cos(a)*d;
    const g=TYPES[x.t].g, big=['falls','spring','tap','res'].includes(g);
    const col= g==='falls'||g==='spring'||g==='tap' ? 'var(--water)' : (g==='res'?'var(--safe)':'var(--muted)');
    h+=`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${state.sel===i?8:(big?5.5:3.2)}" fill="${col}" stroke="var(--card)" stroke-width="1.5" data-i="${i}" style="cursor:pointer"><title>${(x.name||TYPES[x.t].n).replace(/[<&"]/g,'')} · ${fmt(x.km)}</title></circle>`;
  });
  h+=`<circle class="pulse" r="6" fill="var(--you)"/><circle r="6" fill="var(--you)" stroke="var(--card)" stroke-width="2"/>`;
  svg.innerHTML=h;
  svg.querySelectorAll('[data-i]').forEach(c=>c.onclick=()=>{ state.sel=+c.dataset.i; render(); document.getElementById('it'+state.sel)?.scrollIntoView({behavior:'smooth',block:'center'}); });
}

async function fetchLive(){
  if(!state.here) return;
  const [la,lo]=state.here, r=Math.min(state.r,30)*1000, key=la.toFixed(3)+','+lo.toFixed(3)+','+r;
  if(key===state.liveKey) return;
  if(!navigator.onLine){ status('Offline: using built-in data and saved areas.'); render(); return; }
  const around=`(around:${r},${la},${lo})`;
  const q=`[out:json][timeout:25];(nwr["natural"="spring"]${around};nwr["waterway"="waterfall"]${around};node["amenity"="drinking_water"]${around};nwr["man_made"~"^(water_well|water_tower|water_works|reservoir_covered|storage_tank)$"]${around};nwr["natural"="water"]["water"~"^(lake|reservoir|pond|lagoon)$"]${around};nwr["landuse"="reservoir"]${around};);out center tags 400;`;
  status('Checking live OpenStreetMap data…');
  try{
    const ctl=new AbortController(); const tm=setTimeout(()=>ctl.abort(),20000);
    const res=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:'data='+encodeURIComponent(q),signal:ctl.signal});
    clearTimeout(tm);
    if(!res.ok) throw new Error(res.status);
    const j=await res.json();
    state.live=j.elements.map(e=>{
      const t=e.tags||{}, a=e.lat??e.center?.lat, o=e.lon??e.center?.lon;
      let k=null;
      if(t.natural==='spring') k='s'; else if(t.waterway==='waterfall') k='f';
      else if(t.amenity==='drinking_water'||t.man_made==='water_works') k='p';
      else if(t.man_made==='water_well') k='w';
      else if(['water_tower','storage_tank','reservoir_covered'].includes(t.man_made)) k='t';
      else if(t.water==='lake') k='l'; else if(t.water==='pond') k='o'; else if(t.water==='lagoon') k='g';
      else if(t.water==='reservoir'||t.landuse==='reservoir') k='r';
      return k&&a!=null ? {name:t.name||t['name:en']||'',a,o,t:k} : null;
    }).filter(Boolean);
    state.liveKey=key; state.keepView=true;
    status(`Live map added ${state.live.length} extra points (springs, taps, wells, falls).`);
  }catch(e){
    status('Using built-in offline data. Live map data is not reachable here.');
  }
  render();
}

$('#addBtn').onclick=()=>{
  const [la,lo]=state.here;
  $('#dlgWhere').textContent=`Saves at ${la.toFixed(5)}, ${lo.toFixed(5)}. Stand at the source and tap "Use my location" first for an exact spot.`;
  $('#sName').value=''; $('#dlg').showModal();
};
$('#dlg').addEventListener('close',()=>{
  if($('#dlg').returnValue!=='ok') return;
  const n=$('#sName').value.trim(); if(!n) return;
  state.mine.push({name:n,a:state.here[0],o:state.here[1],t:$('#sType').value});
  saveMine(); render(); status('Saved. It stays on this phone.');
});

// ---- map ----
const COLORS={falls:'#0B7699',spring:'#0B7699',tap:'#2C7A4B',res:'#2C7A4B',lake:'#3F6E8C',river:'#6E8792'};
function initMap(){
  state.map=L.map('map',{zoomControl:true}).setView([11.6,122.5],6);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(state.map);
  state.layer=L.layerGroup().addTo(state.map);
}
function esc(t){ return String(t).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function drawMap(items){
  if(!state.map) return;
  state.layer.clearLayers(); state.markers=[];
  const [la,lo]=state.here;
  L.circle([la,lo],{radius:state.r*1000,color:'#0B7699',weight:1,fillOpacity:.04}).addTo(state.layer);
  L.circleMarker([la,lo],{radius:8,color:'#fff',weight:2,fillColor:'#C8432B',fillOpacity:1}).bindPopup('You are here').addTo(state.layer);
  items.forEach((x,i)=>{
    const T=TYPES[x.t], big=['falls','spring','tap','res'].includes(T.g);
    const m=L.circleMarker([x.a,x.o],{radius:big?8:5,color:'#fff',weight:1.5,fillColor:COLORS[T.g],fillOpacity:.95})
      .bindPopup(`<b>${esc(x.name||'Unnamed '+T.n.toLowerCase())}</b><br>${T.n} · ${fmt(x.km)} ${dir(x.b)}<br>${SAFE[T.s][1]}<br><a href="https://www.google.com/maps/dir/?api=1&destination=${x.a},${x.o}" target="_blank" rel="noopener">Directions in Google Maps</a>`)
      .addTo(state.layer);
    state.markers.push(m);
  });
  const z=state.r<=3?14:state.r<=7?13:state.r<=15?12:state.r<=35?11:state.r<=70?10:9;
  if(!state.keepView) state.map.setView([la,lo],z);
  state.keepView=false;
  setTimeout(()=>state.map.invalidateSize(),50);
}
function setView(v){
  state.view=v; $('#tMap').setAttribute('aria-selected',v==='map'); $('#tRad').setAttribute('aria-selected',v==='radar');
  $('#map').hidden=v!=='map'; $('#radar').hidden=v!=='radar';
  if(v==='map') setTimeout(()=>state.map&&state.map.invalidateSize(),50);
}
$('#tMap').onclick=()=>setView('map'); $('#tRad').onclick=()=>setView('radar');
if(typeof L!=='undefined') initMap(); else { setView('radar'); $('#tMap').disabled=true; }

// ---- save area offline ----
$('#saveArea').onclick=async()=>{
  state.liveKey=''; await fetchLive();
  if(!state.live.length){ status('Could not reach the live map. Connect to the internet, then save the area.'); return; }
  const [la,lo]=state.here;
  state.areas=state.areas.filter(a=>hav(a.lat,a.lon,la,lo)>1);
  state.areas.push({lat:la,lon:lo,r:Math.min(state.r,30)*1000,ts:Date.now(),items:state.live});
  status(saveAreas()?`Saved ${state.live.length} live sources around ${state.label.replace('Center of ','')} for offline use. Pan the map once to keep its tiles too.`:'Phone storage is full. Remove old data and try again.');
};

// ---- online/offline + install ----
const net=()=>document.body.classList.toggle('is-offline',!navigator.onLine);
addEventListener('online',net); addEventListener('offline',net); net();
let deferred=null;
addEventListener('beforeinstallprompt',e=>{ e.preventDefault(); deferred=e; $('#install').style.display='inline-block'; });
$('#install').onclick=async()=>{ if(!deferred) return; deferred.prompt(); await deferred.userChoice; deferred=null; $('#install').style.display='none'; };
if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});

// ---- load data ----
status('Loading water sources…');
fetch('data.json').then(r=>r.json()).then(d=>{ D=d; status(state.areas.length?`Ready. ${state.areas.length} saved offline area(s).`:'Ready. Choose your location to start.'); if(state.here) render(); })
  .catch(()=>status('Could not load water data. Open the app once while online.'));
