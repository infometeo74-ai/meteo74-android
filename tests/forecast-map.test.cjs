const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const base=path.join(__dirname,'../app/src/main/assets/web');
const F=require(path.join(base,'forecast-model.js'));
const read=p=>JSON.parse(fs.readFileSync(path.join(base,'assets',p),'utf8'));

test('les 24 repères de la maquette ont exactement les coordonnées d’une localité du catalogue',()=>{
    const towns=read('forecast/towns.json');
    const places=read('places/overview.json').places.concat(...Object.values(read('places/54.json')));
    assert.equal(new Set(towns.map(t=>[t.lat,t.lon].join(','))).size,24);
    assert.equal(towns.filter(t=>t.caption).length,10);
    for(const town of towns) {
        assert.ok(places.some(([name,y,x])=>name===town.name && town.lat===y/10000 && town.lon===x/10000),town.name);
        assert.equal(town.icon,undefined);
    }
    assert.ok(towns.some(t=>t.name==='Les Rousses')&&towns.some(t=>t.name==='La Pesse'));
});

test('jeudi soir à Paris, deux jours fractionnés, puis échéances quotidiennes J4 à J14',()=>{
    const p=F.periods(new Date('2026-11-26T19:00:00Z'));
    assert.deepEqual(p.slice(0,6).map(i=>i.label),['Ce soir','Cette nuit','Vendredi matin','Vendredi après-midi','Samedi matin','Samedi après-midi']);
    assert.deepEqual(p.slice(6).map(i=>i.kind),Array(11).fill('day'));
    assert.equal(p[6].label,'Dimanche');assert.equal(p.filter(k=>k.trend).length,4);
    assert.equal(p.find(i=>i.trend).date,'2026-12-06');assert.equal(p.at(-1).date,'2026-12-09');
    const url=new URL(F.url([{lat:46.485,lon:6.0605},{lat:46.285,lon:5.8478}]));
    assert.equal(url.searchParams.get('forecast_days'),'14');assert.equal(url.searchParams.get('latitude'),'46.485,46.285');
});

test('les dates locales et les créneaux courants résistent à minuit et aux changements d’heure',()=>{
    for(const [when,date,first] of [
        ['2026-03-28T23:20:00Z','2026-03-29','Fin de nuit'],['2026-03-29T05:00:00Z','2026-03-29','Ce matin'],
        ['2026-10-25T01:20:00Z','2026-10-25','Fin de nuit'],['2026-12-31T22:30:00Z','2026-12-31','Cette nuit'],
        ['2026-12-31T23:05:00Z','2027-01-01','Fin de nuit']]) {
        const p=F.periods(new Date(when));assert.equal(p[0].date,date);assert.equal(p[0].label,first);
        assert.equal(new Set(p.map(v=>v.date)).size,14);
    }
});

const sample=()=>({
    hourly:{time:['2026-11-26T22:00','2026-11-27T00:00','2026-11-27T02:00','2026-11-27T08:00','2026-11-27T09:00','2026-11-27T15:00'],
        weather_code:[0,0,0,3,80,95],temperature_2m:[2,-1,-4,0,4,7],is_day:[0,0,0,1,1,1],cloud_cover:[0,0,0,95,96,80],precipitation:[0,0,0,0,1,3]},
    daily:{time:['2026-11-27','2026-12-09'],weather_code:[3,null],temperature_2m_min:[-4,0],temperature_2m_max:[7,2]}
});
test('une nuit couvre ses deux dates civiles et les pictos changent selon la période',()=>{
    const v=F.summarize(sample()),night=v['2026-11-26/night'];
    assert.equal(night.icon,'m74-007');assert.deepEqual([night.low,night.high],[-4,2]);
    assert.equal(v['2026-11-27/morning'].icon,'m74-021');assert.match(v['2026-11-27/afternoon'].label,/Orage/);
    assert.equal(v['2026-12-09/day'],undefined);
});
test('une réponse groupée associe les mailles par indice, y compris en cas de données manquantes',()=>{
    const a=sample(),b=sample();b.daily.weather_code[0]=0;b.hourly.cloud_cover.fill(0);
    const towns=[{lat:46.4,lon:6.1},{lat:46.2,lon:5.8}];
    const map=F.batch([{...b,location_id:1},{...a,location_id:0}],towns);
    assert.equal(map.get(0)['2026-11-27/day'].icon,'m74-006');
    assert.equal(map.get(1)['2026-11-27/day'].icon,'m74-001');
    assert.equal(F.batch([a,{location_id:1}],towns).size,1);
});

test('la même couche sur Reignier et Scientrier garde le même picto le 26 novembre au soir',()=>{
    const time=[18,19,20,21].map(hour=>'2026-11-26T'+hour+':00');
    const towns=[
        {weather_code:[61,3,3,3],cloud_cover:[100,90,86,82],cloud_cover_low:[100,82,76,82]},
        {weather_code:[3,3,3,3],cloud_cover:[90,85,100,85],cloud_cover_low:[81,75,100,85]}
    ];
    for(const town of towns){
        const hourly={...town,time,is_day:[0,0,0,0],precipitation:[0,0,0,0]};
        const value=F.summarize({hourly,daily:{time:['2026-11-26'],weather_code:[3]}})['2026-11-26/evening'];
        assert.deepEqual([value.icon,value.label,value.cloud,value.lowCloud],['m74-012','Nuages bas',90,85]);
    }
});

test('les trouées diurnes exigent du soleil prévu pendant la plage horaire',()=>{
    const time=[6,7,8,9,10,11,12].map(hour=>'2026-11-27T'+String(hour).padStart(2,'0')+':00');
    const hourly={time,weather_code:[3,3,2,2,2,3,3],cloud_cover:[92,84,81,68,51,84,100],
        cloud_cover_low:[92,84,81,68,51,84,100],is_day:[0,0,1,1,1,1,1],sunshine_duration:[0,0,0,1600,3600,3600,3600]};
    const evaluate=h=>F.summarize({hourly:h,daily:{time:['2026-11-27'],weather_code:[3]}})['2026-11-27/morning'];
    assert.deepEqual([evaluate(hourly).icon,evaluate(hourly).label],['m74-098','Nuages bas et éclaircies']);
    const grey=evaluate({...hourly,sunshine_duration:[3600,0,0,0,0,0,0]});
    assert.equal(grey.icon,'m74-012');assert.doesNotMatch(grey.label,/fragment|éclaircie/iu);
    const closed=evaluate({...hourly,cloud_cover:Array(7).fill(99),cloud_cover_low:Array(7).fill(95)});
    assert.equal(closed.label,'Nuages bas');
});

test('une seule mesure de nuages bas ne décrit pas tout un créneau',()=>{
    const time=Array.from({length:6},(_,i)=>'2026-11-27T'+String(i+6).padStart(2,'0')+':00');
    const hourly={time,weather_code:time.map(()=>3),is_day:time.map(()=>1),
        cloud_cover:time.map(()=>96),cloud_cover_low:[null,null,98,null,null,null]};
    const item=F.summarize({hourly,daily:{time:['2026-11-27'],weather_code:[3]}})['2026-11-27/morning'];
    assert.equal(item.lowCloud,null);assert.equal(item.label,'Ciel couvert');
});

test('la carte et la fiche utilisent la même couche basse en journée, même à J14',()=>{
    const C=require(path.join(base,'core.js'));
    const dates=Array.from({length:14},(_,i)=>'2026-12-'+String(i+1).padStart(2,'0'));
    const time=dates.flatMap(date=>Array.from({length:24},(_,hour)=>date+'T'+String(hour).padStart(2,'0')+':00'));
    const is_day=time.map(t=>Number(t.slice(11,13))>=8&&Number(t.slice(11,13))<17?1:0);
    const hourly={time,is_day,weather_code:time.map(()=>3),cloud_cover:is_day.map(v=>v?93:10),
        cloud_cover_low:is_day.map(v=>v?81:0),sunshine_duration:time.map(()=>0)};
    const daily={time:dates,weather_code:dates.map(()=>3)};
    const summary=F.summarize({hourly,daily})['2026-12-14/day'];
    const unix=s=>Date.parse(s+'Z')/1000;
    const local=C.dailyClouds({hourly:{...hourly,time:time.map(unix)},daily:{...daily,time:dates.map(t=>unix(t+'T00:00'))}},13);
    assert.deepEqual([summary.cloud,summary.lowCloud],[local.total,local.low]);
    assert.equal(summary.label,'Nuages bas');
});
