(function(root){
'use strict';
const Field=root.ObservationField,{grid,metrics}=Field;
const bounds=[[grid.south,grid.west],[grid.north,grid.east]];
const domain=[[45.679,5.802],[46.411,7.048]];
const cityLabels=[['Thonon',46.371,6.477],['Annecy',45.899,6.127],['Annemasse',46.194,6.236],['Cluses',46.061,6.579],['Chamonix',45.923,6.869]];
const formatter=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1});
const when=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const clock=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
const stamp=t=>when.format(t).replace(' à ',' · ');
const norm=s=>s.toLocaleLowerCase('fr').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
const minute=60000;
function raster(draw){
 const canvas=document.createElement('canvas');canvas.width=grid.width;canvas.height=grid.height;
 const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(canvas.width,canvas.height);
 draw(pixels.data);ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png');
}
function relief(dem){
 return raster(px=>{
  for(let i=0;i<dem.length;i++){
   const x=i%grid.width,y=Math.floor(i/grid.width),z=dem[i]&32767;
   const left=dem[x>0?i-1:i]&32767,above=dem[y>0?i-grid.width:i]&32767;
   const light=Math.max(-54,Math.min(44,(left-z)*.22+(above-z)*.28));
   const mountain=Math.min(1,z/3600);
   px[i*4]=203+mountain*18+light;px[i*4+1]=218+mountain*8+light;px[i*4+2]=208+mountain*17+light;px[i*4+3]=225;
  }
 });
}
function colored(metric,values,confidence){
 return raster(px=>{
  for(let i=0;i<values.length;i++)if(Number.isFinite(values[i])){
   const c=Field.rgb(metric,values[i]),j=i*4;
   px[j]=c[0];px[j+1]=c[1];px[j+2]=c[2];px[j+3]=confidence?confidence[i]:values[i]===0?145:220;
  }
 });
}
function compactRain(values){
 const bytes=new Uint8Array(values.length*2),view=new DataView(bytes.buffer);
 for(let i=0;i<values.length;i++)view.setUint16(i*2,Number.isFinite(values[i])?Math.min(65534,Math.round(values[i]*100)):65535,true);
 let raw='';for(let i=0;i<bytes.length;i+=4096)raw+=String.fromCharCode(...bytes.subarray(i,i+4096));
 return btoa(raw);
}
function expandRain(encoded){
 const bytes=atob(encoded);
 if(bytes.length!==grid.width*grid.height*2)throw Error('Cumul incomplet');
 return Float32Array.from({length:bytes.length/2},(_,i)=>{const n=bytes.charCodeAt(i*2)+256*bytes.charCodeAt(i*2+1);return n===65535?NaN:n/100;});
}
function rainWorker(bytes,dem,signal){
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(Error('Annulé'));return;}
  const worker=new Worker('observations-rain-worker.js');
  const done=(error,result)=>{clearTimeout(timeout);signal.removeEventListener('abort',cancel);worker.terminate();error?reject(error):resolve(result);};
  const cancel=()=>done(Error('Annulé')),timeout=setTimeout(()=>done(Error('Délai dépassé')),20000);
  signal.addEventListener('abort',cancel,{once:true});
  worker.onmessage=e=>e.data.values?done(null,new Float32Array(e.data.values)):done(Error('Cumul illisible'));
  worker.onerror=()=>done(Error('Cumul illisible'));
  worker.postMessage({bytes,terrain:dem.buffer},[bytes]);
 });
}
function create({$,icon,escape,fetchJSON,storage,service}){
 let active=false,map,terrain,shape,demPromise,geometryError=false,directory=[],directoryReady=false,layer,markers,labels,field=null,fieldKey='',shown=[],points=[];
 let mode=storage.get('obs-mode','live')==='hourly'?'hourly':'live';
 let metric=storage.get('obs-metric','temp');
 if(!Object.hasOwn(metrics,metric)||(mode==='live'&&metric==='snow'))metric='temp';
 let request=null,rainRequest=null,interval,moveTask;
 let busy=false,failed=false,rainBusy=false,rainFailed=false,rain=null,rainChecked=0;
 const snapshots={live:storage.get('obs-v1-live',null),hourly:storage.get('obs-v1-hourly',null)};
 for(const key of Object.keys(snapshots))if(!Array.isArray(snapshots[key]?.stations))snapshots[key]=null;
 const inRain=()=>mode==='live'&&metric==='rain';
 const currentRain=()=>rain&&rain.time>=Date.now()-45*minute&&rain.time<=Date.now()+minute?rain:null;
 function fit(){if(map){map.invalidateSize({pan:false});map.fitBounds(domain,{padding:[12,12],animate:false});}}
 function initMap(){
  if(map)return;
  map=L.map('obs-map',{attributionControl:true,zoomSnap:.25,zoomDelta:1,minZoom:7,maxZoom:14,scrollWheelZoom:false});
  map.attributionControl.setPrefix(false);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxNativeZoom:19,className:'obs-basemap',attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
  map.createPane('obsTerrain').style.zIndex=310;map.createPane('obsField').style.zIndex=325;
  map.createPane('obsLine').style.zIndex=335;map.createPane('obsTowns').style.zIndex=345;
  map.getPane('obsTowns').style.pointerEvents='none';
  labels=L.layerGroup().addTo(map);markers=L.layerGroup().addTo(map);
  for(const [name,lat,lon] of cityLabels)L.marker([lat,lon],{pane:'obsTowns',interactive:false,keyboard:false,icon:L.divIcon({className:'obs-city',iconSize:[60,12],iconAnchor:[-2,-3],html:'<span>'+name+'</span>'})}).addTo(labels);
  fit();map.on('moveend zoomend',()=>{cancelAnimationFrame(moveTask);moveTask=requestAnimationFrame(()=>{if(active)paintMarkers();});});
  map.on('click',e=>{
   if(!field)return;
   const k=Field.indexAt(e.latlng.lng,e.latlng.lat);
   if(k<0||!(terrain?.[k]&32768))return;
   const v=field.values[k],m=metrics[metric];
   const label=Number.isFinite(v)?(inRain()?'Cumul sur 1 h':'Estimation locale')+'<br><b>'+formatter.format(v)+' '+m.unit+'</b>':'Donnée indisponible ici';
   L.popup({closeButton:false}).setLatLng(e.latlng).setContent(label).openOn(map);
  });
 }
 async function geometry(){
  if(terrain&&shape&&directoryReady)return;
  if(demPromise)return demPromise;
  demPromise=(async()=>{
   const [heights,line,sites]=await Promise.all([
    terrain?null:fetch('assets/observations-terrain.bin').then(r=>{if(!r.ok)throw Error('Relief indisponible');return r.arrayBuffer();}),
    shape?null:fetchJSON('assets/haute-savoie.geojson'),directoryReady?null:fetchJSON('assets/observations-infoclimat.json')
   ]);
   if(heights){terrain=Field.terrain(heights);L.imageOverlay(relief(terrain),bounds,{pane:'obsTerrain',opacity:.5,interactive:false,alt:''}).addTo(map);}
   if(line){shape=L.geoJSON(line,{pane:'obsLine',interactive:false,style:{color:'#345b66',weight:1.7,opacity:.85,fill:false}}).addTo(map);}
   if(sites){directory=sites;directoryReady=true;}
   geometryError=false;
  })().catch(()=>{geometryError=true;}).finally(()=>{demPromise=null;if(active)render();});
  return demPromise;
 }
 function filterBar(){
  $('obs-filters').innerHTML=Object.entries(metrics).filter(([key])=>key!=='snow'||mode==='hourly').map(([key,m])=>
   '<button data-metric="'+key+'" aria-pressed="'+(metric===key)+'">'+icon(m.icon)+(m.brief||m.label)+'</button>').join('');
  $('obs-modes').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===mode)));
 }
 function key(){
  const m=metrics[metric],ticks=m.ticks;
  const position=v=>{for(let i=1;i<ticks.length;i++)if(v<=ticks[i])return 100*(i-1+(v-ticks[i-1])/(ticks[i]-ticks[i-1]))/(ticks.length-1);return 100;};
  $('obs-key-name').textContent=m.label;$('obs-key-unit').textContent=m.unit;
  $('obs-scale').style.background='linear-gradient(to right,'+m.colors.map((c,i)=>c+' '+position(m.stops[i])+'%').join(',')+')';
  $('obs-ticks').innerHTML=ticks.map(n=>'<span>'+formatter.format(n)+'</span>').join('');
 }
 function visibleRecords(){
  const input=snapshots[mode]?.stations||[];
  return mode==='hourly'?input:input.filter(s=>s.time>=Date.now()-90*minute&&s.time<=Date.now()+minute);
 }
 function stationDetails(site){
  $('obs-station-name').textContent=site.name;
  const meta=[site.source,Number.isFinite(site.alt)?formatter.format(site.alt)+' m':null,site.time?stamp(site.time):null].filter(Boolean);
  const items=Object.entries(site.values||{}).filter(([k,v])=>Number.isFinite(v)&&(metrics[k]||['dir','qnh','stationPressure'].includes(k)));
  const extra={dir:['Direction du vent','°'],stationPressure:['Pression à la station','hPa'],qnh:['Pression QNH','hPa']};
  const values=items.map(([k,v])=>{const m=metrics[k],label=m?m.label:extra[k][0],unit=m?m.unit:extra[k][1];return '<div><small>'+label+'</small><b>'+formatter.format(v)+' '+unit+'</b></div>';}).join('');
  $('obs-station-detail').innerHTML='<p class="obs-station-meta">'+meta.map(escape).join(' · ')+'</p>'+(values?'<div class="obs-station-values">'+values+'</div>':'<p class="obs-station-meta">Emplacement du répertoire Infoclimat. Les mesures de cette station ne sont pas disponibles dans Météo74.</p>');
  if(!$('obs-dialog').open)$('obs-dialog').showModal();
 }
 function paintMarkers(){
  if(!map||!active)return;
  markers.clearLayers();
  if($('obs-directory').checked)for(const s of directory){
   L.marker([s.lat,s.lon],{title:s.name,alt:s.name,icon:L.divIcon({className:'obs-loc',iconSize:[12,12],html:'<span></span>'})}).addTo(markers).on('click',()=>stationDetails(s));
  }
  const placed=[];
  for(const s of points){
   const value=s.values[metric],pos=map.latLngToContainerPoint([s.lat,s.lon]),m=metrics[metric];
   const label=formatter.format(Math.round(value* (metric==='rain'?10:1))/(metric==='rain'?10:1))+m.short;
   const width=Math.max(23,label.length*7+9);
   const crowded=placed.some(p=>Math.abs(pos.y-p.y)<20&&Math.abs(pos.x-p.x)<(width+p.width)/2+1);
   const fill='rgb('+Field.rgb(metric,value).join(',')+')';
   let pin;
   if(crowded){
    pin=L.circleMarker([s.lat,s.lon],{radius:4,color:'#345663',weight:1,fillColor:fill,fillOpacity:1,bubblingMouseEvents:false});
   }else{
    placed.push({x:pos.x,y:pos.y,width});
    pin=L.marker([s.lat,s.lon],{title:s.name+' · '+formatter.format(value)+' '+m.unit,alt:s.name,icon:L.divIcon({className:'obs-pin',iconSize:[width,20],iconAnchor:[width/2,10],html:'<span style="border-color:'+fill+'">'+label+'</span>'})});
   }
   pin.addTo(markers).on('click',()=>stationDetails(s));
  }
 }
 function list(){
  const q=norm($('obs-search').value.trim());
  shown=[...points,...($('obs-directory').checked?directory:[])].sort((a,b)=>a.name.localeCompare(b.name,'fr'));
  $('obs-number').textContent=String(shown.length);
  if(!$('obs-sites').open)return;
  const rows=shown.filter(s=>!q||norm(s.name+' '+s.source).includes(q));
  $('obs-list').innerHTML=rows.map(s=>{
   const v=s.values?.[metric],measured=Number.isFinite(v);
   const sub=measured?s.source+' · '+clock.format(s.time):'Infoclimat · emplacement seul';
   const info=measured?formatter.format(v)+' '+metrics[metric].unit:'';
   return '<button class="obs-row" data-site="'+escape(s.id)+'"><span class="obs-dot" style="background:'+(measured?'rgb('+Field.rgb(metric,v).join(',')+')':'white')+'"></span><span><b>'+escape(s.name)+'</b><small>'+escape(sub)+'</small></span><strong>'+info+'</strong></button>';
  }).join('')||'<p class="obs-empty">'+(q?'Aucune station ne correspond à la recherche.':inRain()?'Le cumul récent se consulte en touchant la carte. Les pluviomètres figurent dans le relevé horaire.':'Aucune station disponible pour cette mesure.')+'</p>';
 }
 function render(){
  if(!active||!map)return;
  const snapshot=snapshots[mode],source=visibleRecords(),swiss=inRain(),acc=currentRain();
  points=source.filter(s=>Number.isFinite(s.values[metric])).sort((a,b)=>b.time-a.time||a.id.localeCompare(b.id));
  const signature=[mode,metric,snapshot?.retrievedAt,points.map(s=>s.id).join('.'),!!terrain,swiss?acc?.time:0].join('/');
  if(terrain&&fieldKey!==signature){
   if(layer){map.removeLayer(layer);layer=null;}
   fieldKey=signature;field=swiss?(acc?{values:acc.values,confidence:null}:null):points.length?Field.interpolate(metric,points,terrain):null;
   if(field)layer=L.imageOverlay(colored(metric,field.values,field.confidence),bounds,{pane:'obsField',interactive:false,alt:'Couleurs de la couche '+metrics[metric].label}).addTo(map);
  }
  key();paintMarkers();list();
  const n=points.length, count=n+' station'+(n>1?'s':'');
  let caption,method;
  if(swiss){
   caption=acc?'Cumul sur 1 h · '+stamp(acc.time):rainBusy?'Chargement du cumul sur 1 h…':'Cumul récent indisponible';
   method='MétéoSuisse · Radar et pluviomètres. Touchez un point pour lire le cumul.';
  }else if(mode==='hourly'){
   caption=snapshot?count+' · '+stamp(snapshot.time):busy?'Chargement du relevé horaire…':'Relevé horaire indisponible';
   method='Dernière heure publiée par Météo-France. Les couleurs entre les stations sont estimées.';
  }else{
   caption=n?count+' · dernier relevé à '+clock.format(points[0].time):busy?'Chargement des mesures récentes…':'Aucune mesure récente pour ce filtre';
   method='Mesures de moins de 90 min. Les couleurs s’atténuent quand les stations sont trop éloignées.';
  }
  $('obs-caption').textContent=caption;$('obs-method').textContent=method;
  const warnings=[];
  if(geometryError)warnings.push('Fond départemental indisponible.');
  if(!navigator.onLine)warnings.push('Hors connexion.');
  if(swiss&&rainFailed)warnings.push(acc?'Dernier cumul enregistré affiché.':'Le cumul récent n’a pas pu être chargé.');
  if(!swiss&&failed)warnings.push(snapshot?'Dernières données enregistrées.':'La connexion aux stations a échoué.');
  if(!swiss&&snapshot?.missing?.length)warnings.push('Réseau indisponible · '+snapshot.missing.join(', ')+'.');
  $('obs-alert').textContent=warnings.join(' ');$('obs-alert').hidden=!warnings.length;
 }
 function stopRain(){rainRequest?.abort();rainRequest=null;rainBusy=false;}
 async function loadRain(force=false){
  if(!active||!inRain()||rainRequest)return;
  if(!rain){
   try{const saved=storage.get('obs-rain-v1',null);if(saved?.time>=Date.now()-45*minute)rain={time:saved.time,values:expandRain(saved.encoded)};}catch{}
  }
  if(!force&&rainChecked>Date.now()-3*minute){render();return;}
  const ctl=new AbortController();rainRequest=ctl;rainBusy=true;rainFailed=false;render();
  const timeout=setTimeout(()=>ctl.abort(),45000);
  try{
   await geometry();if(!terrain||ctl.signal.aborted)throw Error('Relief indisponible');
   const frames=await SwissRadar.loadFrames(fetchJSON,ctl.signal,'CPC');
   const frame=frames.at(-1),t=frame.time*1000;
   if(t<Date.now()-45*minute)throw Error('Cumul ancien');
   if(t!==rain?.time){
    const res=await fetch(frame.url,{signal:ctl.signal,credentials:'omit'});if(!res.ok)throw Error('Cumul indisponible');
    const values=await rainWorker(await res.arrayBuffer(),terrain,ctl.signal);
    if(rainRequest!==ctl)return;
    if(!values.some(Number.isFinite))throw Error('Couverture indisponible');
    rain={time:t,values};storage.set('obs-rain-v1',{time:t,encoded:compactRain(values)});
   }
   rainChecked=Date.now();
  }catch{if(rainRequest===ctl){rainFailed=true;rainChecked=0;}}
  finally{clearTimeout(timeout);if(rainRequest===ctl){rainRequest=null;rainBusy=false;render();}}
 }
 async function refresh(force=false){
  if(!active||document.hidden)return;
  if(!terrain||!shape)geometry();
  if(inRain()){loadRain(force);render();return;}
  const selected=mode,snap=snapshots[mode],ttl=mode==='live'?3*minute:30*minute;
  if(request||(!force&&snap&&Date.now()-snap.retrievedAt<ttl)){render();return;}
  const ctl=new AbortController();request=ctl;busy=true;failed=false;render();
  try{
   const next=await fetchJSON(service.base+'meteo74-observations?mode='+selected,ctl.signal,40000,service.headers);
   if(request!==ctl||mode!==selected)return;
   if(next.mode!==selected||!Array.isArray(next.stations))throw Error('Observations invalides');
   snapshots[selected]=next;storage.set('obs-v1-'+selected,next);
  }catch{if(request===ctl)failed=true;}
  finally{if(request===ctl){request=null;busy=false;render();}}
 }
 function stop(){request?.abort();request=null;busy=false;stopRain();clearInterval(interval);}
 function schedule(){clearInterval(interval);interval=setInterval(()=>refresh(),minute);}
 function enter(){active=true;initMap();filterBar();map.invalidateSize({pan:false});geometry();schedule();refresh();}
 $('obs-center').onclick=fit;
 $('obs-modes').onclick=e=>{
  const b=e.target.closest('[data-mode]');if(!b||b.dataset.mode===mode)return;
  stop();mode=b.dataset.mode;storage.set('obs-mode',mode);if(mode==='live'&&metric==='snow'){metric='temp';storage.set('obs-metric',metric);}
  failed=false;rainFailed=false;map.closePopup();filterBar();schedule();refresh();
 };
 $('obs-filters').onclick=e=>{
  const b=e.target.closest('[data-metric]');if(!b||b.dataset.metric===metric)return;
  stopRain();metric=b.dataset.metric;storage.set('obs-metric',metric);map.closePopup();
  for(const item of $('obs-filters').children)item.setAttribute('aria-pressed',String(item===b));
  b.scrollIntoView({block:'nearest',inline:'nearest'});refresh();
 };
 $('obs-directory').onchange=()=>{paintMarkers();list();};
 $('obs-search').oninput=list;$('obs-sites').ontoggle=list;
 $('obs-list').onclick=e=>{const id=e.target.closest('[data-site]')?.dataset.site,site=shown.find(s=>s.id===id);if(site)stationDetails(site);};
 return {enter,leave(){active=false;stop();map?.closePopup();},suspend:stop,refresh(force=false){if(active)schedule();return refresh(force);}};
}
root.MeteoObservations={create};
})(globalThis);
