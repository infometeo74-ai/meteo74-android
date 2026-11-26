// Only observations and public station metadata leave this service.
function number(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}
const limits = {minTemp:[-55,55], maxTemp:[-55,55], rainDay:[0,1000], windDay:[0,350], gustDay:[0,400], reportTemp:[-55,55], temp:[-55,55], rain:[0,400], wind:[0,350], gust:[0,400], dir:[0,360], humidity:[0,100], pressure:[850,1100], stationPressure:[450,1100], qnh:[850,1100], snow:[0,1400]};
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
function stationName(raw){
    return String(raw).replaceAll('_',' ').replace(/- +/g,'-').toLocaleLowerCase('fr').replace(/(^|[ -])\p{L}/gu,x=>x.toLocaleUpperCase('fr')).replace(/\b(Sapc|Sa)$/,s=>s.toUpperCase());
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
        const name=stationName(o.NOM_USUEL);
        return station('mf-'+o.NUM_POSTE,name,o.LON,o.LAT,o.ALTI,mfTime(o.AAAAMMJJHH),'Météo-France',v,area,true);
    }));
}

export function creaSites(streams,area) {
    const sites=[];
    for(const stream of streams) {
        const location=stream.Thing?.Locations?.[0],coord=location?.location?.coordinates;
        if(!/^[^:]+:temperature_200cm$/.test(stream.name)||stream.unitOfMeasurement?.symbol!=='degC'||!coord)continue;
        const [lon,lat,alt]=coord.map(number),id=stream['@iot.id'],stationId=stream.Thing['@iot.id'];
        if(!contains(lon,lat,area)||!Number.isSafeInteger(id)||!Number.isSafeInteger(stationId))continue;
        sites.push({id,stationId,name:location.name,lon,lat,alt});
    }
    return sites;
}
export function creaReadings(sites,streams,area,start,end) {
    const byStream=new Map(sites.map(s=>[s.id,s]));
    return latest(streams.flatMap(stream=>{
        const site=byStream.get(stream['@iot.id']);
        if(!site)return [];
        return (stream.Observations||[]).map(obs=>{
            const time=Date.parse(obs.phenomenonTime),values={};
            if(time<start||time>end)return null;
            measure(values,'temp',obs.result);
            return station('crea-'+site.stationId,site.name,site.lon,site.lat,site.alt,time,'CREA Mont-Blanc · Phénoclim',values,area);
        });
    }));
}
export function validDay(day) {
    if(typeof day!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(day))return false;
    const time=Date.parse(day+'T00:00:00Z');
    return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===day;
}
export function dailyStations(rows,area,day) {
    const fields={TN:['minTemp',1],TX:['maxTemp',1],RR:['rainDay',1],FFM:['windDay',3.6],FXI:['gustDay',3.6]};
    return latest(rows.map(row=>{
        if(!String(row.NUM_POSTE).startsWith('74')||row.AAAAMMJJ!==day)return null;
        const values={};
        for(const [col,[key,factor]] of Object.entries(fields)){
            if(![2,3].includes(number(row['Q'+col])))measure(values,key,row[col],factor);
        }
        const s=station('mf-'+row.NUM_POSTE,stationName(row.NOM_USUEL),row.LON,row.LAT,row.ALTI,Date.parse(day+'T00:00:00Z'),'Météo-France',values,area,true);
        return s&&{...s,day};
    }));
}
export function mountainReports(rows,area,start,end) {
    return latest(rows.map(row=>{
        const id=/^0-250-0-(74\d{6})$/.exec(row.geo_id_wigos)?.[1],time=Date.parse(row.validity_time);
        if(!id||time<start||time>end)return null;
        const values={};
        measure(values,'snow',row.ht_neige,100);
        const kelvin=number(row.t);
        if(kelvin!==null)measure(values,'reportTemp',kelvin-273.15);
        measure(values,'wind',row.ff,3.6);measure(values,'dir',row.dd);measure(values,'humidity',row.u);
        return station('mf-'+id,stationName(row.name),row.lon,row.lat,row.Altitude,time,'Météo-France · réseau nivo-météorologique',values,area,true);
    }));
}
export function combineDay(summaries,reports) {
    const result=new Map(summaries.map(s=>[s.id,s]));
    for(const s of reports){
        const same=result.get(s.id);
        result.set(s.id,same?{...same,reportTime:s.time,source:s.source,values:{...same.values,...s.values}}:{...s,reportTime:s.time});
    }
    return [...result.values()];
}

export function frenchLiveSites(registry,area){
    return registry.stations.filter(s=>/^74\d{6}$/.test(s.Id_station)&&
        (contains(s.Longitude,s.Latitude,area)||nearDepartmentBorder(s.Longitude,s.Latitude,area)));
}
export function frenchLive(site,report,area,now){
    const id=String(site.Id_station),time=Date.parse(report.timestamps?.validityTime);
    if(report.location?.inseeId!==id||!recent(time,now))return null;
    const v={};
    if(report.temperature?.unit==='°C')measure(v,'temp',report.temperature.air);
    if(report.humidity?.unit==='%')measure(v,'humidity',report.humidity.relative);
    if(report.wind?.unit==='km/h'){
        measure(v,'wind',report.wind.averageSpeed);measure(v,'gust',report.wind.gustInstant10Min);measure(v,'dir',report.wind.directionDegrees);
    }
    if(report.pressure?.unit==='hPa'){
        measure(v,'pressure',report.pressure.seaLevel);measure(v,'stationPressure',report.pressure.station);
    }
    if(report.snow?.unit==='m')measure(v,'snow',report.snow.snowDepth,100);
    // The six-minute rain amount cannot be used as an hourly total.
    return station('mf-'+id,stationName(site.Nom_usuel),site.Longitude,site.Latitude,site.Altitude,time,'Météo-France · LiveStation',v,area,true);
}
export function uniqueAirfield(stations){
    const mf=stations.find(s=>s.id==='mf-74182001'),metar=stations.find(s=>s.id==='metar-LFLP');
    if(!mf||!metar)return stations;
    const main=mf.time>=metar.time?mf:metar;
    return [...stations.filter(s=>s!==mf&&s!==metar),{...main,id:mf.id,name:'Annecy–Meythet',
        values:mf.time===metar.time?{...metar.values,...mf.values}:main.values}];
}

export function hourlyGauge(id,latestReport,series) {
    const amount=number(latestReport.rain?.amount6Min),anchor=Date.parse(latestReport.timestamps?.referenceTime);
    if(amount===null||amount<0||latestReport.rain.unit!=='mm'||!Number.isFinite(anchor)||String(series.station)!==String(id)||!series.availableKeys?.includes('rr_per'))return null;
    const bins=new Array(10).fill(null);
    for(const row of series.data||[]){
        const t=Date.parse(row.reference_time),slot=Math.round((anchor-t)/360000);
        // Publication times may drift a few seconds. Require all 10 separate
        // intervals and anchor the latest one to the timestamp of the live report.
        if(!Number.isInteger(slot)||slot<0||slot>9||Math.abs(anchor-t-slot*360000)>60000)continue;
        const v=number(row.rr_per);
        if(v===null||v<0||v>100||bins[slot]!==null&&bins[slot]!==v)return null;
        bins[slot]=v;
    }
    if(bins.some(v=>v===null)||Math.abs(bins[0]-amount)>.05)return null;
    const total=bins.reduce((a,b)=>a+b,0);
    return total<=400?Math.round(total*10)/10:null;
}

const pointName=s=>String(s).normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function resortDepths(rows,points,area){
    const unique=new Map();
    for(const row of rows){
        if(!validDay(row.day))continue;
        for(const reading of row.snow||[]){
            const name=pointName(reading.name),alt=number(reading.altitude),cm=number(reading.cm);
            const place=points[row.station_id]?.find(([label,expected])=>pointName(label)===name&&alt!==null&&Math.abs(expected-alt)<=25);
            if(!place||cm===null||cm<0||cm>1000)continue;
            // Some resorts share one instrument and repeat it in both bulletins.
            const [, ,lat,lon,owner=row.station_id]=place,id='ski-'+owner+'-'+name.replaceAll(' ','-');
            if(!contains(lon,lat,area)||unique.has(id)&&unique.get(id).bulletinDay>=row.day)continue;
            unique.set(id,{id,name:reading.name,alt,lat,lon,time:null,bulletinDay:row.day,source:'Bulletin du domaine skiable',values:{snow:cm}});
        }
    }
    return [...unique.values()];
}
