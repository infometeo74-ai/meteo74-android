const api=Deno.env.get("SUPABASE_URL")+"/rest/v1/",key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const headers={apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"};
export async function savedReport(id:string){
    const r=await fetch(api+"meteo74_ski_bulletins?station_id=eq."+encodeURIComponent(id)+"&select=checked_at,bulletin",{headers,signal:AbortSignal.timeout(4000)});
    if(!r.ok)throw Error("Cache indisponible");return (await r.json())[0];
}
export async function saveReports(rows:unknown[]){
    if(!rows.length)return;
    const r=await fetch(api+"meteo74_ski_bulletins?on_conflict=station_id",{method:"POST",headers:{...headers,Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify(rows),signal:AbortSignal.timeout(5000)});
    if(!r.ok)throw Error("Bulletins non enregistrés");await r.body?.cancel();
}
export async function claimSync(cycle:number){
    const r=await fetch(api+"rpc/meteo74_claim_map_cache",{method:"POST",headers,body:JSON.stringify({p_name:"ski-sync",p_cycle:cycle}),signal:AbortSignal.timeout(4000)});
    if(!r.ok)throw Error("Synchronisation indisponible");return await r.json()===true;
}
export async function finishSync(cycle:number){
    const r=await fetch(api+"meteo74_map_cache?name=eq.ski-sync&lease_cycle=eq."+cycle,{method:"PATCH",headers,body:JSON.stringify({cycle,lease_until:null}),signal:AbortSignal.timeout(4000)});
    if(!r.ok)throw Error("Synchronisation incomplète");await r.body?.cancel();
}
