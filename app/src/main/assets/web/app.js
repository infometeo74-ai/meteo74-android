/* Météo74 · Android 0.7.2 · Interface embarquée, données publiques en ligne. */
(()=>{'use strict';
const C=window.MeteoCore,$=id=>document.getElementById(id);
const PRESETS=[{name:'Reignier-Ésery',latitude:46.13333,longitude:6.26667,admin2:'Haute-Savoie'},{name:'Annecy',latitude:45.8992,longitude:6.1294,admin2:'Haute-Savoie'},{name:'Annemasse',latitude:46.1944,longitude:6.2377,admin2:'Haute-Savoie'},{name:'Thonon-les-Bains',latitude:46.3705,longitude:6.4798,admin2:'Haute-Savoie'},{name:'Chamonix',latitude:45.9237,longitude:6.8694,admin2:'Haute-Savoie'},{name:'Sallanches',latitude:45.936,longitude:6.632,admin2:'Haute-Savoie'}];
const TTL=15*60*1000,storage={get(k,f){try{return JSON.parse(localStorage.getItem('meteo74.'+k))??f;}catch{return f;}},set(k,v){try{localStorage.setItem('meteo74.'+k,JSON.stringify(v));}catch{}},remove(k){try{localStorage.removeItem('meteo74.'+k);}catch{}}};
const saved=storage.get('place',null);
const oldFavorites=storage.get('favorites',null);
const oldGPS=p=>p?.name==='Ma position'||p?.admin2==='Position du téléphone';
const previous=Array.isArray(oldFavorites)?oldFavorites:(C.validPlace(saved)&&!oldGPS(saved)?[saved]:[]);
const lastPosition=storage.get('last-position',null);
const following=storage.get('follow-position',false)===true;
// An old saved GPS fix is a stationary favorite until the user selects live location.
const favorites=previous.filter(C.validPlace).slice(0,12).map(p=>
    oldGPS(p)?{...p,name:'Position enregistrée',admin2:''}:p);
if(previous.some(oldGPS))storage.set('favorites',favorites);
const state={place:C.validPlace(saved)?saved:null,favorites,following,position:C.validPlace(lastPosition)?lastPosition:null,
    selectedLocation:following&&storage.get('selected-location',oldGPS(saved)),view:'now',data:null,fetchedAt:0,
    searchController:null,searchTimer:null,searchSeq:0,geoMessage:'',geoDenied:false,homeScroll:0};
const paths={snowflake:'<path d="M12 2v20M3.4 7l17.2 10M3.4 17L20.6 7M9 4l3 2 3-2M9 20l3-2 3 2M4 10l1-3 3-1M16 18l3-1 1-3M4 14l1 3 3 1M16 6l3 1 1 3"/>',tracks:'<path d="m4 18 6-12m-1 14 7-14m-2 14 6-12"/>',camera:'<rect x="3" y="7" width="18" height="13" rx="3"/><path d="m7 7 2-3h6l2 3"/><circle cx="12" cy="13" r="3"/>',map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5Z"/><path d="M9 3v16m6-14v16"/>',mountain:'<path d="m2 19 7.3-13L14 14l2.6-4.4L22 19H2Z"/><path d="m6.8 10.4 2.5 2.1 2.1-2.1"/>',settings:'<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z"/><circle cx="12" cy="12" r="3"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',moon:'<path d="M20.8 14.5A9 9 0 0 1 9.5 3.2 9 9 0 1 0 20.8 14.5Z"/>',pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.2"/>',chevron:'<path d="m9 5 7 7-7 7"/>',star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5M5.6 7A7.5 7.5 0 0 1 19 8l1 4M4 12l1 4a7.5 7.5 0 0 0 13.4 1"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.2"/>',wind:'<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h6a3 3 0 1 1-3 3"/>',drop:'<path d="M12 3S5 10 5 15a7 7 0 0 0 14 0c0-5-7-12-7-12Z"/>',thermometer:'<path d="M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Zm3-6v9"/>',radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18 5M12 3v2m9 7h-2m-7 7v2M3 12h2"/><circle cx="12" cy="12" r="1"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v5m10-5v5M3 11h18m-13 5h1m6 0h1"/>',locate:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',play:'<path d="m8 5 11 7-11 7Z"/>',pause:'<path d="M9 5v14m6-14v14"/>',plus:'<path d="M12 5v14M5 12h14"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',sunrise:'<path d="M3 17h18M1 21h22M7 17a5 5 0 0 1 10 0M12 3v5m-3-2 3-3 3 3M3 11l2 2m14 0 2-2"/>',pressure:'<circle cx="12" cy="12" r="9"/><path d="m12 12 4-5M5 12h1m12 0h1M12 5v1M7 18h10"/>',trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>'};
const icon=name=>'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+(paths[name]||paths.info)+'</svg>';
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}icons();
function escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
// Give the transparent collection a distinct asset URL on devices updating from 0.7.1.
const weatherImage=file=>'assets/weather/hd/'+file+'?v=transparent-1';
function weather(code,day=true,cloud,precip,details){
 const id=C.weatherSymbol(code,day,cloud,precip,details),label=escape(C.condition(code,day,cloud,precip,details).label);
 if(!id)return '<span class="weather-icon weather-unavailable" role="img" aria-label="'+label+'">—</span>';
 return '<img class="weather-icon" src="'+weatherImage(id+'.webp')+'" width="384" height="384" alt="'+label+'" decoding="async">';
}
const collection=$('artwork-collection');
collection.addEventListener('toggle',async()=>{
 const gallery=$('artwork-gallery');
 if(!collection.open||gallery.dataset.loaded)return;
 gallery.dataset.loaded='loading';
 try{
  const response=await fetch('assets/weather/collection.json');
  if(!response.ok)throw Error();
  const entries=await response.json();
  const fragment=document.createDocumentFragment();
  for(const item of entries){
   const figure=document.createElement('figure'),caption=document.createElement('figcaption'),img=new Image();
   caption.textContent=item.label;img.src=weatherImage(item.file);img.width=384;img.height=384;
   img.alt='';img.loading='lazy';img.decoding='async';figure.title=item.label;
   figure.append(caption,img);fragment.append(figure);
  }
  gallery.replaceChildren(fragment);gallery.dataset.loaded='yes';
 }catch{
  delete gallery.dataset.loaded;
  gallery.textContent='La collection n’a pas pu être ouverte. Refermez puis rouvrez la collection pour réessayer.';
 }
});
function notice(msg){$('status').textContent=msg||'';$('status').hidden=!msg;}
let toastTimer;function toast(msg){$('toast').textContent=msg;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3000);}
function openDialog(id){const d=$(id);if(!d.open)d.showModal();}
function closeDialog(d){d.close();if(d.id==='search-dialog'){clearTimeout(state.searchTimer);state.searchController?.abort();state.searchSeq++;}}
document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>closeDialog(b.closest('dialog'))));
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog(d);}}));
$('about').onclick=()=>openDialog('about-dialog');
$('app-update').onclick=e=>{if(!navigator.userAgent.includes('Meteo74Android/')){e.preventDefault();toast('La mise à jour est disponible dans l’application Android.');}};
const equal=(a,b)=>C.validPlace(a)&&C.validPlace(b)&&C.placeKey(a)===C.placeKey(b);
const entries=()=>[...(state.following?[{key:'location',place:state.position}]:[]),...state.favorites.map(p=>({key:C.placeKey(p),place:p}))];
const stationsById=new Map(SnowStations.stations.map(s=>[s.id,s]));
const savedStations=storage.get('snow.favorites',[]);
state.stationIds=Array.isArray(savedStations)?[...new Set(savedStations.filter(id=>stationsById.has(id)))]:[];
const homeEntries=()=>[...entries(),...state.stationIds.map(id=>({key:'ski:'+id,station:stationsById.get(id)}))];
function pinStation(id){
    if(!stationsById.has(id))return;
    const remove=state.stationIds.includes(id);
    state.stationIds=remove?state.stationIds.filter(k=>k!==id):[...state.stationIds,id];
    storage.set('snow.favorites',state.stationIds);renderPlaces();
    toast(stationsById.get(id).name+(remove?' retiré de l’accueil':' ajouté à l’accueil'));
}
const homeNodes=new Map(), busy=new Map(), errors=new Map();
let refreshSequence=0;
function makeCard(key,clickable) {
    const node=$('weather-card').content.firstElementChild.cloneNode(true);
    icons(node);
    if(clickable){
        const hit=document.createElement('button');
        hit.type='button';hit.className='card-hit';hit.dataset.key=key;
        node.append(hit);
    }
    return node;
}
function paintCard(node,entry,record) {
    const following=entry.key==='location',p=entry.place;
    const field=n=>node.querySelector('[data-field="'+n+'"]');
    const town=p?.name||'Ma position';
    field('town').textContent=town;
    field('following').hidden=!following||town==='Ma position';
    const hit=node.querySelector('.card-hit');
    if(hit)hit.setAttribute('aria-label','Météo détaillée · '+(following&&town!=='Ma position'?'Ma position, ':'')+town);
    const d=record?.data,c=d?.current,a=d?.daily,di=d?todayIndex(d):-1;
    const stale=d&&Date.now()/1000-c.time>7200;
    node.classList.toggle('is-night',c?.is_day===0);
    field('date').textContent=c?(stale?'Données du ':'')+C.date(c.time,d.timezone,{day:'numeric',month:'short'})+' · '+C.clock(c.time,d.timezone):'';
    field('temperature').innerHTML=(c?C.fmt(c.temperature_2m):'—')+'<sup>°</sup>';
    field('condition').textContent=c?C.condition(c.weather_code,c.is_day!==0,c.cloud_cover,c.precipitation,c).label:!p?'Recherche de la position…':errors.get(C.placeKey(p))||'Chargement…';
    field('feels').textContent=following&&state.geoMessage?state.geoMessage:c?'Ressenti '+C.fmt(c.apparent_temperature)+'° · '+C.fmt(d.elevation)+' m':'';
    field('symbol').innerHTML=c?weather(c.weather_code,c.is_day!==0,c.cloud_cover,c.precipitation,c):'';
    field('wind').textContent=c?C.fmt(c.wind_speed_10m)+' km/h':'—';
    field('humidity').textContent=c?C.fmt(c.relative_humidity_2m)+' %':'—';
    field('range').textContent=di<0?'—':C.fmt(a.temperature_2m_min[di])+'° / '+C.fmt(a.temperature_2m_max[di])+'°';
}
function paintHomeEntry(entry) {
    const node=homeNodes.get(entry.key);
    if(!node)return;
    if(entry.station)winter.paintHome(node,entry.station);
    else paintCard(node,entry,entry.place&&cached(entry.place));
}
function renderPlaces() {
    const list=homeEntries(), live=new Set(list.map(e=>e.key));
    for(const [k,node] of homeNodes)if(!live.has(k)){node.remove();homeNodes.delete(k);}
    const container=$('home-cards');
    list.forEach((e,i)=>{
        let node=homeNodes.get(e.key);
        if(!node){node=makeCard(e.key,true);homeNodes.set(e.key,node);}
        if(container.children[i]!==node)container.insertBefore(node,container.children[i]||null);
        paintHomeEntry(e);
    });
    $('home-empty').hidden=list.length>0;
    $('home-tools').hidden=!list.length;
    $('favorites-list').innerHTML=list.length?list.map(e=>{
        const label=e.key==='location'?'Ma position':e.station?.name||e.place.name;
        const sub=e.station?(e.station.kind==='fond'?'Ski de fond':'Ski alpin'):e.key==='location'?e.place?.name||'Position du téléphone':e.place.admin2||e.place.country||'Commune enregistrée';
        return '<div class="favorite-row"><button class="favorite-choose" data-open="'+e.key+'"><span>'+icon(e.station?'mountain':e.key==='location'?'locate':'pin')+'</span><span><b>'+escape(label)+'</b><small>'+escape(sub)+'</small></span></button><button class="icon-button" data-delete="'+e.key+'" aria-label="Retirer '+escape(label)+'">'+icon('trash')+'</button></div>';
    }).join(''):'<button class="place-action" data-add>Ajouter une ville</button>';
    updateCredits();
}
function updateCredits(){
    const show=state.view==='now'?(state.stationIds.length>0||entries().some(e=>e.place&&cached(e.place))):['detail','forecast'].includes(state.view)&&!!state.data;
    $('weather-source').hidden=!show;$('weather-credits').hidden=!show;
}
function selectEntry(e){
    if(!e)return;
    state.selectedLocation=e.key==='location';state.place=e.place;
    storage.set('selected-location',state.selectedLocation);
    if(state.place)storage.set('place',state.place);
}
function activeEntry() {
    const list=entries();
    return list.find(e=>state.selectedLocation?e.key==='location':e.key!=='location'&&equal(e.place,state.place))||list[0]||null;
}
function openEntry(key){
    if(key.startsWith('ski:')&&stationsById.has(key.slice(4))){switchView('snow',key.slice(4));return;}
    const entry=entries().find(e=>e.key===key);
    if(!entry)return;
    if(!entry.place){startFollowing();return;}
    selectEntry(entry);radar.placeChanged();
    switchView('detail');
}
$('home-cards').onclick=e=>{const b=e.target.closest('[data-key]');if(b)openEntry(b.dataset.key);};
$('manage-places').onclick=()=>openDialog('places-dialog');
$('favorites-list').onclick=e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.open){closeDialog($('places-dialog'));openEntry(b.dataset.open);return;}
    const key=b.dataset.delete;if(!key)return;
    if(key.startsWith('ski:')){pinStation(key.slice(4));if(!homeEntries().length)closeDialog($('places-dialog'));return;}
    if(key==='location'){
        locationWatch.stop();state.following=false;state.position=null;state.geoMessage='';state.geoDenied=false;
        storage.set('follow-position',false);storage.remove('last-position');
    }else state.favorites=state.favorites.filter(p=>C.placeKey(p)!==key);
    storage.set('favorites',state.favorites);
    const next=activeEntry();
    if(next)selectEntry(next);else{state.place=null;state.selectedLocation=false;storage.remove('place');storage.remove('selected-location');}
    renderPlaces();radar.placeChanged();
    if(!homeEntries().length)closeDialog($('places-dialog'));
};
function cached(p){const c=storage.get('weather.'+C.placeKey(p),null);return c&&C.validForecast(c.data)&&C.finite(c.fetchedAt)?c:null;}
function saveWeather(p,data){const key=C.placeKey(p),fetchedAt=Date.now();storage.set('weather.'+key,{data,fetchedAt});let keys=storage.get('weather-index',[]);if(!Array.isArray(keys))keys=[];keys=keys.filter(k=>k!==key);keys.push(key);while(keys.length>16)storage.remove('weather.'+keys.shift());storage.set('weather-index',keys);return fetchedAt;}
async function fetchJSON(url,signal,timeout=30000,headers){const ctl=new AbortController(),abort=()=>ctl.abort();if(signal?.aborted)ctl.abort();else signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,timeout);try{const r=await fetch(url,{headers,signal:ctl.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw Error(r.status===429?'Le service est très sollicité. Réessayez dans quelques instants.':'Le service météo ne répond pas.');const data=await r.json();if(data.error)throw Error('Données indisponibles pour cette commune.');return data;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}}
function ensureWeather(p,force=false) {
    const key=C.placeKey(p),old=cached(p);
    if(busy.has(key))return busy.get(key);
    if(!force&&old&&Date.now()-old.fetchedAt<TTL)return Promise.resolve(old);
    const task=(async()=>{
        try{
            if(!navigator.onLine)throw Error('Sans réseau');
            const data=await fetchJSON(C.forecastURL(p));
            if(!C.validForecast(data))throw Error('Réponse météo incomplète.');
            const fetchedAt=saveWeather(p,data);errors.delete(key);
            return {data,fetchedAt};
        }catch(e){errors.set(key,navigator.onLine?'Météo indisponible':'Sans réseau');return old;}
        finally{queueMicrotask(()=>busy.delete(key));}
    })();
    busy.set(key,task);return task;
}
async function loadHome(force=false) {
    const seq=++refreshSequence,list=entries().filter(e=>e.place);
    if(force)$('refresh').classList.add('busy');
    let i=0;
    async function next(){
        while(i<list.length&&seq===refreshSequence){
            const e=list[i++];await ensureWeather(e.place,force);
            if(seq!==refreshSequence)return;
            const current=entries().find(x=>x.key===e.key);
            if(current)paintHomeEntry(current);
        }
    }
    const snow= winter.loadHome(state.stationIds.map(id=>stationsById.get(id)),force,s=>{
        if(seq===refreshSequence)paintHomeEntry({key:'ski:'+s.id,station:s});
    });
    await Promise.all([snow,...Array.from({length:Math.min(list.length,3)},next)]);
    if(seq===refreshSequence){$('refresh').classList.remove('busy');updateCredits();}
}
function renderFocus(p,record){
    state.data=record?.data||null; state.fetchedAt=record?.fetchedAt||0;
    const e={key:state.selectedLocation?'location':C.placeKey(p),place:p};
    const node=$('detail-card').firstElementChild||makeCard(e.key,false);
    if(!node.parentElement)$('detail-card').append(node);
    paintCard(node,e,record);$('forecast-place').textContent=p.name+' ▾';
    if(record)renderWeather();
    else{
        const label=errors.get(C.placeKey(p))||'Chargement des prévisions…';
        for(const id of ['hourly','daily-list'])$(id).innerHTML='<p class="empty-text">'+escape(label)+'</p>';
        $('temperature-chart').replaceChildren();$('details').replaceChildren();
    }
    updateCredits();
}
async function loadFocus(force=false) {
    const current=activeEntry();
    if(!current?.place){
        state.data=null;$('forecast-place').textContent='Choisir un lieu';
        $('daily-list').innerHTML='<div class="forecast-empty"><button class="place-action primary" data-follow>Ma position</button><button class="place-action" data-add>Ajouter une ville</button></div>';
        updateCredits();return;
    }
    selectEntry(current);
    const p=current.place,seq=++refreshSequence;
    renderFocus(p,cached(p));
    const data=await ensureWeather(p,force);
    if(seq!==refreshSequence||!equal(p,state.place))return;
    renderFocus(state.place,data);
    if(errors.has(C.placeKey(p)))notice(data?'Dernières prévisions enregistrées.':'Météo indisponible. Touchez Actualiser pour réessayer.');
}
function todayIndex(d){const now=C.date(Date.now()/1000,d.timezone,{year:'numeric',month:'2-digit',day:'2-digit'});return d.daily.time.findIndex(t=>C.date(t,d.timezone,{year:'numeric',month:'2-digit',day:'2-digit'})===now);}
function renderWeather(){const d=state.data;if(!d)return;const c=d.current,tz=d.timezone,di=todayIndex(d),a=d.daily;
 const hours=C.hours(d);$('hourly').innerHTML=hours.length?hours.map((h,i)=>'<article class="hour-card"><span>'+C.date(h.time,tz,{hour:'2-digit'})+'</span>'+weather(h.code,h.isDay,h.cloud,h.precip,h.details)+'<strong>'+C.fmt(h.temperature)+'°</strong><span class="rain-prob">'+icon('drop')+C.fmt(h.probability)+' %</span></article>').join(''):'<p class="empty-text">Les prévisions enregistrées ne couvrent plus les prochaines heures. Actualisez la météo.</p>';
 drawChart(hours,tz);
 const uv=di<0?null:a.uv_index_max[di],uvLabel=!C.finite(uv)?'Non disponible':uv<3?'Faible':uv<6?'Modéré':uv<8?'Élevé':uv<11?'Très élevé':'Extrême';
 const detail=(symbol,title,value,unit,sub)=>'<article class="detail-card"><div class="detail-label">'+icon(symbol)+title+'</div><div class="detail-value">'+value+'<small>'+unit+'</small></div><p>'+sub+'</p></article>';
 $('details').innerHTML=detail('wind','Vent',C.fmt(c.wind_speed_10m),'km/h',C.direction(c.wind_direction_10m)+' · rafales '+C.fmt(c.wind_gusts_10m)+' km/h')+detail('drop','Précipitations du jour',C.fmt(di<0?null:a.precipitation_sum[di],1),'mm','Probabilité max. '+C.fmt(di<0?null:a.precipitation_probability_max[di])+' %')+detail('sun','Indice UV',C.fmt(uv,1),'',uvLabel)+detail('sunrise','Lever du soleil',C.clock(di<0?null:a.sunrise[di],tz),'','Coucher à '+C.clock(di<0?null:a.sunset[di],tz))+detail('drop','Humidité',C.fmt(c.relative_humidity_2m),'%','Humidité relative estimée')+detail('pressure','Pression',C.fmt(c.pressure_msl),'hPa','Ramenée au niveau de la mer');
 renderDaily(d,di);
}
function drawChart(hours,tz){const s=C.scale(hours.map(h=>h.temperature));if(!s){$('temperature-chart').innerHTML='<p class="chart-empty">Courbe indisponible.</p>';return;}const width=340,height=116,x=i=>27+i*(300/Math.max(1,hours.length-1)),y=v=>85-s.ratio(v)*63;
 let path='',previous=false;hours.forEach((h,i)=>{if(C.finite(h.temperature)){path+=(previous?'L':'M')+x(i).toFixed(1)+','+y(h.temperature).toFixed(1)+' ';previous=true;}else previous=false;});
 let svg='<svg class="temp-chart" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Températures horaires entre '+C.fmt(s.low)+' et '+C.fmt(s.high)+' degrés">';
 [s.low,(s.low+s.high)/2,s.high].forEach(v=>svg+='<line x1="27" y1="'+y(v)+'" x2="327" y2="'+y(v)+'" stroke="#e9f0f4"/><text x="0" y="'+(y(v)+3)+'">'+C.fmt(v)+'°</text>');svg+='<path d="'+path+'" fill="none" stroke="#438eb7" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
 [...new Set([0,Math.floor((hours.length-1)/3),Math.floor(2*(hours.length-1)/3),hours.length-1])].forEach(i=>{const h=hours[i];svg+='<text x="'+x(i)+'" y="107" text-anchor="middle">'+C.date(h.time,tz,{hour:'2-digit'})+'</text>';if(C.finite(h.temperature))svg+='<circle cx="'+x(i)+'" cy="'+y(h.temperature)+'" r="3" fill="white" stroke="#438eb7" stroke-width="2"/>';});svg+='</svg>';$('temperature-chart').innerHTML=svg;
}
function renderDaily(d,di){const a=d.daily,tz=d.timezone,sc=C.scale([...a.temperature_2m_min,...a.temperature_2m_max]);$('daily-list').innerHTML=a.time.map((t,i)=>{if(di>=0&&i<di)return '';const lo=a.temperature_2m_min[i],hi=a.temperature_2m_max[i],cloud=C.dailyCloud(d,i),co=C.condition(a.weather_code[i],true,cloud);const left=sc&&C.finite(lo)?Math.max(0,100*sc.ratio(lo)):0,range=sc&&C.finite(lo)&&C.finite(hi)?Math.max(3,100*(hi-lo)/(sc.high-sc.low)):0;
 return '<details class="daily-row"><summary aria-label="'+escape(C.date(t,tz,{weekday:'long',day:'numeric',month:'long'})+', '+co.label+', '+C.fmt(lo)+' à '+C.fmt(hi)+' degrés')+'"><span class="daily-date"><b>'+(i===di?'Aujourd’hui':i===di+1&&di>=0?'Demain':C.date(t,tz,{weekday:'long'}))+'</b><small>'+C.date(t,tz,{day:'numeric',month:'short'})+'</small></span>'+weather(a.weather_code[i],true,cloud)+'<span class="rain-prob">'+C.fmt(a.precipitation_probability_max[i])+' %</span><span class="daily-range"><span>'+C.fmt(lo)+'°</span><span class="range-track"><span class="range-fill" style="left:'+left+'%;width:'+range+'%"></span></span><span>'+C.fmt(hi)+'°</span></span></summary><div class="daily-extra"><strong>'+co.label+'</strong><div class="daily-extra-grid"><span>Pluie / neige : '+C.fmt(a.precipitation_sum[i],1)+' mm</span><span>UV maximum : '+C.fmt(a.uv_index_max[i],1)+'</span><span>Vent max. : '+C.fmt(a.wind_speed_10m_max[i])+' km/h</span><span>Rafales : '+C.fmt(a.wind_gusts_10m_max[i])+' km/h</span><span>Lever : '+C.clock(a.sunrise[i],tz)+'</span><span>Coucher : '+C.clock(a.sunset[i],tz)+'</span></div></div></details>';}).join('')||'<p class="empty-text">Actualisez les prévisions.</p>';}
function switchView(view,stationId){
    if(!['now','detail','map','radar','forecast','snow','webcams'].includes(view))return;
    const before=state.view;
    if(before==='snow'&&view!=='snow')winter.leave();
    if(before==='webcams'&&view!=='webcams')webcams.leave();
    if(before==='map'&&view!=='map')observations.leave();
    if(before==='now'&&view!=='now'){state.homeScroll=window.scrollY;winter.stopHome();}
    state.view=view;++refreshSequence;notice('');$('refresh').classList.remove('busy');
    document.body.classList.toggle('radar-active',view==='radar');
    document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!=='view-'+view);
    const tab=view==='detail'?'now':view;
    document.querySelectorAll('.bottom-nav button').forEach(b=>{
        const active=b.dataset.view===tab;b.classList.toggle('active',active);
        if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');
    });
    if(view==='radar')radar.enter();else radar.leave();
    if(view==='map')observations.enter();
    if(view==='now'){renderPlaces();loadHome();}else if(view==='detail'||view==='forecast')loadFocus();
    updateCredits();
    window.scrollTo(0,view==='now'&&before!=='now'?state.homeScroll:0);
    if(view==='snow')winter.enter(stationId);
    if(view==='webcams')webcams.enter();
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
$('back-places').onclick=()=>switchView('now');
$('forecast-place').onclick=()=>openSearch();
function suggestedPlaces(){
    return [...state.favorites,...PRESETS].filter((p,i,a)=>a.findIndex(q=>equal(p,q))===i);
}
function openSearch(){
    $('search-input').value='';state.searchSeq++;showResults(suggestedPlaces());openDialog('search-dialog');
}
document.addEventListener('click',e=>{
    if(e.target.closest('[data-stations]'))switchView('snow');
    if(e.target.closest('[data-add]'))openSearch();
    if(e.target.closest('[data-follow]'))startFollowing();
});
function showResults(list){
    $('search-results').innerHTML=list.length?list.map((p,i)=>'<button class="search-result" data-result="'+i+'"><span><b>'+escape(p.name)+'</b><small>'+escape([p.admin2,p.admin1,p.country].filter(Boolean).join(' · '))+'</small></span>'+icon('chevron')+'</button>').join(''):'<p class="empty-text">Aucune commune trouvée. Essayez un nom voisin ou un code postal.</p>';
    $('search-results').querySelectorAll('button').forEach(b=>b.onclick=()=>{
        const p=list[+b.dataset.result];
        if(!state.favorites.some(f=>equal(f,p))){
            if(entries().length>=12){toast('Limite de 12 favoris atteinte.');return;}
            state.favorites.push(p);storage.set('favorites',state.favorites);
        }
        selectEntry({key:C.placeKey(p),place:p});
        closeDialog($('search-dialog'));renderPlaces();radar.placeChanged();switchView(state.view==='forecast'?'forecast':'now');
        if(state.view==='now')homeNodes.get(C.placeKey(p))?.scrollIntoView({block:'nearest'});
    });
}
$('search-input').addEventListener('input',()=>{clearTimeout(state.searchTimer);state.searchController?.abort();const seq=++state.searchSeq,q=$('search-input').value.trim();if(q.length<2){showResults(suggestedPlaces());return;}$('search-results').innerHTML='<p class="empty-text">Recherche…</p>';state.searchTimer=setTimeout(async()=>{state.searchController=new AbortController();try{const d=await fetchJSON('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:q,count:'15',language:'fr',format:'json',countryCode:'FR'}),state.searchController.signal,12000);if(seq!==state.searchSeq)return;const list=(d.results||[]).filter(C.validPlace).sort((a,b)=>Number(b.admin2==='Haute-Savoie')-Number(a.admin2==='Haute-Savoie'));showResults(list);}catch(e){if(seq===state.searchSeq)$('search-results').innerHTML='<p class="empty-text">Recherche indisponible. Vérifiez la connexion ou choisissez une commune déjà enregistrée.</p>'; }},350);});
const locationWatch=MeteoLocation.create({fetchJSON,onPosition(p){
    if(!state.following)return;
    const moved=!equal(p,state.position),renamed=p.name!==state.position?.name;
    state.position=p;state.geoMessage='';state.geoDenied=false;storage.set('last-position',p);
    if(!moved&&!renamed){paintHomeEntry({key:'location',place:p});return;}
    if(state.selectedLocation){selectEntry({key:'location',place:p});if(moved)radar.placeChanged();}
    renderPlaces();
    if(state.view==='now')loadHome();
    else if(state.selectedLocation&&['detail','forecast'].includes(state.view))loadFocus();
},onError(message,denied){
    state.geoMessage=message;state.geoDenied=denied;
    if(denied&&!state.position){state.following=false;state.selectedLocation=false;storage.set('follow-position',false);}
    renderPlaces();if(denied||!state.position)toast(message);
}});
function startFollowing(){
    if(!state.following&&entries().length>=12){toast('Limite de 12 favoris atteinte.');return;}
    if($('search-dialog').open)closeDialog($('search-dialog'));
    state.following=true;state.geoDenied=false;state.geoMessage='';storage.set('follow-position',true);
    selectEntry({key:'location',place:state.position});
    renderPlaces();switchView('now');window.scrollTo(0,0);locationWatch.start(true);
}
const observations=MeteoObservations.create({$,icon,escape,fetchJSON,storage,service:MeteoService});
const webcams=MeteoWebcams.create({$,icon,escape,openDialog,catalog:MeteoWebcamCatalog,normalize:C.normalizeSearch});
const winter=MeteoSnow.create({$,C,storage,icon,weather,escape,fetchJSON,catalog:SnowStations,service:MeteoService,observations,isPinned:id=>state.stationIds.includes(id),pinStation,goHome:()=>switchView('now')});
const radar=MeteoRadar.create({$,C,storage,icon,escape,fetchJSON,place:()=>activeEntry()?.place||null});
function refresh(force=false){
    notice('');
    if(state.view==='radar'){if(force)radar.refresh();else radar.resume();}
    else if(state.view==='map')observations.refresh(force);
    else if(state.view==='snow')winter.refresh(force);
    else if(state.view==='webcams')webcams.refresh(force);
    else if(state.view==='now')loadHome(force);
    else if(state.view==='forecast'||state.view==='detail')loadFocus(force);
}
$('refresh').onclick=()=>{
    if(state.following&&!state.geoDenied)locationWatch.start();
    refresh(true);
};
function pause(){locationWatch.pause();radar.suspend();observations.suspend();}
function resume(){
    if(document.hidden)return;
    locationWatch.resume();if(state.following&&!state.geoDenied)locationWatch.start();
    refresh();
}
window.meteoApp={back(){
    const d=document.querySelector('dialog[open]');if(d){closeDialog(d);return true;}
    if(state.view==='snow'&&winter.back())return true;
    if(state.view!=='now'){switchView('now');return true;}return false;
},pause,resume};
document.addEventListener('visibilitychange',()=>document.hidden?pause():resume());
window.addEventListener('offline',()=>{if(state.view!=='map'&&homeEntries().length)notice('Sans réseau · dernières prévisions enregistrées.');});
window.addEventListener('online',()=>refresh(true));
renderPlaces();resume();
})();
