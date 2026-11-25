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
