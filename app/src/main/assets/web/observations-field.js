(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ObservationField=api;})(globalThis,function(){
'use strict';
// The terrain and mask share this Web Mercator pixel grid with the Leaflet image overlay.
const grid={width:210,height:182,west:5.77,south:45.65,east:7.08,north:46.44};
const merc=lat=>Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
const northY=merc(grid.north),southY=merc(grid.south);
function atColumn(x){return grid.west+(x+.5)/grid.width*(grid.east-grid.west);}
function atRow(y){return Math.atan(Math.sinh(northY+(y+.5)/grid.height*(southY-northY)))*180/Math.PI;}
const cols=Array.from({length:grid.width},(_,i)=>atColumn(i));
const rows=Array.from({length:grid.height},(_,i)=>atRow(i));
function indexAt(lon,lat){
 const x=Math.floor((lon-grid.west)/(grid.east-grid.west)*grid.width),y=Math.floor((merc(lat)-northY)/(southY-northY)*grid.height);
 return x>=0&&x<grid.width&&y>=0&&y<grid.height?y*grid.width+x:-1;
}
const metrics={
 temp:{label:'Température',unit:'°C',short:'°',icon:'thermometer',radius:27,vertical:550,stops:[-20,-10,-5,0,5,10,15,20,25,30,38],colors:['#604995','#6276c8','#599fda','#8dd9eb','#7ed5bc','#75c77c','#c3d872','#f0cb66','#f39a51','#e46a4c','#a83956'],ticks:[-20,-10,0,10,20,30,38]},
 rain:{label:'Précipitations sur 1 h',brief:'Précipitations',unit:'mm',short:'',icon:'drop',radius:18,vertical:0,stops:[0,.2,1,2,5,10,20,40],colors:['#e6eeef','#b7e5e6','#78d0d8','#3eadd0','#3a80c6','#5e5cbd','#9146a6','#c33578'],ticks:[0,1,2,5,10,20,40]},
 wind:{label:'Vent moyen',unit:'km/h',short:'',icon:'wind',radius:19,vertical:500,stops:[0,5,15,30,45,60,85,120],colors:['#d5e8e2','#acdcd3','#61c5ba','#66ad79','#debe66','#e29148','#c45261','#844c94'],ticks:[0,15,30,45,60,85,120]},
 gust:{label:'Rafales',unit:'km/h',short:'',icon:'wind',radius:19,vertical:500,stops:[0,10,25,45,65,90,120,160],colors:['#d5e8e2','#aadbd5','#63c3b4','#8fba78','#eac466','#e18d50','#b94f73','#72468b'],ticks:[0,25,45,65,90,120,160]},
 humidity:{label:'Humidité',unit:'%',short:'',icon:'drop',radius:22,vertical:750,stops:[0,20,40,60,80,100],colors:['#e4bd7c','#dfcb92','#c1d9af','#8bcab9','#57aaba','#4078a3'],ticks:[0,20,40,60,80,100]},
 pressure:{label:'Pression au niveau de la mer',brief:'Pression',unit:'hPa',short:'',icon:'pressure',radius:16,vertical:0,stops:[970,985,1000,1015,1030,1045],colors:['#8264ae','#7083c0','#73baca','#a6cdb0','#e2ce81','#d69060'],ticks:[970,985,1000,1015,1030,1045]},
 snow:{label:'Neige au sol',unit:'cm',short:'',icon:'mountain',radius:10,vertical:150,stops:[0,1,5,10,25,50,100,150,200,250,300],colors:['#f2f5f1','#d7f6fa','#a4e3ef','#69cadd','#379bc9','#286cba','#6556af','#894b91','#a03470','#aa2851','#791935'],ticks:[0,10,25,50,100,200,300]}
};
Object.assign(metrics,{
 minTemp:{...metrics.temp,label:'Température minimale',brief:'T° mini'},
 maxTemp:{...metrics.temp,label:'Température maximale',brief:'T° maxi'},
 rainDay:{...metrics.rain,label:'Précipitations sur 24 h',brief:'Pluie 24 h',stops:[0,1,5,10,20,40,70,120],ticks:[0,5,10,20,40,70,120]},
 windDay:{...metrics.wind,label:'Vent moyen quotidien',brief:'Vent moyen'},
 gustDay:{...metrics.gust,label:'Rafale maximale du jour',brief:'Rafale maxi'},
 reportTemp:{...metrics.temp,label:'Température au relevé de neige',brief:'T° au relevé'}
});
for(const m of Object.values(metrics))m.rgb=m.colors.map(c=>[1,3,5].map(i=>parseInt(c.slice(i,i+2),16)));
function rgb(metric,v){
 const {stops,rgb:colors}=metrics[metric];
 if(v<=stops[0])return colors[0];
 for(let i=1;i<stops.length;i++)if(v<=stops[i]){
  const f=(v-stops[i-1])/(stops[i]-stops[i-1]);return colors[i].map((c,j)=>Math.round(colors[i-1][j]+(c-colors[i-1][j])*f));
 }
 return colors.at(-1);
}
function terrain(bytes){
 if(bytes.byteLength!==grid.width*grid.height*2)throw Error('Relief incomplet');
 const view=new DataView(bytes);return Uint16Array.from({length:bytes.byteLength/2},(_,i)=>view.getUint16(i*2,true));
}
function interpolate(metric,records,dem,overrideRadius){
 const {vertical}=metrics[metric],radius=overrideRadius||metrics[metric].radius,out=new Float32Array(dem.length).fill(NaN),confidence=new Uint8Array(dem.length);
 const sites=records.filter(s=>Number.isFinite(s.values?.[metric])).map(s=>{
  const k=indexAt(s.lon,s.lat);return {lon:s.lon,lat:s.lat,z:Number.isFinite(s.alt)?s.alt:k>=0?dem[k]&32767:null,v:s.values[metric]};
 });
 const limit=radius*radius;
 for(let y=0;y<grid.height;y++){
  const lat=rows[y],near=sites.map(s=>({s,dy2:((lat-s.lat)*111.2)**2})).filter(p=>p.dy2<limit);
  for(let x=0;x<grid.width;x++){
   const i=y*grid.width+x;if(!(dem[i]&32768))continue;
   const h=dem[i]&32767,lon=cols[x];let weighted=0,total=0,closest=1;
   for(const {s,dy2} of near){
    const d2=dy2+((lon-s.lon)*77.25)**2;
    if(d2>=limit)continue;
    // A ridge and a valley can be very close on a map. Limit their mutual influence.
    const dz=vertical&&s.z!==null?Math.max(0,Math.abs(h-s.z)-(metric==='snow'?40:130))/vertical:0;
    const distance=Math.sqrt(d2/limit+dz*dz);
    if(distance>=1)continue;
    const w=(1-distance)**2/(.8+d2+(dz*radius)**2);
    weighted+=w*s.v;total+=w;closest=Math.min(closest,distance);
   }
   if(total>0){out[i]=weighted/total;confidence[i]=Math.round(206*Math.min(1,(1-closest)/.4));}
  }
 }
 return {values:out,confidence};
}
function modelSurface(metric,frame,dem){
 const data=frame?.values?.[metric],elev=metric==='snow'?frame?.snowElevation:frame?.elevation;
 if(!data||data.length!==frame.nx*frame.ny||elev?.length!==data.length||!data.some(Number.isFinite))return null;
 const {nx,ny,west,east,south,north}=frame;
 const slopes=new Float32Array(data.length);
 if(metric==='temp'){
  for(let i=0;i<data.length;i++){
   const cx=i%nx,cy=Math.floor(i/nx);let n=0,z=0,t=0,zz=0,zt=0;
   for(let y=Math.max(0,cy-1);y<=Math.min(ny-1,cy+1);y++)for(let x=Math.max(0,cx-1);x<=Math.min(nx-1,cx+1);x++){
    const k=y*nx+x,h=elev[k],v=data[k];if(!Number.isFinite(h)||!Number.isFinite(v))continue;
    n++;z+=h;t+=v;zz+=h*h;zt+=h*v;
   }
   // Shrink poorly constrained local gradients towards a moderate lapse rate.
   const prior=60000;
   slopes[i]=Math.max(-.009,Math.min(.006,(zt-z*t/Math.max(1,n)-.005*prior)/(Math.max(0,zz-z*z/Math.max(1,n))+prior)));
  }
 }
 // Index supplemental valley model cells into the same neighbourhoods as the main grid.
 const valleyBins=new Map();
 if(metric==='snow')for(const entry of frame.snowValleys||[]){
  if(!Array.isArray(entry)||entry.length!==4||!entry.every(Number.isFinite))continue;
  const [lat,lon,z,cm]=entry;
  const x=Math.floor((lon-west)*(nx-1)/(east-west)),y=Math.floor((lat-south)*(ny-1)/(north-south));
  const key=y*nx+x;
  if(!valleyBins.has(key))valleyBins.set(key,[]);
  valleyBins.get(key).push({lat,lon,z,cm});
 }
 function at(lon,lat,height){
  const gx=(lon-west)*(nx-1)/(east-west),gy=(lat-south)*(ny-1)/(north-south);
  if(gx<0||gy<0||gx>nx-1||gy>ny-1)return NaN;
  const x=Math.min(nx-2,Math.floor(gx)),y=Math.min(ny-2,Math.floor(gy)),dx=gx-x,dy=gy-y;
  let sum=0,total=0;
  if(metric==='snow'){
   // Estimate snow presence first. Averaging depth across dry ground and snowy
   // ridges leaves an artificial dusting even when every valley cell is bare.
   let dryWeight=0,wetWeight=0;
   function sample(ylat,xlon,z,cm){
    if(!Number.isFinite(z)||!Number.isFinite(cm)||cm<0)return;
    const distance2=((lat-ylat)*111.2)**2+((lon-xlon)*77.25)**2;
    const heightDiff=Math.abs(height-z);
    const w=1/((2+distance2)*(1+(heightDiff/110)**2)**2);
    if(cm<1)dryWeight+=w;else{wetWeight+=w;sum+=cm*w;}
   }
   for(let sy=Math.max(0,y-1);sy<=Math.min(ny-1,y+2);sy++)for(let sx=Math.max(0,x-1);sx<=Math.min(nx-1,x+2);sx++){
    const k=sy*nx+sx;
    sample(south+sy*(north-south)/(ny-1),west+sx*(east-west)/(nx-1),elev[k],data[k]);
    for(const v of valleyBins.get(k)||[])sample(v.lat,v.lon,v.z,v.cm);
   }
   if(!dryWeight&&!wetWeight)return NaN;
   const cover=wetWeight/(wetWeight+dryWeight);
   if(cover<=.50)return 0;
   return sum/wetWeight*Math.min(1,(cover-.50)/.40);

  }
  for(let j=0;j<2;j++)for(let i=0;i<2;i++){
   const k=(y+j)*nx+x+i,w=(i?dx:1-dx)*(j?dy:1-dy);
   if(!Number.isFinite(data[k])||w<=0)continue;
   const adjust=metric==='temp'&&Number.isFinite(height)&&Number.isFinite(elev[k])?Math.max(-10,Math.min(10,(height-elev[k])*slopes[k])):0;
   sum+=w*(data[k]+adjust);total+=w;
  }
  return total?sum/total:NaN;
 }
 const values=new Float32Array(dem.length).fill(NaN);
 for(let y=0;y<grid.height;y++)for(let x=0;x<grid.width;x++){
  const k=y*grid.width+x;if(dem[k]&32768)values[k]=at(cols[x],rows[y],dem[k]&32767);
 }
 return {values,at};
}
function analyze(metric,dem,stations,frame,accumulation){
 const model=modelSurface(metric,frame,dem),radar=metric==='rain'?accumulation:null;
 if(!model&&!radar){
  const field=interpolate(metric,stations,dem);
  return {...field,used:stations.length,resorts:stations.filter(s=>s.bulletinDay).length,model:false,radar:false};
 }
 const base=model?model.values.slice():new Float32Array(dem.length).fill(NaN);
 if(radar)for(let i=0;i<base.length;i++)if((dem[i]&32768)&&Number.isFinite(radar.values[i]))base[i]=radar.values[i];
 const residuals=[];
 for(const s of stations){
  const k=indexAt(s.lon,s.lat);
  if(k<0||!Number.isFinite(s.values[metric]))continue;
  const radarHere=radar&&Number.isFinite(radar.values[k]);
  if(!radarHere&&!model)continue;
  let dt=Math.abs(s.time-(radarHere?radar.time:frame.time))/60000;
  if(metric==='snow'&&s.bulletinDay){
   const mapDay=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(frame.time);
   const days=(Date.parse(mapDay)-Date.parse(s.bulletinDay))/86400000;
   if(days<0||days>1)continue;
   dt=days*1440;
  }
  const window=metric==='snow'?2160:radarHere?20:metric==='rain'?40:90;
  if(dt>window)continue;
  const z=Number.isFinite(s.alt)?s.alt:dem[k]&32767;
  const reference=radarHere?radar.values[k]:model?.at(s.lon,s.lat,z);
  if(!Number.isFinite(reference))continue;
  const value=metric==='snow'?s.values.snow:(s.values[metric]-reference)*(1-.35*dt/window);
  residuals.push({...s,values:{[metric]:value}});
 }
 if(residuals.length){
  const corrections=interpolate(metric,residuals,dem,radar?9:undefined);
  for(let i=0;i<base.length;i++)if(Number.isFinite(base[i])&&Number.isFinite(corrections.values[i])){
   const influence=corrections.confidence[i]/206;
   let v=metric==='snow'?base[i]*(1-influence)+corrections.values[i]*influence:base[i]+corrections.values[i]*influence;
   if(['snow','rain','wind','gust','humidity'].includes(metric))v=Math.max(0,v);
   base[i]=metric==='humidity'?Math.min(100,v):v;
  }
 }
 return {values:base,confidence:null,used:residuals.length,resorts:residuals.filter(s=>s.bulletinDay).length,model:!!model,radar:!!radar};
}
function sampleRain(frame,read,dem){
 const values=new Float32Array(dem.length).fill(NaN);
 for(let y=0;y<grid.height;y++)for(let x=0;x<grid.width;x++){
  const i=y*grid.width+x;if(!(dem[i]&32768))continue;
  const mm=read(frame,cols[x],rows[y]);if(Number.isFinite(mm)&&mm>=0)values[i]=mm;
 }
 return values;
}
return {grid,metrics,cols,rows,indexAt,rgb,terrain,interpolate,sampleRain,analyze};
});
