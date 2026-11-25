import { parseHTML } from "npm:linkedom@0.18.12";
import feeds from "./feeds.json" with { type: "json" };
import { readBulletin, readPlan, nordicNotice } from "./reports.mjs";

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
async function stationReport(id:string) {
    const source:Feed=sources.get(id)!;
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),10500);
    const read=async(config:Feed)=>readBulletin(await published(config.url,controller.signal),config);
    try {
        const plan=source.planUrl?published(source.planUrl,controller.signal).then(doc=>source.planArea?nordicNotice(doc,source.planArea):{plan:readPlan(doc),seasonStart:null}).catch(()=>null):Promise.resolve(null);
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
Deno.serve(async req => {
    if (req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
    if (req.method!=="GET") return reply({error:"Méthode non prise en charge"},405);
    const id = new URL(req.url).searchParams.get("station") || "";
    if (!sources.has(id)) return reply({error:"Station inconnue"},404);
    const cached = reports.get(id);
    if (cached && cached.until>Date.now()) return reply(cached.value);
    try {
        const task = pending.get(id) || stationReport(id);
        pending.set(id,task);
        return reply(await task);
    } catch {
        return reply({error:"Bulletin momentanément indisponible"},503);
    }
});
