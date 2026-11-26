(function (root) {
    'use strict';
    const F = root.MeteoForecastModel;
    const T = root.ForecastTemperature, area = T.bounds;
    const freshFor = 2*3600000, keepFor = 24*3600000;
    const summaryVersion = 3;
    const keyOf = town => town.lat+','+town.lon;
    const overlap = (a,b) => a[0]<b[2] && b[0]<a[2] && a[1]<b[3] && b[1]<a[3];
    function create({$,fetchJSON,storage,C}) {
        let map,relief,outline,layer,overviewZoom=0,assets,loadingAssets,active=false;
        let revision=0,timer,clock,request,forceSince=0,trend=false,period,periodSignature='',openKey;
        let shown=new Map(),art={},periods=[];
        let temperature=storage.get('forecast-temperature-view',true)!==false;
        let colour=storage.get('forecast-temperature-fill','high')==='low'?'low':'high';
        let fieldLayer,fieldKey='',fieldFrame;
        function source(key,fresh,keep,version){
            const saved=storage.get(key,[]);
            const cache=new Map((Array.isArray(saved)?saved:[]).filter(row=>Array.isArray(row)&&row[1]?.values&&Date.now()-row[1].time<keep));
            return {key,fresh,keep,version,cache,failed:new Map()};
        }
        const local=source('forecast-map-v1',freshFor,keepFor,summaryVersion);
        const ensemble=source('forecast-ec46-v1',12*3600000,2*keepFor,1);
        const currentSource=()=>period?.extended?ensemble:local;
        const measure=document.createElement('canvas').getContext('2d');
        const $periods=$('fm-periods'), $status=$('fm-status');
        function message(value) {$status.textContent=value;$status.hidden=!value;}
        function save(store) {
            const cache=store.cache;
            const recent=[...cache].filter(([,r])=>Date.now()-r.time<store.keep).sort((a,b)=>b[1].time-a[1].time).slice(0,150);
            storage.set(store.key,recent);
            if(cache.size>200) {
                const keep=new Set(recent.map(([key])=>key));
                for(const key of cache.keys()) if(!keep.has(key)&&!shown.has(key)) cache.delete(key);
            }
        }
        function entry(key) {
            const store=currentSource(),record=store.cache.get(key);
            if(!record||Date.now()-record.time>=store.keep)return null;
            return record.version===store.version||store.failed.has(key)||!navigator.onLine ? record : null;
        }
        const valueAt=key=>entry(key)?.values[period.key];
        const available=v=>temperature?(C.finite(v?.low)||C.finite(v?.high)):!!v?.icon;
        function status() {
            if(!active||!period||!shown.size) return;
            const store=currentSource();
            const records=[...shown.keys()].map(entry);
            const ready=records.filter(r=>available(r?.values[period.key])).length;
            if(request && ready<records.length) message('Chargement des prévisions…');
            else if(ready<records.length) message(ready?'Prévisions indisponibles pour certains lieux.':'Prévisions indisponibles. Touchez Actualiser pour réessayer.');
            else if(records.some(r=>r.version!==store.version)) message('Certaines prévisions datent d’avant la mise à jour. Touchez Actualiser pour les renouveler.');
            else if(!navigator.onLine||records.some(r=>Date.now()-r.time>=store.fresh)) message('Dernières prévisions enregistrées.');
            else if(temperature&&assets?.terrainError)message('Fond thermique indisponible. Les valeurs sont indiquées sur les localités.');
            else message('');
        }
        function tip(town) {
            const box=document.createElement('div'),name=document.createElement('strong'),line=document.createElement('div'),details=document.createElement('div');
            name.textContent=town.name;line.className='fm-tip-period';line.textContent=(period.trend?'Tendance · ':'')+period.label+' · '+period.dateLabel;
            const value=entry(keyOf(town))?.values[period.key];
            if(value) {
                details.textContent=value.label||'État du ciel indisponible';
                if(C.finite(value.low)||C.finite(value.high)) {
                    const range=document.createElement('div');range.className='fm-tip-temps';
                    for(const [type,label] of [['low','Min.'],['high','Max.']]){
                        const part=document.createElement('b');part.className='fm-'+type;
                        part.textContent=label+' '+C.fmt(value[type])+(C.finite(value[type])?' °C':'');range.append(part);
                    }
                    details.append(range);
                }
                if(period.extended){
                    const note=document.createElement('div');note.className='fm-tip-cloud';
                    if(value.lowBand&&value.highBand)note.append('Moitié centrale des '+value.members+' scénarios',document.createElement('br'),
                        'Min. '+C.fmt(value.lowBand[0])+' à '+C.fmt(value.lowBand[1])+' °C · Max. '+C.fmt(value.highBand[0])+' à '+C.fmt(value.highBand[1])+' °C');
                    if(C.finite(value.wet))note.append(document.createElement('br'),'Au moins 1 mm sur la journée · '+value.wet+' % des scénarios');
                    details.append(note);
                }
                if(C.finite(value.cloud)){
                    const clouds=document.createElement('div');
                    clouds.className='fm-tip-cloud';
                    clouds.textContent='Couverture moyenne du ciel · '+C.fmt(value.cloud)+' %';
                    if(C.finite(value.lowCloud))clouds.append(document.createElement('br'),'Nuages bas · '+C.fmt(value.lowCloud)+' % du ciel');
                    details.append(clouds);
                }
                if(value.stratus||value.modelMask){
                    const info=document.createElement('div');info.className='fm-tip-cloud';
                    if(value.stratus)info.append('Couche basse persistante et humide · stratus possible.',document.createElement('br'));
                    if(value.modelMask)info.append('Couverture de l’étage bas · '+root.ForecastClouds.names.flatMap((name,i)=>
                        value.modelMask&(1<<i)?[name+(C.finite(value.modelLow?.[i])?' '+value.modelLow[i]+' %':'')]:[]).join(' · '));
                    details.append(info);
                }
            } else details.textContent=request?'Chargement…':'Prévision indisponible';
            box.append(name,line,details);return box;
        }
        function paint() {
            if(!period) return;
            let geometryChanged=false;
            for(const [key,item] of shown) {
                const value=valueAt(key);
                const id=art[value?.icon]?value.icon:'';
                item.temps=temperature&&available(value)?[C.fmt(value.low)+(C.finite(value.low)?'°':''),C.fmt(value.high)+(C.finite(value.high)?'°':'')]:null;
                const visual=temperature?'t/'+(item.temps||[]).join('/'):'w/'+id;
                if(item.visual!==visual){item.visual=visual;geometryChanged=true;}
                item.icon=temperature?'':id;
                const title=item.town.name+' · '+(temperature&&item.temps?'Minimale '+item.temps[0]+' · Maximale '+item.temps[1]:(value?.label||'Prévision indisponible'));
                const el=item.marker.getElement();el.setAttribute('aria-label',title);el.title=title;
            }
            if(geometryChanged)layoutSymbols([...shown.values()]);
            if(active&&map){cancelAnimationFrame(fieldFrame);fieldFrame=requestAnimationFrame(drawField);}
            if(openKey && shown.has(openKey)) {
                const item=shown.get(openKey);
                if(item.marker.isPopupOpen()) item.marker.getPopup().setContent(tip(item.town));
            }
            status();
        }
        function drawField(){
            if(!active||!map)return;
            const points=assets?.fieldSites||[];
            const values=temperature&&assets?.plan?points.map(t=>valueAt(keyOf(t))?.[colour]):[];
            const key=period.key+'|'+colour+'|'+values.join(',');
            if(key===fieldKey)return;
            fieldKey=key;fieldLayer?.remove();fieldLayer=null;
            if(!values.length)return;
            const surface=T.surface(assets.plan,values,period.extended);
            if(surface)fieldLayer=L.imageOverlay(T.image(surface),area,{pane:'forecastThermal',interactive:false,opacity:.77,
                alt:colour==='low'?'Températures minimales prévues':'Températures maximales prévues'}).addTo(map);
        }
        function viewControls(){
            $('fm-weather').setAttribute('aria-pressed',String(!temperature));
            $('fm-temperature').setAttribute('aria-pressed',String(temperature));
            $('fm-thermal-key').hidden=!temperature;
            $('fm-low').setAttribute('aria-pressed',String(colour==='low'));
            $('fm-high').setAttribute('aria-pressed',String(colour==='high'));
        }
        function setView(toTemperature){
            temperature=toTemperature;storage.set('forecast-temperature-view',temperature);
            viewControls();paint();pump();
        }
        $('fm-weather').onclick=()=>setView(false);$('fm-temperature').onclick=()=>setView(true);
        for(const key of ['low','high'])$('fm-'+key).onclick=()=>{
            colour=key;storage.set('forecast-temperature-fill',colour);viewControls();paint();
        };
        const scale=root.ObservationField.metrics.temp;
        $('fm-ramp').style.background='linear-gradient(to right,'+scale.colors.map((c,i)=>c+' '+(100*(scale.stops[i]-scale.stops[0])/(scale.stops.at(-1)-scale.stops[0]))+'%').join(',')+')';
        viewControls();
        function controls(now=new Date()) {
            const next=F.periods(now);
            const selected=next.find(p=>p.key===period?.key && p.trend===trend) || next.find(p=>p.trend===trend);
            const signature=next[0].key+'|'+selected.key+'|'+trend;
            periods=next; period=selected;
            if(request&&request.store!==currentSource())request.ctl.abort();
            if(signature===periodSignature) return;
            periodSignature=signature;
            $('fm-short').setAttribute('aria-pressed',String(!trend));
            $('fm-trend').setAttribute('aria-pressed',String(trend));
            const fragment=document.createDocumentFragment();
            for(const p of periods.filter(p=>p.trend===trend)) {
                const b=document.createElement('button');b.type='button';b.dataset.key=p.key;
                b.setAttribute('aria-pressed',String(p.key===period.key));
                b.setAttribute('aria-label',(p.trend?'J'+p.dayNumber+' · ':'')+p.label+' · '+p.dateLabel);b.textContent=p.label;
                if(p.kind==='day') {const small=document.createElement('small');small.textContent=(p.trend?'J'+p.dayNumber+' · ':'')+p.dateLabel;b.append(small);}
                fragment.append(b);
            }
            $periods.replaceChildren(fragment);
            const chosen=$periods.querySelector('[aria-pressed="true"]');
            if(chosen) $periods.scrollLeft=Math.max(0,chosen.offsetLeft-($periods.clientWidth-chosen.offsetWidth)/2);
            $('fm-uncertainty').hidden=!period.trend;
            $('fm-uncertainty').textContent=period.extended?'J'+period.dayNumber+' · Tendance régionale ECMWF, maille d’environ 36 km. Forte incertitude.':'J'+period.dayNumber+' · Tendance quotidienne. La fiabilité diminue avec l’échéance.';
            paint();pump();
        }
        function setBand(toTrend) {if(trend!==toTrend){trend=toTrend;controls();}}
        $('fm-short').onclick=()=>setBand(false);$('fm-trend').onclick=()=>setBand(true);
        $periods.onclick=e=>{const b=e.target.closest('button');if(!b)return;period=periods.find(p=>p.key===b.dataset.key);controls();};
        function data() {
            if(loadingAssets) return loadingAssets;
            loadingAssets=Promise.all(['forecast/towns.json','forecast/icon-bounds.json','haute-savoie.geojson'].map(name=>fetchJSON('assets/'+name))).then(async ([towns,icons,shape])=>{
                art=icons;const result={towns,shape,fieldSites:towns};
                try {
                    const [extra,bytes]=await Promise.all([fetchJSON('assets/forecast/thermal-points.json'),
                        fetch('assets/forecast/altitudes.bin').then(r=>{if(!r.ok)throw Error('Relief indisponible');return r.arrayBuffer();})]);
                    result.fieldSites=towns.concat(extra);result.plan=T.prepare(bytes,result.fieldSites);
                }catch{result.terrainError=true;}
                return assets=result;
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
            map.createPane('forecastThermal').style.zIndex=313;
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
            const baseWidth=1.56*Math.max(19,Math.min(45,57*unit));
            function add(town,isDetail) {
                const key=keyOf(town);if(keys.has(key)||!bounds.contains([town.lat,town.lon]))return;
                const p=map.latLngToContainerPoint([town.lat,town.lon]);
                const width=town.major?baseWidth:Math.max(27.3,baseWidth*52/57);
                if(p.x<width/2||p.x>size.x-width/2||p.y<width/2||p.y>size.y-width/2)return;
                if(isDetail && sites.some(s=>p.distanceTo(s.p)<Math.max(49,baseWidth*1.25)))return;
                keys.add(key);sites.push({town,key,p,width});
            }
            assets.towns.forEach(t=>add(t,false));
            const limitLevel=Math.min(12,Math.floor(8+delta*2.8));
            const detailRows=rows.filter(r=>r[3]<=limitLevel && r[1]/10000>=area[0][0] && r[1]/10000<=area[1][0] &&
                r[2]/10000>=area[0][1] && r[2]/10000<=area[1][1] && bounds.contains([r[1]/10000,r[2]/10000]));
            detailRows.sort((a,b)=>a[3]-b[3] || b[4]-a[4] || a[1]-b[1]);
            const cap=Math.max(24,Math.min(90,Math.floor(size.x*size.y/3500)));
            for(const [name,y,x,level] of detailRows) {
                if(sites.length>=cap)break;
                add({name,lat:y/10000,lon:x/10000,caption:name,level},true);
            }
            layer.clearLayers();shown=new Map();
            for(const site of sites) {
                const {town,key,width}=site,symbol=document.createElement('span'),wrap=document.createElement('span');
                wrap.className='fm-pin';symbol.className='fm-glyph';wrap.append(symbol);
                const hit=Math.round(Math.max(32,width+3));
                const marker=L.marker([town.lat,town.lon],{title:town.name,alt:town.name,keyboard:true,
                    icon:L.divIcon({className:'fm-marker',html:wrap,iconSize:[hit,hit],iconAnchor:[hit/2,hit/2]})}).addTo(layer);
                marker.bindPopup(()=>tip(town),{closeButton:true,autoPan:false,offset:[0,-width/2]});
                marker.on('popupopen',()=>{openKey=key;});
                shown.set(key,{...site,marker,symbol,wrap});
            }
            paint();pump();
        }
        function layoutSymbols(sites) {
            const size=map.getSize(),unit=Math.min(size.x/860,size.y/803),detailed=map.getZoom()-overviewZoom>=.48;
            const stacked=size.x<520, numberSize=size.x<350?12:size.x<520?13:15;
            for(const site of sites){
                const bounds=art[site.icon];
                site.factor=bounds?site.width/Math.max(bounds[2],bounds[3]):1;
                site.drawWidth=bounds?bounds[2]*site.factor:8;
                site.drawHeight=bounds?bounds[3]*site.factor:8;
                if(site.temps){
                    measure.font='750 '+numberSize+'px system-ui,sans-serif';
                    const widths=site.temps.map(t=>Math.ceil(measure.measureText(t).width));
                    site.drawWidth=(stacked?Math.max(...widths):widths[0]+widths[1]+5)+6;
                    site.drawHeight=(stacked?2:1)*(numberSize+1)+2;
                }
                site.scale=1;
            }
            // Clouds are wide and shallow. Only limit artwork whose actual bounds meet a neighbour.
            for(let i=0;i<sites.length;i++){
                const a=sites[i];
                for(let j=i+1;j<sites.length;j++){
                    const b=sites[j];
                    const across=2*(Math.abs(a.p.x-b.p.x)-1.5)/(a.drawWidth+b.drawWidth);
                    const down=2*(Math.abs(a.p.y-b.p.y)-1.5)/(a.drawHeight+b.drawHeight);
                    const available=Math.max(0,across,down);
                    a.scale=Math.min(a.scale,available);b.scale=Math.min(b.scale,available);
                }
            }
            for(const site of sites){
                const {symbol,icon}=site,bounds=art[icon];
                symbol.classList.toggle('fm-digits',!!site.temps);
                if(symbol.dataset.visual!==site.visual){
                    symbol.dataset.visual=site.visual;symbol.dataset.icon=icon;symbol.replaceChildren();
                    if(site.temps){
                        for(const [i,type] of ['low','high'].entries()){
                            const text=document.createElement('span');text.className='fm-'+type;text.textContent=site.temps[i];symbol.append(text);
                        }
                    }else if(bounds){
                        const img=new Image();img.src='assets/weather/hd/'+icon+'.webp';img.alt='';img.draggable=false;symbol.append(img);
                    }else{
                        const dot=document.createElement('span');dot.className='fm-missing';symbol.append(dot);
                    }
                }
                site.drawWidth*=site.scale;site.drawHeight*=site.scale;
                symbol.style.width=site.drawWidth+'px';symbol.style.height=site.drawHeight+'px';
                if(site.temps){
                    symbol.style.flexDirection=stacked?'column':'row';
                    symbol.style.gap=stacked?'0':(5*site.scale)+'px';
                    symbol.style.fontSize=(numberSize*site.scale)+'px';symbol.style.lineHeight=((numberSize+1)*site.scale)+'px';
                }
                if(bounds){
                    const factor=site.factor*site.scale;
                    Object.assign(symbol.firstChild.style,{left:-bounds[0]*factor+'px',top:-bounds[1]*factor+'px',width:384*factor+'px',height:384*factor+'px'});
                }
            }
            const origin=map.getContainer().getBoundingClientRect();
            const boxes=Array.from(map.getContainer().querySelectorAll('.leaflet-control')).map(node=>{
                const r=node.getBoundingClientRect();return [r.left-origin.left-2,r.top-origin.top-2,r.right-origin.left+2,r.bottom-origin.top+2];
            });
            for(const {p,drawWidth:w,drawHeight:h} of sites)boxes.push([p.x-w/2,p.y-h/2,p.x+w/2,p.y+h/2]);
            const labels=[];
            for(const site of sites){
                const {town,p,wrap}=site;
                wrap.querySelector('.fm-name')?.remove();
                const prominent=town.level<=7,weight=town.level<=9?700:400;
                const name=town.caption || (detailed?town.name:'');
                const label=prominent?name.toLocaleUpperCase('fr'):name;
                if(label) {
                    const font=Math.max(size.x<330?9:10,Math.min(13,Math.round(19*unit))), height=font+3;
                    measure.font=weight+' '+font+'px system-ui,sans-serif';
                    const w=Math.ceil(measure.measureText(label).width);
                    const gapX=site.drawWidth/2+2,gapY=site.drawHeight/2+2;
                    const offsets=[];
                    for(const dy of [gapY,-gapY-height]) {
                        for(const ratio of [-.5,-.7,-.3,-.9,-.1]) offsets.push([w*ratio,dy]);
                    }
                    for(const dx of [-gapX-w,gapX]) {
                        for(const dy of [-height/2,-height,0]) offsets.push([dx,dy]);
                    }
                    for(const dy of [gapY+4,-gapY-height-4]) {
                        for(const ratio of [-.5,-.8,-.2]) offsets.push([w*ratio,dy]);
                    }
                    if(!detailed) {
                        for(const vertical of [0,2,5,8,12,16,20]) {
                            for(let shift=2;shift<=w/2+gapX;shift+=2) {
                                for(const dx of [-w/2+shift,-w/2-shift]) offsets.push([dx,gapY+vertical],[dx,-gapY-height-vertical]);
                            }
                        }
                        for(const extra of [0,-2,2,-4,4,6]) {
                            for(const dx of [-gapX-w-extra,gapX+extra]) {
                                for(let dy=-height-gapY;dy<=gapY;dy+=2)offsets.push([dx,dy]);
                            }
                        }
                    }
                    const positions=[];
                    for(const [dx,dy] of offsets){
                        const rect=[p.x+dx-2,p.y+dy-1,p.x+dx+w+2,p.y+dy+height+1];
                        if(rect[0]>=1&&rect[1]>=1&&rect[2]<=size.x-1&&rect[3]<=size.y-1&&!boxes.some(box=>overlap(box,rect)))
                            positions.push({dx,dy,rect});
                    }
                    if(positions.length||!detailed)labels.push({wrap,label,font,weight,height,positions,p,w});
                }
            }
            // On the overview, reserve space for the names with the fewest workable positions first.
            if(!detailed)labels.sort((a,b)=>a.positions.length-b.positions.length);
            const occupied=[];
            for(const {wrap,label,font,weight,height,positions,p,w} of labels){
                let best=positions.find(pos=>!occupied.some(box=>overlap(box,pos.rect)));
                if(!best&&!detailed){
                    // Tight phone layouts can leave exactly one text-width between two markers.
                    const obstacles=boxes.concat(occupied),pad=.6;
                    const xs=[p.x-w/2],ys=[p.y-height/2];
                    for(const b of obstacles){
                        xs.push(b[2]+pad,b[0]-w-pad);ys.push(b[3]+pad,b[1]-height-pad);
                    }
                    let nearest=42;
                    for(const x of xs)for(const y of ys){
                        const distance=Math.hypot(x+w/2-p.x,y+height/2-p.y);
                        if(distance>=nearest)continue;
                        const rect=[x-pad,y-pad,x+w+pad,y+height+pad];
                        if(rect[0]<1||rect[1]<1||rect[2]>size.x-1||rect[3]>size.y-1||obstacles.some(b=>overlap(b,rect)))continue;
                        best={dx:x-p.x,dy:y-p.y,rect};nearest=distance;
                    }
                }
                if(!best)continue;
                const caption=document.createElement('span');caption.className='fm-name';caption.textContent=label;
                Object.assign(caption.style,{left:best.dx+'px',top:best.dy+'px',fontSize:font+'px',fontWeight:String(weight),lineHeight:height+'px'});
                wrap.append(caption);occupied.push(best.rect);
            }
        }
        async function pump() {
            if(!active||request||!shown.size||!assets||!period)return;
            const today=F.localNow().date,now=Date.now();
            const store=currentSource(), {cache,failed}=store;
            const wanted=new Map([...shown.values()].map(item=>[item.key,item.town]));
            if(temperature&&assets.plan)for(const t of assets.fieldSites)wanted.set(keyOf(t),t);
            const next=[...wanted.values()].filter(t=>{
                const key=keyOf(t),r=cache.get(key);
                return (failed.get(key)||0)<now && (!r||r.version!==store.version||r.time<forceSince||r.date!==today||now-r.time>=store.fresh);
            }).slice(0,12);
            if(!next.length){status();return;}
            const ctl=new AbortController();request={store,ctl};status();
            try {
                const extended=store===ensemble;
                const [response,comparisons]=await Promise.all([
                    fetchJSON(extended?F.ensembleUrl(next,today):F.url(next),ctl.signal,30000),
                    extended?Promise.resolve(null):root.ForecastClouds.compare(next.filter(t=>t.name),fetchJSON,ctl.signal)
                ]);
                if(ctl.signal.aborted)return;
                if(comparisons){
                    const rows=Array.isArray(response)?response:[response];
                    rows.forEach((row,i)=>{
                        const town=next[row?.location_id??i];
                        if(town)root.ForecastClouds.check(row,comparisons.get(keyOf(town)));
                    });
                }
                const records=F.batch(response,next,extended?F.ensembleSummary:F.summarize);
                next.forEach((t,i)=>{
                    const key=keyOf(t),values=records.get(i);
                    if(values) {cache.set(key,{time:Date.now(),date:today,version:store.version,values});failed.delete(key);}
                    else failed.set(key,Date.now()+120000);
                });
                if(records.size)save(store);
            } catch {
                if(!ctl.signal.aborted) next.forEach(t=>failed.set(keyOf(t),Date.now()+120000));
            } finally {
                if(request?.ctl===ctl) {request=null;if(active){paint();pump();}}
            }
        }
        async function enter(force=false) {
            active=true;
            if(force){forceSince=Date.now();local.failed.clear();ensemble.failed.clear();}
            controls();
            clearInterval(clock);clock=setInterval(()=>{if(active){controls();pump();}},60000);
            try {
                await data();if(!active)return;
                if(!map) init(); else {map.invalidateSize({pan:false});schedule();}
            } catch {if(active)message('Carte indisponible. Touchez Actualiser pour réessayer.');}
        }
        function leave() {active=false;++revision;clearTimeout(timer);clearInterval(clock);cancelAnimationFrame(fieldFrame);request?.ctl.abort();map?.closePopup();}
        return {enter,leave};
    }
    root.MeteoForecastMap={create};
})(globalThis);
