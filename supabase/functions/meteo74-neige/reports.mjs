// Read factual fields from published resort bulletins. Missing fields stay absent.
const clean = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
const plain = text => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const all = (root, selector) => [...root.querySelectorAll(selector)];
const file = img => (img?.getAttribute('src') || '').split('/').pop().split('.')[0];
const within = (name, filter) => !filter || filter.split('|').some(term => plain(name).includes(term));
const stamp = text => {
    const date = /(\d{2})\/(\d{2})\/(20\d\d)/.exec(text);
    return date ? [date[3], date[2], date[1]].join('-') : null;
};
function pair(text) {
    const m = /^\s*(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)(?:\s*km)?\s*$/i.exec(text);
    if (!m) return null;
    const [open,total] = m.slice(1).map(s => Number(s.replace(',','.')));
    return total > 0 && total <= 2000 && open <= total ? {open,total} : null;
}
function countKnown(statuses) {
    return statuses.length && statuses.every(s => typeof s === 'boolean')
        ? {open:statuses.filter(Boolean).length,total:statuses.length} : null;
}
export function isRecent(date, now, days=3) {
    if (!date) return false;
    const elapsed = now - Date.parse(date+'T12:00:00Z');
    return Number.isFinite(elapsed) && elapsed >= -86400000 && elapsed <= days*86400000;
}
function lumi(doc, config, result, now) {
    result.date = stamp(clean(doc.querySelector('.intro_maj')));
    for (const card of all(doc,'.bloc_meteo .meteo_card')) {
        const header = clean(card.querySelector('.bloc_title'));
        if (config.excludeSnow || !within(header,config.snowFilter)) continue;
        const point = /^(.+?)\s*-\s*(\d{2,4})\s*m\s*$/i.exec(header);
        if (!point) continue;
        const group = all(card,'.meteo_matin');
        const snow = group.find(n => file(n.querySelector('img')) === 'image_neige');
        const amount = /^(\d{1,3})\s*cm$/i.exec(clean(snow?.querySelector('.text')));
        const lastFall = group.find(n => file(n.querySelector('img')) === 'calendrier_neige');
        const fallDate = stamp(clean(lastFall));
        // Some winter bulletins display last season's values under today's edition date.
        if (!amount || (fallDate && !isRecent(fallDate,now,120))) continue;
        const depth = Number(amount[1]);
        // An isolated preseason zero with no observation details can be an empty station template.
        if (depth === 0 && !fallDate && !clean(snow.querySelector('.subtext'))) continue;
        result.snow.push({name:point[1].replace(/\s*-\s*/g,' · ').trim(),altitude:Number(point[2]),cm:depth});
    }
    if (!config.trackFilter && !config.nordicOnly) {
        for (const row of all(doc,'.bloc_etat .c100.normal')) {
            const key = {LIFTS:'lifts',DOWNHILL_SKIING:'trails'}[file(row.querySelector('img'))];
            if (key) result[key] = pair(clean(row.querySelector('.text')));
        }
    }
    const items = {trails:new Map(),lifts:new Map()};
    const routes=new Map();
    for (const card of all(doc,'.bloc_pistes_remontees .meteo_card')) {
        if (!within(clean(card.querySelector('.bloc_title')),config.trackFilter)) continue;
        for (const row of all(card,'.POI_info')) {
            const type = file(row.querySelector('.img_type'));
            const key = config.nordicOnly ? (/^(CROSS_COUNTRY|NORDIC_SKIING|SKATING|CLASSIC_SKI)/.test(type)?'trails':null) : /^DOWNHILL_SKIING_(GREEN|BLUE|RED|BLACK)$/.test(type) ? 'trails' :
                /^(GONDOLA|DETACHABLE_CHAIRLIFT|CHAIRLIFT|SURFACE_LIFT|MAGIC_CARPET|TRAM|ROPE_TOW|FUNICULAR|TELEMIX)$/.test(type) ? 'lifts' : null;
            if (!key) continue;
            const name = clean(row.querySelector('.nom'));
            const status = file(row.querySelector('img[alt="statut ouverture"]'));
            if (!name) continue;
            const opened = /_opened$/.test(status) ? true : /_(closed|out_period|scheduled|stopped|delayed)$/.test(status) ? false : null;
            const id = type+'/'+name;
            if (!items[key].has(id) || opened === true) {
                items[key].set(id,opened);
                routes.set(id,{name,type:key,status:opened===true?'open':/_scheduled$/.test(status)?'planned':opened===false?'closed':'unknown'});
            }
        }
    }
    result.routes=[...routes.values()].slice(0,400);
    // Individual lists may cover only a subset of the ski area.
    for (const key of ['trails','lifts']) if (!result[key]) {
        result[key] = countKnown([...items[key].values()]);
        if (result[key]) result[key].listed = true;
    }
}
function nordic(doc, result) {
    result.date = stamp(clean(doc.querySelector('.maj-na em')));
    const trails = new Map();
    for (const row of all(doc,'ul.pistes.liste li')) {
        const info = plain(clean(row.querySelector('.infos')));
        if (!/\bski de fond\b/.test(info)) continue;
        const name = clean(row.querySelector('.nom'));
        const s = plain(clean(row.querySelector('.ouverture')));
        if (!name) continue;
        const sector = clean(row.closest('.bloc-pistes')?.querySelector('h3'));
        const status = routeStatus(s);
        result.routes.push({name:sector?sector+' · '+name:name,type:'trails',status});
        trails.set(sector+'/'+name,status==='unknown' ? null : status==='open');
    }
    result.trails = countKnown([...trails.values()]);
    if (result.trails) result.trails.listed=true;
    const km = all(doc,'.type-piste').filter(n => plain(clean(n.querySelector('.nom'))) === 'km de pistes ouvertes');
    // Multi-sector summaries can include both a global total and sector totals.
    if (km.length === 1) result.km = pair(clean(km[0].querySelector('.ouverture')));
}
function tourism(doc, result) {
    result.date = stamp(clean(doc.querySelector('.wp-block-info-neige-station__heading__date')));
    const cell = doc.querySelector('th.infoneige-table--snowbottom')?.parentElement;
    const depth = /Bas\s*:\s*(\d{1,3})\s*cm\s*\/\s*Haut\s*:\s*(\d{1,3})\s*cm/i.exec(clean(cell));
    if (depth) result.snow = [{name:'Bas des pistes',cm:Number(depth[1])},{name:'Haut des pistes',cm:Number(depth[2])}];
    for (const group of all(doc,'.station__summary__pistes')) {
        const title = plain(clean(group.querySelector('.station__summary__pistes__title')));
        if (title !== 'ski alpin') continue;
        const pairs = all(group,'.pistes__summary__content').map(n => pair(clean(n.querySelector('.opened'))+'/'+clean(n.querySelector('.total')))).filter(Boolean);
        if (pairs.length) result.trails=pairs.reduce((acc,s)=>({open:acc.open+s.open,total:acc.total+s.total}),{open:0,total:0});
    }
}
const months=['janvier','fevrier','mars','avril','mai','juin','juillet','aout','septembre','octobre','novembre','decembre'];
const today=now=>new Intl.DateTimeFormat('fr-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const day=(d,m,y)=>months.includes(plain(m)) && +d>0 && +d<=31 ? [y,String(months.indexOf(plain(m))+1).padStart(2,'0'),d.padStart(2,'0')].join('-') : null;
function writtenDate(text){
    const match=/(\d{1,2})(?:er)?\s+([a-zéûôàè]+)\s+(20\d\d)/i.exec(text);
    return stamp(text)||(match&&day(match[1],match[2],match[3]))||null;
}
function routeStatus(label) {
    const state = plain(label).trim();
    if (/^ferme(?:e?s?)\b/.test(state)) return 'closed';
    if (/^fermeture\b/.test(state)) return 'unknown';
    if (/^(?:prevu(?:e)?|programme(?:e)?|prevision(?:nel(?:le)?)?)(?:\s|$)/.test(state) ||
        /^(?:ouvert(?:e?s?)|ouverture)\b.*\b(?:prevu\w*|prevision\w*|programme\w*|demain|a venir)\b/.test(state)) return 'planned';
    if (/^ouvert(?:e?s?)\b/.test(state)) return 'open';
    return 'unknown';
}
const emptyMetrics={trails:null,lifts:null,km:null};
function totals(r) {
    for (const key of ['trails','lifts']) {
        if (r[key]) continue;
        const rows=r.routes.filter(x=>x.type===key);
        const v=countKnown(rows.map(x=>x.status==='unknown'?null:x.status==='open'));
        if(v) r[key]={...v,listed:true};
    }
}
function depth(doc,r) {
    r.publisher='Hauteur de neige';
    r.date=stamp(clean(doc.querySelector('#profile-title')?.parentElement));
    if(all(doc,'p').some(p=>/premier bulletin attendu|compteurs ont été remis à zéro/i.test(clean(p))))return;
    const card=all(doc,'span').find(n=>clean(n)==='Pistes ouvertes')?.parentElement;
    if(card){
        r.trails=pair(clean(card.querySelector('.num')));
        const lifts=all(card,'span').map(clean).find(t=>/^Remontées\s+\d/i.test(t));
        r.lifts=lifts?pair(lifts.replace(/^Remontées\s+/i,'')):null;
    }
    for(const table of all(doc,'table')){
        if(!all(table,'thead th').some(n=>plain(clean(n))==='neige au sol'))continue;
        for(const row of all(table,'tbody tr')){
            const [alt,cm]=all(row,'td').map(n=>clean(n).replace(/\s/g,''));
            const name=clean(row.querySelector('th'));
            if(name && /^\d{1,4}m$/.test(alt) && /^\d{1,3}cm$/.test(cm))r.snow.push({name,altitude:parseInt(alt),cm:parseInt(cm)});
        }
    }
}
function skiInfo(doc,r,now){
    r.publisher='Skiinfo';
    for(const tag of all(doc,'script[type="application/ld+json"]')){
        let data;try{data=JSON.parse(tag.textContent);}catch{continue;}
        if(data?.['@type']!=='SkiResort'||!Array.isArray(data.additionalProperty))continue;
        const fields=new Map(data.additionalProperty.map(p=>[p.name,p.value]));
        const iso=x=>typeof x==='string' && /^20\d\d-\d\d-\d\d$/.test(x)?x:null;
        r.date=iso(fields.get('Last snow report update'));
        const start=iso(fields.get('Projected season opening date'));
        if(start&&start>=today(now)&&Date.parse(start)-now<155*86400000)r.seasonStart=start;
        for(const [key,label] of [['trails','trails'],['lifts','lifts']]){
            const open=fields.get('Open '+label), total=fields.get('Total '+label);
            if(Number.isInteger(open)&&open>=0&&open<=1000)r[key]={open,total:Number.isInteger(total)&&total>=open&&total>0?total:null};
        }
        for(const [key,name]of [['Base snow depth','Bas des pistes'],['Summit snow depth','Haut des pistes']]){
            const p=data.additionalProperty.find(x=>x.name===key);
            if(p&&Number.isFinite(p.value)&&p.value>=0&&p.value<=999&&/^centimeters|cm$/i.test(p.unitText||''))r.snow.push({name,cm:p.value});
        }
        break;
    }
}
function leman(doc,config,r,now){
    const groups=all(doc,'.secteur').filter(n=>[...n.classList].some(c=>c.startsWith(config.sector)));
    for(const group of groups){
        const h=group.querySelector('h3'), title=plain(clean(h));
        const type=title.startsWith('pistes')?'trails':title.startsWith('remontees')?'lifts':null;
        if(!type)continue;
        const date=writtenDate(clean(group.querySelector('h3 .date')));
        if(date&&(!r.date||date>r.date))r.date=date;
        if(!isRecent(date,now))continue;
        for(const row of all(group,'li.piste')){
            const [label,state]=all(row,'span');
            if(clean(label))r.routes.push({name:clean(label),type,status:routeStatus(clean(state))});
        }
    }
    totals(r);
}
function liveArea(doc,kind,r,now){
    if(kind==='pds'){
        const root=doc.querySelector('.woody-component-snowflake');if(!root)return;
        for(const [key,prefix]of [['trails','slopes'],['lifts','lifts']]){
            const n=root.querySelector('[data-snowflake-live="'+prefix+'-open-global"]');
            if(n)r[key]=pair(clean(n.parentElement));
        }
        for(const n of all(root,'.sector-content .item')){
            const type=n.hasAttribute('data-color')?'trails':/remontee|teleski|telesiege|telecabine|telepherique/.test(plain(n.querySelector('.wicon')?.className||''))?'lifts':null;
            if(type&&clean(n.querySelector('.title')))r.routes.push({name:clean(n.querySelector('.title')),type,status:routeStatus(clean(n.querySelector('.status')))});
        }
        r.publisher='Portes du Soleil';
    }else{
        // The provider leaves the previous season's counters on this page during the summer.
        if(/saison est terminee/.test(plain(clean(doc.querySelector('.resort__infobox')))))return;
        for(const row of all(doc,'.ski-trail-connection')){
            const name=clean(row.querySelector('.ski-trail-connection__title'));
            const pict=row.querySelector('.ski-trail-connection__left use')?.getAttribute('href')||'';
            const type=/difficultylevel/.test(pict)?'trails':/lift|teles|gondola|chairlift|telecab/i.test(pict)?'lifts':null;
            if(name&&type)r.routes.push({name,type,status:routeStatus(clean(row.querySelector('.realtime-opening-label__label')))});
        }
        r.publisher='Môle & Brasses';
    }
    totals(r);
    if(r.trails||r.lifts||r.routes.length){r.date=today(now);r.dateKind='consulted';}
}
function local(doc,r,now){
    // A town's regular weekly hours do not establish whether a snow-dependent run is open.
    for(const p of all(doc,'main p, article p, .texte p, .uit_cttxt p')){
        const t=clean(p),d=writtenDate(t);
        if(!d||!/pistes?|t[ée]l[ée]ski|station|domaine/i.test(t)||t.length>400)continue;
        if(!r.date||d>r.date)r.date=d;
        if(!isRecent(d,now)||/prévu|prévision|sous réserve/i.test(t))continue;
        const m=/\b(pistes?|téléski|station|domaine)\s+(?:(?:est|sont)\s+)?(ouvert(?:e|es|s)?|ferm(?:é|ée|és|ées))\b/i.exec(t);
        if(m)r.areaStatus=plain(m[2]).startsWith('ouv')?'open':'closed';
    }
}
export function readPlan(doc,now=Date.now()){
    let from,through,sectors,lifts;
    for(const el of all(doc,'p,h2')){
        const t=clean(el);
        const m=/(\d{1,2})\s+(?:et|au)\s+(\d{1,2})\s+([a-zéûôàè]+)\s+(20\d\d)/i.exec(t);
        if(!from&&m&&/week.end|ouvert/i.test(t)){from=day(m[1],m[3],m[4]);through=day(m[2],m[3],m[4]);}
        const a=/ouverture partielle des secteurs\s+([^.!?]{2,85})/i.exec(t);if(a)sectors=a[1].trim();
        if(el.tagName.toLowerCase()==='h2'&&/^remontées mécaniques ouvertes/i.test(t)){
            const group=el.nextElementSibling;
            if(group){const list=all(group,'li').filter(n=>/^(télésiège|téléski|télécabine|téléphérique|tapis)\b/iu.test(clean(n)));if(list.length)lifts=list.length;}
        }
    }
    return from&&through&&through>=from&&through>=today(now)&&Date.parse(from)-now<90*86400000?{from,through,sectors,lifts}:null;
}
export function nordicNotice(doc,area,now=Date.now()){
    // Undated day/month headings are only meaningful in a recently updated edition.
    const edition=doc.querySelector('meta[property="article:modified_time"]')?.getAttribute('content')?.slice(0,10);
    if(!isRecent(edition,now,30))return null;
    const heading=all(doc,'h4').find(n=>plain(clean(n)).includes(area)&&/ouverture/.test(plain(clean(n))));
    if(!heading)return null;
    const group=heading.parentElement;
    const next=clean(group.querySelector('h5'));
    const dates=[...next.matchAll(/(\d{1,2})\/(\d{1,2})/g)].map(m=>{
        const year=Number(edition.slice(0,4))+(Number(edition.slice(5,7))===12&&Number(m[2])===1?1:0);
        return year+'-'+m[2].padStart(2,'0')+'-'+m[1].padStart(2,'0');
    });
    if(!dates.length||dates[0]<edition||Date.parse(dates[0])-Date.parse(edition)>45*86400000)return null;
    const text=clean(group);
    const start=/en continu.{0,30}?(\d{2})\/(\d{2})\/(\d{2,4})/i.exec(text);
    const seasonStart=start?(start[3].length===2?'20':'')+start[3]+'-'+start[2]+'-'+start[1]:
        dates.length===1&&/en continu/i.test(text)?dates[0]:null;
    const plan=dates.length>1&&dates.at(-1)>=today(now)?{from:dates[0],through:dates.at(-1)}:null;
    return {plan,seasonStart:seasonStart&&seasonStart>=today(now)?seasonStart:null};
}
export function readBulletin(doc, config, now=Date.now()) {
    const r={date:null,scope:config.scope||null,snow:[],routes:[],...emptyMetrics};
    if(config.kind==='lumi')lumi(doc,config,r,now);
    else if(config.kind==='nordic')nordic(doc,r);
    else if(config.kind==='tourism')tourism(doc,r);
    else if(config.kind==='depth')depth(doc,r);
    else if(config.kind==='skiinfo')skiInfo(doc,r,now);
    else if(config.kind==='leman')leman(doc,config,r,now);
    else if(config.kind==='pds'||config.kind==='brasses')liveArea(doc,config.kind,r,now);
    else if(config.kind==='local')local(doc,r,now);
    if(!isRecent(r.date,now))return {...r,snow:[],routes:[],areaStatus:null,...emptyMetrics};
    return r;
}
