(function(root){
'use strict';
const normalizeSearch = text => String(text ?? '').normalize('NFD').replace(/\p{M}/gu,'').replace(/œ/gi,'oe').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const fmt=(v,d=0)=>finite(v)?(Math.abs(v)<.5*Math.pow(10,-d)?0:v).toLocaleString('fr-FR',{maximumFractionDigits:d,minimumFractionDigits:0}):'—';
// The same bundled artwork serves the current conditions and both forecast lists.
// Numbers follow the Météo74 illustrated collection. Paired entries are day/night.
const weatherArtwork={
 0:[1,7],1:[3,9],2:[4,10],3:6,45:74,48:77,
 51:13,53:14,55:15,56:49,57:50,61:16,63:17,65:18,66:51,67:53,
 71:37,73:38,75:39,77:48,80:[25,28],81:[26,29],82:[27,30],
 85:[32,35],86:[33,36],95:63,96:65,97:64,99:66
};
const coveredShowers={80:21,81:22,82:23,85:42,86:43};
function cloudState(code,cloud,precip){
 if(finite(cloud)&&cloud>=85){
  if(finite(code)&&code>=0&&code<=3)return 'covered';
  if(precip===0&&[51,53,55,61,63,80,81,82].includes(code))return 'interval';
  return 'overcast';
 }
 return finite(cloud)&&cloud>=0&&cloud<65?'breaks':'uncertain';
}
const percentage = value => finite(value) && value>=0 && value<=100;
function lowCoverage(total,low){
 // Some model fields differ by a few points. Ignore a strongly contradictory pair.
 if(!percentage(low))return null;
 if(!percentage(total))return low;
 if(low>total+8)return null;
 return Math.min(total,low);
}
function hasLowCloudLayer(cloud,low){
 if(!percentage(low)||low<20)return false;
 if(!percentage(cloud))return low>=75;
 if(cloud>=85)return low>=55&&low>=cloud*.62;
 return low>=35&&low>=cloud*.5;
}
function lowCloudSky(code,cloud,low,day,sunnyBreaks){
 if(!hasLowCloudLayer(cloud,low)||(!percentage(cloud)&&code!==3))return null;
 if(day&&sunnyBreaks===true)return [98,'Nuages bas et éclaircies'];
 if(!day&&percentage(cloud)&&cloud<70)return [99,'Nuages bas épars'];
 return [12,'Nuages bas'];
}
function detailedWeather(code,day,cloud,precip,details={}){
 const lowFraction=details.lowAllowed===false?null:lowCoverage(cloud,details.cloud_cover_low);
 const low=finite(lowFraction)&&lowFraction>=85;
 const windy=finite(details.wind_speed_10m)&&details.wind_speed_10m>=40;
 const mixed=details.snowfall>0&&(details.rain>0||details.showers>0);
 if(mixed&&[51,53,55,61,63,65,71,73,75,80,81,82,85,86,95,97].includes(code)){
  if(code>=95)return [71,'Orage et pluie-neige'];
  const intensity=[55,65,75,82,86].includes(code)?2:[51,61,71,80].includes(code)?0:1;
  return [(low?111:44)+intensity,low?'Nuages bas, pluie et neige':'Pluie et neige mêlées'];
 }
 if(code===95||code===97){
  if(details.wind_gusts_10m>=90)return [72,'Orage et fortes rafales'];
  if(precip===0)return [61,'Orage sec'];
  if(cloudState(code,cloud,precip)==='breaks')return [day?69:70,'Orage avec éclaircies'];
 }
 if(cloudState(code,cloud,precip)==='interval')return null;
 if(low){
  if([51,53,55].includes(code))return [100,'Nuages bas et bruine'];
  if([61,63,65].includes(code))return [101,'Nuages bas et pluie'];
  if([71,73,75].includes(code))return [108+[71,73,75].indexOf(code),'Nuages bas et neige'];
 }
 if([0,1,2,3].includes(code)){
  // The instantaneous direct beam and hourly sunshine totals apply to different time windows.
  const direct=details.direct_normal_irradiance;
  const sun=details.sunnyBreaks??(finite(direct)&&percentage(cloud)?direct>120&&cloud<85:null);
  const sky=lowCloudSky(code,cloud,lowFraction,day,sun);
  if(sky)return sky;
  if(finite(cloud)&&cloud>=65&&cloud<85&&sun!==true)return [day?5:11,'Nuageux'];
 }
 if(windy){
  if(code===0&&cloudState(code,cloud,precip)!=='covered')return [day?89:91,day?'Soleil et vent':'Nuit claire et vent'];
  if([0,1,2,3].includes(code))return [90,'Nuages et vent'];
  if([61,63,65].includes(code))return [24,'Pluie et vent'];
  if([71,73,75].includes(code))return [47,'Neige et vent'];
 }
 return null;
}
function weatherSymbol(code,day=true,cloud,precip,details){
 if(!finite(code)||!weatherArtwork[code])return null;
 const sky=cloudState(code,cloud,precip);
 let entry=detailedWeather(code,day,cloud,precip,details)?.[0];
 if(!entry){
  if(sky==='covered'||sky==='interval')entry=6;
  else if(sky!=='breaks'&&coveredShowers[code])entry=coveredShowers[code];
  else entry=weatherArtwork[code];
 }
 const number=Array.isArray(entry)?entry[day?0:1]:entry;
 return 'm74-'+String(number).padStart(3,'0');
}
function condition(code,day=true,cloud,precip,details){
 const special=detailedWeather(code,day,cloud,precip,details);
 if(special)return {label:special[1],icon:code>=95?'storm':code>=71?'snow':code>=51?'rain':'cloud'};
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
 current:'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,cloud_cover_low,direct_normal_irradiance,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m',
 hourly:'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,sunshine_duration,visibility,wind_speed_10m,wind_gusts_10m,is_day',
 daily:'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max'});
 return 'https://api.open-meteo.com/v1/forecast?'+q;
}
function date(epoch,zone,opts){if(!finite(epoch))return '—';try{return new Intl.DateTimeFormat('fr-FR',{timeZone:zone||'Europe/Paris',...opts}).format(new Date(epoch*1000));}catch{return '—';}}
const clock=(t,z)=>date(t,z,{hour:'2-digit',minute:'2-digit'});
function hours(data,now=Date.now()/1000){const h=data?.hourly;if(!Array.isArray(h?.time))return [];const floor=Math.floor(now/3600)*3600;return h.time.map((time,i)=>({time,i,temperature:h.temperature_2m?.[i],probability:h.precipitation_probability?.[i],code:h.weather_code?.[i],cloud:h.cloud_cover?.[i],precip:h.precipitation?.[i],details:{cloud_cover_low:h.cloud_cover_low?.[i],lowAllowed:h.lowAllowed?.[i],sunnyBreaks:percentage(h.cloud_cover?.[i])&&h.cloud_cover[i]<85&&hourSunshine(h,i)>=600,wind_speed_10m:h.wind_speed_10m?.[i],wind_gusts_10m:h.wind_gusts_10m?.[i],rain:h.rain?.[i],showers:h.showers?.[i],snowfall:h.snowfall?.[i]},isDay:h.is_day?.[i]!==0})).filter(x=>x.time>=floor&&x.time<floor+24*3600);}
// Sunshine is a total for the preceding hour. Use the value ending the displayed hour.
function hourSunshine(hourly,i){
 const seconds=hourly.sunshine_duration?.[i+1];
 return finite(seconds)&&seconds>=0&&seconds<=3600?seconds:null;
}
function periodClouds(hourly,indices){
 let totalSum=0,lowSum=0,totalCount=0,lowCount=0;
 let lightHours=0,sunHours=0,breakSeconds=0;
 let assessed=0,supported=0,run=0,longest=0,stratusHours=0,previous=-2;
 const compared=[0,0,0],modelSum=[0,0,0],modelCount=[0,0,0];
 for(const i of indices){
  const allowed=hourly.lowAllowed?.[i];
  if(typeof allowed==='boolean'){assessed++;if(allowed)supported++;}
  const mask=hourly.lowModelMask?.[i]||0;
  for(let k=0;k<3;k++){
   if(mask&(1<<k))compared[k]++;
   const cover=hourly.lowByModel?.[k]?.[i];
   if(percentage(cover)){modelSum[k]+=cover;modelCount[k]++;}
  }
  if(hourly.stratusSignal?.[i]){run=i===previous+1?run+1:1;longest=Math.max(longest,run);stratusHours++;}else run=0;
  previous=i;
  const total=hourly.cloud_cover?.[i];
  if(percentage(total)){totalSum+=total;totalCount++;}
  const low=lowCoverage(total,hourly.cloud_cover_low?.[i]);
  if(low!==null){lowSum+=low;lowCount++;}
  if(hourly.is_day?.[i]===1){
   lightHours++;
   const seconds=hourSunshine(hourly,i);
   if(seconds!==null&&percentage(total)){
    sunHours++;
    if(total<85)breakSeconds+=seconds;
   }
  }
 }
 // A lone value in an otherwise missing series cannot describe the period.
 const required=Math.max(1,Math.ceil(2*indices.length/3));
 const sunnyBreaks=lightHours>0&&sunHours>=Math.ceil(2*lightHours/3)
  ?breakSeconds>=Math.max(600,lightHours*300):null;
 const modelMask=compared.reduce((mask,n,k)=>n>=required?mask|(1<<k):mask,0);
 return {total:totalCount>=required?totalSum/totalCount:null,low:lowCount>=required?lowSum/lowCount:null,sunnyBreaks,
  lowAllowed:assessed>=required?supported>assessed/2:null,modelMask,
  modelLow:modelCount.map((n,k)=>n>=required?Math.round(modelSum[k]/n):null),
  stratus:longest>=3&&stratusHours>=required};
}
function daytimeClouds(hourly,indices){
 const daylight=indices.filter(i=>hourly.is_day?.[i]===1);
 return periodClouds(hourly,daylight.length?daylight:indices);
}
function dailyClouds(data,i){
 const h=data.hourly,day=data.daily,indices=[];
 if(h?.time&&finite(day?.time?.[i])){
  const begin=day.time[i],end=day.time[i+1]??begin+86400;
  for(let j=0;j<h.time.length;j++)if(h.time[j]>=begin&&h.time[j]<end)indices.push(j);
 }
 return daytimeClouds(h||{},indices);
}
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
const api={finite,fmt,normalizeSearch,condition,weatherSymbol,validPlace,placeKey,forecastURL,date,clock,hours,dailyCloud,dailyClouds,periodClouds,daytimeClouds,hasLowCloudLayer,validForecast,direction,scale};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MeteoCore=api;
})(typeof window!=='undefined'?window:globalThis);
