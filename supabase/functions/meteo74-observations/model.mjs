const hour=3600000;
const layout={nx:12,ny:11,west:5.77,east:7.09,south:45.65,north:46.45};
const vars={temp:'temperature_2m',humidity:'relative_humidity_2m',rain:'precipitation',wind:'wind_speed_10m',gust:'wind_gusts_10m',pressure:'pressure_msl'};
const format=t=>new Date(t).toISOString().slice(0,16);
export const modelCycle=now=>Math.floor(now/(3*hour))*3*hour;
export async function loadModel(cycle,json,previous) {
    const start=cycle-48*hour,end=cycle+5*hour,count=layout.nx*layout.ny;
    const times=Array.from({length:(end-start)/hour+1},(_,j)=>format(start+j*hour));
    const coords=Array.from({length:count},(_,i)=>[
        layout.south+Math.floor(i/layout.nx)*(layout.north-layout.south)/(layout.ny-1),
        layout.west+(i%layout.nx)*(layout.east-layout.west)/(layout.nx-1)
    ]);
    async function series(endpoint,variables){
        const batches=[];
        for(let i=0;i<count;i+=44){
            const batch=coords.slice(i,i+44);
            const params=new URLSearchParams({latitude:batch.map(a=>a[0].toFixed(4)).join(','),longitude:batch.map(a=>a[1].toFixed(4)).join(','),
                start_hour:format(start),end_hour:format(end),timezone:'GMT',hourly:variables.join(','),wind_speed_unit:'kmh'});
            batches.push(json('https://api.open-meteo.com/v1/'+endpoint+'?'+params).then(body=>{
                if(!Array.isArray(body)||body.length!==batch.length)throw Error('Grille incomplète');
                return body.map((p,k)=>{
                    if(Math.abs(p.latitude-batch[k][0])>.08||Math.abs(p.longitude-batch[k][1])>.11||p.utc_offset_seconds!==0)throw Error('Coordonnées incohérentes');
                    if(p.hourly?.time?.length!==times.length||p.hourly.time.some((t,j)=>t!==times[j]))throw Error('Heures incomplètes');
                    for(const v of variables)if(p.hourly[v]?.length!==times.length)throw Error('Variable absente');
                    return p;
                });
            }));
        }
        return (await Promise.all(batches)).flat();
    }
    const reuse=previous?.start===start&&previous.end===end&&previous.sites?.length===count;
    const sites=reuse?previous.sites.map(s=>({...s})):(await series('meteofrance',Object.values(vars))).map(p=>({z:p.elevation,v:Object.values(vars).map(v=>p.hourly[v])}));
    const snow=await series('forecast',['snow_depth']).catch(e=>{console.warn('Grille neige Open-Meteo',String(e));return null;});
    for(const [i,s] of sites.entries()){
        const p=snow?.[i];
        if(p?.hourly_units.snow_depth==='m'){
            s.sz=p.elevation;s.snow=p.hourly.snow_depth.map(m=>Number.isFinite(m)&&m>=0?Math.round(m*100):null);
        }
    }
    return {schema:2,cycle,start,end,sites};
}
export function modelFrame(model,time) {
    const index=(time-model.start)/hour;
    if(!Number.isInteger(index)||index<0||time>model.end||model.sites.length!==layout.nx*layout.ny)throw Error('Heure hors grille');
    const values={};
    for(const [i,key] of Object.keys(vars).entries())values[key]=model.sites.map(s=>s.v[i][index]);
    values.snow=model.sites.map(s=>s.snow?.[index]??null);
    return {mode:'field',time,...layout,snowElevation:model.sites.map(s=>s.sz??null),elevation:model.sites.map(s=>s.z),values,source:'Météo-France via Open-Meteo',snowSource:'Open-Meteo, modèle local'};
}
