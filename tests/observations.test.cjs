const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const web=path.resolve(__dirname,'../app/src/main/assets/web');
const server=path.resolve(__dirname,'../supabase/functions/meteo74-observations');
const F=require(path.join(web,'observations-field.js'));
const R=require(path.join(web,'swiss-radar.js'));
const area=require(path.join(server,'territory.json'));
const now=Date.UTC(2026,10,25,22,0), place={lon:6.129,lat:45.899};
const bytes=fs.readFileSync(path.join(web,'assets/observations-terrain.bin'));
const terrain=F.terrain(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length));

test('Stations and colored grid use the same department, including its relief',async()=>{
 const {contains}=await import(path.join(server,'normalize.mjs'));
 assert.deepEqual(area.rings,JSON.parse(fs.readFileSync(path.join(web,'assets/haute-savoie.geojson'))).geometry.coordinates);
 for(const [lon,lat,expect] of [[6.129,45.899,true],[6.267,46.134,true],[6.142,46.204,false],[5.921,45.66,false]]){
  assert.equal(contains(lon,lat,area),expect);
  assert.equal(Boolean(terrain[F.indexAt(lon,lat)]&32768),expect);
 }
 assert.ok((terrain[F.indexAt(6.129,45.899)]&32767)<540);
 assert.ok((terrain[F.indexAt(6.8652,45.8326)]&32767)>4200);
});
test('Recent wind and METAR reports retain valid zero, convert only knots and exclude stale and foreign sites',async()=>{
 const {ffvl,aviation}=await import(path.join(server,'normalize.mjs'));
 const registry=[{departement:'74',idBalise:4,nom:'Balise',longitude:place.lon,latitude:place.lat,altitude:455,en_maintenance:0,contact_email_adr:'private'}];
 const obs={idbalise:4,date:new Date(now).toISOString(),temperature:0,vitesseVentMoy:13,vitesseVentMax:null,directVentMoy:0};
 const list=ffvl(registry,[obs,{...obs,date:new Date(now-91*60000).toISOString(),temperature:7}],area,now);
 assert.equal(list.length,1);assert.deepEqual(list[0].values,{temp:0,wind:13,dir:0});assert.equal(list[0].time,now);assert.ok(!JSON.stringify(list).includes('private'));
 assert.equal(ffvl([{...registry[0],longitude:6.6739,latitude:45.785}],[obs],area,now).length,1);
 assert.equal(ffvl([{...registry[0],en_maintenance:1}],[obs],area,now).length,0);
 const metar={...place,icaoId:'LFLP',obsTime:now/1000,temp:4,wspd:5,wgst:10,wdir:'VRB',altim:1008};
 const result=aviation([metar,{...metar,icaoId:'LSGG',lon:6.11,lat:46.24}],area,now);
 assert.equal(result.length,1);assert.deepEqual(result[0].values,{temp:4,wind:9.3,gust:18.5,qnh:1008});
});
test('Outdoor sensors keep UTC, sea-level and station pressure distinct, and discard missing readings',async()=>{
 const {sensors}=await import(path.join(server,'normalize.mjs'));
 const sample={location:{latitude:place.lat,longitude:place.lon,id:22,indoor:0},timestamp:'2026-11-25 22:00:00',sensordatavalues:[{value_type:'pressure',value:'96000'},{value_type:'pressure_at_sealevel',value:'101200'},{value_type:'temperature',value:null},{value_type:'humidity',value:'75'}]};
 const items=sensors([sample,{...sample,location:{...sample.location,indoor:1,id:23}},{...sample,timestamp:'2026-11-25 19:59:59'}],area,now);
 assert.equal(items.length,1);assert.equal(items[0].time,now);assert.equal(items[0].alt,null);assert.deepEqual(items[0].values,{stationPressure:960,pressure:1012,humidity:75});
});
test('Hourly rain and snow preserve a measured zero and a missing value stays absent',async()=>{
 const {meteoFrance,mfTime}=await import(path.join(server,'normalize.mjs'));
 const s={NUM_POSTE:74014002,NOM_USUEL:'LES CARROZ',LON:place.lon,LAT:place.lat,AAAAMMJJHH:'2026112505',FF:5,FXI:20,T:0,RR1:0,NEIGETOT:0,PMER:null,PSTAT:910,U:65,QU:2};
 const item=meteoFrance([s],area)[0];assert.equal(item.time,Date.UTC(2026,10,25,5));assert.equal(item.name,'Les Carroz');
 assert.deepEqual(item.values,{temp:0,rain:0,wind:18,gust:72,stationPressure:910,snow:0});
 assert.ok(Number.isNaN(mfTime('2026112')));
});
test('Interpolation respects the mask, vertical separation and measured calm',()=>{
 const s={...place,alt:450,values:{temp:0,wind:0}};
 const field=F.interpolate('temp',[s],terrain),here=F.indexAt(place.lon,place.lat);
 assert.equal(field.values[here],0);assert.ok(field.confidence[here]>170);
 assert.ok(Number.isNaN(field.values[F.indexAt(6.142,46.204)]));
 assert.ok(Number.isNaN(field.values[F.indexAt(6.125,45.797)]));
 assert.ok(Number.isNaN(F.interpolate('rain',[s],terrain).values[here]));
 assert.equal(F.interpolate('wind',[s],terrain).values[here],0);
 assert.notDeepEqual(F.rgb('temp',-5),F.rgb('temp',10));
});
test('The Swiss one-hour accumulation uses its own STAC product and ODIM no-detection value',()=>{
 const n='cpc2632922409_00060.001.h5';
 assert.equal(R.timestamp(n,'CPC'),Date.UTC(2026,10,25,22,40)/1000);
 assert.equal(R.timestamp(n),null);assert.equal(R.timestamp(n.replace('00060','00240'),'CPC'),null);
 const other='rzc263292240vl.001.h5',base='https://data.geo.admin.ch/ch.meteoschweiz.ogd-radar-precip/day/';
 const frames=R.framesFromItems([{assets:{[n]:{href:base+n},[other]:{href:base+other}}}],Date.UTC(2026,10,25,22,42)/1000,'CPC');
 assert.equal(frames.length,1);assert.equal(frames[0].url,base+n);
 const odim={'where':{attrs:{xsize:2,ysize:2,xscale:1,yscale:1,projdef:'identity',UL_lon:0,UL_lat:2,LR_lon:2,LR_lat:0}},'dataset1/what':{attrs:{prodname:'CHCPC_00060'}},'dataset1/data1/what':{attrs:{quantity:'ACRR',gain:1,offset:0,nodata:NaN,undetect:Infinity}},'dataset1/data1/data':{shape:[2,2],value:[NaN,Infinity,0,.25]}};
 class File{get(k){return odim[k];}}
 const projection=()=>({forward:x=>x});
 const frame=R.decode(null,{File},projection,'CPC');assert.deepEqual([...frame.values],[NaN,0,0,.25]);
 assert.throws(()=>R.decode(null,{File},projection));
});
