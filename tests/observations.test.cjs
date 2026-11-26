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

test('Phénoclim uses the outdoor two-metre stream, real time and department polygon',async()=>{
 const {creaSites,creaReadings}=await import(path.join(server,'normalize.mjs'));
 const stream={'@iot.id':178,name:'234:temperature_200cm',unitOfMeasurement:{symbol:'degC'},Thing:{'@iot.id':30,Locations:[{name:'Montroc',location:{coordinates:['6.92','46.01','1360']}}]}};
 const wrong={...stream,name:'234:temperature_30cm'};
 const abroad={...stream,Thing:{...stream.Thing,Locations:[{location:{coordinates:[6.14,46.21,400]}}]}};
 const sites=creaSites([stream,wrong,abroad],area);assert.equal(sites.length,1);
 const obs=time=>({phenomenonTime:new Date(time).toISOString(),result:0});
 const [out]=creaReadings(sites,[{'@iot.id':178,Observations:[obs(now),obs(now-900000),obs(now+900000)]}],area,now,now);
 assert.deepEqual([out.id,out.name,out.time,out.values],['crea-30','Montroc',now,{temp:0}]);
});
test('Dated totals and mountain reports preserve units, quality flags, dates and identifiers',async()=>{
 const {validDay,dailyStations,mountainReports,combineDay}=await import(path.join(server,'normalize.mjs'));
 assert.ok(validDay('2024-02-29'));for(const day of ['2026-02-29','2026-13-01','20261125',''])assert.equal(validDay(day),false);
 const day='2026-11-25',row={NUM_POSTE:74056417,AAAAMMJJ:day,NOM_USUEL:'LA FLEGERE',LAT:45.9625,LON:6.889167,ALTI:1850,TN:-3,TX:4,RR:0,FFM:2,FXI:90,QFXI:2};
 const daily=dailyStations([row,{...row,AAAAMMJJ:'2026-11-24'}],area,day);
 assert.deepEqual(daily[0].values,{minTemp:-3,maxTemp:4,rainDay:0,windDay:7.2});
 const r={geo_id_wigos:'0-250-0-74056417',validity_time:new Date(now).toISOString(),name:'LA FLEGERE',lat:row.LAT,lon:row.LON,Altitude:row.ALTI,ht_neige:1.23,t:271.15,ff:0,dd:null,u:72};
 const reports=mountainReports([r,{...r,t:274,validity_time:new Date(now-3600000).toISOString()},{...r,geo_id_wigos:'0-250-0-73000001'}],area,now-86400000,now);
 assert.deepEqual(reports[0].values,{snow:123,reportTemp:-2,wind:0,humidity:72});
 const all=combineDay(daily,reports);assert.equal(all.length,1);assert.equal(all[0].reportTime,now);
 assert.equal(all[0].values.rainDay,0);assert.equal(all[0].values.snow,123);
});

test('Live Météo-France values use validity time and six-minute rain is never treated as an hour',async()=>{
 const {frenchLive,uniqueAirfield}=await import(path.join(server,'normalize.mjs'));
 const site={Id_station:74182001,Nom_usuel:'MEYTHET',Longitude:6.09,Latitude:45.93,Altitude:455};
 const report={location:{inseeId:'74182001'},timestamps:{validityTime:new Date(now).toISOString()},temperature:{air:0,unit:'°C'},rain:{amount6Min:4,unit:'mm'},wind:{averageSpeed:2,directionDegrees:0,gustInstant10Min:7,unit:'km/h'}};
 const mf=frenchLive(site,report,area,now);assert.deepEqual(mf.values,{temp:0,wind:2,gust:7,dir:0});
 assert.equal(frenchLive(site,report,area,now+100*60000),null);
 const records=uniqueAirfield([mf,{...mf,id:'metar-LFLP',values:{temp:1,qnh:1002}}]);
 assert.equal(records.length,1);assert.equal(records[0].values.temp,0);assert.equal(records[0].values.qnh,1002);
});
test('A continuous model is locally corrected by real measurements, with zero rain and masked borders',()=>{
 const frame={nx:2,ny:2,west:5.7,east:7.2,south:45.6,north:46.5,time:now,elevation:[500,500,500,500],values:{temp:[0,0,0,0],wind:[10,10,10,10],rain:[0,0,0,0]}};
 const at=F.indexAt(place.lon,place.lat),far=F.indexAt(6.86,45.92);
 const record={...place,time:now,alt:terrain[at]&32767,values:{wind:30,rain:8}};
 const raw=F.analyze('wind',terrain,[],frame,null),blend=F.analyze('wind',terrain,[record],frame,null);
 assert.equal(blend.used,1);assert.equal(blend.values.filter(Number.isFinite).length,Array.from(terrain).filter(n=>n&32768).length);
 assert.ok(blend.values[at]>29);assert.equal(blend.values[far],10);assert.equal(raw.values[at],10);assert.ok(Number.isNaN(blend.values[0]));
 const radar={time:now,values:new Float32Array(terrain.length).fill(0)};radar.values[far]=NaN;
 const rain=F.analyze('rain',terrain,[record],frame,radar);
 assert.ok(rain.values[at]>7);assert.equal(rain.values[far],0);
 const old=F.analyze('rain',terrain,[{...record,time:now-31*60000}],frame,radar);
 assert.equal(old.used,0);assert.equal(old.values[at],0);
 const onlyRadar=F.analyze('rain',terrain,[{...record,lon:6.86,lat:45.92}],null,radar);
 assert.equal(onlyRadar.used,0);
});

test('Gauge corrections require ten actual consecutive six-minute totals anchored to the live report',async()=>{
 const {hourlyGauge}=await import(path.join(server,'normalize.mjs'));
 const report={rain:{amount6Min:.2,unit:'mm'},timestamps:{referenceTime:new Date(now).toISOString()}};
 const data=Array.from({length:10},(_,k)=>({reference_time:new Date(now-k*360000+(k%3)*1000).toISOString(),rr_per:.2}));
 const series={station:741,availableKeys:['rr_per'],data};
 assert.equal(hourlyGauge(741,report,series),2);assert.equal(hourlyGauge(742,report,series),null);
 assert.equal(hourlyGauge(741,report,{...series,data:data.slice(1)}),null);
 assert.equal(hourlyGauge(741,report,{...series,data:[...data,{...data[4],rr_per:9}]}),null);
 assert.equal(hourlyGauge(741,{...report,rain:{...report.rain,amount6Min:2}},series),null);
});

test('Ski bulletins use the named observation level, retain a dated zero, and ignore heights without a matching site',async()=>{
 const {resortDepths}=await import(path.join(server,'normalize.mjs')),points=require(path.join(server,'ski-points.json'));
 const snow=[{name:'FORUM',altitude:1600,cm:0},{name:'GRANDES PLATIERES',altitude:2500,cm:250},{name:'FORUM',altitude:2500,cm:80},{name:'Bas des pistes',cm:100}];
 const data=resortDepths([{station_id:'flaine',day:'2026-11-25',snow},{station_id:'flaine',day:'2026-11-26',snow}],points,area);
 assert.deepEqual(data.map(p=>[p.alt,p.values.snow,p.bulletinDay,p.time]),[[1600,0,'2026-11-26',null],[2500,250,'2026-11-26',null]]);
 assert.notEqual(data[0].lat,data[1].lat);
});
test('Snow depth observations correct the same terrain band without depositing summit snow in the valley',()=>{
 const k=F.indexAt(6.695,46.005),lat=F.rows[Math.floor(k/F.grid.width)],lon=F.cols[k%F.grid.width],dem=terrain.slice();
 dem[k]=32768+1600;dem[k+1]=32768+2500;
 const frame={nx:2,ny:2,west:5.7,east:7.2,south:45.6,north:46.5,time:now,snowElevation:[500,500,500,500],values:{snow:[0,0,0,0]}};
 const summit={lat,lon,alt:2500,time:null,bulletinDay:'2026-11-25',values:{snow:200}};
 const a=F.analyze('snow',dem,[summit],frame,null);
 assert.equal(a.used,1);assert.equal(a.resorts,1);assert.equal(a.values[k],0);assert.ok(a.values[k+1]>195);
 assert.equal(F.analyze('snow',dem,[{...summit,bulletinDay:'2026-11-22'}],frame,null).used,0);
});
