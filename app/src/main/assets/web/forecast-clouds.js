(function(root) {
    'use strict';
    const C=typeof module==='object'&&module.exports?require('./core.js'):root.MeteoCore;
    const models=['meteofrance_arome_france','icon_seamless','gfs_seamless'],names=['AROME','ICON','GFS'];
    const fields=['cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high','relative_humidity_2m'];
    const percent=v=>C.finite(v)&&v>=0&&v<=100;
    function url(points,unix=false){
        const q=new URLSearchParams({latitude:points.map(p=>p.lat).join(','),longitude:points.map(p=>p.lon).join(','),
            timezone:'Europe/Paris',forecast_days:5,models:models.join(','),hourly:fields.join(',')});
        if(unix)q.set('timeformat','unixtime');
        return 'https://api.open-meteo.com/v1/forecast?'+q;
    }
    function dominant(total,low,mid,high){
        if(!percent(total)||!percent(low)||low>total+8)return null;
        if(!C.hasLowCloudLayer(total,Math.min(low,total)))return false;
        // An opaque deck can hide upper layers. With scattered low clouds, compare their coverage.
        return low>=78||Math.max(percent(mid)?mid:0,percent(high)?high:0)<=low+8;
    }
    function check(data,comparison){
        const h=data?.hourly,m=comparison?.hourly;
        if(!Array.isArray(h?.time))return data;
        const modelTimes=new Map((m?.time||[]).map((t,i)=>[t,i]));
        h.lowAllowed=[];h.lowModelMask=[];h.stratusSignal=[];h.lowByModel=models.map(()=>[]);
        h.time.forEach((time,i)=>{
            const j=modelTimes.get(time),total=h.cloud_cover?.[i],low=h.cloud_cover_low?.[i];
            const base=dominant(total,low,h.cloud_cover_mid?.[i],h.cloud_cover_high?.[i]);
            let available=0,yes=0,damp=0,mask=0,sum=0;
            if(j!==undefined)models.forEach((model,k)=>{
                const v=fields.map(field=>m[field+'_'+model]?.[j]);
                const agree=dominant(...v);
                if(agree===null)return;
                h.lowByModel[k][i]=v[1];
                available++;mask|=1<<k;
                if(agree){yes++;sum+=v[1];if(v[0]>=85&&v[1]>=80&&percent(v[4])&&v[4]>=88)damp++;}
            });
            const majority=available>=2&&yes>available/2;
            if(!percent(low)&&majority&&percent(total)&&total>=70&&sum/yes<=total+8){
                (h.cloud_cover_low??=[])[i]=Math.min(total,sum/yes);
            }
            h.lowAllowed[i]=available>=2?majority&&base!==false:base;
            h.lowModelMask[i]=available>=2?mask:0;
            h.stratusSignal[i]=majority&&base!==false&&damp>=2&&total>=85&&h.cloud_cover_low?.[i]>=78;
        });
        if(data.current&&typeof data.current.time==='number'){
            const index=h.time.indexOf(Math.floor(data.current.time/3600)*3600);
            if(index>=0)data.current.lowAllowed=h.lowAllowed[index];
        }
        return data;
    }
    async function compare(points,fetchJSON,signal,unix=false){
        const result=new Map();
        if(!points.length)return result;
        try{
            const response=await fetchJSON(url(points,unix),signal,10000);
            const records=Array.isArray(response)?response:[response];
            records.forEach((r,i)=>{
                const id=r?.location_id??i,p=points[id];
                if(Number.isInteger(id)&&p&&Array.isArray(r?.hourly?.time))result.set(p.lat+','+p.lon,r);
            });
        }catch{/* The primary model still supplies its own cloud layers. */}
        return result;
    }
    const api={url,check,compare,names};
    if(typeof module==='object'&&module.exports)module.exports=api;else root.ForecastClouds=api;
})(globalThis);
