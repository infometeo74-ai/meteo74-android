(function(root){
'use strict';
const Field=root.ObservationField,{grid,metrics}=Field;
const bounds=[[grid.south,grid.west],[grid.north,grid.east]];
const domain=[[45.679,5.802],[46.411,7.048]];
const cityLabels=[['Thonon',46.371,6.477],['Annecy',45.899,6.127],['Annemasse',46.194,6.236],['Cluses',46.061,6.579],['Chamonix',45.923,6.869]];
const formatter=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1});
const when=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const stamp=t=>when.format(t).replace(' à ',' · ');
const minute=60000;
const dayName=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'});
const dayLabel=day=>dayName.format(Date.parse(day+'T00:00:00Z'));
const filters={
 live:['temp','rain','wind','gust','humidity','pressure','snow'],
 hourly:['temp','rain','wind','gust','humidity','pressure','snow'],
 daily:['minTemp','maxTemp','rainDay','windDay','gustDay','snow','reportTemp']
};
const defaults={live:'temp',hourly:'temp',daily:'minTemp'};
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
 let active=false,map,terrain,shape,demPromise,geometryError=false,layer,labels,field=null,fieldKey='';
 let mode=storage.get('obs-mode','live');
 if(!Object.hasOwn(filters,mode))mode='live';
 let metric=storage.get('obs-metric',defaults[mode]);
 if(!filters[mode].includes(metric))metric=defaults[mode];
 const today=new Date().toISOString().slice(0,10),earliest=(Number(today.slice(0,4))-1)+'-01-01';
 const dateBox=$('obs-date');dateBox.min=earliest;dateBox.max=today;
 let requestedDay=storage.get('obs-selected-day',null);
 if(!requestedDay||requestedDay<earliest||requestedDay>today)requestedDay=null;
 let request=null,rainRequest=null,modelRequest=null,modelBusy=false,modelFailed=false,lastModelAttempt=0,modelRetry=null,interval;
 let snowSnapshot=storage.get('obs-snow-surface',null),snowRequest=null,snowFailed=false;
 const inSnow=()=>mode==='live'&&metric==='snow';
 const frames={live:storage.get('obs-v2-model-live',null),hourly:storage.get('obs-v2-model-hourly',null)};
 let busy=false,failed=false,rainBusy=false,rainFailed=false,rain=null,rainChecked=0;
 const snapshots={live:storage.get('obs-v1-live',null),hourly:storage.get('obs-v1-hourly',null),daily:storage.get('obs-v1-daily',null)};
 for(const key of Object.keys(snapshots))if(!Array.isArray(snapshots[key]?.stations))snapshots[key]=null;
 function snapshotForMode(){
  const snapshot=snapshots[mode];
  return mode==='daily'&&snapshot?.selection!==requestedDay?null:snapshot;
 }
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
  labels=L.layerGroup().addTo(map);
  for(const [name,lat,lon] of cityLabels)L.marker([lat,lon],{pane:'obsTowns',interactive:false,keyboard:false,icon:L.divIcon({className:'obs-city',iconSize:[60,12],iconAnchor:[-2,-3],html:'<span>'+name+'</span>'})}).addTo(labels);
  fit();
  map.on('click',e=>{
   if(!field)return;
   const k=Field.indexAt(e.latlng.lng,e.latlng.lat);
   if(k<0||!(terrain?.[k]&32768))return;
   const v=field.values[k],m=metrics[metric];
   const label=Number.isFinite(v)?m.label+'<br><b>'+formatter.format(v)+' '+m.unit+'</b>'+(metric==='snow'?'<br>Terrain ≈ '+formatter.format(terrain[k]&32767)+' m':''):'Donnée indisponible ici';
   let nearby='';
   if(metric==='snow'&&Number.isFinite(v)){
    const h=terrain[k]&32767;
    const points=visibleRecords().filter(s=>s.bulletinDay&&Number.isFinite(s.values?.snow)&&Math.abs(h-s.alt)<=220)
     .map(s=>({s,d:Math.hypot((e.latlng.lat-s.lat)*111.2,(e.latlng.lng-s.lon)*77.25)})).filter(p=>p.d<=6).sort((a,b)=>a.d-b.d);
    const site=points[0]?.s;
    if(site)nearby='<br><small>Relevé proche · '+escape(site.name)+'<br>'+formatter.format(site.values.snow)+' cm à '+formatter.format(site.alt)+' m · '+dayLabel(site.bulletinDay)+'</small>';
   }
   L.popup({closeButton:false}).setLatLng(e.latlng).setContent(label+nearby).openOn(map);
  });
 }
 async function geometry(){
  if(terrain&&shape)return;
  if(demPromise)return demPromise;
  demPromise=(async()=>{
   const [heights,line]=await Promise.all([
    terrain?null:fetch('assets/observations-terrain.bin').then(r=>{if(!r.ok)throw Error('Relief indisponible');return r.arrayBuffer();}),
    shape?null:fetchJSON('assets/haute-savoie.geojson')
   ]);
   if(heights){terrain=Field.terrain(heights);L.imageOverlay(relief(terrain),bounds,{pane:'obsTerrain',opacity:.5,interactive:false,alt:''}).addTo(map);}
   if(line){shape=L.geoJSON(line,{pane:'obsLine',interactive:false,style:{color:'#345b66',weight:1.7,opacity:.85,fill:false}}).addTo(map);}
   geometryError=false;
  })().catch(()=>{geometryError=true;}).finally(()=>{demPromise=null;if(active)render();});
  return demPromise;
 }
 function filterBar(){
  $('obs-filters').innerHTML=filters[mode].map(key=>[key,metrics[key]]).map(([key,m])=>
   '<button data-metric="'+key+'" aria-pressed="'+(metric===key)+'">'+icon(m.icon)+(m.brief||m.label)+'</button>').join('');
  $('obs-calendar').hidden=mode!=='daily';
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
  const input=snapshotForMode()?.stations||[];
  if(inSnow()){
   const minDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now()-86400000);
   return (snowSnapshot?.stations||[]).filter(s=>s.bulletinDay?s.bulletinDay>=minDay:s.time>=Date.now()-36*3600000);
  }
  return mode!=='live'?input:input.filter(s=>s.time>=Date.now()-90*minute&&s.time<=Date.now()+minute);
 }
 function render(){
  if(!active||!map)return;
  const snapshot=snapshotForMode(),records=visibleRecords().filter(s=>Number.isFinite(s.values?.[metric]));
  const t=fieldTime(),model=t!==null&&frames[mode]?.time===t?frames[mode]:null,acc=inRain()?currentRain():null;
  const signature=[mode,metric,snapshot?.retrievedAt,inSnow()?snowSnapshot?.retrievedAt:0,records.map(s=>s.id).join('.'),model?.time,acc?.time,!!terrain].join('/');
  if(terrain&&signature!==fieldKey){
   if(layer){map.removeLayer(layer);layer=null;}
   fieldKey=signature;field=model||acc||records.length?Field.analyze(metric,terrain,records,model,acc):null;
   if(field&&field.values.some(Number.isFinite))layer=L.imageOverlay(colored(metric,field.values,field.confidence),bounds,{pane:'obsField',opacity:.88,interactive:false,alt:'Carte en couleurs · '+metrics[metric].label}).addTo(map);
  }
  key();
  const n=field?.used||0,stationText=n+' station'+(n>1?'s':'');
  let caption,method;
  if(mode==='daily'){
   const day=requestedDay||snapshot?.day;
   if(day&&dateBox.value!==day)dateBox.value=day;
   caption=day?metrics[metric].label+' · '+dayLabel(day):'Chargement du bilan…';
   method=snapshot?(n?stationText+' pour estimer les couleurs. '+(['snow','reportTemp'].includes(metric)?'Dernier relevé de montagne de chaque poste ce jour-là.':'Les postes manuels peuvent transmettre en fin de mois.'):'Aucun relevé publié pour ce filtre à cette date.'):'Chargement des relevés…';
  }else{
   const valid=acc?.time??model?.time??(mode==='hourly'?snapshot?.time:records.length?Math.max(...records.map(s=>s.time)):null);
   caption=valid?metrics[metric].label+' · '+stamp(valid):busy||modelBusy||rainBusy?'Chargement de la carte…':'Données indisponibles';
   const origin=field?.radar?'Radar et pluviomètres MétéoSuisse':field?.model?(metric==='snow'?'Neige modélisée par Open-Meteo':'Modèle Météo-France via Open-Meteo'):n?'Estimation entre les stations':'';
   method=origin+(n&&origin?(field.model||field.radar?' · corrigé localement avec ':' · ')+stationText:'')+'.';
   if(metric==='snow'&&n){
    const reports=field.resorts||0;
    method=origin+' · '+n+' relevé'+(n>1?'s':'')+' par altitude'+(reports?', dont '+reports+' des domaines skiables':'')+'.';
   }
   if(!origin)method=busy||modelBusy||rainBusy?'Les données sont en cours de chargement.':'Aucune donnée pour ce filtre à cette heure.';
  }
  $('obs-caption').textContent=caption;$('obs-method').textContent=method;
  const warnings=[];
  if(geometryError)warnings.push('Fond départemental indisponible.');
  if(!navigator.onLine)warnings.push('Hors connexion.');
  if(inRain()&&rainFailed&&!acc)warnings.push(model?'Radar indisponible. Cumul estimé par le modèle.':'Cumul radar indisponible.');
  if(modelFailed&&mode!=='daily'&&!model&&!acc)warnings.push('Grille Open-Meteo indisponible.');
  if(inSnow()&&(snowFailed||snowSnapshot?.missing?.length))warnings.push('Certains relevés de neige sont indisponibles.');
  if(!inSnow()&&failed)warnings.push(snapshot?'Derniers relevés enregistrés.':'Les relevés des stations sont momentanément indisponibles.');
  if(!inSnow()&&snapshot?.missing?.length)warnings.push('Réception partielle · '+snapshot.missing.join(', ')+'.');
  $('obs-alert').textContent=warnings.join(' ');$('obs-alert').hidden=!warnings.length;
 }
 function fieldTime(){
  if(mode==='daily')return null;
  const current=Math.floor(Date.now()/3600000)*3600000;
  if(mode==='live')return current;
  const t=snapshotForMode()?.time;
  return Number.isFinite(t)&&t<=current&&t>=current-48*3600000?t:null;
 }
 function stopModel(){modelRequest?.abort();modelRequest=null;modelBusy=false;}
 async function loadField(force=false){
  const t=fieldTime(),selected=mode;
  if(!active||t===null||modelRequest||(!force&&frames[selected]?.time===t))return;
  if(!force&&modelRetry===t&&Date.now()-lastModelAttempt<2*minute)return;
  const ctl=new AbortController();modelRequest=ctl;modelBusy=true;modelFailed=false;
  modelRetry=t;lastModelAttempt=Date.now();render();
  try{
   const frame=await fetchJSON(service.base+'meteo74-observations?mode=field&time='+t,ctl.signal,42000,service.headers);
   if(ctl!==modelRequest||selected!==mode)return;
   if(frame.mode!=='field'||frame.time!==t||!Array.isArray(frame.values?.temp)||frame.values.temp.length!==frame.nx*frame.ny)throw Error('Grille invalide');
   frames[selected]=frame;fieldKey='';storage.set('obs-v2-model-'+selected,frame);
  }catch{if(modelRequest===ctl)modelFailed=true;}
  finally{if(modelRequest===ctl){modelRequest=null;modelBusy=false;render();}}
 }
 async function loadSnow(force=false){
  if(!inSnow()||snowRequest||(!force&&snowSnapshot&&Date.now()-snowSnapshot.retrievedAt<10*minute))return;
  const ctl=new AbortController();snowRequest=ctl;snowFailed=false;
  try{
   const next=await fetchJSON(service.base+'meteo74-observations?mode=snow',ctl.signal,40000,service.headers);
   if(snowRequest!==ctl)return;
   if(next.mode!=='snow'||!Array.isArray(next.stations))throw Error('Relevés neige invalides');
   snowSnapshot=next;storage.set('obs-snow-surface',next);fieldKey='';
  }catch{if(snowRequest===ctl)snowFailed=true;}
  finally{if(snowRequest===ctl){snowRequest=null;render();}}
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
  loadField(force);if(inSnow())loadSnow(force);
  if(inRain())loadRain(force);
  const selected=mode,day=requestedDay,snap=snapshotForMode(),ttl=mode==='live'?3*minute:30*minute;
  if(request||(!force&&snap&&Date.now()-snap.retrievedAt<ttl)){render();return;}
  const ctl=new AbortController();request=ctl;busy=true;failed=false;render();
  try{
   const next=await fetchJSON(service.base+'meteo74-observations?mode='+selected+(selected==='daily'&&day?'&date='+day:''),ctl.signal,40000,service.headers);
   if(request!==ctl||mode!==selected)return;
   if(next.mode!==selected||!Array.isArray(next.stations))throw Error('Observations invalides');
   if(selected==='daily'){if(!/^\d{4}-\d{2}-\d{2}$/.test(next.day)||(day&&next.day!==day))throw Error('Date du relevé incorrecte');next.selection=day;}
   snapshots[selected]=next;storage.set('obs-v1-'+selected,next);if(selected==='hourly')loadField();
  }catch{if(request===ctl)failed=true;}
  finally{if(request===ctl){request=null;busy=false;render();}}
 }
 function stop(){request?.abort();request=null;busy=false;stopRain();stopModel();snowRequest?.abort();snowRequest=null;clearInterval(interval);}
 function schedule(){clearInterval(interval);interval=setInterval(()=>refresh(),minute);}
 function enter(){active=true;initMap();filterBar();map.invalidateSize({pan:false});geometry();schedule();refresh();}
 $('obs-center').onclick=fit;
 $('obs-modes').onclick=e=>{
  const b=e.target.closest('[data-mode]');if(!b||b.dataset.mode===mode)return;
  stop();mode=b.dataset.mode;storage.set('obs-mode',mode);if(!filters[mode].includes(metric)){metric=defaults[mode];storage.set('obs-metric',metric);}
  failed=false;rainFailed=false;modelFailed=false;modelRetry=null;fieldKey='';map.closePopup();filterBar();schedule();refresh();
 };
 function chooseDay(day){
  if(day===requestedDay)return;
  stop();requestedDay=day;storage.set('obs-selected-day',day);dateBox.value=day||'';
  failed=false;map.closePopup();schedule();refresh();
 }
 dateBox.onchange=()=>{if(dateBox.value&&dateBox.validity.valid)chooseDay(dateBox.value);};
 $('obs-latest').onclick=()=>chooseDay(null);
 $('obs-filters').onclick=e=>{
  const b=e.target.closest('[data-metric]');if(!b||b.dataset.metric===metric)return;
  stopRain();metric=b.dataset.metric;storage.set('obs-metric',metric);map.closePopup();
  for(const item of $('obs-filters').children)item.setAttribute('aria-pressed',String(item===b));
  b.scrollIntoView({block:'nearest',inline:'nearest'});refresh();
 };
 return {enter,leave(){active=false;stop();map?.closePopup();},suspend:stop,refresh(force=false){if(active)schedule();return refresh(force);}};
}
root.MeteoObservations={create};
})(globalThis);
