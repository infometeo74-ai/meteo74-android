import { parseHTML } from "npm:linkedom@0.18.12";
import feeds from "./feeds.json" with { type: "json" };
import { readBulletin, readPlan, nordicNotice } from "./reports.mjs";

import { savedReport, saveReports, claimSync, finishSync } from "./cache.ts";

const ttl = 15 * 60_000;
const sources = new Map(Object.entries(feeds));
const reports = new Map<string, {until:number, value:unknown}>();
const pending = new Map<string, Promise<unknown>>();
const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, apikey, content-type", "Access-Control-Allow-Methods":"GET, OPTIONS" };
const reply = (body:unknown,status=200) => Response.json(body,{status,headers:{...cors,"Cache-Control":status===200?"public, max-age=300":"no-store"}});

type Feed = {kind:string,url:string,scope?:string,planUrl?:string,planArea?:string,alternative?:string,alternativeKind?:string};
async function published(url:string,signal:AbortSignal){
    const raw=await fetch(url,{signal,headers:{Accept:"text/html"}});
    if(!raw.ok)throw Error("Source indisponible");
    const buffer=await raw.arrayBuffer();
    if(buffer.byteLength>3_000_000)throw Error("Source trop volumineuse");
    const utf=new TextDecoder().decode(buffer);
    // Some legacy tourism pages contain isolated Windows-1252 bytes among UTF-8 text.
    return parseHTML(utf).document;
}
async function stationReport(id:string, documentFor=published) {
    const source:Feed=sources.get(id)!;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10500);
    const read=async(config:Feed)=>readBulletin(await documentFor(config.url,controller.signal),config);
    try {
        const plan=source.planUrl?documentFor(source.planUrl,controller.signal).then(doc=>source.planArea?nordicNotice(doc,source.planArea):{plan:readPlan(doc),seasonStart:null}).catch(()=>null):Promise.resolve(null);
        const [primary,secondary,announcement]=await Promise.all([
            read(source).catch(()=>null),
            source.alternative?read({kind:source.alternativeKind||"skiinfo",url:source.alternative,scope:source.scope}).catch(()=>null):null,
            plan
        ]);
        const useful=(r:ReturnType<typeof readBulletin>|null)=>!!(r&&(r.trails||r.lifts||r.km||r.snow.length||r.routes.length||r.areaStatus));
        const best=useful(primary)?primary:useful(secondary)?secondary:
            (secondary?.date||"")>(primary?.date||"")?secondary:primary||secondary;
        if(!best&&!announcement)throw Error("Bulletin indisponible");
        const data={...(best||{snow:[],routes:[],trails:null,lifts:null,km:null,date:null,scope:source.scope||null}),
            seasonStart:announcement?.seasonStart||best?.seasonStart||secondary?.seasonStart||null,plan:announcement?.plan||null};
        reports.set(id,{until:Date.now()+ttl,value:data});
        return data;
    } finally {
        clearTimeout(timeout);
        pending.delete(id);
    }
}
async function syncBulletins(){
    const cycle=Math.floor(Date.now()/3600000)*3600000;
    if(!await claimSync(cycle))return {actualise:false};
    // Multiple resorts can publish different sectors of a single operator bulletin.
    const documents=new Map<string,ReturnType<typeof published>>();
    const shared=(url:string,_signal:AbortSignal)=>{
        if(!documents.has(url))documents.set(url,published(url,AbortSignal.timeout(6500)));
        return documents.get(url)!;
    };
    const ids=[...sources].filter(([,s])=>["lumi","depth"].includes(s.kind)).map(([id])=>id);
    let cursor=0;const rows:any[]=[];
    async function worker(){
        while(cursor<ids.length){
            const id=ids[cursor++];
            try{
                const bulletin=await stationReport(id,shared);
                rows.push({station_id:id,checked_at:new Date().toISOString(),bulletin});
            }catch{/* A failed source keeps its previous timestamp and observations. */}
        }
    }
    await Promise.all(Array.from({length:6},worker));
    if(!rows.length)throw Error("Aucun bulletin");
    await saveReports(rows);await finishSync(cycle);
    return {actualise:true,bulletins:rows.length};
}
Deno.serve(async req => {
    if (req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
    if (req.method!=="GET") return reply({error:"Méthode non prise en charge"},405);
    const params=new URL(req.url).searchParams;
    if(params.get("sync")==="1"){
        try{return reply(await syncBulletins());}catch{return reply({error:"Synchronisation indisponible"},503);}
    }
    const id = params.get("station") || "";
    if (!sources.has(id)) return reply({error:"Station inconnue"},404);
    const cached = reports.get(id);
    if (cached && cached.until>Date.now()) return reply(cached.value);
    try {
        const stored=await savedReport(id).catch(()=>null);
        if(stored&&Date.now()-Date.parse(stored.checked_at)<60*60000){
            reports.set(id,{until:Math.min(Date.now()+ttl,Date.parse(stored.checked_at)+3600000),value:stored.bulletin});
            return reply(stored.bulletin);
        }
        const task = pending.get(id) || stationReport(id).then(async bulletin=>{
            await saveReports([{station_id:id,checked_at:new Date().toISOString(),bulletin}]).catch(()=>{});
            return bulletin;
        });
        pending.set(id,task);
        return reply(await task);
    } catch {
        return reply({error:"Bulletin momentanément indisponible"},503);
    }
});
