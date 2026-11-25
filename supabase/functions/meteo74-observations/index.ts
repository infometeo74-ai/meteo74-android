import territory from "./territory.json" with { type: "json" };
import { ffvl, sensors, aviation, meteoFrance } from "./normalize.mjs";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, content-type","Access-Control-Allow-Methods":"GET, OPTIONS"};
const author={"Accept":"application/json","User-Agent":"Meteo74/0.6 (Haute-Savoie observations)"};
const resource="https://www.data.gouv.fr/api/1/datasets/r/";
const cache=new Map<string,{at:number,value:any}>();
const pending=new Map<string,Promise<any>>();
async function memo(key:string,age:number,load:()=>Promise<any>){
    const hit=cache.get(key);
    if(hit && Date.now()-hit.at<age)return hit.value;
    const active=pending.get(key);if(active)return active;
    const task=load().then(value=>{cache.set(key,{at:Date.now(),value});return value;}).finally(()=>pending.delete(key));
    pending.set(key,task);return task;
}
async function json(url:string){
    const res=await fetch(url,{headers:author,signal:AbortSignal.timeout(11500)});
    if(!res.ok)throw Error("Source indisponible");
    return res.json();
}
const feeds=[
    ["FFVL",async()=>{const [sites,obs]=await Promise.all([
        memo("ff-sites",86400000,()=>json(resource+"8d795154-9145-4ab2-99de-6768a36f31ea")),
        json(resource+"047b2ab9-627f-4e5f-9d68-5b948433c61d")]);return ffvl(sites,obs,territory,Date.now());}],
    ["Sensor.Community",async()=>sensors(await json("https://data.sensor.community/airrohr/v1/filter/box=45.66,5.76,46.46,7.06"),territory,Date.now())],
    ["METAR",async()=>aviation(await json("https://aviationweather.gov/api/data/metar?format=json&bbox=45.65,5.78,46.44,7.06&hours=2"),territory,Date.now())]
] as const;
async function live(){
    const results=await Promise.allSettled(feeds.map(([name,load])=>memo(name,150000,load)));
    const stations:any[]=[], missing:string[]=[];
    for(const [i,r] of results.entries()){
        if(r.status==="fulfilled"){stations.push(...r.value);continue;}
        const name=feeds[i][0];missing.push(name);
        // Keep a network's previously received measurements only while they remain recent.
        stations.push(...(cache.get(name)?.value||[]).filter((s:any)=>s.time>=Date.now()-90*60000));
    }
    if(missing.length===feeds.length&&!stations.length)throw Error("Aucun réseau disponible");
    return {mode:"live",retrievedAt:Date.now(),stations,missing};
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
    return {mode:"hourly",retrievedAt:Date.now(),time:stations[0].time,stations,missing:[]};
}
Deno.serve(async req=>{
    if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
    const reply=(body:unknown,status:number,age=0)=>Response.json(body,{status,headers:{...cors,"Cache-Control":age?"public, max-age="+age:"no-store"}});
    if(req.method!=="GET")return reply({error:"Méthode inconnue"},405);
    const mode=new URL(req.url).searchParams.get("mode")||"live";
    if(mode!=="live"&&mode!=="hourly")return reply({error:"Mode inconnu"},400);
    try {
        const body=await memo("mode-"+mode,mode==="live"?120000:1800000,mode==="live"?live:hourly);
        return reply(body,200,mode==="live"?90:900);
    }catch{return reply({error:"Observations momentanément indisponibles"},503);}
});
