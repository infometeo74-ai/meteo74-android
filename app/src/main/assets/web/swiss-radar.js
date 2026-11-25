/* Radar RZC de MétéoSuisse (CC BY). Projection et couleurs propres à Météo74. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SwissRadar=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const COLLECTION='https://data.geo.admin.ch/api/stac/v1/collections/ch.meteoschweiz.ogd-radar-precip';
const clean=s=>String(s??'').replace(/\\x00/g,'').replace(/\0/g,'');
function timestamp(name){
 const m=/^rzc(\d{2})(\d{3})(\d{2})(\d{2})[a-z0-9]*\.[a-z0-9]+\.h5$/i.exec(name);
 if(!m||+m[2]<1||+m[2]>366||+m[3]>23||+m[4]>59)return null;
 const year=2000+Number(m[1]),ms=Date.UTC(year,0,Number(m[2]),Number(m[3]),Number(m[4]));
 return new Date(ms).getUTCFullYear()===year?ms/1000:null;
}
function framesFromItems(items,now=Date.now()/1000){
 const found=new Map();
 for(const item of items)for(const [name,asset] of Object.entries(item?.assets||{})){
  const time=timestamp(name);if(time===null||time>now+60||time<now-24*3600)continue;
  let url;try{url=new URL(asset.href);}catch{continue;}
  if(url.protocol!=='https:'||url.hostname!=='data.geo.admin.ch'||!url.pathname.startsWith('/ch.meteoschweiz.ogd-radar-precip/'))continue;
  found.set(time,{time,url:url.href});
 }
 const all=[...found.values()].sort((a,b)=>a.time-b.time),latest=all.at(-1)?.time;
 return all.filter(f=>f.time>=latest-2*3600).slice(-25);
}
async function loadFrames(fetchJSON,signal){
 const now=Date.now(),day=ms=>new Date(ms).toISOString().slice(0,10).replaceAll('-','');
 const today=await fetchJSON(COLLECTION+'/items/'+day(now)+'-ch',signal,25000).catch(e=>{if(signal?.aborted)throw e;return null;});
 let items=[today];
 if(new Date(now).getUTCHours()<3||!framesFromItems(items).length){
  try {items.push(await fetchJSON(COLLECTION+'/items/'+day(now-86400000)+'-ch',signal,25000));}
  catch(error){if(signal?.aborted||!framesFromItems(items).length)throw error;}
 }
 const frames=framesFromItems(items);if(!frames.length)throw Error('Aucune image suisse disponible');return frames;
}
function decode(buffer,hdf5,proj4){
 const f=new hdf5.File(buffer),where=f.get('where').attrs,what=f.get('dataset1/data1/what').attrs;
 const dataset=f.get('dataset1/data1/data'),shape=dataset.shape;
 const width=Number(where.xsize),height=Number(where.ysize),dx=Number(where.xscale),dy=Number(where.yscale);
 if(clean(what.quantity)!=='RATE'||clean(what.unit)!=='mm/h'||shape[0]!==height||shape[1]!==width||width*height>2000000||width<1||height<1||dx<=0||dy<=0)throw Error('Format radar non reconnu');
 const projection=proj4('EPSG:4326',clean(where.projdef));
 const ul=projection.forward([where.UL_lon,where.UL_lat]),lr=projection.forward([where.LR_lon,where.LR_lat]);
 // The ODIM corner coordinates are rounded WGS84 values (a few metres).
 // The Swiss grid is anchored to whole kilometre coordinates in LV95.
 const x0=Math.round(ul[0]/dx)*dx,y0=Math.round(ul[1]/dy)*dy;
 if(Math.abs(lr[0]-(x0+width*dx))>dx/20||Math.abs(lr[1]-(y0-height*dy))>dy/20)throw Error('Projection radar incohérente');
 const raw=dataset.value,values=new Float32Array(raw.length),gain=Number(what.gain),offset=Number(what.offset);
 if(!Number.isFinite(gain)||!Number.isFinite(offset))throw Error('Échelle radar invalide');
 for(let i=0;i<raw.length;i++)values[i]=!Number.isFinite(raw[i])||raw[i]===what.nodata?NaN:raw[i]===what.undetect?0:raw[i]*gain+offset;
 return {width,height,dx,dy,x0,y0,projection,values,key:[width,height,dx,dy,x0,y0,clean(where.projdef)].join('|')};
}
function cell(frame,longitude,latitude){const [e,n]=frame.projection.forward([longitude,latitude]);const col=Math.floor((e-frame.x0)/frame.dx),row=Math.floor((frame.y0-n)/frame.dy);return col<0||row<0||col>=frame.width||row>=frame.height?-1:row*frame.width+col;}
function valueAt(frame,longitude,latitude){const i=cell(frame,longitude,latitude);return i<0?NaN:frame.values[i];}
return {timestamp,framesFromItems,loadFrames,decode,cell,valueAt};
});
