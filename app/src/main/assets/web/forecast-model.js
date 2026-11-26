/* All dates and period boundaries on the regional map use local civil time. */
(function (root) {
    'use strict';
    const C = typeof module === 'object' && module.exports ? require('./core.js') : root.MeteoCore;
    const paris = new Intl.DateTimeFormat('en-GB', {
        timeZone:'Europe/Paris', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', hourCycle:'h23'
    });
    const weekday = new Intl.DateTimeFormat('fr-FR', {timeZone:'UTC', weekday:'long'});
    const dateLabel = new Intl.DateTimeFormat('fr-FR', {timeZone:'UTC', day:'numeric', month:'short'});
    const slots = {dawn:[0,6], morning:[6,12], afternoon:[12,18], evening:[18,22], night:[22,30]};
    const firstLabels = {dawn:'Fin de nuit', morning:'Ce matin', afternoon:'Cet après-midi', evening:'Ce soir', night:'Cette nuit'};

    function localNow(now = new Date()) {
        const parts = Object.fromEntries(paris.formatToParts(now).map(p => [p.type,p.value]));
        return {date:parts.year+'-'+parts.month+'-'+parts.day, hour:Number(parts.hour)};
    }
    function plus(date, days) {
        const d = new Date(date+'T12:00:00Z');
        d.setUTCDate(d.getUTCDate()+days);
        return d.toISOString().slice(0,10);
    }
    function periods(now = new Date()) {
        const {date,hour} = localNow(now);
        const list = [];
        for (let i=0; i<20; i++) {
            const day = plus(date,i), instant = new Date(day+'T12:00:00Z');
            const lower = weekday.format(instant), name = lower[0].toUpperCase()+lower.slice(1);
            const kinds = i===0 ? Object.keys(slots).filter(k => slots[k][1]>hour) :
                i<=2 ? ['morning','afternoon'] : ['day'];
            for (const kind of kinds) {
                const label = i===0 ? firstLabels[kind] : kind==='day' ? name :
                    name+(kind==='morning'?' matin':' après-midi');
                list.push({key:day+'/'+kind,date:day,kind,label,dateLabel:dateLabel.format(instant),dayNumber:i+1,trend:i>=10,extended:i>=14});
            }
        }
        return list;
    }
    const hourlyFields = ['weather_code','temperature_2m','cloud_cover','cloud_cover_low','cloud_cover_mid','cloud_cover_high','is_day','sunshine_duration','precipitation','rain','showers','snowfall'];
    function url(towns) {
        const params = new URLSearchParams({
            latitude:towns.map(t => t.lat).join(','), longitude:towns.map(t => t.lon).join(','),
            timezone:'Europe/Paris', forecast_days:14,
            hourly:hourlyFields.join(','),
            daily:'weather_code,temperature_2m_min,temperature_2m_max,cloud_cover_mean,precipitation_sum'
        });
        return 'https://api.open-meteo.com/v1/forecast?'+params;
    }
    function summary(code,day,cloud,precip,low,high,details) {
        const icon=C.weatherSymbol(code,day,cloud,precip,details);
        if(!icon && !C.finite(low) && !C.finite(high)) return null;
        return {icon,label:icon?C.condition(code,day,cloud,precip,details).label:'',low,high,
            cloud:details?.lowSky&&C.finite(cloud)?Math.round(cloud):null,
            modelMask:details?.modelMask||0,modelLow:details?.modelMask?details.modelLow:null,stratus:!!(details?.lowSky&&details?.stratus),
            lowCloud:details?.lowSky&&C.finite(details.cloud_cover_low)?Math.round(details.cloud_cover_low):null};
    }
    function family(code) {
        if (code<=3) return code;
        if (code>=95) return 95;
        if (code>=85) return 85;
        if (code>=80) return 80;
        if (code>=71) return 71;
        if (code>=66) return 66;
        if (code>=61) return 61;
        if (code>=56) return 56;
        if (code>=51) return 51;
        return 45;
    }
    function hourSummary(h,indices,kind) {
        const temperatures=indices.map(i=>h.temperature_2m?.[i]).filter(C.finite);
        const low=temperatures.length?Math.min(...temperatures):null, high=temperatures.length?Math.max(...temperatures):null;
        const valid=indices.filter(i => C.finite(h.weather_code[i]));
        if (!valid.length) return summary(null,false,null,null,low,high);
        const counts=new Map();
        for (const i of valid) {
            const group=family(h.weather_code[i]);
            counts.set(group,(counts.get(group)||0)+1);
        }
        // Show a forecast thunderstorm even if brief. Otherwise use the prevailing weather family.
        const group=counts.has(95) ? 95 : [...counts].sort((a,b)=>b[1]-a[1] || b[0]-a[0])[0][0];
        const match=valid.filter(i=>family(h.weather_code[i])===group);
        const representative=match.slice().sort((a,b)=>h.weather_code[a]-h.weather_code[b])[Math.floor(match.length/2)];
        const daylight=valid.filter(i=>h.is_day?.[i]===1).length;
        const day=kind!=='night' && kind!=='dawn' && daylight*2>=valid.length;
        const code=h.weather_code[representative],dry=code>=0&&code<=3;
        const clouds=C.periodClouds(h,indices);
        const lowSky=dry&&clouds.lowAllowed!==false&&C.hasLowCloudLayer(clouds.total,clouds.low);
        const cover=lowSky?clouds.total:h.cloud_cover?.[representative];
        const details={cloud_cover_low:dry?(lowSky?clouds.low:null):h.cloud_cover_low?.[representative],sunnyBreaks:clouds.sunnyBreaks,lowAllowed:clouds.lowAllowed,modelMask:clouds.modelMask,modelLow:clouds.modelLow,stratus:clouds.stratus,lowSky};
        for (const key of ['rain','showers','snowfall']) details[key]=h[key]?.[representative];
        return summary(code,day,cover,h.precipitation?.[representative],low,high,details);
    }
    function summarize(data) {
        const d=data?.daily;
        if (!Array.isArray(d?.time)) return null;
        const h={time:[],weather_code:[],...data.hourly};
        if (!Array.isArray(h.time)||!Array.isArray(h.weather_code)) return null;
        const values={};
        const byDate=new Map(),hours=new Map();
        for (let i=0; i<h.time.length; i++) {
            const t=h.time[i], date=t.slice(0,10), hour=Number(t.slice(11,13));
            if(!byDate.has(date))byDate.set(date,[]);
            byDate.get(date).push(i);
            if(d.time.length>=3 && date>d.time[2])continue;
            const kind=hour<6?'dawn':hour<12?'morning':hour<18?'afternoon':hour<22?'evening':'night';
            const keys=[date+'/'+kind];
            if(kind==='dawn') keys.push(plus(date,-1)+'/night');
            for(const key of keys) {
                if(!hours.has(key)) hours.set(key,[]);
                hours.get(key).push(i);
            }
        }
        d.time.forEach((date,i)=>{
            const clouds=C.daytimeClouds(h,byDate.get(date)||[]);
            const code=d.weather_code?.[i],lowSky=[0,1,2,3].includes(code)&&clouds.lowAllowed!==false&&C.hasLowCloudLayer(clouds.total,clouds.low);
            const total=(lowSky?clouds.total:null)??d.cloud_cover_mean?.[i];
            const item=summary(code,true,total,d.precipitation_sum?.[i],d.temperature_2m_min?.[i],d.temperature_2m_max?.[i],
                {cloud_cover_low:lowSky?clouds.low:null,sunnyBreaks:clouds.sunnyBreaks,lowAllowed:clouds.lowAllowed,modelMask:clouds.modelMask,modelLow:clouds.modelLow,stratus:clouds.stratus,lowSky});
            if(item)values[date+'/day']=item;
        });
        for (const [key,indices] of hours) {
            const item=hourSummary(h,indices,key.split('/')[1]);
            if(item) values[key]=item;
        }
        return Object.keys(values).length ? values : null;
    }
    function ensembleUrl(towns,today) {
        const params=new URLSearchParams({
            latitude:towns.map(t=>t.lat).join(','),longitude:towns.map(t=>t.lon).join(','),
            timezone:'Europe/Paris',models:'ecmwf_ec46',start_date:plus(today,14),end_date:plus(today,19),
            daily:'temperature_2m_min,temperature_2m_max,precipitation_sum,snowfall_sum,cloud_cover_mean'
        });
        return 'https://seasonal-api.open-meteo.com/v1/seasonal?'+params;
    }
    function quantile(sorted,p) {
        const index=(sorted.length-1)*p, lo=Math.floor(index), fraction=index-lo;
        return sorted[lo]*(1-fraction)+sorted[Math.ceil(index)]*fraction;
    }
    function ensembleSummary(data) {
        const d=data?.daily;
        if(!Array.isArray(d?.time))return null;
        const result={};
        d.time.forEach((date,i)=>{
            const lows=[], highs=[], cloud=[], rain=[], snow=[];
            for(let member=0;member<51;member++){
                const suffix=member?'_member'+String(member).padStart(2,'0'):'';
                const low=d['temperature_2m_min'+suffix]?.[i],high=d['temperature_2m_max'+suffix]?.[i];
                if(C.finite(low)&&C.finite(high)&&low<=high){lows.push(low);highs.push(high);}
                for(const [field,list] of [['cloud_cover_mean',cloud],['precipitation_sum',rain],['snowfall_sum',snow]]){
                    const value=d[field+suffix]?.[i];
                    if(C.finite(value)&&value>=0)list.push(value);
                }
            }
            const minimum=26;
            const pct=(values,threshold)=>values.length>=minimum?Math.round(100*values.filter(v=>v>=threshold).length/values.length):null;
            const wet=pct(rain,1), snowy=pct(snow,1);
            cloud.sort((a,b)=>a-b);
            const cover=cloud.length>=minimum?quantile(cloud,.5):null;
            let code=null,label='';
            if(snowy!==null&&snowy>=65){code=71;label='Tendance neigeuse';}
            else if(wet!==null&&wet>=65){code=61;label='Tendance humide';}
            else if(cover!==null){
                code=cover<25?0:cover<60?2:3;
                label=code===0?'Tendance ensoleillée':code===2?'Tendance variable':'Tendance nuageuse';
                if(wet!==null&&wet>=35)label+=' · précipitations possibles';
            }
            lows.sort((a,b)=>a-b);highs.sort((a,b)=>a-b);
            const enough=lows.length>=minimum;
            const value=summary(code,true,cover,null,enough?quantile(lows,.5):null,enough?quantile(highs,.5):null);
            if(value)result[date+'/day']={...value,label,wet,members:lows.length,
                lowBand:enough?[quantile(lows,.25),quantile(lows,.75)]:null,highBand:enough?[quantile(highs,.25),quantile(highs,.75)]:null};
        });
        return Object.keys(result).length?result:null;
    }
    // Open-Meteo returns the model cell coordinates, which may differ from the requested town.
    // Its location_id is the request index. Some deployments omit it for the first location.
    function batch(response,towns,parse=summarize) {
        const items=Array.isArray(response)?response:[response];
        const records=new Map();
        for (const [index,item] of items.entries()) {
            const id=item?.location_id ?? index;
            if(!Number.isInteger(id)||id<0||id>=towns.length||records.has(id)) continue;
            const values=parse(item);
            if(values) records.set(id,values);
        }
        return records;
    }
    const api={localNow,periods,url,summarize,ensembleUrl,ensembleSummary,batch};
    if(typeof module==='object'&&module.exports) module.exports=api; else root.MeteoForecastModel=api;
})(globalThis);
