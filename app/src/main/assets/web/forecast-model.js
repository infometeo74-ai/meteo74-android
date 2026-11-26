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
        for (let i=0; i<14; i++) {
            const day = plus(date,i), instant = new Date(day+'T12:00:00Z');
            const lower = weekday.format(instant), name = lower[0].toUpperCase()+lower.slice(1);
            const kinds = i===0 ? Object.keys(slots).filter(k => slots[k][1]>hour) :
                i<=2 ? ['morning','afternoon'] : ['day'];
            for (const kind of kinds) {
                const label = i===0 ? firstLabels[kind] : kind==='day' ? name :
                    name+(kind==='morning'?' matin':' après-midi');
                list.push({key:day+'/'+kind,date:day,kind,label,dateLabel:dateLabel.format(instant),trend:i>=10});
            }
        }
        return list;
    }
    const hourlyFields = ['weather_code','temperature_2m','cloud_cover','cloud_cover_low','is_day','precipitation','rain','showers','snowfall'];
    function url(towns) {
        const params = new URLSearchParams({
            latitude:towns.map(t => t.lat).join(','), longitude:towns.map(t => t.lon).join(','),
            timezone:'Europe/Paris', forecast_days:14, past_hours:6, forecast_hours:72,
            hourly:hourlyFields.join(','),
            daily:'weather_code,temperature_2m_min,temperature_2m_max,cloud_cover_mean,precipitation_sum'
        });
        return 'https://api.open-meteo.com/v1/forecast?'+params;
    }
    function summary(code,day,cloud,precip,low,high,details) {
        const icon=C.weatherSymbol(code,day,cloud,precip,details);
        return icon ? {icon,label:C.condition(code,day,cloud,precip,details).label,low,high} : null;
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
        const valid=indices.filter(i => C.finite(h.weather_code[i]));
        if (!valid.length) return null;
        const counts=new Map();
        for (const i of valid) {
            const group=family(h.weather_code[i]);
            counts.set(group,(counts.get(group)||0)+1);
        }
        // Show a forecast thunderstorm even if brief. Otherwise use the prevailing weather family.
        const group=counts.has(95) ? 95 : [...counts].sort((a,b)=>b[1]-a[1] || b[0]-a[0])[0][0];
        const match=valid.filter(i=>family(h.weather_code[i])===group);
        const representative=match.slice().sort((a,b)=>h.weather_code[a]-h.weather_code[b])[Math.floor(match.length/2)];
        const temperatures=indices.map(i=>h.temperature_2m?.[i]).filter(C.finite);
        const daylight=valid.filter(i=>h.is_day?.[i]===1).length;
        const day=kind!=='night' && kind!=='dawn' && daylight*2>=valid.length;
        const details={};
        for (const key of ['cloud_cover_low','rain','showers','snowfall']) details[key]=h[key]?.[representative];
        return summary(h.weather_code[representative],day,h.cloud_cover?.[representative],h.precipitation?.[representative],
            temperatures.length?Math.min(...temperatures):null,temperatures.length?Math.max(...temperatures):null,details);
    }
    function summarize(data) {
        const h=data?.hourly, d=data?.daily;
        if (!Array.isArray(d?.time)||!Array.isArray(d.weather_code)||!Array.isArray(h?.time)||!Array.isArray(h.weather_code)) return null;
        const values={};
        d.time.forEach((date,i)=>{
            const item=summary(d.weather_code[i],true,d.cloud_cover_mean?.[i],d.precipitation_sum?.[i],d.temperature_2m_min?.[i],d.temperature_2m_max?.[i]);
            if(item) values[date+'/day']=item;
        });
        const hours=new Map();
        for (let i=0; i<h.time.length; i++) {
            const t=h.time[i], date=t.slice(0,10), hour=Number(t.slice(11,13));
            const kind=hour<6?'dawn':hour<12?'morning':hour<18?'afternoon':hour<22?'evening':'night';
            const keys=[date+'/'+kind];
            if(kind==='dawn') keys.push(plus(date,-1)+'/night');
            for(const key of keys) {
                if(!hours.has(key)) hours.set(key,[]);
                hours.get(key).push(i);
            }
        }
        for (const [key,indices] of hours) {
            const item=hourSummary(h,indices,key.split('/')[1]);
            if(item) values[key]=item;
        }
        return Object.keys(values).length ? values : null;
    }
    // Open-Meteo returns the model cell coordinates, which may differ from the requested town.
    // Its location_id is the request index. Some deployments omit it for the first location.
    function batch(response,towns) {
        const items=Array.isArray(response)?response:[response];
        const records=new Map();
        for (const [index,item] of items.entries()) {
            const id=item?.location_id ?? index;
            if(!Number.isInteger(id)||id<0||id>=towns.length||records.has(id)) continue;
            const values=summarize(item);
            if(values) records.set(id,values);
        }
        return records;
    }
    const api={localNow,periods,url,summarize,batch};
    if(typeof module==='object'&&module.exports) module.exports=api; else root.MeteoForecastModel=api;
})(globalThis);
