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
    if (!config.trackFilter) {
        for (const row of all(doc,'.bloc_etat .c100.normal')) {
            const key = {LIFTS:'lifts',DOWNHILL_SKIING:'trails'}[file(row.querySelector('img'))];
            if (key) result[key] = pair(clean(row.querySelector('.text')));
        }
    }
    const items = {trails:new Map(),lifts:new Map()};
    for (const card of all(doc,'.bloc_pistes_remontees .meteo_card')) {
        if (!within(clean(card.querySelector('.bloc_title')),config.trackFilter)) continue;
        for (const row of all(card,'.POI_info')) {
            const type = file(row.querySelector('.img_type'));
            const key = /^DOWNHILL_SKIING_(GREEN|BLUE|RED|BLACK)$/.test(type) ? 'trails' :
                /^(GONDOLA|DETACHABLE_CHAIRLIFT|CHAIRLIFT|SURFACE_LIFT|MAGIC_CARPET|TRAM|ROPE_TOW|FUNICULAR|TELEMIX)$/.test(type) ? 'lifts' : null;
            if (!key) continue;
            const name = clean(row.querySelector('.nom'));
            const status = file(row.querySelector('img[alt="statut ouverture"]'));
            if (!name) continue;
            const opened = /_opened$/.test(status) ? true : /_(closed|out_period|scheduled|stopped|delayed)$/.test(status) ? false : null;
            const id = type+'/'+name;
            if (!items[key].has(id) || opened === true) items[key].set(id,opened);
        }
    }
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
        trails.set(sector+'/'+name,/^ouvert(?:e)?$/.test(s) ? true : /^ferme(?:e)?$/.test(s) ? false : null);
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
export function readBulletin(doc, config, now=Date.now()) {
    const r = {date:null,scope:config.scope||null,snow:[],trails:null,lifts:null,km:null};
    if (config.kind==='lumi') lumi(doc,config,r,now);
    else if (config.kind==='nordic') nordic(doc,r);
    else if (config.kind==='tourism') tourism(doc,r);
    if (!isRecent(r.date,now)) return {...r,snow:[],trails:null,lifts:null,km:null};
    return r;
}
