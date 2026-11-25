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
        assert.ok(station.url.startsWith('https://'));
        assert.equal(station.report,Object.hasOwn(feeds,station.id));
        for(const area of station.areas) {
            assert.equal(area.points.length,station.kind==='fond'?1:2);
            for(const [lat,lon,alt] of area.points) {
                assert.ok(lat>45.6 && lat<46.5 && lon>5.9 && lon<7.1);
                assert.ok(alt>500 && alt<4000);
            }
            if(area.points.length===2) assert.ok(area.points[0][2]<area.points[1][2]);
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
