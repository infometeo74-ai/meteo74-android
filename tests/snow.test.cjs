const test = require('node:test');
const assert = require('node:assert/strict');
const {regions, stations} = require('../app/src/main/assets/web/snow-stations.js');
const {matches, forecastURL} = require('../app/src/main/assets/web/snow.js');
const feeds = require('../supabase/functions/meteo74-neige/feeds.json');

test('The two ski directories have stable distinct keys and Haute-Savoie forecast points', () => {
    assert.equal(stations.filter(s=>s.kind==='alpin').length,40);
    assert.equal(stations.filter(s=>s.kind==='fond').length,22);
    assert.equal(new Set(stations.map(s=>s.id)).size,62);
    for(const station of stations) {
        assert.ok(regions[station.region]);
        assert.ok(!('url' in station) && !('widget' in station));
        assert.ok(feeds[station.id].url.startsWith('https://'));
        assert.equal(station.report,Object.hasOwn(feeds,station.id));
        for(const area of station.areas) {
            assert.equal(area.points.length,station.kind==='fond'?1:2);
            for(const [lat,lon,alt] of area.points) {
                assert.ok(lat>45.6 && lat<46.5 && lon>5.9 && lon<7.1);
                assert.ok(alt>500 && alt<4000);
            }
            if(area.points.length===2){assert.ok(area.points[0][2]<area.points[1][2]);assert.ok(area.summit && area.reference);}
        }
    }
});

test('Accents, apostrophes and sector names find their stations', () => {
    function found(name,query) {
        const station=stations.find(s=>s.id===name);
        return matches(station,regions[station.region],query);
    }
    assert.ok(found('chamonix-mont-blanc','argentiere'));
    assert.ok(found('fond-plateau-des-glieres','glières'));
    assert.ok(found('les-carroz-daraches','daraches'));
    assert.ok(found('praz-de-lyssommand','sommand'));
    assert.equal(found('fond-les-confins','zzz'),false);
});

test('The API receives each matching coordinate and its altitude in order', () => {
    const station=stations.find(s=>s.name==='Chamonix-Mont-Blanc');
    const points=station.areas.flatMap(a=>a.points);
    const {searchParams:q} = new URL(forecastURL(points,true));
    assert.equal(points.length,8);
    ['latitude','longitude','elevation'].forEach((key,i)=>assert.deepEqual(q.get(key).split(',').map(Number),points.map(p=>p[i])));
    assert.match(q.get('daily'),/snowfall_sum/);
    assert.match(q.get('current'),/snow_depth/);
    assert.equal(q.get('forecast_days'),'5');
    assert.equal(new URL(forecastURL([points[0]],false)).searchParams.has('daily'),false);
});

test('Expired Nordic bulletins clear their counts, and a reported zero remains distinct from missing data', async () => {
    const {readBulletin}=await import('../supabase/functions/meteo74-neige/reports.mjs');
    const node = text => ({textContent:text});
    const km={querySelector:sel=>node(sel==='.nom'?'Km de pistes ouvertes':'0/47 km')};
    const doc={querySelector:()=>node('Mise à jour : 25/11/2026'),querySelectorAll:sel=>sel==='.type-piste'?[km]:[]};
    const fresh=readBulletin(doc,{kind:'nordic'},Date.UTC(2026,10,25,18));
    assert.deepEqual(fresh.km,{open:0,total:47});
    assert.equal(fresh.trails,null);
    assert.deepEqual(fresh.snow,[]);
    const old=readBulletin(doc,{kind:'nordic'},Date.UTC(2026,11,4,18));
    assert.equal(old.date,'2026-11-25');
    assert.equal(old.km,null);
});

test('Summits use the highest ski sector and its own forecast coordinates',()=>{
    const c=stations.find(x=>x.id==='chamonix-mont-blanc');
    const argent=c.areas.find(a=>a.name==='Argentière');
    assert.match(argent.summit,/Bochard/);
    assert.equal(argent.points[1][2],2765);
    assert.notDeepEqual(argent.points[0].slice(0,2),argent.points[1].slice(0,2));
    assert.equal(stations.find(x=>x.id==='flaine').areas[0].points[1][2],2500);
    assert.equal(stations.find(x=>x.id==='avoriaz').areas[0].points[1][2],2277);
    assert.equal(stations.filter(x=>x.kind==='alpin').reduce((n,s)=>n+s.areas.length,0),49);
});

test('A planned weekend expires independently of the date of the snow report',async()=>{
    const {readPlan}=await import('../supabase/functions/meteo74-neige/reports.mjs');
    const p=textContent=>({tagName:'P',textContent});
    const doc={querySelectorAll:()=>[p('Préouverture le week-end des 28 et 29 novembre 2026.'),p('Ouverture partielle des secteurs Arare et Chavanette.')]};
    assert.deepEqual(readPlan(doc,Date.UTC(2026,10,25)),{from:'2026-11-28',through:'2026-11-29',sectors:'Arare et Chavanette',lifts:undefined});
    assert.equal(readPlan(doc,Date.UTC(2026,10,30)),null);
});

test('Published open counts survive a missing denominator and expire separately from a future opening',async()=>{
    const {readBulletin}=await import('../supabase/functions/meteo74-neige/reports.mjs');
    const fields={'Last snow report update':'2026-11-25','Open trails':0,'Open lifts':4,'Projected season opening date':'2026-12-19'};
    const json=JSON.stringify({'@type':'SkiResort',additionalProperty:Object.entries(fields).map(([name,value])=>({name,value}))});
    const doc={querySelectorAll:()=>[{textContent:json}]};
    const r=readBulletin(doc,{kind:'skiinfo'},Date.UTC(2026,10,25,19));
    assert.deepEqual(r.trails,{open:0,total:null});assert.deepEqual(r.lifts,{open:4,total:null});assert.equal(r.seasonStart,'2026-12-19');
    const old=readBulletin(doc,{kind:'skiinfo'},Date.UTC(2026,11,3));
    assert.equal(old.trails,null);assert.equal(old.lifts,null);assert.equal(old.seasonStart,'2026-12-19');
});

test('Nordic totals count confirmed openings and preserve unreported trail states',async()=>{
    const {readBulletin}=await import('../supabase/functions/meteo74-neige/reports.mjs');
    const labels=['Ouverte','Ouverte demain','Ouverture prévisionnelle','Fermée'];
    const doc={
        querySelector:()=>({textContent:'25/11/2026'}),
        querySelectorAll:selector=>selector==='ul.pistes.liste li'?labels.map((label,i)=>({
            closest:()=>null,
            querySelector:key=>({textContent:{'.infos':'Ski de fond','.nom':'Piste '+i,'.ouverture':label}[key]})
        })):[]
    };
    const read=()=>readBulletin(doc,{kind:'nordic'},Date.UTC(2026,10,25,16));
    const report=read();
    assert.deepEqual(report.routes.map(route=>route.status),['open','planned','planned','closed']);
    assert.deepEqual(report.trails,{open:1,total:4,listed:true});
    labels.push('Non communiqué');
    assert.equal(read().trails,null);
    assert.equal(read().routes.at(-1).status,'unknown');
});
