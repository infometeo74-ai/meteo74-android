import { extractGrid } from "./grid.mjs";

const mirrors = [
  "https://object-store.os-api.cci1.ecmwf.int/openradar-24h-backup",
  "https://s3.waw3-1.cloudferro.com/openradar-24h",
];
const cors = { "Access-Control-Allow-Origin":"*", "X-Content-Type-Options":"nosniff", "Access-Control-Allow-Headers":"authorization, apikey, content-type" };
const frames = new Map<number, Uint8Array>();
const pending = new Map<number, Promise<Uint8Array>>();
let catalog: {at:number,items:Map<number,string>} | null = null;
let listing: Promise<Map<number,string>> | null = null;

function stamp(t:number) { return new Date(t*1000).toISOString().slice(0,16).replace(/[-:]/g,""); }
async function discover(now:number) {
  const start=now-10800, hours=new Set<string>();
  for(let t=Math.floor(start/3600)*3600;t<=now;t+=3600)hours.add(stamp(t).slice(0,11));
  for(const base of mirrors){
    const items=new Map<number,string>();
    await Promise.all(Array.from(hours,async h=>{
      const dir=h.slice(0,4)+"/"+h.slice(4,6)+"/"+h.slice(6,8)+"/OPERA/COMP/";
      const qs=new URLSearchParams({"list-type":"2",prefix:dir+"OPERA@"+h,"max-keys":"150"});
      try{
        const response=await fetch(base+"?"+qs,{signal:AbortSignal.timeout(9000)});
        if(!response.ok)return;
        const xml=await response.text();
        for(const match of xml.matchAll(/<Key>([0-9/]+\/OPERA\/COMP\/OPERA@(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)@0@DBZH\.tiff)<\/Key>/g)){
          const t=Date.UTC(+match[2],+match[3]-1,+match[4],+match[5],+match[6])/1000;
          if(t>=start&&t<=now+60&&t%300===0)items.set(t,base+"/"+match[1]);
        }
      }catch{/* Try another mirror when this hour is unavailable. */}
    }));
    const newest=Math.max(...items.keys());
    if(items.size&&newest>=now-3600){
      const sorted=Array.from(items).filter(([t])=>t>=newest-7200).sort((a,b)=>a[0]-b[0]);
      return new Map(sorted);
    }
  }
  throw Error("Observations indisponibles");
}
async function available(){
  const now=Math.floor(Date.now()/1000);
  if(catalog&&now-catalog.at<60)return catalog.items;
  listing??=discover(now).then(items=>{catalog={at:now,items};return items;}).catch(error=>{
    if(catalog&&now-catalog.at<300)return catalog.items;
    throw error;
  }).finally(()=>{listing=null;});
  return listing;
}
async function readObservation(url:string) {
  // A mirror occasionally times out while serving a new observation.
  for(let attempt=0;attempt<2;attempt++){
    try{
      const response=await fetch(url,{signal:AbortSignal.timeout(7500)});
      if(!response.ok){await response.body?.cancel();throw Error("Observation indisponible");}
      if(Number(response.headers.get("Content-Length"))>24_000_000){await response.body?.cancel();throw Error("Format inattendu");}
      const bytes=await response.arrayBuffer();
      if(bytes.byteLength>24_000_000)throw Error("Format inattendu");
      return bytes;
    }catch(error){if(attempt===1)throw error;}
  }
  throw Error("Observation indisponible");
}
async function prepare(time:number,url:string){
  const saved=frames.get(time);if(saved)return saved;
  const task=pending.get(time);if(task)return task;
  const job=(async()=>{
    const packed=await extractGrid(await readObservation(url));
    for(const t of frames.keys())if(t<time-10800)frames.delete(t);
    if(frames.size>=28)frames.delete(frames.keys().next().value!);
    frames.set(time,packed);return packed;
  })().finally(()=>pending.delete(time));
  pending.set(time,job);return job;
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:{...cors,"Access-Control-Allow-Methods":"GET, OPTIONS"}});
  if(req.method!=="GET")return new Response(null,{status:405,headers:{...cors,Allow:"GET, OPTIONS"}});
  const path=new URL(req.url).pathname.split("/").pop()||"";
  if(path!=="frames"&&!/^\d{10}\.bin$/.test(path))return new Response(null,{status:404,headers:cors});
  try{
    const items=await available();
    if(path==="frames")return Response.json({times:[...items.keys()]},{headers:{...cors,"Cache-Control":"public, max-age=45"}});
    const time=Number(path.slice(0,-4)),url=items.get(time);
    if(!url)return new Response(null,{status:404,headers:cors});
    const bytes=await prepare(time,url);
    return new Response(bytes as BodyInit,{headers:{...cors,"Content-Type":"application/octet-stream","Content-Encoding":"gzip","Cache-Control":"public, max-age=7200, immutable"}});
  }catch{return new Response("Radar momentanément indisponible",{status:503,headers:{...cors,"Cache-Control":"no-store"}});}
});
