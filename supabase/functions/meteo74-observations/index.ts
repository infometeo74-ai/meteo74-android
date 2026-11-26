import territory from "./territory.json" with { type: "json" };
import skiPoints from "./ski-points.json" with { type: "json" };
import { ffvl, sensors, aviation, meteoFrance, validDay, frenchLiveSites, frenchLive, uniqueAirfield, hourlyGauge, resortDepths } from "./normalize.mjs";

import { sharedCache } from "./shared-cache.ts";
import { loadModel, modelCycle, modelFrame } from "./model.mjs";
import { createNetworks } from "./networks.mjs";
import { sharedWeatherLink } from "./weatherlink.mjs";

const davisKey=Deno.env.get("WEATHERLINK_API_KEY");
const davisSecret=Deno.env.get("WEATHERLINK_API_SECRET");
const davisIds=Deno.env.get("WEATHERLINK_STATION_IDS");
const davisHistory=new Map();

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"GET, OPTIONS"};
const author={"Accept":"application/json","User-Agent":"Meteo74/0.6 (Haute-Savoie observations)"};
const resource="https://www.data.gouv.fr/api/1/datasets/r/";
const cache=new Map<string,{at:number,value:any}>();
const pending=new Map<string,Promise<any>>();
async function memo(key:string,age:number,load:()=>Promise<any>){
    const hit=cache.get(key);
    if(hit && Date.now()-hit.at<age)return hit.value;
    const active=pending.get(key);if(active)return active;
    const task=load().then(value=>{
        if(cache.size>=96&&!cache.has(key))cache.delete(cache.keys().next().value!);
        cache.set(key,{at:Date.now(),value});return value;
    }).finally(()=>pending.delete(key));
    pending.set(key,task);return task;
}
async function json(url:string){
    const res=await fetch(url,{headers:author,signal:AbortSignal.timeout(11500)});
    if(!res.ok)throw Error("Source indisponible");
    return res.json();
}
const networks=createNetworks(json,memo,territory);
const feeds=[
    ["CREA Mont-Blanc",()=>{const now=Date.now();return networks.thermometers(now-90*60000,now+60000);}],
    ["FFVL",async()=>{const [sites,obs]=await Promise.all([
        memo("ff-sites",86400000,()=>json(resource+"8d795154-9145-4ab2-99de-6768a36f31ea")),
        json(resource+"047b2ab9-627f-4e5f-9d68-5b948433c61d")]);return ffvl(sites,obs,territory,Date.now());}],
    ["Sensor.Community",async()=>sensors(await json("https://data.sensor.community/airrohr/v1/filter/box=45.66,5.76,46.46,7.06"),territory,Date.now())],
    ["METAR",async()=>aviation(await json("https://aviationweather.gov/api/data/metar?format=json&bbox=45.65,5.78,46.44,7.06&hours=2"),territory,Date.now())]
] as const;
async function publicFrenchStations(){
    const now=Date.now(),cycle=Math.floor(now/1200000)*1200000+1;
    const result=await sharedCache("stations",cycle,async()=>{
        const base="https://meteo.kstl.fr/api/weather/";
        const sites=await memo("mf-live-sites",86400000,async()=>frenchLiveSites(await json(base+"stations"),territory));
        if(!sites.length)throw Error("Stations Météo-France absentes");
        const stations:any[]=[];let failures=0,cursor=0;
        const deadline=Date.now()+26000;
        // The publisher exposes one latest observation per station. Share the regional
        // snapshot across devices and limit simultaneous requests to the source.
        async function worker(){
            while(cursor<sites.length&&Date.now()<deadline){
                const site=sites[cursor++];
                try{
                    const r=await fetch(base+"latest-observation/"+site.Id_station,{headers:author,signal:AbortSignal.timeout(4000)});
                    if(r.status===404||r.status===204){await r.body?.cancel();continue;}
                    if(!r.ok){await r.body?.cancel();failures++;continue;}
                    const report=await r.json(),station=frenchLive(site,report,territory,Date.now());
                    if(!station)continue;
                    stations.push(station);
                    if(report.rain?.unit==="mm"&&Number.isFinite(report.rain.amount6Min)){
                        try{
                            const series=await fetch("https://meteo.kstl.fr/api/station/"+site.Id_station+"/obs-120h?keys=rr_per",{headers:author,signal:AbortSignal.timeout(4000)});
                            if(series.ok){
                                const mm=hourlyGauge(site.Id_station,report,await series.json());
                                if(mm!==null)station.values.rain=mm;
                            }else await series.body?.cancel();
                        }catch{/* A single interval cannot stand in for a complete hourly total. */}
                    }
                }catch{failures++;}
            }
        }
        await Promise.all(Array.from({length:5},worker));
        if(!stations.length&&failures)throw Error("Relais indisponible");
        return {schema:2,retrievedAt:Date.now(),stations,partial:failures>0||cursor<sites.length};
    },v=>v?.schema===2&&Number.isFinite(v?.retrievedAt)&&v.retrievedAt>Date.now()-80*60000);
    return {...result,stations:result.stations.filter((s:any)=>s.time>=Date.now()-90*60000)};
}
async function live(){
    const [results,davis,french]=await Promise.all([
        Promise.allSettled(feeds.map(([name,load])=>memo(name,150000,load))),
        davisKey&&davisSecret?memo("davis-observations",900000,()=>sharedWeatherLink({
            key:davisKey,secret:davisSecret,ids:davisIds,area:territory,history:davisHistory,signal:AbortSignal.timeout(27500)
        })).catch(()=>({stations:[],partial:true})):null,
        memo("mf-live",150000,publicFrenchStations).catch(()=>({stations:[],partial:true}))
    ]);
    const stations:any[]=[], missing:string[]=[];
    for(const [i,r] of results.entries()){
        if(r.status==="fulfilled"){stations.push(...r.value);continue;}
        const name=feeds[i][0];missing.push(name);
        // Keep a network's previously received measurements only while they remain recent.
        stations.push(...(cache.get(name)?.value||[]).filter((s:any)=>s.time>=Date.now()-90*60000));
    }
    if(davis){
        stations.push(...davis.stations);
        if(davis.partial)missing.push("WeatherLink");
    }
    stations.push(...french.stations);if(french.partial)missing.push("Météo-France · LiveStation");
    if(results.every(r=>r.status==="rejected")&&!stations.length)throw Error("Aucun réseau disponible");
    return {mode:"live",retrievedAt:Date.now(),stations:uniqueAirfield(stations),missing};
}
async function latestResource(){
    const url="https://www.data.gouv.fr/api/2/datasets/6569b4473bedf2e7abad3b72/resources/?q=HOR_departement_74_periode&page_size=25";
    const list=await json(url);
    const item=list.data.filter((x:any)=>/\/H_74_latest-\d{4}-\d{4}\.csv\.gz$/i.test(x.url)).sort((a:any,b:any)=>b.url.localeCompare(a.url))[0];
    if(!item || !/^[\da-f-]{36}$/i.test(item.id))throw Error("Ressource absente");
    return item.id;
}
async function hourly(){
    const id=await memo("mf-resource",86400000,latestResource).catch(()=>cache.get("mf-resource")?.value||"ecc5739f-2e98-4600-a1c4-79e05a7991c9");
    const url="https://tabular-api.data.gouv.fr/api/resources/"+id+"/data/?";
    const last=await json(url+"AAAAMMJJHH__sort=desc&page_size=1&columns=AAAAMMJJHH");
    const stamp=String(last.data?.[0]?.AAAAMMJJHH);
    if(!/^\d{10}$/.test(stamp))throw Error("Heure inconnue");
    const fields="NUM_POSTE,NOM_USUEL,LAT,LON,ALTI,AAAAMMJJHH,T,QT,RR1,QRR1,FF,QFF,FXI,QFXI,DD,QDD,U,QU,PMER,QPMER,PSTAT,QPSTAT,NEIGETOT,QNEIGETOT";
    const body=await json(url+"AAAAMMJJHH__exact="+stamp+"&page_size=100&columns="+fields);
    const stations=meteoFrance(body.data,territory);
    if(!stations.length)throw Error("Aucun relevé publié");
    const time=stations[0].time,missing:string[]=[];
    try{stations.push(...await networks.thermometers(time,time));}catch{missing.push("CREA Mont-Blanc");}
    return {mode:"hourly",retrievedAt:Date.now(),time,stations,missing};
}
async function regionalModel(cycle:number){
    return sharedCache("model",cycle+3,previous=>loadModel(cycle,async url=>{
        const res=await fetch(url,{headers:author,signal:AbortSignal.timeout(20000)});
        if(!res.ok){await res.body?.cancel();throw Error("Open-Meteo HTTP "+res.status);}return res.json();
    },previous),m=>m?.schema===3&&m.end>=cycle&&m.sites?.length>0);
}
const parisDay=(t:number)=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Europe/Paris",year:"numeric",month:"2-digit",day:"2-digit"}).format(t);
async function storedDepths(from:string,to:string){
    const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const url=Deno.env.get("SUPABASE_URL")+"/rest/v1/meteo74_ski_depths?day=gte."+from+"&day=lte."+to+"&select=day,station_id,snow";
    const r=await fetch(url,{headers:{apikey:key,Authorization:"Bearer "+key},signal:AbortSignal.timeout(4000)});
    if(!r.ok)throw Error("Bulletins indisponibles");
    return resortDepths(await r.json(),skiPoints,territory);
}
async function snowSurface(){
    const now=Date.now(),today=parisDay(now),yesterday=parisDay(now-86400000);
    const sources=await Promise.allSettled([storedDepths(yesterday,today),networks.mountainDay(today),networks.mountainDay(yesterday),memo("mf-snow-hour",1800000,hourly)]);
    const stations=new Map(),missing:string[]=[];
    sources.forEach((r,i)=>{
        if(r.status==="rejected"){missing.push(["Bulletins ski","Réseau nivo","Réseau nivo","Météo-France horaire"][i]);return;}
        const rows=i===3?r.value.stations:r.value;
        for(const s of rows){
            if(!Number.isFinite(s.values.snow)||!Number.isFinite(s.alt)||(!s.bulletinDay&&(!Number.isFinite(s.time)||s.time<now-36*3600000||s.time>now+60000)))continue;
            if(!stations.has(s.id)||(s.time||0)>stations.get(s.id).time)stations.set(s.id,s);
        }
    });
    if(sources.every(s=>s.status==="rejected"))throw Error("Relevés neige indisponibles");
    return {mode:"snow",retrievedAt:now,stations:[...stations.values()],missing:[...new Set(missing)]};
}
Deno.serve(async req=>{
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
    const reply=(body:unknown,status:number,age=0)=>Response.json(body,{status,headers:{...cors,"Cache-Control":age?"public, max-age="+age:"no-store"}});
    if(req.method!=="GET")return reply({error:"Méthode inconnue"},405);
    const params=new URL(req.url).searchParams;
    const mode=params.get("mode")||"live";
    if(mode!=="live"&&mode!=="hourly"&&mode!=="daily"&&mode!=="field"&&mode!=="snow")return reply({error:"Mode inconnu"},400);
    try {
        if(mode==="snow")return reply(await memo("snow-surface",600000,snowSurface),200,300);
        if(mode==="field"){
            const hour=3600000,now=Date.now(),current=Math.floor(now/hour)*hour;
            const raw=params.get("time"),time=raw===null?current:Number(raw);
            if(!Number.isSafeInteger(time)||time%hour!==0||time<current-48*hour||time>current)return reply({error:"Heure hors période"},400);
            const cycle=modelCycle(now),model=await memo("model-"+cycle,180000,()=>regionalModel(cycle));
            return reply(modelFrame(model,time),200,180);
        }
        if(mode==="daily"){
            const day=params.get("date")??await memo("latest-daily",1800000,networks.latestDaily);
            const now=new Date(),min=(now.getUTCFullYear()-1)+"-01-01",max=now.toISOString().slice(0,10);
            if(!validDay(day)||day<min||day>max)return reply({error:"Date hors période"},400);
            const body=await memo("day-"+day,1800000,async()=>{
                const [regular,resorts]=await Promise.all([networks.dayObservations(day),storedDepths(day,day).catch(()=>null)]);
                if(resorts)regular.stations.push(...resorts);else regular.missing.push("Bulletins ski");
                return regular;
            });
            return reply(body,200,900);
        }
        const body=await memo("mode-"+mode,mode==="live"?120000:1800000,mode==="live"?live:hourly);
        return reply(body,200,mode==="live"?90:900);
    }catch(e){console.warn("Observations",mode,e instanceof Error?e.message:"Source indisponible");return reply({error:"Observations momentanément indisponibles"},503);}
});
