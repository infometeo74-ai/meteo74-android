const test=require('node:test'),assert=require('node:assert/strict');
const area=require('../supabase/functions/meteo74-observations/territory.json');
const pkg='../supabase/functions/meteo74-observations/';
const s={id:15,name:'Station de test',lon:6.632,lat:45.944};
const ts=1795674540,now=ts*1000, packet=(type,row,time=ts,lsid=1)=>({data_structure_type:type,lsid,data:[{ts:time,...row}]});
const sample={station_id:15,sensors:[packet(10,{temp:41,hum:88,wind_speed_avg_last_10_min:2,wind_speed_hi_last_10_min:7,wind_dir_scalar_avg_last_10_min:210,rainfall_last_60_min_mm:0}),packet(12,{bar_absolute:28,bar_sea_level:29.85}),packet(21,{temp:72,hum:60})]};
test('Davis outside observations use metric units, true hourly rain and the sensor timestamp',async()=>{
    const {weatherlink}=await import(pkg+'normalize.mjs');
    const row=weatherlink(s,sample,area,now);
    assert.equal(row.time,now);assert.equal(row.id,'wl-15');assert.equal(row.source,'WeatherLink');
    assert.deepEqual(row.values,{temp:5,humidity:88,wind:3.2,gust:11.3,dir:210,rain:0,pressure:1010.8,stationPressure:948.2});
    assert.equal(weatherlink(s,{...sample,generated_at:ts+7200},area,now+7200000),null);
    assert.equal(weatherlink(s,{...sample,station_id:777},area,now),null);
});
test('Legacy loggers never treat their daily total as hourly rain and never publish indoor or delayed fields',async()=>{
    const {weatherlink}=await import(pkg+'normalize.mjs');
    const r=weatherlink(s,{station_id:15,sensors:[packet(2,{temp_out:32,temp_in:74,wind_speed_10_min_avg:0,hum_out:null,rain_day_mm:9,rain_rate_mm:4}),packet(12,{bar_sea_level:30},ts-800),packet(21,{temp:78,hum:99})]},area,now);
    assert.deepEqual(r.values,{temp:0,wind:0});
    const env=weatherlink(s,{station_id:15,sensors:[packet(6,{temp_out:41,wind_speed_10_min:5,rain_60_min_mm:1.2})]},area,now);
    assert.deepEqual(env.values,{temp:5,wind:8,rain:1.2});
});
test('Only authorized public department stations are fetched and station owner metadata remains server-side',async()=>{
    const {sharedWeatherLink}=await import(pkg+'weatherlink.mjs');
    const site={station_id:15,private:false,active:true,latitude:s.lat,longitude:s.lon,station_name:s.name,user_email:'private@example.invalid'};
    const registry={stations:[site,{...site,station_id:22,private:true},{...site,station_id:23,latitude:46.204,longitude:6.142},{...site,station_id:24,active:false},{...site,station_id:25},{...site,station_id:26}]};
    const paths=[];
    const fetcher=async(url,opt)=>{
        assert.equal(url.origin,'https://api.weatherlink.com');assert.equal(opt.headers['X-Api-Secret'],'fixture-secret');
        assert.equal(opt.redirect,'error');assert.equal(url.searchParams.get('api-key'),'fixture-key');assert.equal(url.searchParams.size,1);
        paths.push(url.pathname);
        if(url.pathname==='/v2/stations')return Response.json(registry);
        if(url.pathname==='/v2/current/25')return new Response(null,{status:403});
        return Response.json(sample);
    };
    const config={key:'fixture-key',secret:'fixture-secret',ids:'15,22,23,24,25',area,fetcher,now:()=>now};
    const data=await sharedWeatherLink(config);
    assert.deepEqual(paths,['/v2/stations','/v2/current/15','/v2/current/25']);
    assert.equal(data.partial,true);assert.equal(data.stations.length,1);assert.ok(!JSON.stringify(data).includes('private@example'));
    paths.length=0;assert.deepEqual(await sharedWeatherLink({...config,key:''}),{stations:[],partial:false});assert.deepEqual(paths,[]);
});
