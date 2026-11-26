const url=Deno.env.get("SUPABASE_URL")+"/rest/v1/";
const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"};
async function api(path:string,opts:RequestInit={}){
    const r=await fetch(url+path,{...opts,headers:{...headers,...opts.headers},signal:AbortSignal.timeout(4000)});
    if(!r.ok){await r.body?.cancel();throw Error("Cache indisponible");}
    return r;
}
export async function sharedCache(name:string,cycle:number,load:(previous?:any)=>Promise<any>,usable:(value:any)=>boolean){
    const row="meteo74_map_cache?name=eq."+name;
    const read=async()=>(await (await api(row+"&select=cycle,payload")).json())[0];
    let previous,claimed;
    try{
        previous=await read();
        if(previous?.cycle===cycle&&usable(previous.payload))return previous.payload;
        const r=await api("rpc/meteo74_claim_map_cache",{method:"POST",body:JSON.stringify({p_name:name,p_cycle:cycle})});
        claimed=await r.json();
    }catch{/* Source requests can still be served without database connectivity. */}
    if(claimed===false){
        if(previous?.payload&&usable(previous.payload))return previous.payload;
        for(let attempt=0;attempt<10;attempt++){
            await new Promise(resolve=>setTimeout(resolve,1700));
            try{const next=await read();if(next?.payload&&usable(next.payload))return next.payload;}catch{break;}
        }
        throw Error("Mise à jour en cours");
    }
    try{
        const next=await load(previous?.payload);
        if(claimed)try{
            const r=await api(row+"&lease_cycle=eq."+cycle,{method:"PATCH",body:JSON.stringify({cycle,payload:next,lease_until:null})});
            await r.body?.cancel();
        }catch{/* Serve the completed response if persistent storage is unavailable. */}
        return next;
    }catch(error){if(previous?.payload&&usable(previous.payload))return previous.payload;throw error;}
}
