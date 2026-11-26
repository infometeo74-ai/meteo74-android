// Only observations and public station metadata leave this service.
function number(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
const limits = {temp:[-55,55], rain:[0,400], wind:[0,350], gust:[0,400], dir:[0,360], humidity:[0,100], pressure:[850,1100], stationPressure:[450,1100], qnh:[850,1100], snow:[0,1400]};
function measure(values,key,raw,factor=1) {
    const n=number(raw);
    if (n===null) return;
    const v=n*factor, [lo,hi]=limits[key];
    if (v>=lo && v<=hi) values[key]=Math.round(v*10)/10;
}
function inRing(x,y,ring) {
    let inside=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
        const [a,b]=ring[i],[c,d]=ring[j];
        if ((b>y)!==(d>y) && x<(c-a)*(y-b)/(d-b)+a) inside=!inside;
    }
    return inside;
}
export function contains(lon,lat,area) {
    return lon>=5.79 && lon<=7.06 && lat>=45.67 && lat<=46.42 &&
        inRing(lon,lat,area.rings[0]) && !area.rings.slice(1).some(r=>inRing(lon,lat,r));
}
// The official department outline is simplified to 100 m. An assigned boundary
// station such as Col du Joly sits less than a metre outside that line.
function nearDepartmentBorder(lon,lat,area){
    if(!Number.isFinite(lon)||!Number.isFinite(lat))return false;
    const ring=area.rings[0];
    for(let i=1;i<ring.length;i++){
        const ax=(ring[i-1][0]-lon)*77250,ay=(ring[i-1][1]-lat)*111200;
        const dx=(ring[i][0]-ring[i-1][0])*77250,dy=(ring[i][1]-ring[i-1][1])*111200;
        const length=dx*dx+dy*dy;
        const t=length?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/length)):0;
        if((ax+t*dx)**2+(ay+t*dy)**2<=100**2)return true;
    }
    return false;
}
export function recent(time,now) { return Number.isFinite(time) && time>=now-90*60000 && time<=now+60000; }
function station(id,name,lon,lat,alt,time,source,values,area,departmentAssigned=false) {
    lon=number(lon);lat=number(lat);alt=number(alt);
    if(!Object.keys(values).length||!Number.isFinite(time))return null;
    if(!contains(lon,lat,area)&&!(departmentAssigned&&nearDepartmentBorder(lon,lat,area)))return null;
    return {id,name,lon,lat,alt,time,source,values};
}
function latest(stations) {
    const byId=new Map();
    for(const s of stations)if(s&&(!byId.has(s.id)||s.time>byId.get(s.id).time))byId.set(s.id,s);
    return [...byId.values()];
}
export function ffvl(registry,observations,area,now) {
    const sites=new Map(registry.filter(s=>String(s.departement)==='74'&&!Number(s.en_maintenance)).map(s=>[String(s.idBalise),s]));
    return latest(observations.map(o=>{
        const s=sites.get(String(o.idbalise)),time=Date.parse(o.date);
        if(!s||!recent(time,now))return null;
        const v={};
        measure(v,'wind',o.vitesseVentMoy);measure(v,'gust',o.vitesseVentMax);measure(v,'dir',o.directVentMoy);
        measure(v,'temp',o.temperature);
        return station('ff-'+o.idbalise,s.nom,s.longitude,s.latitude,s.altitude,time,'FFVL',v,area,true);
    }));
}
export function sensors(observations,area,now) {
    return latest(observations.map(o=>{
        const s=o.location,t=Date.parse(String(o.timestamp).replace(' ','T')+'Z');
        if(!s||Number(s.indoor)!==0||!recent(t,now)||!contains(+s.longitude,+s.latitude,area))return null;
        const v={},fields={temperature:['temp',1],humidity:['humidity',1],pressure:['stationPressure',.01],pressure_at_sealevel:['pressure',.01]};
        for(const item of o.sensordatavalues||[]){const f=fields[item.value_type];if(f)measure(v,f[0],item.value,f[1]);}
        if(!Object.keys(v).length)return null;
        let best=null,distance=Infinity;
        for(const town of area.towns){const d=((town[1]-s.longitude)*.695)**2+(town[2]-s.latitude)**2;if(d<distance){distance=d;best=town[0];}}
        return station('sc-'+s.id,'Près de '+best,s.longitude,s.latitude,s.altitude,t,'Sensor.Community',v,area);
    }));
}
export function aviation(records,area,now) {
    return latest(records.map(o=>{
        const t=number(o.obsTime)*1000,v={};if(!recent(t,now))return null;
        measure(v,'temp',o.temp);measure(v,'wind',o.wspd,1.852);measure(v,'gust',o.wgst,1.852);
        measure(v,'dir',o.wdir);measure(v,'qnh',o.altim);
        return station('metar-'+o.icaoId,o.icaoId==='LFLP'?'Annecy–Meythet':o.icaoId,o.lon,o.lat,o.elev,t,'METAR',v,area);
    }));
}
// WeatherLink v2 reports Fahrenheit, mph and inHg, regardless of display preferences.
export function weatherlinkSites(registry,area) {
    if(!Array.isArray(registry?.stations))throw Error('Liste WeatherLink indisponible');
    return registry.stations.filter(s=>s.active===true && s.private===false &&
        Number.isSafeInteger(s.station_id) && s.station_id>0 && contains(s.longitude,s.latitude,area))
        .map(s=>({id:s.station_id,name:String(s.station_name||s.city||'Station WeatherLink'),lon:number(s.longitude),lat:number(s.latitude)}));
}
function davisValues(type,row) {
    const v={};
    if(type===12||type===19){
        measure(v,'pressure',row.bar_sea_level,33.8638867);
        measure(v,'stationPressure',row.bar_absolute,33.8638867);
        return v;
    }
    const modern=type===10||type===23;
    if(!modern&&![1,2,6].includes(type))return v;
    const f=number(modern?row.temp:row.temp_out);
    if(f!==null)measure(v,'temp',(f-32)*5/9);
    measure(v,'humidity',modern?row.hum:row.hum_out);
    const avg=modern?row.wind_speed_avg_last_10_min:type===6?row.wind_speed_10_min:row.wind_speed_10_min_avg;
    measure(v,'wind',avg,1.609344);
    measure(v,'gust',modern?row.wind_speed_hi_last_10_min:row.wind_gust_10_min,1.609344);
    measure(v,'dir',modern?row.wind_dir_scalar_avg_last_10_min:row.wind_dir);
    // Older IP loggers expose rain rate and daily total but no rolling one-hour total.
    if(modern||type===6)measure(v,'rain',modern?row.rainfall_last_60_min_mm:row.rain_60_min_mm);
    if(type===6)measure(v,'stationPressure',row.bar_absolute,33.8638867);
    return v;
}
export function weatherlink(site,payload,area,now) {
    if(payload?.station_id!==site.id||!Array.isArray(payload.sensors))return null;
    const outdoor=[],barometers=[];
    for(const sensor of payload.sensors){
        const type=Number(sensor.data_structure_type),barometer=type===12||type===19;
        for(const row of sensor.data||[]){
            const t=number(row.ts)*1000;
            if(!recent(t,now))continue;
            const values=davisValues(type,row);
            if(Object.keys(values).length)(barometer?barometers:outdoor).push({t,values,lsid:sensor.lsid});
        }
    }
    const order=(a,b)=>b.t-a.t||Object.keys(b.values).length-Object.keys(a.values).length||a.lsid-b.lsid;
    const main=outdoor.sort(order)[0],bar=barometers.sort(order)[0],sample=main||bar;
    if(!sample)return null;
    // All values in the public station card belong to the displayed timestamp.
    const pressure=main&&bar?.t===main.t?bar.values:{};
    return station('wl-'+site.id,site.name,site.lon,site.lat,null,sample.t,'WeatherLink',{...sample.values,...pressure},area);
}
export function mfTime(raw){
    const t=String(raw);
    if(!/^\d{10}$/.test(t))return NaN;
    return Date.parse(t.slice(0,4)+'-'+t.slice(4,6)+'-'+t.slice(6,8)+'T'+t.slice(8,10)+':00:00Z');
}
export function meteoFrance(records,area) {
    const fields={T:['temp',1],RR1:['rain',1],FF:['wind',3.6],FXI:['gust',3.6],DD:['dir',1],U:['humidity',1],PMER:['pressure',1],PSTAT:['stationPressure',1],NEIGETOT:['snow',1]};
    return latest(records.map(o=>{
        if(!String(o.NUM_POSTE).startsWith('74'))return null;
        const v={};
        for(const [col,[key,factor]] of Object.entries(fields)){
            if([2,3].includes(number(o['Q'+col])))continue;
            measure(v,key,o[col],factor);
        }
        const name=String(o.NOM_USUEL).replaceAll('_',' ').replace(/- +/g,'-').toLocaleLowerCase('fr').replace(/(^|[ -])\p{L}/gu,x=>x.toLocaleUpperCase('fr')).replace(/\b(Sapc|Sa)$/,s=>s.toUpperCase());
        return station('mf-'+o.NUM_POSTE,name,o.LON,o.LAT,o.ALTI,mfTime(o.AAAAMMJJHH),'Météo-France',v,area,true);
    }));
}
