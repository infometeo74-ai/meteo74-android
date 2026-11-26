(function (root) {
    'use strict';
    const F = root.MeteoForecastModel;
    const area = [[45.48,5.48],[46.62,7.24]];
    const freshFor = 2*3600000, keepFor = 24*3600000;
    const keyOf = town => town.lat+','+town.lon;
    const overlap = (a,b) => a[0]<b[2] && b[0]<a[2] && a[1]<b[3] && b[1]<a[3];
    function create({$,fetchJSON,storage,C}) {
        let map,relief,outline,layer,overviewZoom=0,assets,loadingAssets,active=false;
        let revision=0,timer,clock,request,forceSince=0,trend=false,period,periodSignature='',openKey;
        let shown=new Map(),art={},periods=[],failed=new Map();
        const saved=storage.get('forecast-map-v1',[]);
        const cache=new Map((Array.isArray(saved)?saved:[]).filter(entry=>
            Array.isArray(entry) && entry[1]?.values && Date.now()-entry[1].time<keepFor));
        const measure=document.createElement('canvas').getContext('2d');
        const $periods=$('fm-periods'), $status=$('fm-status');
        function message(value) {$status.textContent=value;$status.hidden=!value;}
        function save() {
            const recent=[...cache].filter(([,r])=>Date.now()-r.time<keepFor).sort((a,b)=>b[1].time-a[1].time).slice(0,140);
            storage.set('forecast-map-v1',recent);
            if(cache.size>200) {
                const keep=new Set(recent.map(([key])=>key));
                for(const key of cache.keys()) if(!keep.has(key)&&!shown.has(key)) cache.delete(key);
            }
        }
        function entry(key) {
            const record=cache.get(key);
            return record && Date.now()-record.time<keepFor ? record : null;
        }
        function status() {
            if(!active||!period||!shown.size) return;
            const records=[...shown.keys()].map(entry);
            const ready=records.filter(r=>r?.values[period.key]).length;
            if(request && ready<records.length) message('Chargement des prévisions…');
            else if(ready<records.length) message(ready?'Prévisions indisponibles pour certains lieux.':'Prévisions indisponibles. Touchez Actualiser pour réessayer.');
            else if(records.some(r=>Date.now()-r.time>=freshFor)) message('Dernières prévisions enregistrées.');
            else message('');
        }
        function tip(town) {
            const box=document.createElement('div'),name=document.createElement('strong'),line=document.createElement('div'),details=document.createElement('div');
            name.textContent=town.name;line.className='fm-tip-period';line.textContent=(period.trend?'Tendance · ':'')+period.label+' · '+period.dateLabel;
            const value=entry(keyOf(town))?.values[period.key];
            if(value) {
                details.textContent=value.label;
                if(C.finite(value.low)&&C.finite(value.high)) {
                    const range=document.createElement('b');
                    const lo=C.fmt(value.low),hi=C.fmt(value.high);
                    range.textContent=lo===hi?lo+' °C':lo+' à '+hi+' °C';details.append(document.createElement('br'),range);
                }
            } else details.textContent=request?'Chargement…':'Prévision indisponible';
            box.append(name,line,details);return box;
        }
        function paint() {
            if(!period) return;
            for(const [key,item] of shown) {
                const {town,symbol,width,marker}=item, value=entry(key)?.values[period.key];
                const bbox=value && art[value.icon];
                const id=bbox?value.icon:'';
                if(symbol.dataset.icon!==id) {
                    symbol.dataset.icon=id;symbol.replaceChildren();
                    if(bbox) {
                        const [x,y,w,h]=bbox,factor=width/Math.max(w,h),img=document.createElement('img');
                        const height=h*factor;
                        symbol.style.width=w*factor+'px';symbol.style.height=height+'px';
                        Object.assign(img.style,{left:-x*factor+'px',top:-y*factor+'px',width:384*factor+'px',height:384*factor+'px'});
                        img.src='assets/weather/hd/'+id+'.webp';img.alt='';img.draggable=false;
                        symbol.append(img);
                    } else {
                        symbol.style.width='';symbol.style.height='';
                        const missing=document.createElement('span');missing.className='fm-missing';missing.textContent='·';symbol.append(missing);
                    }
                }
                const title=town.name+' · '+(value?.label||'Prévision indisponible');
                const el=marker.getElement();el.setAttribute('aria-label',title);el.title=title;
            }
            if(openKey && shown.has(openKey)) {
                const item=shown.get(openKey);
                if(item.marker.isPopupOpen()) item.marker.getPopup().setContent(tip(item.town));
            }
            status();
        }
        function controls(now=new Date()) {
            const next=F.periods(now);
            const selected=next.find(p=>p.key===period?.key && p.trend===trend) || next.find(p=>p.trend===trend);
            const signature=next[0].key+'|'+selected.key+'|'+trend;
            periods=next; period=selected;
            if(signature===periodSignature) return;
            periodSignature=signature;
            $('fm-short').setAttribute('aria-pressed',String(!trend));
            $('fm-trend').setAttribute('aria-pressed',String(trend));
            const fragment=document.createDocumentFragment();
            for(const p of periods.filter(p=>p.trend===trend)) {
                const b=document.createElement('button');b.type='button';b.dataset.key=p.key;
                b.setAttribute('aria-pressed',String(p.key===period.key));
                b.setAttribute('aria-label',p.label+' · '+p.dateLabel);b.textContent=p.label;
                if(p.kind==='day') {const small=document.createElement('small');small.textContent=p.dateLabel;b.append(small);}
                fragment.append(b);
            }
            $periods.replaceChildren(fragment);
            const chosen=$periods.querySelector('[aria-pressed="true"]');
            if(chosen) $periods.scrollLeft=Math.max(0,chosen.offsetLeft-($periods.clientWidth-chosen.offsetWidth)/2);
            paint();
        }
        function setBand(toTrend) {if(trend!==toTrend){trend=toTrend;controls();}}
        $('fm-short').onclick=()=>setBand(false);$('fm-trend').onclick=()=>setBand(true);
        $periods.onclick=e=>{const b=e.target.closest('button');if(!b)return;period=periods.find(p=>p.key===b.dataset.key);controls();};
        function data() {
            if(loadingAssets) return loadingAssets;
            loadingAssets=Promise.all(['forecast/towns.json','forecast/icon-bounds.json','haute-savoie.geojson'].map(name=>fetchJSON('assets/'+name))).then(([towns,icons,shape])=>{
                art=icons;return assets={towns,shape};
            }).catch(error=>{loadingAssets=null;throw error;});
            return loadingAssets;
        }
        function fit() {
            if(!map) return;
            map.invalidateSize({pan:false});
            overviewZoom=map.getBoundsZoom(L.latLngBounds(area));
            map.fitBounds(area,{animate:false});schedule();
        }
        $('fm-center').onclick=fit;
        function init() {
            if(map)return;
            map=L.map('forecast-map',{zoomControl:false,zoomSnap:.05,zoomDelta:1,minZoom:7,maxZoom:14,
                maxBounds:L.latLngBounds(area).pad(.25),maxBoundsViscosity:.9,scrollWheelZoom:false});
            map.attributionControl.setPrefix(false);
            L.control.zoom({position:'bottomright',zoomInTitle:'Zoomer',zoomOutTitle:'Dézoomer'}).addTo(map);
            root.MeteoMapPlaces.basemap(map,'tilePane');
            map.createPane('forecastTerrain').style.zIndex=310;
            map.createPane('forecastOutline').style.zIndex=315;
            relief=L.imageOverlay('assets/forecast/relief.webp',area,{pane:'forecastTerrain',interactive:false,alt:''}).addTo(map);
            outline=L.geoJSON(assets.shape,{pane:'forecastOutline',interactive:false,style:{color:'#466659',weight:1.5,fill:false,opacity:0}}).addTo(map);
            layer=L.layerGroup().addTo(map);
            map.on('moveend zoomend',schedule);
            map.on('resize',()=>{
                const atHome=Math.abs(map.getZoom()-overviewZoom)<.12;
                if(atHome) fit(); else {overviewZoom=map.getBoundsZoom(L.latLngBounds(area));schedule();}
            });
            map.on('popupclose',()=>{openKey=null;});
            fit();
        }
        function schedule() {
            clearTimeout(timer);const token=++revision;
            if(active) timer=setTimeout(()=>layout(token).catch(()=>{if(active&&token===revision)message('Carte indisponible. Touchez Actualiser pour réessayer.');}),65);
        }
        async function layout(token) {
            if(!active||!map||token!==revision)return;
            const bounds=map.getBounds(),size=map.getSize(),delta=map.getZoom()-overviewZoom;
            const opacity=Math.max(0,Math.min(1,1-(delta-.45)/1.7));
            relief.setOpacity(opacity);outline.setStyle({opacity:1-opacity});
            const detailed=delta>=.48;
            const rows=detailed?await root.MeteoMapPlaces.placesIn(bounds,true):[];
            if(!active||token!==revision)return;
            const sites=[],keys=new Set(),unit=Math.min(size.x/860,size.y/803);
            const baseWidth=Math.max(19,Math.min(45,57*unit));
            function add(town,isDetail) {
                const key=keyOf(town);if(keys.has(key)||!bounds.contains([town.lat,town.lon]))return;
                const p=map.latLngToContainerPoint([town.lat,town.lon]);
                const width=town.major?baseWidth:Math.max(17.5,baseWidth*52/57);
                if(p.x<width/2||p.x>size.x-width/2||p.y<width/2||p.y>size.y-width/2)return;
                if(isDetail && sites.some(s=>p.distanceTo(s.p)<Math.max(49,baseWidth*1.6)))return;
                keys.add(key);sites.push({town,key,p,width});
            }
            assets.towns.forEach(t=>add(t,false));
            const limitLevel=Math.min(12,Math.floor(8+delta*2.8));
            const detailRows=rows.filter(r=>r[3]<=limitLevel && r[1]/10000>=area[0][0] && r[1]/10000<=area[1][0] &&
                r[2]/10000>=area[0][1] && r[2]/10000<=area[1][1] && bounds.contains([r[1]/10000,r[2]/10000]));
            detailRows.sort((a,b)=>a[3]-b[3] || b[4]-a[4] || a[1]-b[1]);
            const cap=Math.max(24,Math.min(90,Math.floor(size.x*size.y/3500)));
            for(const [name,y,x] of detailRows) {
                if(sites.length>=cap)break;
                add({name,lat:y/10000,lon:x/10000,caption:name},true);
            }
            const origin=map.getContainer().getBoundingClientRect();
            const boxes=Array.from(map.getContainer().querySelectorAll('.leaflet-control')).map(node=>{
                const r=node.getBoundingClientRect();return [r.left-origin.left-2,r.top-origin.top-2,r.right-origin.left+2,r.bottom-origin.top+2];
            });
            for(const {p,width} of sites) boxes.push([p.x-width/2,p.y-width/2,p.x+width/2,p.y+width/2]);
            layer.clearLayers();shown=new Map();
            // Keep the approved captions first when a narrow screen leaves room for fewer names.
            for(const site of sites) {
                const {town,key,p,width}=site,symbol=document.createElement('span'),wrap=document.createElement('span');
                wrap.className='fm-pin';symbol.className='fm-glyph';wrap.append(symbol);
                const label=town.caption || (detailed?town.name:'');
                if(label) {
                    const font=Math.max(size.x<330?9:10,Math.min(13,Math.round(19*unit))), height=font+3;
                    measure.font='600 '+font+'px system-ui,sans-serif';
                    const w=Math.ceil(measure.measureText(label).width), gap=width/2+2;
                    const offsets=[];
                    for(const dy of [gap,-gap-height]) {
                        for(const ratio of [-.5,-.7,-.3,-.9,-.1]) offsets.push([w*ratio,dy]);
                    }
                    for(const dx of [-gap-w,gap]) {
                        for(const dy of [-height/2,-height,0]) offsets.push([dx,dy]);
                    }
                    for(const dy of [gap+4,-gap-height-4]) {
                        for(const ratio of [-.5,-.8,-.2]) offsets.push([w*ratio,dy]);
                    }
                    if(!detailed && size.x<335) {
                        for(const vertical of [0,2,5]) {
                            for(let shift=2;shift<=w/2;shift+=2) {
                                for(const dx of [-w/2+shift,-w/2-shift]) offsets.push([dx,gap+vertical],[dx,-gap-height-vertical]);
                            }
                        }
                    }
                    for(const [dx,dy] of offsets) {
                        const b=[p.x+dx-2,p.y+dy-1,p.x+dx+w+2,p.y+dy+height+1];
                        if(b[0]<1||b[1]<1||b[2]>size.x-1||b[3]>size.y-1||boxes.some(v=>overlap(v,b)))continue;
                        const caption=document.createElement('span');caption.className='fm-name';caption.textContent=label;
                        Object.assign(caption.style,{left:dx+'px',top:dy+'px',fontSize:font+'px',lineHeight:height+'px'});
                        wrap.append(caption);boxes.push(b);break;
                    }
                }
                const hit=Math.round(Math.max(32,width+3));
                const marker=L.marker([town.lat,town.lon],{title:town.name,alt:town.name,keyboard:true,
                    icon:L.divIcon({className:'fm-marker',html:wrap,iconSize:[hit,hit],iconAnchor:[hit/2,hit/2]})}).addTo(layer);
                marker.bindPopup(()=>tip(town),{closeButton:true,autoPan:false,offset:[0,-width/2]});
                marker.on('popupopen',()=>{openKey=key;});
                shown.set(key,{town,marker,symbol,width});
            }
            paint();pump();
        }
        async function pump() {
            if(!active||request||!shown.size)return;
            const today=F.localNow().date,now=Date.now();
            const next=[...shown.values()].map(v=>v.town).filter(t=>{
                const key=keyOf(t),r=cache.get(key);
                return (failed.get(key)||0)<now && (!r||r.time<forceSince||r.date!==today||now-r.time>=freshFor);
            }).slice(0,12);
            if(!next.length){status();return;}
            const ctl=new AbortController();request=ctl;status();
            try {
                const response=await fetchJSON(F.url(next),ctl.signal,30000);
                if(ctl.signal.aborted)return;
                const records=F.batch(response,next);
                next.forEach((t,i)=>{
                    const key=keyOf(t),values=records.get(i);
                    if(values) {cache.set(key,{time:Date.now(),date:today,values});failed.delete(key);}
                    else failed.set(key,Date.now()+120000);
                });
                if(records.size)save();
            } catch {
                if(!ctl.signal.aborted) next.forEach(t=>failed.set(keyOf(t),Date.now()+120000));
            } finally {
                if(request===ctl) {request=null;paint();if(active)pump();}
            }
        }
        async function enter(force=false) {
            active=true;
            if(force){forceSince=Date.now();failed.clear();}
            controls();
            clearInterval(clock);clock=setInterval(()=>{if(active){controls();pump();}},60000);
            try {
                await data();if(!active)return;
                if(!map) init(); else {map.invalidateSize({pan:false});schedule();}
            } catch {if(active)message('Carte indisponible. Touchez Actualiser pour réessayer.');}
        }
        function leave() {active=false;++revision;clearTimeout(timer);clearInterval(clock);request?.abort();map?.closePopup();}
        return {enter,leave};
    }
    root.MeteoForecastMap={create};
})(globalThis);
