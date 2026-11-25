import { parseHTML } from "npm:linkedom@0.18.12";
import feeds from "./feeds.json" with { type: "json" };
import { readBulletin } from "./reports.mjs";

const ttl = 15 * 60_000;
const sources = new Map(Object.entries(feeds));
const reports = new Map<string, {until:number, value:unknown}>();
const pending = new Map<string, Promise<unknown>>();
const cors = { "Access-Control-Allow-Origin":"*", "Access-Control-Allow-Headers":"authorization, apikey, content-type", "Access-Control-Allow-Methods":"GET, OPTIONS" };
const reply = (body:unknown,status=200) => Response.json(body,{status,headers:{...cors,"Cache-Control":status===200?"public, max-age=300":"no-store"}});

async function stationReport(id:string) {
    const source = sources.get(id)!;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    try {
        const raw = await fetch(source.url, {signal:controller.signal, headers:{Accept:"text/html"}});
        if (!raw.ok) throw Error("Bulletin indisponible");
        const text = await raw.text();
        if (text.length > 2_000_000) throw Error("Bulletin trop volumineux");
        const { document } = parseHTML(text);
        const data = {...readBulletin(document,source),source:source.url};
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
