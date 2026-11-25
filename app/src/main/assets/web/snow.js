/* Météo74 · directory, station observations and altitude-specific forecasts. */
(function(root) {
'use strict';
const zone = 'Europe/Paris';
const stampDay = epoch => new Intl.DateTimeFormat('fr-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(epoch);
const number = value => Number.isFinite(value) ? value.toLocaleString('fr-FR',{maximumFractionDigits:1}) : '—';
const normalize = text => String(text ?? '').normalize('NFD').replace(/\p{M}/gu,'').replace(/œ/gi,'oe').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function matches(station, region, query) {
    const terms = normalize(query).split(' ').filter(Boolean);
    const haystack = normalize([station.name,region,station.domain,...station.areas.flatMap(a=>[a.name,a.landmark])].join(' '));
    return terms.every(t=>haystack.includes(t) || haystack.replace(/ /g,'').includes(t));
}
function forecastURL(points, daily) {
    const q = new URLSearchParams({timezone:zone,timeformat:'unixtime',forecast_days:daily?'5':'1',
        current:'temperature_2m,weather_code,is_day,snow_depth',
        latitude:points.map(p=>p[0]).join(','),longitude:points.map(p=>p[1]).join(','),elevation:points.map(p=>p[2]).join(',')});
    if (daily) q.set('daily','weather_code,temperature_2m_min,temperature_2m_max,snowfall_sum');
    return 'https://api.open-meteo.com/v1/forecast?'+q;
}
const pointKey = p => p.join(',');
const recent = (entry,ms) => !!entry && Date.now()-entry.at>=0 && Date.now()-entry.at<ms;
function freshBulletin(r) {
    if (!r?.date) return false;
    const age=Date.now()-Date.parse(r.date+'T12:00:00Z');
    return Number.isFinite(age) && age>=-86400000 && age<=3*86400000;
}
function create({$,C,storage,icon,weather,escape:esc,fetchJSON,catalog,service}) {
    const {stations,regions}=catalog;
    const byId=new Map(stations.map(s=>[s.id,s]));
    const expanded={alpin:new Set([0]),fond:new Set([0])};
    const regionOrder=regions.map((_,i)=>i);
    let kind=storage.get('snow.kind','alpin')==='fond'?'fond':'alpin';
    let active=false, selected=null, area=0, level=0, listY=0;
    let lifetime=null, observer=null, timer=0;
    const visible=new Set(), attempted=new Set(), forcePreview=new Set(), pendingReports=new Map();
    const weatherCache=new Map(), reportCache=new Map();
    let detailData=null, reportData=null, loadingWeather=false, loadingReport=false;
    let weatherError=false, reportError=false;
    const formatter=new Intl.DateTimeFormat('fr-FR',{weekday:'short',day:'numeric',month:'short',timeZone:zone});
    const formatDate=d=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',year:'numeric',timeZone:zone}).format(Date.parse(d+'T12:00:00Z'));
    const bulletLink=s=>'<a class="snow-link" href="'+esc(s.url)+'">Bulletin du domaine '+icon('chevron')+'</a>';
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
    const getReport=s=>getCache(reportCache,'report',s.id);
    function resetRequests(){
        lifetime?.abort();
        lifetime=new AbortController();
        observer?.disconnect(); observer=null;
        clearTimeout(timer);visible.clear();attempted.clear();forcePreview.clear();pendingReports.clear();
    }
    function rangeLabel(s){
        const pp=s.areas[0].points;
        return pp.map(p=>number(p[2])).join(' – ')+' m';
    }
    function paintPreview(button) {
        const s=byId.get(button.dataset.station);
        const cache=getWeather(s.areas[0].points[0]);
        const current=cache?.value?.current;
        const temp=button.querySelector('.snow-preview-temp');
        const now=Number.isFinite(current?.time) && Math.abs(Date.now()/1000-current.time)<3*3600;
        temp.textContent=now && Number.isFinite(current.temperature_2m)?Math.round(current.temperature_2m)+'°':'';
        const r=getReport(s)?.value, extra=button.querySelector('.snow-preview-extra');
        const parts=[];
        if (freshBulletin(r)) {
            if (r.km) parts.push(number(r.km.open)+'/'+number(r.km.total)+' km ouverts');
            else if (r.trails) parts.push(r.trails.open+'/'+r.trails.total+' pistes');
            const first=r.snow?.[0];
            if (Number.isFinite(first?.cm)) parts.push(first.cm+' cm'+(first.altitude?' à '+number(first.altitude)+' m':' · '+first.name));
        }
        extra.textContent=parts.join(' · ');extra.hidden=!parts.length;
    }
    async function bulletin(s, signal, force=false) {
        const cache=getReport(s);
        if (!force && recent(cache,15*60000)) return cache;
        if (pendingReports.has(s.id)) return pendingReports.get(s.id);
        const task=fetchJSON(service.base+'meteo74-neige?station='+encodeURIComponent(s.id),signal,15000,service.headers)
            .then(data=>{
                if (!Array.isArray(data.snow)) throw Error('Bulletin illisible');
                if (signal.aborted) return cache;
                return save(reportCache,'report',s.id,data);
            }).finally(()=>{if(pendingReports.get(s.id)===task)pendingReports.delete(s.id);});
        pendingReports.set(s.id,task);
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
                let i=0;
                async function next() {
                    while(i<rows.length && !signal.aborted) {
                        const at=i++,s=rows[at];
                        if (!s.report) continue;
                        try{await bulletin(s,signal,forcePreview.has(s.id));update(buttons[at]);}catch{}
                    }
                }
                await Promise.all([temps,next(),next()]);
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
        closeWidget();
        resetRequests();$('snow-detail').hidden=true;$('snow-directory').hidden=false;
        const query=$('snow-search').value.trim();
        const shown=stations.filter(s=>s.kind===kind && matches(s,regions[s.region],query));
        for(const tab of document.querySelectorAll('[data-ski]'))tab.setAttribute('aria-pressed',String(tab.dataset.ski===kind));
        $('snow-empty').hidden=shown.length>0;
        $('snow-groups').innerHTML=regionOrder.map(i=>{
            const rows=shown.filter(s=>s.region===i).sort((a,b)=>a.name.localeCompare(b.name,'fr'));
            if (!rows.length) return '';
            const cards=rows.map(s=>'<button class="snow-row" data-station="'+s.id+'"><span class="snow-row-copy"><b>'+esc(s.name)+'</b><small>'+esc(rangeLabel(s))+'</small><small class="snow-preview-extra" hidden></small></span><span class="snow-preview-temp"></span>'+icon('chevron')+'</button>').join('');
            return '<details class="snow-group" data-region="'+i+'"'+(query||expanded[kind].has(i)?' open':'')+'><summary><span>'+esc(regions[i])+'</span><small>'+rows.length+'</small>'+icon('chevron')+'</summary><div>'+cards+'</div></details>';
        }).join('');
        const generation=lifetime;
        for (const g of $('snow-groups').querySelectorAll('details'))g.ontoggle=()=>{
            if(generation!==lifetime || !g.isConnected)return;
            if(!query){const id=Number(g.dataset.region);if(g.open)expanded[kind].add(id);else expanded[kind].delete(id);}
            watchVisible();
        };
        watchVisible();
    }
    const metric=(title,value)=>'<div><small>'+esc(title)+'</small><strong>'+esc(value)+'</strong></div>';
    function paintConditions() {
        if (!selected)return;
        const a=selected.areas[area],p=a.points[level];
        const row=getWeather(p)?.value,cur=row?.current;
        const stale=cur && Math.abs(Date.now()/1000-cur.time)>3*3600;
        const controls=$('snow-levels');
        controls.innerHTML=a.points.map((pt,i)=>'<button data-level="'+i+'" aria-pressed="'+(i===level)+'">'+(a.points.length===1?'Repère météo':i?'En altitude':'Au départ')+' · '+number(pt[2])+' m</button>').join('');
        if (a.points.length===1){controls.firstElementChild.disabled=true;controls.firstElementChild.classList.add('single');}
        const condition=cur?C.condition(cur.weather_code,cur.is_day===1).label:'';
        const value=Number.isFinite(cur?.temperature_2m)?Math.round(cur.temperature_2m)+'°':'—';
        const picture=cur?weather(cur.weather_code,cur.is_day===1):'';
        const status=cur?(stale?'Dernières données · ':'')+C.date(cur.time,zone,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):
            loadingWeather?'Chargement de la météo…':'Météo indisponible';
        $('snow-current').innerHTML='<div class="snow-current"><div><strong>'+value+'</strong><b>'+esc(condition)+'</b></div>'+picture+'</div><div class="snow-context"><span>'+esc(a.landmark)+'</span><span>'+esc(status)+'</span></div>';
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
        if (valid && r.trails) cells.push(metric(r.trails.listed?'Pistes listées ouvertes':'Pistes ouvertes',r.trails.open+' / '+r.trails.total));
        if (valid && r.lifts) cells.push(metric(r.lifts.listed?'Remontées listées ouvertes':'Remontées ouvertes',r.lifts.open+' / '+r.lifts.total));
        const measured=valid?(r.snow||[]):[];
        const depths=measured.map(pt=>metric('Neige · '+pt.name+(pt.altitude?' · '+number(pt.altitude)+' m':''),number(pt.cm)+' cm'));
        if (!depths.length && detailData) depths.push(metric('Neige au sol estimée · '+number(detailData.alt)+' m',number(detailData.cm)+' cm'));
        let message='';
        if (loadingReport && !r) message='Recherche du bulletin…';
        else if (reportError) message='Actualisation du bulletin indisponible.';
        else if (r?.date && !valid) message='Dernier bulletin du '+formatDate(r.date)+'.';
        else if(valid && (cells.length || measured.length)) message='Bulletin du '+formatDate(r.date)+(r.scope?' · '+r.scope:'')+'.';
        else if(selected.report) message='Le domaine n’a pas publié de chiffres récents.';
        const status=!cells.length&&!loadingReport?'Ouverture des pistes à consulter auprès du domaine.':'';
        $('snow-report').innerHTML=(depths.length||cells.length?'<div class="snow-metrics">'+[...depths,...cells].join('')+'</div>':'')+
            (message||status?'<p class="snow-note">'+esc([message,status].filter(Boolean).join(' '))+(reportError?' <button class="text-button" data-snow-retry="report">Réessayer</button>':'')+'</p>':'')+(selected.widget?'':bulletLink(selected));
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
    function closeWidget() {
        $('snow-widget').open=false;
        $('snow-frame').replaceChildren();
    }
    $('snow-widget').ontoggle=()=>{
        const box=$('snow-frame');
        if (!$('snow-widget').open || !selected?.widget) {box.replaceChildren();return;}
        if (box.firstChild)return;
        const frame=document.createElement('iframe');
        frame.title='Bulletin officiel · '+selected.name;
        frame.setAttribute('sandbox','allow-scripts allow-same-origin');
        frame.referrerPolicy='no-referrer';
        frame.src=selected.widget;
        const link=document.createElement('a');
        link.className='snow-link';link.href=selected.widget;link.textContent='Voir en plein écran';
        box.append(frame,link);
    };
    function detail(s) {
        listY=window.scrollY;resetRequests();closeWidget();selected=s;
        $('snow-widget').hidden=!s.widget;area=0;level=0;
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
    return {
        enter(){active=true;directory();window.scrollTo(0,listY);},
        leave(){active=false;closeWidget();if(!selected)listY=window.scrollY;resetRequests();selected=null;},
        refresh(force=false){
            if(!active)return;
            if(!selected){
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
