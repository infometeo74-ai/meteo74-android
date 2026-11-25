/* Météo74 · Android 0.3.4 · Interface embarquée, données publiques en ligne. */
(()=>{'use strict';
const C=window.MeteoCore,$=id=>document.getElementById(id);
const PRESETS=[{name:'Reignier-Ésery',latitude:46.13333,longitude:6.26667,admin2:'Haute-Savoie'},{name:'Annecy',latitude:45.8992,longitude:6.1294,admin2:'Haute-Savoie'},{name:'Annemasse',latitude:46.1944,longitude:6.2377,admin2:'Haute-Savoie'},{name:'Thonon-les-Bains',latitude:46.3705,longitude:6.4798,admin2:'Haute-Savoie'},{name:'Chamonix',latitude:45.9237,longitude:6.8694,admin2:'Haute-Savoie'},{name:'Sallanches',latitude:45.936,longitude:6.632,admin2:'Haute-Savoie'}];
const TTL=15*60*1000,storage={get(k,f){try{return JSON.parse(localStorage.getItem('meteo74.'+k))??f;}catch{return f;}},set(k,v){try{localStorage.setItem('meteo74.'+k,JSON.stringify(v));}catch{}},remove(k){try{localStorage.removeItem('meteo74.'+k);}catch{}}};
let saved=storage.get('place',PRESETS[0]);if(!C.validPlace(saved))saved=PRESETS[0];
let fav=storage.get('favorites',[PRESETS[0],PRESETS[1]]);if(!Array.isArray(fav))fav=[];
const state={place:saved,favorites:fav.filter(C.validPlace).slice(0,12),view:'now',data:null,fetchedAt:0,request:0,controller:null,searchController:null,searchTimer:null,searchSeq:0};
const paths={settings:'<path d="M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1Z"/><circle cx="12" cy="12" r="3"/>',sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',moon:'<path d="M20.8 14.5A9 9 0 0 1 9.5 3.2 9 9 0 1 0 20.8 14.5Z"/>',pin:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.2"/>',chevron:'<path d="m9 5 7 7-7 7"/>',star:'<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"/>',refresh:'<path d="M20 7v5h-5M4 17v-5h5M5.6 7A7.5 7.5 0 0 1 19 8l1 4M4 12l1 4a7.5 7.5 0 0 0 13.4 1"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.2"/>',wind:'<path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h6a3 3 0 1 1-3 3"/>',drop:'<path d="M12 3S5 10 5 15a7 7 0 0 0 14 0c0-5-7-12-7-12Z"/>',thermometer:'<path d="M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0Zm3-6v9"/>',radar:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18 5M12 3v2m9 7h-2m-7 7v2M3 12h2"/><circle cx="12" cy="12" r="1"/>',calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v5m10-5v5M3 11h18m-13 5h1m6 0h1"/>',locate:'<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/>',play:'<path d="m8 5 11 7-11 7Z"/>',pause:'<path d="M9 5v14m6-14v14"/>',plus:'<path d="M12 5v14M5 12h14"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',sunrise:'<path d="M3 17h18M1 21h22M7 17a5 5 0 0 1 10 0M12 3v5m-3-2 3-3 3 3M3 11l2 2m14 0 2-2"/>',pressure:'<circle cx="12" cy="12" r="9"/><path d="m12 12 4-5M5 12h1m12 0h1M12 5v1M7 18h10"/>',trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>'};
const icon=name=>'<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">'+(paths[name]||paths.info)+'</svg>';
function icons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));}icons();
function escape(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function weather(code,day=true){
 const id=C.weatherSymbol(code,day),label=escape(C.condition(code,day).label);
 if(!id)return '<span class="weather-icon weather-unavailable" role="img" aria-label="'+label+'">—</span>';
 return '<img class="weather-icon" src="assets/weather/hd/'+id+'.webp" width="512" height="512" alt="'+label+'" decoding="async">';
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
   caption.textContent=item.label;img.src='assets/weather/hd/'+item.file;img.width=512;img.height=512;
   img.alt='';img.loading='lazy';img.decoding='async';figure.title=item.id+'.png';
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
const equal=(a,b)=>C.placeKey(a)===C.placeKey(b);
function renderPlaces(){
 $('selected-name').textContent=state.place.name;
 const isFav=state.favorites.some(p=>equal(p,state.place));$('toggle-favorite').setAttribute('aria-pressed',String(isFav));$('toggle-favorite').setAttribute('aria-label',isFav?'Retirer des favoris':'Ajouter aux favoris');
 const places=[state.place,...state.favorites,...PRESETS].filter((p,i,a)=>a.findIndex(q=>equal(p,q))===i);
 $('quick-places').innerHTML=places.slice(0,9).map((p,i)=>'<button class="chip '+(equal(p,state.place)?'active':'')+'" data-place-index="'+i+'">'+escape(p.name)+'</button>').join('');
 $('quick-places').querySelectorAll('button').forEach(b=>b.onclick=()=>choose(places[+b.dataset.placeIndex]));
 $('favorites-list').innerHTML=state.favorites.length?state.favorites.map((p,i)=>'<div class="favorite-row"><button class="favorite-choose" data-favorite="'+i+'"><span>'+icon('pin')+'</span><span><b>'+escape(p.name)+'</b><small>'+escape(p.admin2||p.country||'Commune enregistrée')+'</small></span></button><button class="icon-button" data-delete="'+i+'" aria-label="Retirer '+escape(p.name)+' des favoris">'+icon('trash')+'</button></div>').join(''):'<p class="empty-text">Touchez l’étoile près d’une commune pour la retrouver ici.</p>';
 $('favorites-list').querySelectorAll('[data-favorite]').forEach(b=>b.onclick=()=>{choose(state.favorites[+b.dataset.favorite]);switchView('now');});
 $('favorites-list').querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{state.favorites.splice(+b.dataset.delete,1);storage.set('favorites',state.favorites);renderPlaces();toast('Commune retirée des favoris');});
}
$('toggle-favorite').onclick=()=>{const i=state.favorites.findIndex(p=>equal(p,state.place));if(i>=0)state.favorites.splice(i,1);else{if(state.favorites.length>=12){toast('Vous pouvez enregistrer jusqu’à 12 communes.');return;}state.favorites.push({...state.place});}storage.set('favorites',state.favorites);renderPlaces();toast(i>=0?'Commune retirée':'Commune ajoutée aux favoris');};
function cached(p){const c=storage.get('weather.'+C.placeKey(p),null);return c&&C.validForecast(c.data)&&C.finite(c.fetchedAt)?c:null;}
function saveWeather(p,data){const key=C.placeKey(p),fetchedAt=Date.now();storage.set('weather.'+key,{data,fetchedAt});let keys=storage.get('weather-index',[]);if(!Array.isArray(keys))keys=[];keys=keys.filter(k=>k!==key);keys.push(key);while(keys.length>16)storage.remove('weather.'+keys.shift());storage.set('weather-index',keys);return fetchedAt;}
async function fetchJSON(url,signal,timeout=30000){const ctl=new AbortController(),abort=()=>ctl.abort();if(signal?.aborted)ctl.abort();else signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,timeout);try{const r=await fetch(url,{signal:ctl.signal,credentials:'omit',referrerPolicy:'no-referrer'});if(!r.ok)throw Error(r.status===429?'Le service est très sollicité. Réessayez dans quelques instants.':'Le service météo ne répond pas.');const data=await r.json();if(data.error)throw Error('Données indisponibles pour cette commune.');return data;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}}
function clearWeather(){state.data=null;state.fetchedAt=0;$('current-temperature').innerHTML='—<sup>°</sup>';$('condition').textContent='Chargement…';$('feels').textContent='Prévisions pour '+state.place.name;$('hero-symbol').innerHTML='';$('hero-date').textContent='';document.querySelector('.eyebrow').textContent='CONDITIONS ESTIMÉES';['current-wind','current-humidity','current-range'].forEach(id=>$(id).textContent='—');$('updated').textContent='Conditions estimées · Open-Meteo';$('hourly').innerHTML='<p class="empty-text">Chargement des prévisions…</p>';$('temperature-chart').innerHTML='';$('details').innerHTML='';$('daily-list').innerHTML='<p class="empty-text">Chargement des prévisions…</p>';}
async function loadWeather(force=false){
 const req=++state.request,p={...state.place};state.controller?.abort();state.controller=new AbortController();$('refresh').classList.remove('busy');$('refresh').disabled=false;
 const old=cached(p);if(old){state.data=old.data;state.fetchedAt=old.fetchedAt;renderWeather();}else clearWeather();
 if(!force&&old&&Date.now()-old.fetchedAt<TTL){notice(navigator.onLine?'':'Sans réseau · dernières prévisions enregistrées.');return;}
 if(!navigator.onLine){notice(old?'Sans réseau · prévisions enregistrées le '+C.date(old.fetchedAt/1000,old.data.timezone,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+'.':'Sans réseau. Connectez-vous pour charger la météo de cette commune.');if(!old)showUnavailable();return;}
 $('refresh').classList.add('busy');$('refresh').disabled=true;notice(old?'Actualisation des prévisions…':'');
 try{const d=await fetchJSON(C.forecastURL(p),state.controller.signal);if(req!==state.request)return;if(!C.validForecast(d))throw Error('Réponse météo incomplète.');state.fetchedAt=saveWeather(p,d);state.data=d;renderWeather();notice('');}
 catch(e){if(req!==state.request)return;notice((e.name==='AbortError'?'La connexion prend trop de temps.':e.message||'Connexion indisponible.')+(old?' Les dernières prévisions enregistrées sont affichées.':' Touchez Actualiser pour réessayer.'));if(!old)showUnavailable();}
 finally{if(req===state.request){$('refresh').classList.remove('busy');$('refresh').disabled=false;}}
}
function showUnavailable(){$('condition').textContent='Météo indisponible';$('feels').textContent='Vos favoris restent accessibles.';$('hourly').innerHTML='<p class="empty-text">Aucune prévision enregistrée pour cette commune.</p>';$('daily-list').innerHTML='<p class="empty-text">Connectez-vous puis touchez Actualiser.</p>';}
function choose(p){if(!C.validPlace(p))return;state.place={...p};storage.set('place',state.place);renderPlaces();loadWeather();radar.placeChanged();}
function todayIndex(d){const now=C.date(Date.now()/1000,d.timezone,{year:'numeric',month:'2-digit',day:'2-digit'});return d.daily.time.findIndex(t=>C.date(t,d.timezone,{year:'numeric',month:'2-digit',day:'2-digit'})===now);}
function renderWeather(){const d=state.data;if(!d)return;const c=d.current,tz=d.timezone,di=todayIndex(d),a=d.daily,cond=C.condition(c.weather_code,c.is_day!==0);
 document.body.classList.toggle('night',c.is_day===0);document.querySelector('.eyebrow').textContent=Date.now()/1000-c.time>7200?'DERNIÈRES DONNÉES':'EN CE MOMENT';
 $('current-temperature').innerHTML=C.fmt(c.temperature_2m)+'<sup>°</sup>';$('condition').textContent=cond.label;$('feels').textContent='Ressenti '+C.fmt(c.apparent_temperature)+'° · '+C.fmt(d.elevation)+' m';$('hero-symbol').innerHTML=weather(c.weather_code,c.is_day!==0);
 $('hero-date').textContent=C.date(c.time,tz,{day:'numeric',month:'short'})+' · '+C.clock(c.time,tz);
 $('current-wind').textContent=C.fmt(c.wind_speed_10m)+' km/h';$('current-humidity').textContent=C.fmt(c.relative_humidity_2m)+' %';$('current-range').textContent=(di<0?'—':C.fmt(a.temperature_2m_min[di])+'° / '+C.fmt(a.temperature_2m_max[di])+'°');
 $('updated').textContent='Conditions estimées · Open-Meteo · reçues le '+C.date(state.fetchedAt/1000,tz,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
 const hours=C.hours(d);$('hourly').innerHTML=hours.length?hours.map((h,i)=>'<article class="hour-card"><span>'+C.date(h.time,tz,{hour:'2-digit'})+'</span>'+weather(h.code,h.isDay)+'<strong>'+C.fmt(h.temperature)+'°</strong><span class="rain-prob">'+icon('drop')+C.fmt(h.probability)+' %</span></article>').join(''):'<p class="empty-text">Les prévisions enregistrées ne couvrent plus les prochaines heures. Actualisez la météo.</p>';
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
function renderDaily(d,di){const a=d.daily,tz=d.timezone,sc=C.scale([...a.temperature_2m_min,...a.temperature_2m_max]);$('daily-list').innerHTML=a.time.map((t,i)=>{if(di>=0&&i<di)return '';const lo=a.temperature_2m_min[i],hi=a.temperature_2m_max[i],co=C.condition(a.weather_code[i]);const left=sc&&C.finite(lo)?Math.max(0,100*sc.ratio(lo)):0,range=sc&&C.finite(lo)&&C.finite(hi)?Math.max(3,100*(hi-lo)/(sc.high-sc.low)):0;
 return '<details class="daily-row"><summary aria-label="'+escape(C.date(t,tz,{weekday:'long',day:'numeric',month:'long'})+', '+co.label+', '+C.fmt(lo)+' à '+C.fmt(hi)+' degrés')+'"><span class="daily-date"><b>'+(i===di?'Aujourd’hui':i===di+1&&di>=0?'Demain':C.date(t,tz,{weekday:'long'}))+'</b><small>'+C.date(t,tz,{day:'numeric',month:'short'})+'</small></span>'+weather(a.weather_code[i])+'<span class="rain-prob">'+C.fmt(a.precipitation_probability_max[i])+' %</span><span class="daily-range"><span>'+C.fmt(lo)+'°</span><span class="range-track"><span class="range-fill" style="left:'+left+'%;width:'+range+'%"></span></span><span>'+C.fmt(hi)+'°</span></span></summary><div class="daily-extra"><strong>'+co.label+'</strong><div class="daily-extra-grid"><span>Pluie / neige : '+C.fmt(a.precipitation_sum[i],1)+' mm</span><span>UV maximum : '+C.fmt(a.uv_index_max[i],1)+'</span><span>Vent max. : '+C.fmt(a.wind_speed_10m_max[i])+' km/h</span><span>Rafales : '+C.fmt(a.wind_gusts_10m_max[i])+' km/h</span><span>Lever : '+C.clock(a.sunrise[i],tz)+'</span><span>Coucher : '+C.clock(a.sunset[i],tz)+'</span></div></div></details>';}).join('')||'<p class="empty-text">Actualisez les prévisions.</p>';}
function switchView(view){if(!['now','radar','forecast','favorites'].includes(view))return;state.view=view;document.body.classList.toggle('radar-active',view==='radar');document.querySelectorAll('.view').forEach(v=>v.hidden=v.id!=='view-'+view);document.querySelectorAll('.bottom-nav button').forEach(b=>{b.classList.toggle('active',b.dataset.view===view);if(b.dataset.view===view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});if(view==='radar')radar.enter();else radar.leave();window.scrollTo({top:0,behavior:'instant'});}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>switchView(b.dataset.view));
function openSearch(addFavorite=false){state.addFavorite=addFavorite===true;$('search-input').value='';state.searchSeq++;showSuggestions();openDialog('search-dialog');setTimeout(()=>$('search-input').focus(),80);}
$('open-search').onclick=()=>openSearch();$('add-place').onclick=()=>openSearch(true);
function showResults(list){$('search-results').innerHTML=list.length?list.map((p,i)=>'<button class="search-result" data-result="'+i+'"><span><b>'+escape(p.name)+'</b><small>'+escape([p.admin2,p.admin1,p.country].filter(Boolean).join(' · '))+'</small></span>'+icon('chevron')+'</button>').join(''):'<p class="empty-text">Aucune commune trouvée. Essayez un nom voisin ou un code postal.</p>';$('search-results').querySelectorAll('button').forEach(b=>b.onclick=()=>{const place=list[+b.dataset.result];if(state.addFavorite&&!state.favorites.some(p=>equal(p,place))){if(state.favorites.length<12){state.favorites.push(place);storage.set('favorites',state.favorites);}else toast('Limite de 12 favoris atteinte.');}choose(place);closeDialog($('search-dialog')); switchView('now');});}
function showSuggestions(){showResults(PRESETS);}
$('search-input').addEventListener('input',()=>{clearTimeout(state.searchTimer);state.searchController?.abort();const seq=++state.searchSeq,q=$('search-input').value.trim();if(q.length<2){showSuggestions();return;}$('search-results').innerHTML='<p class="empty-text">Recherche…</p>';state.searchTimer=setTimeout(async()=>{state.searchController=new AbortController();try{const d=await fetchJSON('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name:q,count:'15',language:'fr',format:'json',countryCode:'FR'}),state.searchController.signal,12000);if(seq!==state.searchSeq)return;const list=(d.results||[]).filter(C.validPlace).sort((a,b)=>Number(b.admin2==='Haute-Savoie')-Number(a.admin2==='Haute-Savoie'));showResults(list);}catch(e){if(seq===state.searchSeq)$('search-results').innerHTML='<p class="empty-text">Recherche indisponible. Vérifiez la connexion ou choisissez une commune déjà enregistrée.</p>'; }},350);});
$('locate').onclick=()=>{if(!navigator.geolocation){toast('La localisation est indisponible. Recherchez votre commune.');return;}const b=$('locate');b.disabled=true;b.innerHTML=icon('locate')+'Recherche de votre position…';navigator.geolocation.getCurrentPosition(pos=>{b.disabled=false;b.innerHTML=icon('locate')+'Utiliser ma position';choose({name:'Ma position',latitude:pos.coords.latitude,longitude:pos.coords.longitude,admin2:'Position du téléphone'});switchView('now');},err=>{b.disabled=false;b.innerHTML=icon('locate')+'Utiliser ma position';toast(err.code===1?'Localisation refusée. Vous pouvez rechercher votre commune.':'Position introuvable. Réessayez à l’extérieur ou recherchez votre commune.');},{enableHighAccuracy:false,timeout:15000,maximumAge:300000});};
const radar = window.MeteoRadar.create({ $, C, storage, icon, escape, fetchJSON, places:PRESETS, place:()=>state.place });
$('refresh').onclick=()=>{loadWeather(true);if(state.view==='radar')radar.refresh();};
function resume(){if(Date.now()-state.fetchedAt>TTL)loadWeather();if(state.view==='radar'&&!document.hidden)radar.resume();}
window.meteoApp={back(){const d=document.querySelector('dialog[open]');if(d){closeDialog(d);return true;}if(state.view!=='now'){switchView('now');return true;}return false;},pause:()=>radar.suspend(),resume};
document.addEventListener('visibilitychange',()=>document.hidden?radar.suspend():resume());
window.addEventListener('offline',()=>notice(state.data?'Sans réseau · les dernières prévisions enregistrées sont affichées.':'Sans réseau. Connectez-vous pour charger la météo.'));
window.addEventListener('online',()=>{loadWeather(true);if(state.view==='radar')radar.refresh();});
renderPlaces();loadWeather();
})();
