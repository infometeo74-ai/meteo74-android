/* Météo74 radar playback. Network and raster preparation are independent of the animation clock. */
(function(root){
'use strict';
function create({$,C,storage,icon,escape,fetchJSON,place}) {
    const speeds=[.5,1,2,4], storedSpeed=Number(storage.get('radar.speed',1));
    let speed=speeds.includes(storedSpeed)?storedSpeed:1, snow=storage.get('radar.snow',false)===true;
    const storedOpacity=Number(storage.get('radar.opacity',.75));let opacity=storedOpacity>=.2&&storedOpacity<=1?storedOpacity:.75;
    let map,marker,paint,shade,painter,paintView,shadeView,worker,local,metaAbort,view;
    let provider='swiss',frames=[],active=false,suspended=false,wants=true,metadataAt=0,metaSeq=0,sequence=0;
    let index=0,progress=0,raf=0,lastTick=null,buffering=true,bufferStart=0,msPerFrame=0,sampleToken=0,terrainFailed=false,lastUI=0;
    let warmPending=false;
    const still=[0,0];
    const ready=new Map(),pending=new Set(),failed=new Set(),motions=new Map();
    const ui=(id,value)=>{if($(id).textContent!==value)$(id).textContent=value;};
    const visible=()=>active&&!suspended&&!document.hidden;
    const timeFormat=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'});
    const clock=t=>timeFormat.format(t*1000);
    function controls(){
        $('radar-play').innerHTML=icon(wants?'pause':'play');$('radar-play').setAttribute('aria-label',wants?'Mettre en pause':'Lancer l’animation');
        $('radar-play').setAttribute('aria-pressed',String(wants));$('radar-play').disabled=!frames.length;
        $('radar-range').disabled=frames.length<2;$('radar-speed').value=String(speed);$('radar-snow').checked=snow;$('radar-opacity').value=String(Math.round(opacity*100));
    }
    function legend(){
        const swiss=provider==='swiss',france=provider==='france',numeric=swiss||france;
        for(const name of ['swiss','france','europe']){
            const selected=provider===name,button=$('radar-'+name);
            button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
        }
        $('radar-snow').closest('label').hidden=france;
        const bands=RadarRender.intensityBands;
        const row=(label,kind)=>{
            const scale=numeric?'<i class="band-key">'+bands.map(b=>'<span style="background:'+b[kind]+'"></span>').join('')+'</i>':'<i class="eu-'+(kind==='rain'?'key':'snow-key')+'"></i>';
            return '<div class="scale-row"><b>'+label+'</b>'+scale+'</div>';
        };
        $('radar-legend').className='radar-legend '+(numeric?'swiss-legend':'europe-legend');
        const values=france?FranceRadar.bands:bands.map(b=>b.from===0?'&lt;0,1':b.from===50?'50+':b.from.toLocaleString('fr-FR'));
        const ticks=numeric?values.map(n=>'<span>'+n+'</span>').join(''):'<span>Faible</span><span>Forte</span>';
        $('radar-legend').innerHTML=row(swiss?'mm/h':france?'dBZ':'Intensité','rain')+(snow&&!france?row('Neige probable','snow'):'')+'<div class="scale-caption">'+ticks+'</div>';
        const sources={
            swiss:'<a href="https://opendatadocs.meteoswiss.ch/d-radar-data/d1-precipitation-radar-products">MétéoSuisse</a>'+(snow?' · <a href="https://open-meteo.com/">Open-Meteo</a>':''),
            france:'<a href="https://www.eumetnet.eu/observations/weather-radar-network/">Météo-France · EUMETNET OPERA</a>',
            europe:'<a href="https://www.rainviewer.com/">RainViewer</a>'
        };
        $('radar-source').innerHTML=sources[provider];
    }
    function messages(){
        if(!frames.length)return;
        const notes=[];
        if(Date.now()/1000-frames[frames.length-1].time>1800)notes.push('Dernière observation reçue il y a plus de 30 min.');
        if(failed.size)notes.push('Certaines images sont indisponibles.');
        if(terrainFailed)notes.push('Relief partiellement indisponible.');
        if(snow&&provider==='swiss'&&ready.get(frames[index]?.time)?.phaseReady===false)notes.push('Type de précipitations indisponible sur une partie de la carte.');
        notes.push(provider!=='europe'?'Mesures espacées de 5 min. Mouvement interpolé. Touchez la carte pour lire une mesure.':'Images espacées de 10 min. Mouvement interpolé.');
        if(provider!=='europe')notes.push('Hachures : mesure indisponible.');
        ui('radar-message',notes.join(' '));
    }
    function send(message){if(worker)worker.postMessage(message);else if(local)Promise.resolve().then(()=>local(message));}
    function enableFallback(){
        worker?.terminate();worker=null;local=RadarRender.engine(receive);
        if(view&&visible())prepare(true);
    }
    function startRenderer(){
        if(worker||local)return;
        if(root.Worker&&root.OffscreenCanvas&&root.createImageBitmap){
            try{worker=new Worker('radar-worker.js');worker.onmessage=e=>receive(e.data);worker.onerror=e=>{e.preventDefault();enableFallback();};return;}catch{}
        }
        enableFallback();
    }
    function position(canvas,area){
        if(!area||!canvas)return;
        const a=map.latLngToLayerPoint(area.nw),b=map.latLngToLayerPoint(area.se);
        L.DomUtil.setPosition(canvas,a);canvas.style.width=Math.max(1,b.x-a.x)+'px';canvas.style.height=Math.max(1,b.y-a.y)+'px';
    }
    function reposition(){position(paint,paintView);position(shade,shadeView);}
    function surface(pane,name,tag='canvas'){const c=document.createElement(tag);c.className='radar-surface '+name;c.setAttribute('aria-hidden','true');pane.appendChild(c);return c;}
    function initMap(){
        const chosen=place(),p=chosen||{latitude:46.02,longitude:6.38};map=L.map('map',{minZoom:4,maxZoom:14,zoomAnimation:false,fadeAnimation:false}).setView([p.latitude,p.longitude],8);
        for(const [name,z] of [['base',200],['relief',300],['department',320],['radar',350]]){const pane=map.createPane(name);pane.style.zIndex=z;pane.style.pointerEvents='none';}
        map.getPane('base').classList.add('muted-basemap');map.attributionControl.setPrefix(false);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,pane:'base',attribution:'© <a href="https://www.openstreetmap.org/copyright">OSM</a>'}).addTo(map);
        map.attributionControl.addAttribution('Relief <a href="https://registry.opendata.aws/terrain-tiles/">Mapzen</a>');
        paint=surface(map.getPane('radar'),'precip-layer','div');paint.style.opacity=opacity;painter=RadarPlayback.createPainter(paint);shade=surface(map.getPane('relief'),'relief-layer');
        marker=L.circleMarker([p.latitude,p.longitude],{radius:5,color:'#fff',weight:2,fillColor:'#164967',fillOpacity:1,interactive:false});
        if(chosen)marker.addTo(map);
        fetch('assets/haute-savoie.geojson').then(r=>r.json()).then(feature=>{
            const polygons=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
            const world=[[-85,-540],[-85,540],[85,540],[85,-540]];
            const rings=polygons.flatMap(p=>p.map(r=>r.map(([lon,lat])=>[lat,lon])));
            const pane='department',interactive=false;
            L.polygon([world,...rings],{pane,interactive,stroke:false,fillColor:'#2a4056',fillOpacity:.12,fillRule:'evenodd',smoothFactor:.3}).addTo(map);
            L.geoJSON(feature,{pane,interactive,style:{pane,color:'#356071',opacity:.82,weight:1.7,fill:false,smoothFactor:.3}}).addTo(map);
        }).catch(()=>{ui('radar-message','Contour départemental indisponible.');});
        map.on('move zoom resize',reposition);map.on('moveend resize',()=>{if(visible()&&frames.length)prepare();});map.on('click',inspect);
        startRenderer();legend();controls();
    }
    function closeImages(){for(const data of ready.values())data.image.close?.();ready.clear();pending.clear();failed.clear();motions.clear();}
    function viewGeometry(){
        const p=map.getPixelBounds(),size=map.getSize(),padX=Math.ceil(size.x*.13),padY=Math.ceil(size.y*.13),z=map.getZoom();
        const left=p.min.x-padX,top=p.min.y-padY,cssW=size.x+padX*2,cssH=size.y+padY*2;
        const scale=Math.min(root.devicePixelRatio||1,1.6,800/cssW,650/cssH),w=Math.max(32,Math.round(cssW*scale)),h=Math.max(32,Math.round(cssH*scale));
        return {left,top,cssW,cssH,w,h,z,nw:map.unproject([left,top],z),se:map.unproject([left+cssW,top+cssH],z)};
    }
    function prepare(force=false){
        if(!visible()||!frames.length||!map)return;
        const geom=viewGeometry(),bounds=map.getPixelBounds();
        if(!force&&view&&view.z===geom.z&&view.cssW===geom.cssW&&view.cssH===geom.cssH&&
            bounds.min.x>=view.left&&bounds.min.y>=view.top&&bounds.max.x<=view.left+view.cssW&&bounds.max.y<=view.top+view.cssH)return;
        painter.hold();closeImages();terrainFailed=false;lastTick=null;buffering=true;bufferStart=performance.now();msPerFrame=0;
        const g={...geom,id:++sequence,provider,snow,firstTime:frames[0].time,lastTime:frames[frames.length-1].time};view=g;
        send({type:'prepare',view:g});pump();schedule();
    }
    function pump(){
        if(!visible()||!view)return;
        const budget=wants?frames.length:Math.min(3,frames.length);
        for(let d=0;d<budget&&pending.size<3;d++){
            const f=frames[(index+d)%frames.length];if(!f||ready.has(f.time)||pending.has(f.time)||failed.has(f.time))continue;
            pending.add(f.time);send({type:'frame',id:view.id,frame:f});
        }
    }
    function nextIndex(from){for(let d=1;d<frames.length;d++){const j=(from+d)%frames.length;if(!failed.has(frames[j].time))return j;}return from;}
    function receive(m){
        if(!m||m.type==='ready')return;
        if(!view||m.id!==view.id||!visible()){m.image?.close?.();return;}
        if(m.type==='sample'){
            if(m.token!==sampleToken||!sampleLocation)return;
            const value=provider==='france'?(m.dry?'Aucun écho détecté':m.dbz==null?'Pas de mesure à cet endroit':C.fmt(m.dbz,1)+' dBZ'):m.rate==null?'Pas de mesure à cet endroit':m.rate===0?'Aucune précipitation détectée':C.fmt(m.rate,m.rate<1?2:1)+' mm/h';
            L.popup({autoPan:false}).setLatLng(sampleLocation).setContent('<b>'+value+'</b>'+(m.phase?'<br>'+m.phase:'')+'<br>Mesure de '+clock(m.time)).openOn(map);return;
        }
        if(m.type==='terrain'){shade.width=view.w;shade.height=view.h;shade.getContext('2d').drawImage(m.image,0,0);m.image.close?.();shadeView=view;position(shade,shadeView);terrainFailed=!m.complete;messages();return;}
        if(m.type==='terrainError'){terrainFailed=true;messages();return;}
        pending.delete(m.key);
        if(!frames.some(frame=>frame.time===m.key)){m.image?.close?.();pump();return;}
        if(m.type==='frame'){
            ready.set(m.key,m);
            for(const match of m.motions)motions.set(match.from+'/'+match.to,match.offset);
            warmNext();
            msPerFrame=(performance.now()-bufferStart)/ready.size;
        }else if(m.type==='error'){
            failed.add(m.key);if(frames[index]?.time===m.key&&failed.size<frames.length){index=nextIndex(index);progress=0;lastTick=null;buffering=true;}
            if(failed.size===frames.length){fail('Images radar indisponibles');return;}
        }
        pump();schedule();messages();
    }
    function fail(message){ui('radar-badge',message);$('retry-radar').hidden=false;ui('radar-message',message+'. Touchez Réessayer pour relancer le chargement.');}
    function schedule(){if(!raf&&visible())raf=requestAnimationFrame(tick);}
    function bufferedAhead(){
        let count=0;
        for(let d=0;d<frames.length;d++){
            const time=frames[(index+d)%frames.length].time;
            if(failed.has(time))continue;
            if(!ready.has(time))break;
            count++;
        }
        return count;
    }
    function pair(from=index){
        const f=frames[from],j=nextIndex(from),n=frames[j],gap=n.time-f.time;
        const interval=RadarPlayback.interval(gap,provider==='europe'?600:300,j<=from);
        return {f,j,n,gap,...interval,a:ready.get(f.time),b:ready.get(n.time)};
    }
    function motionFor(segment){return motions.get(segment.f.time+'/'+segment.n.time)||still;}
    function warmNext(){
        if(warmPending||!visible()||!wants||buffering)return;
        warmPending=true;
        const warm=()=>{
            warmPending=false;
            if(!visible()||paintView!==view||!view||!frames.length||!wants||buffering)return;
            const next=pair(nextIndex(index));
            if(next.connected&&next.a&&next.b)painter.prepareNext(next.a,next.b,motionFor(next),next.duration/speed);
        };
        if(root.requestIdleCallback)root.requestIdleCallback(warm,{timeout:48});
        else setTimeout(warm,0);
    }
    function tick(now){
        raf=0;if(!visible()||!frames.length||!view)return;
        let segment=pair();
        const count=frames.length-failed.size,remaining=count-ready.size;
        if(!segment.a){
            if(remaining>0)ui('radar-badge','Préparation · '+ready.size+'/'+count);
            lastTick=null;return; // A worker message wakes the player.
        }
        if(wants&&count>1&&!segment.b)buffering=true;
        let elapsed=lastTick===null?0:Math.max(0,now-lastTick)*speed;
        if(wants&&buffering){
            const period=RadarPlayback.observationDuration*(provider==='europe'?2:1);
            buffering=!RadarPlayback.bufferSufficient(bufferedAhead(),remaining,count,period,speed,msPerFrame);
            elapsed=0;
        }
        let running=wants&&count>1&&!buffering&&!!segment.b;
        lastTick=running?now:null;
        if(running){
            let timeInPair=progress*segment.duration+elapsed;
            // Carry the exact time across observations so dropping a display refresh never stops the clock.
            while(timeInPair>=segment.duration){
                timeInPair-=segment.duration;index=segment.j;segment=pair();pump();
                if(!segment.b){buffering=true;running=false;lastTick=null;timeInPair=0;break;}
            }
            progress=timeInPair/segment.duration;
        }
        const {a,b,f,n,gap}=segment,interpolate=segment.connected&&!!b,t=interpolate?progress:0;
        if(paintView!==view){paintView=view;position(paint,view);}
        const changed=painter.show(a,interpolate?b:null,interpolate?motionFor(segment):still,t,segment.duration/speed,running,now);
        if(changed&&running)warmNext();
        if(now-lastUI>=90||!running||!lastUI){
            lastUI=now;const time=Math.round(f.time+t*gap),label=clock(time);ui('radar-time',label);
            const range=$('radar-range');if(+range.value!==time)range.value=time;
            const badge=wants&&buffering&&count>1?'Préparation · '+ready.size+'/'+count:(t>0?'Relecture · ':'Mesure · ')+label;
            ui('radar-badge',badge);if(range.getAttribute('aria-valuetext')!==label)range.setAttribute('aria-valuetext',label);
        }
        if(running)schedule();
    }
    function nearest(time){let best=0;for(let i=1;i<frames.length;i++)if(Math.abs(frames[i].time-time)<Math.abs(frames[best].time-time))best=i;return best;}
    function seek(i){failed.delete(frames[i].time);index=i;progress=0;lastTick=null;buffering=true;wants=false;controls();pump();schedule();}
    let sampleLocation=null;
    function inspect(e){
        if(provider==='europe'||!view||paintView!==view||!ready.get(frames[index]?.time))return;
        let i=index;if(progress>=.5){const j=nextIndex(index);if(j>i&&ready.has(frames[j].time))i=j;}
        seek(i);sampleLocation=e.latlng;const pt=map.project(e.latlng,view.z);send({type:'sample',id:view.id,token:++sampleToken,frame:frames[i],lon:e.latlng.lng,lat:e.latlng.lat,x:(pt.x-view.left)/view.cssW,y:(pt.y-view.top)/view.cssH});
    }
    async function metadata(force=false){
        if(!visible())return;
        if(!force&&(metaAbort||Date.now()-metadataAt<285000)&&frames.length){if(!view)prepare();return;}
        if(metaAbort&&!force)return;
        metaAbort?.abort();const controller=new AbortController();metaAbort=controller;const seq=++metaSeq;
        if(!frames.length){ui('radar-badge','Chargement du radar…');ui('radar-message','Préparation de l’animation…');}$('retry-radar').hidden=true;
        try{
            let list;
            if(provider==='swiss')list=await SwissRadar.loadFrames(fetchJSON,controller.signal);
            else if(provider==='france')list=await FranceRadar.loadFrames(fetchJSON,controller.signal);
            else{
                const data=await fetchJSON('https://api.rainviewer.com/public/weather-maps.json',controller.signal,18000),host=new URL(data.host);
                if(host.protocol!=='https:'||!(host.hostname==='rainviewer.com'||host.hostname.endsWith('.rainviewer.com')))throw Error();
                list=(data.radar?.past||[]).filter(f=>Number.isFinite(f.time)&&/^\/v2\/radar\/[a-zA-Z0-9_-]+$/.test(f.path)).sort((a,b)=>a.time-b.time).map(f=>({time:f.time,url:host.origin+f.path}));
            }
            if(seq!==metaSeq||!visible())return;if(!list.length)throw Error();metadataAt=Date.now();
            const changed=list.length!==frames.length||list.some((f,i)=>f.url!==frames[i]?.url);
            if(changed||!view||force){
                const old=frames[index]?.time,oldNext=frames[nextIndex(index)]?.time;
                const byTime=new Map(frames.map(f=>[f.time,f.url])),first=list[0].time,last=list[list.length-1].time;
                const reuse=view&&!force&&list.every(f=>!byTime.has(f.time)||byTime.get(f.time)===f.url)&&
                    !(provider==='swiss'&&snow&&Math.floor(last/3600)!==Math.floor(view.lastTime/3600));
                frames=list;index=old?nearest(old):0;
                if(!reuse||old!==frames[index].time||oldNext!==frames[nextIndex(index)]?.time){progress=0;lastTick=null;buffering=true;}
                const range=$('radar-range');range.min=first;range.max=last;range.step='1';
                ui('radar-first',clock(first));ui('radar-last',clock(last));controls();
                if(reuse){
                    const keep=new Set(list.map(f=>f.time));
                    for(const [key,data] of ready)if(!keep.has(key)){data.image.close?.();ready.delete(key);}
                    for(const key of failed)if(!keep.has(key))failed.delete(key);
                    for(const key of motions.keys())if(!key.split('/').every(time=>keep.has(Number(time))))motions.delete(key);
                    view.firstTime=first;view.lastTime=last;pump();schedule();
                }else {range.value=frames[index].time;prepare(true);}
                messages();
            }
        }catch(e){if(!controller.signal.aborted&&seq===metaSeq){if(!frames.length)fail('Radar indisponible');else{messages();$('retry-radar').hidden=false;}}}
        finally{if(seq===metaSeq)metaAbort=null;}
    }
    function cancelWork(){
        cancelAnimationFrame(raf);raf=0;lastTick=null;painter?.hold();metaAbort?.abort();metaAbort=null;++metaSeq;
        if(view){send({type:'stop'});view=null;}closeImages();++sampleToken;
    }
    function enter(){
        const entering=!active;active=true;suspended=false;if(!map)initMap();map.invalidateSize({pan:false});
        if(entering){wants=true;controls();}if(frames.length&&!view)prepare();metadata();schedule();
    }
    function leave(){active=false;cancelWork();map?.closePopup();}
    function suspend(){if(suspended)return;suspended=true;cancelWork();}
    function resume(){if(!active||document.hidden)return;if(suspended){suspended=false;map?.invalidateSize({pan:false});}if(frames.length&&!view)prepare();metadata();schedule();}
    function changeSource(name){if(name===provider)return;cancelWork();map.closePopup();provider=name;metadataAt=0;frames=[];index=0;progress=0;wants=true;paintView=null;painter.clear();ui('radar-time','—');ui('radar-first','—');ui('radar-last','—');
        if(name==='france')map.fitBounds([[41.25,-5.2],[51.15,9.65]],{padding:[8,8]});
        else if(name==='europe')map.fitBounds([[39,-8],[60,25]],{padding:[5,5]});
        else{const p=place();map.setView(p?[p.latitude,p.longitude]:[46.02,6.38],8);}
        legend();controls();metadata(true);}
    function refresh(){failed.clear();metadata(true);}
    for(const name of ['swiss','france','europe'])$('radar-'+name).onclick=()=>changeSource(name);
    $('radar-play').onclick=()=>{wants=!wants;lastTick=null;if(wants){buffering=true;map?.closePopup();}controls();pump();schedule();};
    $('radar-range').addEventListener('input',e=>{if(frames.length){map.closePopup();seek(nearest(Number(e.target.value)));}});
    $('radar-speed').onchange=e=>{const n=Number(e.target.value);if(speeds.includes(n)){speed=n;lastTick=null;storage.set('radar.speed',n);schedule();}};
    $('radar-snow').onchange=e=>{snow=e.target.checked;storage.set('radar.snow',snow);map?.closePopup();legend();ui('radar-badge','Actualisation des couches…');prepare(true);};
    $('radar-opacity').oninput=e=>{opacity=Number(e.target.value)/100;storage.set('radar.opacity',opacity);if(paint)paint.style.opacity=opacity;};
    $('recenter').onclick=()=>{const p=place();map?.setView(p?[p.latitude,p.longitude]:[46.02,6.38],8);};$('retry-radar').onclick=refresh;
    setInterval(()=>{if(visible()&&Date.now()-metadataAt>290000)metadata();},30000);
    return {enter,leave,resume,suspend,refresh,placeChanged(){if(map){
        const p=place();
        if(!p){marker.remove();return;}
        marker.setLatLng([p.latitude,p.longitude]).addTo(map);
        if(!active)map.setView([p.latitude,p.longitude],map.getZoom());
    }}};
}
root.MeteoRadar={create};
})(window);
