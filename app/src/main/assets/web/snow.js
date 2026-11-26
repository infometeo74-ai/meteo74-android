/* Météo74 · directory, station observations and altitude-specific forecasts. */
(function(root) {
'use strict';
const zone = 'Europe/Paris';
const stampDay = epoch => new Intl.DateTimeFormat('fr-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(epoch);
const number = value => Number.isFinite(value) ? value.toLocaleString('fr-FR',{maximumFractionDigits:1}) : '—';
const normalize = (root.MeteoCore || require('./core.js')).normalizeSearch;
function matches(station, region, query) {
    const terms = normalize(query).split(' ').filter(Boolean);
    const haystack = normalize([station.name,region,station.domain,...station.areas.flatMap(a=>[a.name,a.landmark,a.summit])].join(' '));
    return terms.every(t=>haystack.includes(t) || haystack.replace(/ /g,'').includes(t));
}
function forecastURL(points, daily) {
    const q = new URLSearchParams({timezone:zone,timeformat:'unixtime',forecast_days:daily?'5':'1',
        current:'temperature_2m,weather_code,is_day,snow_depth,cloud_cover,cloud_cover_low,precipitation,rain,showers,snowfall,wind_speed_10m,wind_gusts_10m',
        latitude:points.map(p=>p[0]).join(','),longitude:points.map(p=>p[1]).join(','),elevation:points.map(p=>p[2]).join(',')});
    if (daily) q.set('daily','weather_code,temperature_2m_min,temperature_2m_max,snowfall_sum');
    return 'https://api.open-meteo.com/v1/forecast?'+q;
}
const openCount=v=>v.total==null?number(v.open):number(v.open)+' / '+number(v.total);
const pointKey = p => p.join(',');
const recent = (entry,ms) => !!entry && Date.now()-entry.at>=0 && Date.now()-entry.at<ms;
function freshBulletin(r) {
    if (!r?.date) return false;
    const age=Date.now()-Date.parse(r.date+'T12:00:00Z');
    return Number.isFinite(age) && age>=-86400000 && age<=3*86400000;
}
function create({$,C,storage,icon,weather,escape:esc,fetchJSON,catalog,service,isPinned,pinStation,goHome,observations}) {
    const {stations,regions}=catalog;
    const byId=new Map(stations.map(s=>[s.id,s]));
    const expanded={alpin:new Set([0]),fond:new Set([0])};
    const regionOrder=regions.map((_,i)=>i);
    let kind=storage.get('snow.kind','alpin')==='fond'?'fond':'alpin';
    let fromHome=false, homeController=null, active=false, selected=null, area=0, level=0, listY=0;
    let lifetime=null, observer=null, timer=0;
    const visible=new Set(), attempted=new Set(), forcePreview=new Set(), pendingReports=new Map();
    const weatherCache=new Map(), reportCache=new Map();
    let detailData=null, reportData=null, loadingWeather=false, loadingReport=false;
    let weatherError=false, reportError=false;
    const formatter=new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric',month:'short',timeZone:zone});
    const formatDate=d=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric',timeZone:zone}).format(Date.parse(d+'T12:00:00Z'));
    const getCache=(map,prefix,key)=>{
        if (!map.has(key)) map.set(key,storage.get('snow.'+prefix+'.'+key,null));
        return map.get(key);
    };
    function save(map,prefix,key,value) {
        const entry={at:Date.now(),value};
        map.set(key,entry); storage.set('snow.'+prefix+'.'+key,entry);
        return entry;
    }
    const getWeather=point=>getCache(weatherCache,'point',pointKey(point));
    const getReport=s=>getCache(reportCache,'report2',s.id);
    function resetRequests(){
        lifetime?.abort();
        lifetime=new AbortController();
        observer?.disconnect(); observer=null;
        clearTimeout(timer);visible.clear();attempted.clear();forcePreview.clear();
    }
    function rangeLabel(s){
        if(s.kind==='fond')return number(s.areas[0].points[0][2])+' m';
        const low=Math.min(...s.areas.map(a=>a.points[0][2]));
        const highest=s.areas.reduce((best,a)=>a.points[1][2]>best.points[1][2]?a:best);
        return number(low)+' – '+(highest.approx?'≈ ':'')+number(highest.points[1][2])+' m';
    }
    let summary=storage.get('snow.directory.v1',null),summaryRequest=null;
    function directoryReport(station){
        const list=summary?.value?.[station.id],local=getReport(station)?.value;
        return local&&(!list||(local.date||'')>(list.date||''))?local:list||local;
    }
    async function loadSummaries(force=false){
        if(summaryRequest||(!force&&recent(summary,30*60000)))return;
        const ctl=new AbortController();summaryRequest=ctl;
        try{
            const data=await fetchJSON(service.base+'meteo74-neige?mode=directory',ctl.signal,15000,service.headers);
            if(!Array.isArray(data.reports))return;
            summary={at:Date.now(),value:Object.fromEntries(data.reports.filter(r=>byId.has(r.station_id)).map(r=>[r.station_id,r]))};
            storage.set('snow.directory.v1',summary);
            if(active&&!selected)document.querySelectorAll('#snow-groups [data-station]').forEach(paintPreview);
        }catch{/* The last shared directory remains available. */}
        finally{if(summaryRequest===ctl)summaryRequest=null;}
    }
    function paintPreview(button) {
        const s=byId.get(button.dataset.station),cur=getWeather(s.areas[0].points[0])?.value?.current;
        const fresh=Number.isFinite(cur?.time)&&Math.abs(Date.now()/1000-cur.time)<3*3600;
        const temp=button.querySelector('.snow-preview-temp');
        temp.innerHTML=fresh&&Number.isFinite(cur.temperature_2m)?weather(cur.weather_code,!!cur.is_day,cur.cloud_cover,cur.precipitation,cur)+'<b>'+Math.round(cur.temperature_2m)+'°</b>':'';
        const r=directoryReport(s),parts=[];
        const chip=(sym,label)=>'<span>'+icon(sym)+esc(label)+'</span>';
        if(freshBulletin(r)){
            const points=(r.snow||[]).filter(x=>Number.isFinite(x.cm)&&Number.isFinite(x.altitude)).sort((a,b)=>a.altitude-b.altitude);
            for(const pt of points.length>1?[points[0],points.at(-1)]:points)
                parts.push(chip('snowflake',number(pt.cm)+' cm à '+number(pt.altitude)+' m'));
            if(r.km&&Number.isFinite(r.km.open))parts.push(chip('tracks',openCount(r.km)+' km ouverts'));
            else if(r.trails&&Number.isFinite(r.trails.open))parts.push(chip('tracks',openCount(r.trails)+' pistes ouvertes'));
            else if(r.lifts&&Number.isFinite(r.lifts.open))parts.push(chip('tracks',openCount(r.lifts)+' remontées'));
            else if(r.areaStatus)parts.push(chip('mountain',r.areaStatus==='open'?'Domaine ouvert':'Domaine fermé'));
        }
        if(!parts.length&&r?.seasonStart>=stampDay(Date.now()))parts.push(chip('calendar','Ouverture prévue le '+formatDate(r.seasonStart)));
        const extra=button.querySelector('.snow-preview-extra');
        extra.innerHTML=parts.join('')||'<small>'+(r?.date&&!freshBulletin(r)?'Dernier bulletin du '+esc(formatDate(r.date)):s.report?'Enneigement et ouverture non communiqués':'Bulletin non publié')+'</small>';
    }
    async function bulletin(s, signal, force=false) {
        const cache=getReport(s);
        if (!force && recent(cache,15*60000)) return cache;
        const pending=pendingReports.get(s.id);
        if (pending && !pending.signal.aborted) return pending.task;
        const task=fetchJSON(service.base+'meteo74-neige?station='+encodeURIComponent(s.id),signal,15000,service.headers)
            .then(data=>{
                if (!Array.isArray(data.snow)) throw Error('Bulletin illisible');
                if (signal.aborted) return cache;
                return save(reportCache,'report2',s.id,data);
            }).finally(()=>{if(pendingReports.get(s.id)?.task===task)pendingReports.delete(s.id);});
        pendingReports.set(s.id,{task,signal});
        return task;
    }
    async function batchWeather(points, daily, signal) {
        const response=await fetchJSON(forecastURL(points,daily),signal,16000);
        const rows=Array.isArray(response)?response:[response];
        if (rows.length!==points.length || rows.some(r=>!Number.isFinite(r.current?.time) || (daily && !Array.isArray(r.daily?.time)))) throw Error('Météo indisponible');
        if(signal.aborted)return;
        rows.forEach((row,i)=>{
            const key=pointKey(points[i]);
            const old=getWeather(points[i]);
            // A summary refresh must not give an old five-day forecast a new timestamp.
            const value={current:row.current,daily:row.daily||old?.value?.daily,dailyAt:daily?Date.now():old?.value?.dailyAt};
            save(weatherCache,'point',key,value);
        });
    }
    let listBusy=null;
    async function previews() {
        const owner=lifetime, signal=owner.signal;
        if (listBusy===owner || !active || selected) return;
        listBusy=owner;
        try {
            while (!signal.aborted) {
                const buttons=[...visible].filter(b=>!attempted.has(b.dataset.station)).slice(0,6);
                if (!buttons.length) break;
                buttons.forEach(b=>attempted.add(b.dataset.station));
                const rows=buttons.map(b=>byId.get(b.dataset.station));
                const points=rows.filter(s=>forcePreview.has(s.id)||!recent(getWeather(s.areas[0].points[0]),20*60000)).map(s=>s.areas[0].points[0]);
                const update=b=>{if(!signal.aborted&&b.isConnected)paintPreview(b);};
                const temps=points.length?batchWeather(points,false,signal).then(()=>buttons.forEach(update)).catch(()=>{}):Promise.resolve();
                await temps;
            }
        } finally {if(listBusy===owner)listBusy=null;}
    }
    function watchVisible() {
        observer?.disconnect();visible.clear();clearTimeout(timer);
        const nodes=[...$('snow-groups').querySelectorAll('details[open] [data-station]')];
        nodes.forEach(paintPreview);
        if (!('IntersectionObserver' in root)) {
            nodes.slice(0,6).forEach(b=>visible.add(b));timer=setTimeout(previews,70);return;
        }
        observer=new IntersectionObserver(entries=>{
            entries.forEach(e=>{if(e.isIntersecting)visible.add(e.target);else visible.delete(e.target);});
            clearTimeout(timer);timer=setTimeout(previews,85);
        },{rootMargin:'90px 0px'});
        nodes.forEach(n=>observer.observe(n));
    }
    function directory() {
        selected=null;
        $('summit-credit').replaceChildren();
        resetRequests();$('snow-detail').hidden=true;$('snow-directory').hidden=false;
        const query=$('snow-search').value.trim();
        const shown=stations.filter(s=>s.kind===kind && matches(s,regions[s.region],query));
        for(const tab of document.querySelectorAll('[data-ski]'))tab.setAttribute('aria-pressed',String(tab.dataset.ski===kind));
        $('snow-empty').hidden=shown.length>0;
        $('snow-groups').innerHTML=regionOrder.map(i=>{
            const rows=shown.filter(s=>s.region===i).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
            if (!rows.length) return '';
            const cards=rows.map(s=>'<button class="snow-row" data-station="'+s.id+'"><span class="snow-row-copy"><b>'+esc(s.name)+'</b><small>'+esc(rangeLabel(s))+'</small></span><span class="snow-preview-temp"></span>'+icon('chevron')+'<span class="snow-preview-extra"></span></button>').join('');
            return '<details class="snow-group" data-region="'+i+'"'+(query||expanded[kind].has(i)?' open':'')+'><summary><span>'+esc(regions[i])+'</span><small>'+rows.length+'</small>'+icon('chevron')+'</summary><div>'+cards+'</div></details>';
        }).join('');
        const generation=lifetime;
        for (const g of $('snow-groups').querySelectorAll('details'))g.ontoggle=()=>{
            if(generation!==lifetime || !g.isConnected)return;
            if(!query){const id=Number(g.dataset.region);if(g.open)expanded[kind].add(id);else expanded[kind].delete(id);}
            watchVisible();
        };
        observations.resorts(shown,s=>detail(s),query);loadSummaries();watchVisible();
    }
    const metric=(title,value)=>'<div><small>'+esc(title)+'</small><strong>'+esc(value)+'</strong></div>';
    function paintConditions() {
        if (!selected)return;
        const a=selected.areas[area],p=a.points[level];
        const row=getWeather(p)?.value,cur=row?.current;
        const stale=cur && Math.abs(Date.now()/1000-cur.time)>3*3600;
        const controls=$('snow-levels');
        controls.innerHTML=a.points.map((pt,i)=>'<button data-level="'+i+'" aria-pressed="'+(i===level)+'">'+(a.points.length===1?'Repère météo':i?'Sommet des pistes':'Départ')+' · '+(i&&a.approx?'≈ ':'')+number(pt[2])+' m</button>').join('');
        if (a.points.length===1){controls.firstElementChild.disabled=true;controls.firstElementChild.classList.add('single');}
        const source=catalog.summitSources[a.reference];
        const credit=$('summit-credit');credit.replaceChildren();
        if(source){const link=document.createElement('a');link.href=source;link.textContent='Référence du secteur';credit.append(link,document.createTextNode('. '));}
        const condition=cur?C.condition(cur.weather_code,cur.is_day===1,cur.cloud_cover,cur.precipitation,cur).label:'';
        const value=Number.isFinite(cur?.temperature_2m)?Math.round(cur.temperature_2m)+'°':'—';
        const picture=cur?weather(cur.weather_code,cur.is_day===1,cur.cloud_cover,cur.precipitation,cur):'';
        const status=cur?(stale?'Dernières données · ':'')+C.date(cur.time,zone,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):
            loadingWeather?'Chargement de la météo…':'Météo indisponible';
        $('snow-current').innerHTML='<div class="snow-current"><div><strong>'+value+'</strong><b>'+esc(condition)+'</b></div>'+picture+'</div><div class="snow-context"><span>'+esc(level?a.summit:a.landmark)+'</span><span>'+esc(status)+'</span></div>';
        const daily=row?.daily;
        const ids=(daily?.time||[]).map((t,i)=>({t,i})).filter(({t})=>stampDay(t*1000)>=stampDay(Date.now()));
        const retry='<button class="text-button" data-snow-retry="weather">Réessayer</button>';
        const err=weatherError?'<p class="snow-note">Actualisation météo indisponible. '+retry+'</p>':'';
        $('snow-days').innerHTML=ids.length?'<div class="snow-day-legend"><span>Jour</span><span>Min. / max.</span><span>Neige prévue</span></div>'+ids.map(({t,i})=>{
            const lo=daily.temperature_2m_min?.[i],hi=daily.temperature_2m_max?.[i],cm=daily.snowfall_sum?.[i];
            return '<div class="snow-day"><span>'+weather(daily.weather_code?.[i])+'<b>'+esc(formatter.format(t*1000))+'</b></span><span>'+number(lo)+'° / '+number(hi)+'°</span><span>'+number(cm)+(Number.isFinite(cm)?' cm':'')+'</span></div>';
        }).join('')+err:'<p class="snow-note">'+(loadingWeather?'Chargement des prévisions…':weatherError?'Prévisions indisponibles. '+retry:'Aucune prévision récente pour ce point.')+'</p>';
        // Estimates always refer to the currently selected forecast point.
        const depth=cur?.snow_depth;
        detailData=Number.isFinite(depth)&&depth>=0&&!stale?{cm:Math.round(depth*100),alt:p[2]}:null;
        paintReport();
    }
    function paintReport() {
        if (!selected)return;
        const r=reportData?.value;
        const valid=freshBulletin(r);
        const cells=[];
        if (valid && r.km) cells.push(metric('Kilomètres ouverts',number(r.km.open)+' / '+number(r.km.total)+' km'));
        if (valid && r.trails) cells.push(metric(r.trails.listed?'Pistes listées ouvertes':'Pistes ouvertes',openCount(r.trails)));
        if (valid && r.lifts) cells.push(metric(r.lifts.listed?'Remontées listées ouvertes':'Remontées ouvertes',openCount(r.lifts)));
        if(valid && r.areaStatus)cells.push(metric('Domaine',r.areaStatus==='open'?'Ouvert':'Fermé'));
        const measured=valid?(r.snow||[]):[];
        const depths=measured.map(pt=>metric('Neige · '+pt.name+(pt.altitude?' · '+number(pt.altitude)+' m':''),number(pt.cm)+' cm'));
        if (!depths.length && detailData) depths.push(metric('Neige au sol estimée · '+number(detailData.alt)+' m',number(detailData.cm)+' cm'));
        let message='';
        if (loadingReport && !r) message='Recherche du bulletin…';
        else if (reportError) message='Actualisation du bulletin indisponible.';
        else if (r?.date && !valid) message='Dernier bulletin du '+formatDate(r.date)+'.';
        else if(valid && (cells.length || measured.length)) message=(r.dateKind==='consulted'?'État consulté le ':'Bulletin du ')+formatDate(r.date)+(r.scope?' · '+r.scope:'')+'.';
        else if(selected.report) message='Le domaine n’a pas publié de chiffres récents.';
        const status=!cells.length&&!loadingReport?'Ouvertures non communiquées.':'';
        const plan=r?.plan;
        const planned=plan && plan.through>=stampDay(Date.now())?
            '<div class="snow-plan"><strong>Préouverture annoncée</strong><span>'+esc(formatDate(plan.from)+' – '+formatDate(plan.through))+'</span>'+
            (plan.sectors?'<span>'+esc(plan.sectors)+'</span>':'')+(plan.lifts?'<span>'+number(plan.lifts)+' remontées prévues</span>':'')+'</div>':'';
        const routes=valid && Array.isArray(r.routes)?r.routes:[];
        const states={open:'Ouverte',closed:'Fermée',planned:'Prévue',unknown:'Non communiqué'};
        const items=routes.length?'<details class="snow-routes"><summary>Détail des pistes et remontées</summary>'+['trails','lifts'].map(type=>{
            const list=routes.filter(x=>x.type===type);if(!list.length)return '';
            return '<h3>'+(type==='trails'?'Pistes':'Remontées')+'</h3>'+list.map(x=>'<div><span>'+esc(x.name)+'</span><small data-state="'+(x.status==='open'?'open':'other')+'">'+(states[x.status]||states.unknown)+'</small></div>').join('');
        }).join('')+'</details>':'';
        const origin=r?.publisher&&valid?' · '+r.publisher:'';
        $('snow-report').innerHTML=(depths.length||cells.length?'<div class="snow-metrics">'+[...depths,...cells].join('')+'</div>':'')+
            planned+(r?.seasonStart&&r.seasonStart>=stampDay(Date.now())?'<p class="snow-note">Ouverture de saison prévue le '+esc(formatDate(r.seasonStart))+'.</p>':'')+items+(message||status?'<p class="snow-note">'+esc([message,status].filter(Boolean).join(' ')+origin)+(reportError?' <button class="text-button" data-snow-retry="report">Réessayer</button>':'')+'</p>':'');
    }
    async function loadWeather(s,signal,force) {
        const points=s.areas.flatMap(a=>a.points);
        if (!force && points.every(p=>{const v=getWeather(p)?.value;return v?.daily && recent({at:v.dailyAt},20*60000);}))return;
        loadingWeather=true;weatherError=false;paintConditions();
        try{await batchWeather(points,true,signal);}
        catch{if(!signal.aborted)weatherError=true;}
        finally{if(!signal.aborted){loadingWeather=false;paintConditions();}}
    }
    async function loadReport(s,signal,force) {
        if (!s.report) return;
        loadingReport=true;reportError=false;paintReport();
        try{const r=await bulletin(s,signal,force);if(!signal.aborted)reportData=r;}
        catch{if(!signal.aborted)reportError=true;}
        finally{if(!signal.aborted){loadingReport=false;paintReport();}}
    }
    function paintPin(){
        const pinned=isPinned(selected.id);
        $('snow-pin').setAttribute('aria-pressed',String(pinned));
        $('snow-pin-label').textContent=pinned?'Sur l’accueil':'Ajouter à l’accueil';
        $('snow-pin').setAttribute('aria-label',pinned?'Retirer de l’accueil':'Ajouter à l’accueil');
    }
    $('snow-pin').onclick=()=>{if(selected){pinStation(selected.id);paintPin();}};
    function detail(s,home=false) {
        if(!home)listY=window.scrollY;
        observations.leave();
        fromHome=home;resetRequests();selected=s;area=0;level=0;
        $('snow-back-label').textContent=home?'Aujourd’hui':'Stations';paintPin();
        $('snow-directory').hidden=true;$('snow-detail').hidden=false;
        $('snow-name').textContent=s.name;$('snow-domain').textContent=s.domain;
        $('snow-area-wrap').hidden=s.areas.length<2;
        $('snow-area').innerHTML=s.areas.map((a,i)=>'<option value="'+i+'">'+esc(a.name)+'</option>').join('');
        loadingReport=s.report;loadingWeather=false;weatherError=false;reportError=false;
        reportData=getReport(s);paintConditions();
        loadWeather(s,lifetime.signal,false);loadReport(s,lifetime.signal,false);
        window.scrollTo(0,0);$('snow-name').focus({preventScroll:true});
    }
    function back() {
        if (!selected) return false;
        if(fromHome){goHome();return true;}
        const id=selected.id;
        directory();$('snow-groups').querySelector('[data-station="'+id+'"]')?.focus({preventScroll:true});window.scrollTo(0,listY);return true;
    }
    $('snow-back').onclick=back;
    $('snow-search').oninput=directory;
    for(const tab of document.querySelectorAll('[data-ski]'))tab.onclick=()=>{
        if(kind===tab.dataset.ski)return;
        kind=tab.dataset.ski;storage.set('snow.kind',kind);directory();
    };
    $('snow-groups').onclick=e=>{const b=e.target.closest('[data-station]');if(b)detail(byId.get(b.dataset.station));};
    $('snow-levels').onclick=e=>{const b=e.target.closest('[data-level]');if(b){level=Number(b.dataset.level);paintConditions();$('snow-levels').children[level].focus({preventScroll:true});}};
    $('snow-area').onchange=()=>{area=Number($('snow-area').value);level=0;paintConditions();};
    $('snow-detail').onclick=e=>{
        const b=e.target.closest('[data-snow-retry]');if(!b||!selected)return;
        if(b.dataset.snowRetry==='report'&&!loadingReport)loadReport(selected,lifetime.signal,true);
        if(b.dataset.snowRetry==='weather'&&!loadingWeather)loadWeather(selected,lifetime.signal,true);
    };
    function paintHome(node,s) {
        const field=k=>node.querySelector('[data-field="'+k+'"]');
        const base=s.areas[0].points[0], cur=getWeather(base)?.value?.current;
        const r=getReport(s)?.value,valid=freshBulletin(r);
        const measured=valid?r.snow?.filter(x=>Number.isFinite(x.cm)).sort((a,b)=>Math.abs((a.altitude??base[2])-base[2])-Math.abs((b.altitude??base[2])-base[2]))[0]:null;
        const estimate=Number.isFinite(cur?.snow_depth)&&Math.abs(Date.now()/1000-cur.time)<10800?Math.round(cur.snow_depth*100):null;
        field('town').textContent=s.name;field('following').hidden=false;
        field('following').textContent=s.kind==='fond'?'Ski de fond':'Ski alpin';
        field('date').textContent=cur?C.date(cur.time,zone,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
        field('temperature').innerHTML=number(Number.isFinite(cur?.temperature_2m)?Math.round(cur.temperature_2m):null)+'<sup>°</sup>';
        field('condition').textContent=cur?C.condition(cur.weather_code,cur.is_day===1,cur.cloud_cover,cur.precipitation,cur).label:'Météo indisponible';
        field('feels').textContent=(s.kind==='fond'?'Repère nordique':'Départ')+' · '+number(base[2])+' m';
        field('symbol').innerHTML=cur?weather(cur.weather_code,cur.is_day===1,cur.cloud_cover,cur.precipitation,cur):'';
        node.classList.toggle('is-night',cur?.is_day===0);
        const stat=(key,label,val,symbol)=>{const b=field(key);b.textContent=val;b.nextElementSibling.textContent=label;const i=b.parentElement.previousElementSibling;if(i.dataset.icon!==symbol){i.dataset.icon=symbol;i.innerHTML=icon(symbol);}};
        const depth=measured?.cm??estimate, opened=valid&&(r.km||r.trails);
        stat('wind',measured?'Neige relevée':'Neige estimée',Number.isFinite(depth)?number(depth)+' cm':'—','drop');
        stat('humidity',valid&&r.km?'Km ouverts':'Pistes ouvertes',opened?openCount(opened):'—','calendar');
        const top=s.kind==='alpin'?s.areas.reduce((b,a)=>a.points[1][2]>b.points[1][2]?a:b):null;
        stat('range',top?'Sommet':'Altitude',top?(top.approx?'≈ ':'')+number(top.points[1][2])+' m':number(base[2])+' m','mountain');
        node.querySelector('.card-hit').setAttribute('aria-label','Ouvrir la fiche de '+s.name+' · '+field('following').textContent);
    }
    function stopHome(){homeController?.abort();homeController=null;}
    async function loadHome(rows,force,update){
        stopHome();if(!rows.length)return;
        homeController=new AbortController();const signal=homeController.signal;
        const points=[...new Map(rows.map(s=>s.areas[0].points[0]).map(p=>[pointKey(p),p])).values()]
            .filter(p=>force||!recent(getWeather(p),20*60000));
        async function temps(){
            for(let i=0;i<points.length&&!signal.aborted;i+=6){
                try{await batchWeather(points.slice(i,i+6),false,signal);}catch{}
                if(!signal.aborted)rows.forEach(update);
            }
        }
        let at=0;
        async function counts(){while(at<rows.length&&!signal.aborted){const s=rows[at++];try{await bulletin(s,signal,force);}catch{}if(!signal.aborted)update(s);}}
        await Promise.all([temps(),counts(),counts()]);
    }
    return {
        enter(id){active=true;if(byId.has(id)){detail(byId.get(id),true);return;}fromHome=false;directory();window.scrollTo(0,listY);},
        paintHome,loadHome,stopHome,
        leave(){active=false;observations.leave();summaryRequest?.abort();summaryRequest=null;if(!selected)listY=window.scrollY;resetRequests();selected=null;},
        refresh(force=false){
            if(!active)return;
            if(!selected){
                observations.refresh(force);loadSummaries(force);
                if(force){
                    const ids=[...visible].map(b=>b.dataset.station);
                    resetRequests();ids.forEach(id=>forcePreview.add(id));watchVisible();
                }else directory();
                return;
            }
            if(!loadingWeather)loadWeather(selected,lifetime.signal,force);
            if(!loadingReport)loadReport(selected,lifetime.signal,force);
        },back
    };
}
const api={create,normalize,matches,forecastURL,freshBulletin};
if(typeof module==='object'&&module.exports)module.exports=api;else root.MeteoSnow=api;
})(globalThis);
