const hour=3600000;
const layout={nx:12,ny:11,west:5.77,east:7.09,south:45.65,north:46.45};
const vars={temp:'temperature_2m',humidity:'relative_humidity_2m',rain:'precipitation',wind:'wind_speed_10m',gust:'wind_gusts_10m',pressure:'pressure_msl'};
// Extra model samples along valley floors between the regular grid nodes.
const valleyLocations=[
 [46.133,6.267],[46.191,6.230],[46.142,6.303],[46.116,6.342],[46.078,6.404],
 [46.078,6.466],[46.062,6.504],[46.057,6.536],[46.063,6.580],[46.049,6.584],
 [46.023,6.604],[46.003,6.616],[45.982,6.621],[45.960,6.633],[45.936,6.632],
 [45.918,6.649],[45.910,6.699],[45.918,6.748],[45.895,6.802],[45.923,6.868],
 [45.941,6.886],[45.982,6.926],[46.003,6.948],[46.035,6.932],[45.873,6.720],
 [46.060,6.614],[46.079,6.680],[46.082,6.722],[46.086,6.351],[46.052,6.315],
 [45.904,6.127],[45.942,6.114],[45.868,6.148],[45.840,6.176],[45.783,6.224],
 [45.747,6.294],[45.760,6.407],[45.863,5.945],[45.901,6.328],[45.888,6.411],
 [46.372,6.478],[46.398,6.590],[46.305,6.320],[46.331,6.424],[46.196,6.570],
 [46.184,6.688],[46.276,6.720],[46.289,6.787],[46.269,6.839],[46.209,6.404],
 [46.057,5.828],[46.013,5.845],[46.071,5.954],[46.112,6.085]
];
const format=t=>new Date(t).toISOString().slice(0,16);
export const modelCycle=now=>Math.floor(now/(3*hour))*3*hour;
export async function loadModel(cycle,json,previous) {
    const start=cycle-48*hour,end=cycle+5*hour,count=layout.nx*layout.ny;
    const times=Array.from({length:(end-start)/hour+1},(_,j)=>format(start+j*hour));
    const coords=Array.from({length:count},(_,i)=>[
        layout.south+Math.floor(i/layout.nx)*(layout.north-layout.south)/(layout.ny-1),
        layout.west+(i%layout.nx)*(layout.east-layout.west)/(layout.nx-1)
    ]);
    async function series(endpoint,variables,locations=coords,model=''){
        const batches=[];
        for(let i=0;i<locations.length;i+=44){
            const batch=locations.slice(i,i+44);
            const params=new URLSearchParams({latitude:batch.map(a=>a[0].toFixed(4)).join(','),longitude:batch.map(a=>a[1].toFixed(4)).join(','),
                start_hour:format(start),end_hour:format(end),timezone:'GMT',hourly:variables.join(','),wind_speed_unit:'kmh'});
            if(model){
                params.set('models',model);params.set('cell_selection','nearest');
                params.set('elevation',batch.map(()=>'nan').join(','));
            }
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
    let snowSource='',valleys=[];
    for(const [model,label] of [['meteoswiss_icon_ch1','MétéoSuisse ICON-CH1'],['icon_d2','DWD ICON-D2']]){
        try{
            const snow=await series('forecast',['snow_depth'],[...coords,...valleyLocations],model);
            if(!snow.every(p=>p.hourly_units.snow_depth==='m'&&Number.isFinite(p.elevation)&&p.hourly.snow_depth.some(Number.isFinite)))continue;
            const depths=p=>p.hourly.snow_depth.map(m=>Number.isFinite(m)&&m>=0?Math.round(m*100):null);
            sites.forEach((s,i)=>{s.sz=snow[i].elevation;s.snow=depths(snow[i]);});
            valleys=snow.slice(count).map(p=>({lat:p.latitude,lon:p.longitude,z:p.elevation,cm:depths(p)}));
            snowSource=label;
            break;
        }catch(e){console.warn(label,String(e));}
    }
    if(!snowSource&&reuse){snowSource=previous.snowSource||'';valleys=previous.valleys||[];}
    return {schema:3,cycle,start,end,sites,snowSource,valleys};

}
export function modelFrame(model,time) {
    const index=(time-model.start)/hour;
    if(!Number.isInteger(index)||index<0||time>model.end||model.sites.length!==layout.nx*layout.ny)throw Error('Heure hors grille');
    const values={};
    for(const [i,key] of Object.keys(vars).entries())values[key]=model.sites.map(s=>s.v[i][index]);
    values.snow=model.sites.map(s=>s.snow?.[index]??null);
    return {mode:'field',time,...layout,snowElevation:model.sites.map(s=>s.sz??null),elevation:model.sites.map(s=>s.z),values,source:'Météo-France via Open-Meteo',snowSource:model.snowSource||'',snowValleys:(model.valleys||[]).map(p=>[p.lat,p.lon,p.z,p.cm[index]])};
}
