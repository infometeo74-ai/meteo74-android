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
 snow:{label:'Neige au sol',unit:'cm',short:'',icon:'mountain',radius:15,vertical:350,stops:[0,2,10,25,50,100,200],colors:['#e5edef','#c4e2ed','#89ccde','#63acd0','#728ac7','#805da7','#673c88'],ticks:[0,10,25,50,100,200]}
};
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
function interpolate(metric,records,dem){
 const {radius,vertical}=metrics[metric],out=new Float32Array(dem.length).fill(NaN),confidence=new Uint8Array(dem.length);
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
    const dz=vertical&&s.z!==null?Math.max(0,Math.abs(h-s.z)-130)/vertical:0;
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
function sampleRain(frame,read,dem){
 const values=new Float32Array(dem.length).fill(NaN);
 for(let y=0;y<grid.height;y++)for(let x=0;x<grid.width;x++){
  const i=y*grid.width+x;if(!(dem[i]&32768))continue;
  const mm=read(frame,cols[x],rows[y]);if(Number.isFinite(mm)&&mm>=0)values[i]=mm;
 }
 return values;
}
return {grid,metrics,cols,rows,indexAt,rgb,terrain,interpolate,sampleRain};
});
