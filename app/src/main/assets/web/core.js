(function(root){
'use strict';
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const fmt=(v,d=0)=>finite(v)?(Math.abs(v)<.5*Math.pow(10,-d)?0:v).toLocaleString('fr-FR',{maximumFractionDigits:d,minimumFractionDigits:0}):'—';
// The same bundled artwork serves the current conditions and both forecast lists.
const weatherArtwork={
 0:'clear-*', 1:'mostly-clear-*', 2:'broken-*', 3:'overcast', 45:'fog', 48:'rime',
 51:'drizzle-light', 53:'drizzle', 55:'drizzle-heavy', 56:'freezing-drizzle', 57:'freezing-drizzle',
 61:'rain-light', 63:'rain', 65:'rain-heavy', 66:'freezing-rain', 67:'freezing-rain',
 71:'snow-light', 73:'snow', 75:'snow-heavy', 77:'snow-grains',
 80:'showers-light-*', 81:'showers-*', 82:'showers-heavy-*',
 85:'snow-showers-*', 86:'snow-showers-heavy-*',
 95:'thunder-*', 96:'thunder-hail', 97:'thunder-*', 99:'thunder-hail'
};
const rainShowers={80:'rain-light',81:'rain',82:'rain-heavy',85:'snow',86:'snow-heavy'};
function cloudState(code,cloud,precip){
 if(finite(cloud)&&cloud>=85){
  if(finite(code)&&code>=0&&code<=3)return 'covered';
  if(precip===0&&[51,53,55,61,63,80,81,82].includes(code))return 'interval';
  return 'overcast';
 }
 return finite(cloud)&&cloud>=0&&cloud<65?'breaks':'uncertain';
}
function weatherSymbol(code,day=true,cloud,precip){
 const sky=cloudState(code,cloud,precip);
 if(sky==='covered'||sky==='interval')return 'wx-overcast';
 if(sky!=='breaks'&&rainShowers[code])return 'wx-'+rainShowers[code];
 const name=finite(code)?weatherArtwork[code]:null;
 return name?'wx-'+name.replace('*',day?'day':'night'):null;
}
function condition(code,day=true,cloud,precip){
 const sky=cloudState(code,cloud,precip);
 if(sky==='covered')return {label:'Ciel couvert',icon:'cloud'};
 if(sky==='interval')return {label:'Couvert, pluie intermittente',icon:'cloud'};
 if(sky==='overcast'&&[80,81,82].includes(code))return {label:code===82?'Couvert, fortes averses':'Couvert, averses',icon:'rain'};
 if(sky==='overcast'&&[85,86].includes(code))return {label:'Couvert, averses de neige',icon:'snow'};
 if(code===0)return {label:day?'Ciel dégagé':'Nuit dégagée',icon:day?'sun':'moon'};
 if(code===1||code===2)return {label:code===1?'Peu nuageux':'Éclaircies',icon:day?'partly':'nightcloud'};
 if(code===3)return {label:'Ciel couvert',icon:'cloud'};
 if(code===45||code===48)return {label:code===48?'Brouillard givrant':'Brouillard',icon:'fog'};
 if([51,53,55].includes(code))return {label:'Bruine',icon:'rain'};
 if([56,57,66,67].includes(code))return {label:'Pluie verglaçante',icon:'sleet'};
 if([61,63,65].includes(code))return {label:code===65?'Pluie forte':code===61?'Pluie faible':'Pluie',icon:'rain'};
 if([71,73,75,77].includes(code))return {label:code===75?'Neige forte':'Neige',icon:'snow'};
 if([80,81,82].includes(code))return {label:code===82?'Fortes averses':'Averses',icon:'rain'};
 if([85,86].includes(code))return {label:'Averses de neige',icon:'snow'};
 if([95,96,97,99].includes(code))return {label:[96,99].includes(code)?'Orage avec grêle':'Orage',icon:'storm'};
 return {label:'Conditions indisponibles',icon:'unknown'};
}
function validPlace(p){return p&&typeof p.name==='string'&&p.name.length>0&&finite(p.latitude)&&finite(p.longitude)&&Math.abs(p.latitude)<=90&&Math.abs(p.longitude)<=180;}
function placeKey(p){return p.latitude.toFixed(3)+','+p.longitude.toFixed(3);}
function forecastURL(p){
 if(!validPlace(p))throw Error('Coordonnées incorrectes');
 const q=new URLSearchParams({latitude:p.latitude,longitude:p.longitude,timezone:'auto',timeformat:'unixtime',forecast_days:10,temperature_unit:'celsius',wind_speed_unit:'kmh',precipitation_unit:'mm',
 current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
 hourly:'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,cloud_cover,visibility,wind_speed_10m,wind_gusts_10m,is_day',
 daily:'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max'});
 return 'https://api.open-meteo.com/v1/forecast?'+q;
}
function date(epoch,zone,opts){if(!finite(epoch))return '—';try{return new Intl.DateTimeFormat('fr-FR',{timeZone:zone||'Europe/Paris',...opts}).format(new Date(epoch*1000));}catch{return '—';}}
const clock=(t,z)=>date(t,z,{hour:'2-digit',minute:'2-digit'});
function hours(data,now=Date.now()/1000){const h=data?.hourly;if(!Array.isArray(h?.time))return [];const floor=Math.floor(now/3600)*3600;return h.time.map((time,i)=>({time,i,temperature:h.temperature_2m?.[i],probability:h.precipitation_probability?.[i],code:h.weather_code?.[i],cloud:h.cloud_cover?.[i],precip:h.precipitation?.[i],isDay:h.is_day?.[i]!==0})).filter(x=>x.time>=floor&&x.time<floor+24*3600);}
function dailyCloud(data,i){
 const h=data.hourly,day=data.daily;
 if(!h?.cloud_cover||!day?.time?.[i])return null;
 const begin=day.sunrise?.[i]??day.time[i],end=day.sunset?.[i]??day.time[i+1]??begin+86400;
 let total=0,n=0;
 for(let j=0;j<h.time.length;j++)if(h.time[j]>=begin&&h.time[j]<end&&h.is_day?.[j]!==0&&finite(h.cloud_cover[j])){total+=h.cloud_cover[j];n++;}
 return n?total/n:null;
}
function validForecast(d){return d&&finite(d.current?.time)&&Array.isArray(d.hourly?.time)&&Array.isArray(d.daily?.time)&&typeof d.timezone==='string';}
function direction(v){return finite(v)?['N','NE','E','SE','S','SO','O','NO'][Math.round(v/45)%8]:'—';}
function scale(values){const clean=values.filter(finite);if(!clean.length)return null;let low=Math.floor(Math.min(...clean))-1,high=Math.ceil(Math.max(...clean))+1;return {low,high,ratio:v=>(v-low)/(high-low)};}
const api={finite,fmt,condition,weatherSymbol,validPlace,placeKey,forecastURL,date,clock,hours,dailyCloud,validForecast,direction,scale};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MeteoCore=api;
})(typeof window!=='undefined'?window:globalThis);
