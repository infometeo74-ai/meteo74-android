import {recent,weatherlink,weatherlinkSites} from './normalize.mjs';

// The credentials belong to the account whose public stations are shared for Météo74.
export async function sharedWeatherLink({key,secret,ids,area,fetcher=fetch,signal,now=Date.now,history=new Map()}){
    if(!key||!secret)return {stations:[],partial:false};
    async function read(path){
        const url=new URL('https://api.weatherlink.com/v2/'+path);
        url.searchParams.set('api-key',key);
        const response=await fetcher(url,{headers:{Accept:'application/json','X-Api-Secret':secret},redirect:'error',signal});
        if(!response.ok){
            await response.body?.cancel();
            throw Error('WeatherLink indisponible');
        }
        return response.json();
    }
    const allowed=ids?new Set(ids.split(',').map(s=>s.trim()).filter(Boolean)):null;
    const published=weatherlinkSites(await read('stations'),area).filter(s=>!allowed||allowed.has(String(s.id)));
    const idsOnMap=new Set(published.map(s=>s.id));
    for(const id of history.keys())if(!idsOnMap.has(id))history.delete(id);
    // Start with stations missed by any previous partial refresh.
    published.sort((a,b)=>(history.get(a.id)?.checked||0)-(history.get(b.id)?.checked||0));
    let partial=false;
    // The API allows ten calls per second. Count the registry call in the first group.
    let lastBatchStart=0;
    for(let i=0;i<published.length;i+=8){
        const delay=lastBatchStart+1050-Date.now();
        if(delay>0)await new Promise(r=>setTimeout(r,delay));
        if(signal?.aborted){partial=true;break;}
        lastBatchStart=Date.now();
        const group=published.slice(i,i+8);
        const results=await Promise.allSettled(group.map(async s=>weatherlink(s,await read('current/'+s.id),area,now())));
        for(const [j,result] of results.entries()){
            const value=result.status==='fulfilled'?result.value:null;
            history.set(group[j].id,{checked:now(),value});
            if(result.status==='rejected')partial=true;
        }
    }
    const stations=[...history.values()].map(h=>h.value).filter(s=>s&&recent(s.time,now()));
    return {stations,partial};
}
