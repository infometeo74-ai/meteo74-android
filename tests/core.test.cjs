const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app/src/main/assets/web/core.js');
test('Missing measurements never become zero or sunshine',()=>{
 assert.equal(C.fmt(null),'—');assert.equal(C.fmt(NaN),'—');assert.equal(C.fmt(0),'0');assert.equal(C.fmt(-.1),'0');
 assert.equal(C.condition(null).icon,'unknown');assert.equal(C.condition(0,false).icon,'moon');
 assert.equal(C.condition(97).icon,'storm');assert.equal(C.condition(67).label,'Pluie verglaçante');assert.equal(C.condition(86).icon,'snow');
});
test('All weather codes resolve to bundled high-density artwork; fog, frost and night stay distinct',()=>{
 const fs=require('node:fs'),path=require('node:path');
 const root=path.join(__dirname,'../app/src/main/assets/web/assets/weather/hd');
 const codes=[0,1,2,3,45,48,51,53,55,56,57,61,63,65,66,67,71,73,75,77,80,81,82,85,86,95,96,97,99];
 const files=new Set();
 for(const code of codes)for(const day of [true,false]){
  const file=C.weatherSymbol(code,day,35)+'.webp';
  files.add(file);
 }
 const catalogue=JSON.parse(fs.readFileSync(path.join(root,'../collection.json')));
 assert.equal(catalogue.length,113);
 assert.equal(new Set(catalogue.map(item=>item.id)).size,113);
 for(const item of catalogue){
  assert.ok(item.label);files.add(item.file);
  const bytes=fs.readFileSync(path.join(root,item.file));
  assert.equal(bytes.toString('ascii',8,16),'WEBPVP8X');
  assert.equal(bytes.readUIntLE(24,3)+1,384);
  assert.equal(bytes.readUIntLE(27,3)+1,384);
  assert.equal(bytes[20]&0x10,0x10); // The extended WebP carries an alpha channel.
 }
 assert.deepEqual([...files].sort(),fs.readdirSync(root).sort());
 for(const code of [0,1,2,80,81,82,85,86,95])assert.notEqual(C.weatherSymbol(code,true,35),C.weatherSymbol(code,false,35));
 assert.notEqual(C.weatherSymbol(45),C.weatherSymbol(48));
 assert.equal(C.weatherSymbol(null),null);assert.equal(C.weatherSymbol(999,false),null);
});
test('Forecast URL preserves place and requests Unix time with explicit units',()=>{
 const u=new URL(C.forecastURL({name:'Reignier-Ésery',latitude:46.13333,longitude:6.26667}));
 assert.equal(u.searchParams.get('latitude'),'46.13333');assert.equal(u.searchParams.get('timeformat'),'unixtime');
 assert.equal(u.searchParams.get('forecast_days'),'10');assert.equal(u.searchParams.get('wind_speed_unit'),'kmh');
 assert.throws(()=>C.forecastURL({name:'Bad',latitude:999,longitude:0}));
});
test('Hourly series uses epoch boundaries, keeps nulls and excludes expired dates',()=>{
 const now=Date.parse('2026-10-25T02:35:00Z')/1000;
 const time=Array.from({length:50},(_,i)=>now-35*60+(i-3)*3600);
 const h={hourly:{time,temperature_2m:time.map((_,i)=>i===3?null:i)}};
 const hours=C.hours(h,now);assert.equal(hours.length,24);assert.equal(hours[0].time,now-35*60);assert.equal(hours[0].temperature,null);
 assert.equal(C.hours(h,now+7*86400).length,0);
});
test('France times handle daylight saving transition without host timezone dependence',()=>{
 assert.equal(C.clock(Date.parse('2026-10-25T00:30:00Z')/1000,'Europe/Paris'),'02:30');
 assert.equal(C.clock(Date.parse('2026-10-25T01:30:00Z')/1000,'Europe/Paris'),'02:30');
 assert.equal(C.clock(null,'Europe/Paris'),'—');
});
test('Chart range works for constant, negative and missing series',()=>{
 assert.equal(C.scale([null,undefined,NaN]),null);
 const s=C.scale([-3,-3,null]);assert.ok(s.high>s.low);assert.equal(s.ratio(-3),.5);
 const t=C.scale([-10,0,20]);assert.ok(t.ratio(-10)>=0);assert.ok(t.ratio(20)<=1);
});

test('Overcast showers respect cloud cover, dry intervals, unknown cover and night',()=>{
 for(const daylight of [true,false]){
  assert.equal(C.weatherSymbol(80,daylight,100,.2),'m74-021');
  assert.equal(C.weatherSymbol(86,daylight,98,.4),'m74-043');
  assert.equal(C.weatherSymbol(80,daylight,100,0),'m74-006');
  assert.equal(C.condition(80,daylight,100,.2).label,'Couvert, averses');
  assert.equal(C.condition(61,daylight,100,0).label,'Couvert, pluie intermittente');
  assert.equal(C.weatherSymbol(80,daylight,undefined,.3),'m74-021');
  assert.equal(C.weatherSymbol(null,daylight,100),null);
 }
 assert.equal(C.weatherSymbol(80,true,35,.2),'m74-025');
 assert.equal(C.condition(2,true,99).label,'Ciel couvert');
});

test('Combined conditions use the corrected sheets only with matching measurements',()=>{
 assert.equal(C.weatherSymbol(63,true,90,1,{rain:1,snowfall:0.2,cloud_cover_low:95}),'m74-112');
 assert.equal(C.weatherSymbol(73,true,90,1,{wind_speed_10m:48}),'m74-047');
 assert.equal(C.weatherSymbol(73,true,90,1,{temperature_2m:-2}),'m74-038');
 assert.equal(C.weatherSymbol(95,true,100,1),'m74-063');
 assert.equal(C.weatherSymbol(3,false,100,0,{cloud_cover_low:94}),'m74-012');
});
