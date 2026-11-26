(function(root){
'use strict';
const Field=root.ObservationField,{grid,metrics}=Field;
const bounds=[[grid.south,grid.west],[grid.north,grid.east]];
const domain=[[45.679,5.802],[46.411,7.048]];
const formatter=new Intl.NumberFormat('fr-FR',{maximumFractionDigits:1});
const when=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const stamp=t=>when.format(t).replace(' à ',' · ');
const minute=60000;
const dayName=new Intl.DateTimeFormat('fr-FR',{timeZone:'UTC',day:'numeric',month:'long',year:'numeric'});
const dayLabel=day=>dayName.format(Date.parse(day+'T00:00:00Z'));
const filters=['temp','rain','wind','gust','humidity','pressure','snow'];
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
   px[j]=c[0];px[j+1]=c[1];px[j+2]=c[2];px[j+3]=metric==='snow'&&values[i]<.5?0:confidence?confidence[i]:values[i]===0?145:220;
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
 let active=false,map,terrain,shape,demPromise,geometryError=false,layer,refreshNames,field=null,fieldKey='';
 let metric='temp',resortStations=null,onStation=null,markers=null,lastQuery='',lastPanel=null;
 const bank={};
 let request=null,rainRequest=null,modelRequest=null,modelBusy=false,modelFailed=false,lastModelAttempt=0,modelRetry=null,interval;
 let snowSnapshot=storage.get('obs-snow-surface',null),snowRequest=null,snowFailed=false;
 const inSnow=()=>metric==='snow';
 let frame=storage.get('obs-v3-model',null);
 let busy=false,failed=false,rainBusy=false,rainFailed=false,rain=null,rainChecked=0;
 let snapshot=storage.get('obs-v1-live',null);
 if(!Array.isArray(snapshot?.stations))snapshot=null;
 const inRain=()=>metric==='rain';
 const currentRain=()=>rain&&rain.time>=Date.now()-45*minute&&rain.time<=Date.now()+minute?rain:null;
 function fit(){if(map){map.invalidateSize({pan:false});map.fitBounds(domain,{padding:[12,12],animate:false});}}
 function initMap(){
  if(map)return;
  map=L.map('obs-map',{attributionControl:true,zoomSnap:.25,zoomDelta:1,minZoom:7,maxZoom:14,scrollWheelZoom:false});
  map.attributionControl.setPrefix(false);
  markers=L.layerGroup().addTo(map);map.on('zoomend',drawFlakes);
  refreshNames=root.MeteoMapPlaces.attach(map);
  map.createPane('obsTerrain').style.zIndex=310;map.createPane('obsField').style.zIndex=325;
  map.createPane('obsLine').style.zIndex=335;
  fit();
  map.on('click',e=>{
   if(!field)return;
   const k=Field.indexAt(e.latlng.lng,e.latlng.lat);
   if(k<0||!(terrain?.[k]&32768))return;
   const v=field.values[k],m=metrics[metric];
   const label=Number.isFinite(v)?m.label+'<br><b>'+formatter.format(metric==='snow'?Math.round(v):v)+' '+m.unit+'</b>'+(metric==='snow'?'<br>Terrain ≈ '+formatter.format(terrain[k]&32767)+' m':''):'Donnée indisponible ici';
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
  $('obs-filters').innerHTML=filters.map(key=>[key,metrics[key]]).map(([key,m])=>
   '<button data-metric="'+key+'" aria-pressed="'+(metric===key)+'">'+icon(m.icon)+(m.brief||m.label)+'</button>').join('');

 }
 function key(){
  const m=metrics[metric],ticks=m.ticks;
  const position=v=>{for(let i=1;i<ticks.length;i++)if(v<=ticks[i])return 100*(i-1+(v-ticks[i-1])/(ticks[i]-ticks[i-1]))/(ticks.length-1);return 100;};
  $('obs-key-name').textContent=m.label;$('obs-key-unit').textContent=m.unit;
  $('obs-scale').style.background='linear-gradient(to right,'+m.colors.map((c,i)=>c+' '+position(m.stops[i])+'%').join(',')+')';
  $('obs-ticks').innerHTML=ticks.map(n=>'<span>'+formatter.format(n)+(metric==='snow'&&n===300?' +':'')+'</span>').join('');
 }
 function visibleRecords(){
  const input=snapshot?.stations||[];
  if(inSnow()){
   const minDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(Date.now()-86400000);
   return (snowSnapshot?.stations||[]).filter(s=>s.bulletinDay?s.bulletinDay>=minDay:s.time>=Date.now()-36*3600000);
  }
  return input.filter(s=>s.time>=Date.now()-90*minute&&s.time<=Date.now()+minute);
 }
 function render(){
  if(!active||!map)return;
  const records=visibleRecords().filter(s=>Number.isFinite(s.values?.[metric]));
  const t=fieldTime(),model=frame?.time===t?frame:null,acc=inRain()?currentRain():null;
  const signature=[metric,inSnow()?0:snapshot?.retrievedAt,inSnow()?snowSnapshot?.retrievedAt:0,records.map(s=>s.id).join('.'),model?.time,acc?.time,!!terrain].join('/');
  if(terrain&&signature!==fieldKey){
   if(layer){map.removeLayer(layer);layer=null;}
   fieldKey=signature;field=model||acc||records.length?Field.analyze(metric,terrain,records,model,acc):null;
   if(field&&field.values.some(Number.isFinite))layer=L.imageOverlay(colored(metric,field.values,field.confidence),bounds,{pane:'obsField',opacity:.88,interactive:false,alt:'Carte en couleurs · '+metrics[metric].label}).addTo(map);
  }
  key();
  const n=field?.used||0,stationText=n+' station'+(n>1?'s':'');
  let caption,method;
  {
   const valid=acc?.time??model?.time??(records.length?Math.max(...records.map(s=>s.time||0)):null);
   caption=valid?metrics[metric].label+' · '+stamp(valid):busy||modelBusy||rainBusy?'Chargement de la carte…':'Données indisponibles';
   const origin=field?.radar?'Radar et pluviomètres MétéoSuisse':field?.model?(metric==='snow'?(model.snowSource||'Modèle de neige')+' via Open-Meteo':'Modèle Météo-France via Open-Meteo'):n?'Estimation entre les stations':'';
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
  if(modelFailed&&!model&&!acc)warnings.push('Grille Open-Meteo indisponible.');
  if(inSnow()&&(snowFailed||snowSnapshot?.missing?.length))warnings.push('Certains relevés de neige sont indisponibles.');
  if(!inSnow()&&failed)warnings.push(snapshot?'Derniers relevés enregistrés.':'Les relevés des stations sont momentanément indisponibles.');
  if(!inSnow()&&snapshot?.missing?.length)warnings.push('Réception partielle · '+snapshot.missing.join(', ')+'.');
  $('obs-alert').textContent=warnings.join(' ');$('obs-alert').hidden=!warnings.length;
 }
 const fieldTime=()=>Math.floor(Date.now()/3600000)*3600000;
 function stopModel(){modelRequest?.abort();modelRequest=null;modelBusy=false;}
 async function loadField(force=false){
  const t=fieldTime();
  if(!active||t===null||modelRequest||(!force&&frame?.time===t))return;
  if(!force&&modelRetry===t&&Date.now()-lastModelAttempt<2*minute)return;
  const ctl=new AbortController();modelRequest=ctl;modelBusy=true;modelFailed=false;
  modelRetry=t;lastModelAttempt=Date.now();render();
  try{
   const next=await fetchJSON(service.base+'meteo74-observations?mode=field&time='+t,ctl.signal,42000,service.headers);
   if(ctl!==modelRequest)return;
   if(next.mode!=='field'||next.time!==t||next.values?.temp?.length!==next.nx*next.ny)throw Error('Grille illisible');
   frame=next;storage.set('obs-v3-model',next);fieldKey='';modelRetry=null;
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
  loadField(force);if(inSnow()){loadSnow(force);render();return;}
  if(inRain())loadRain(force);
  if(request||(!force&&snapshot&&Date.now()-snapshot.retrievedAt<3*minute)){render();return;}
  const ctl=new AbortController();request=ctl;busy=true;failed=false;render();
  try{
   const next=await fetchJSON(service.base+'meteo74-observations?mode=live',ctl.signal,40000,service.headers);
   if(request!==ctl)return;
   if(next.mode!=='live'||!Array.isArray(next.stations))throw Error('Observations invalides');
   snapshot=next;storage.set('obs-v1-live',next);
  }catch{if(request===ctl)failed=true;}
  finally{if(request===ctl){request=null;busy=false;render();}}
 }
 function stop(){request?.abort();request=null;busy=false;stopRain();stopModel();snowRequest?.abort();snowRequest=null;clearInterval(interval);}
 function schedule(){clearInterval(interval);interval=setInterval(()=>refresh(),minute);}
 function drawFlakes(){
  if(!markers)return;
  markers.clearLayers();
  refreshNames?.();
  if(!resortStations)return;
  const groups=[];
  for(const station of resortStations){
   const pos=station.areas[0].points[0].slice(0,2),point=map.latLngToLayerPoint(pos);
   const group=groups.find(g=>point.distanceTo(g.point)<22);
   if(group)group.items.push(station);else groups.push({pos,point,items:[station]});
  }
  for(const {pos,items} of groups){
   const group=items.length>1,title=group?items.map(s=>s.name).join(' · '):items[0].name;
   const marker=L.marker(pos,{title,alt:title,icon:L.divIcon({className:'resort-marker',iconSize:[23,23],iconAnchor:[11,11],html:icon('snowflake')+(group?'<b>'+items.length+'</b>':'')})}).addTo(markers);
   if(!group){marker.on('click',()=>onStation?.(items[0]));continue;}
   const menu=document.createElement('div');menu.className='resort-choices';
   for(const station of items){
    const button=document.createElement('button');button.innerHTML=icon('snowflake')+escape(station.name);
    button.onclick=()=>onStation?.(station);menu.appendChild(button);
   }
   marker.bindPopup(menu,{maxHeight:190});
  }
 }
 function mount(target){
  const moved=lastPanel!==target;
  $(target).appendChild($('obs-panel'));active=true;initMap();map.invalidateSize({pan:false});
  if(moved){
   map.closePopup();
   if(bank[target])map.setView(bank[target].center,bank[target].zoom,{animate:false});else fit();
   lastPanel=target;fieldKey='';
  }
  geometry();schedule();refresh();
 }
 function enter(){
  resortStations=null;onStation=null;lastQuery='';
  const saved=storage.get('obs-metric','temp');metric=filters.includes(saved)?saved:'temp';
  mount('weather-map-host');filterBar();drawFlakes();
 }
 function resorts(stations,openStation,query){
  resortStations=stations;onStation=openStation;metric='snow';mount('snow-map-host');
  if(query!==lastQuery){
   if(query&&stations.length)map.fitBounds(stations.map(s=>s.areas[0].points[0].slice(0,2)),{padding:[30,30],maxZoom:11,animate:false});else fit();
   lastQuery=query;
  }
  drawFlakes();
 }
 function leave(){
  if(active&&map&&lastPanel)bank[lastPanel]={center:map.getCenter(),zoom:map.getZoom()};
  active=false;stop();map?.closePopup();markers?.clearLayers();
 }
 $('obs-center').onclick=fit;
 $('obs-filters').onclick=e=>{
  const b=e.target.closest('[data-metric]');if(!b||b.dataset.metric===metric)return;
  stopRain();metric=b.dataset.metric;storage.set('obs-metric',metric);map.closePopup();
  for(const item of $('obs-filters').children)item.setAttribute('aria-pressed',String(item===b));
  b.scrollIntoView({block:'nearest',inline:'nearest'});refresh();
 };
 return {enter,resorts,leave,suspend:stop,refresh(force=false){if(active)schedule();return refresh(force);}};
}
root.MeteoObservations={create};
})(globalThis);
