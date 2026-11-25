/* Open 1 km OPERA reflectivity observations produced by Météo-France / EUMETNET. */
(function(root){
'use strict';
const service='https://bepcgggpdtxwaifiyrah.supabase.co/functions/v1/meteo74-radar-france';
// Public anonymous key of this app's independent Supabase project.
const anon='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcGNnZ2dwZHR4d2FpZml5cmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1OTg5NTksImV4cCI6MjExMTE3NDk1OX0.qRCXb7lLdpZT6seIgmQ7jTRCgaPirbHSorYvrxnebwk';
const colors=root.RadarColors||require('./radar-colors.js');
const dbz=code=>(code-1)/2-32;
const rateTable=new Uint16Array(256);
for(let code=1;code<255;code++)rateTable[code]=colors.reflectivityRate(dbz(code));
const headers={apikey:anon,Authorization:'Bearer '+anon};
const projection='+proj=laea +lat_0=55 +lon_0=10 +x_0=1950000 +y_0=-2100000 +units=m +ellps=WGS84';
async function loadFrames(fetchJSON,signal){
    const {times}=await fetchJSON(service+'/frames',signal,22000,headers);
    const now=Date.now()/1000;
    if(!Array.isArray(times))throw Error('Catalogue radar indisponible');
    return [...new Set(times)].filter(t=>Number.isInteger(t)&&t%300===0&&t<=now+60&&t>=now-10800)
        .sort((a,b)=>a-b).slice(-25).map(time=>({time,url:service+'/'+time+'.bin'}));
}
function decode(buffer,proj4){
    const h=new DataView(buffer);
    if(h.getUint32(0)!==0x4d373446)throw Error('Grille France invalide');
    const width=h.getUint16(4,true),height=h.getUint16(6,true),col=h.getUint16(8,true),row=h.getUint16(10,true);
    if(width<2||height<2||buffer.byteLength!==16+width*height||col+width>3800||row+height>4400)throw Error('Grille France incomplète');
    return {width,height,dx:1000,dy:1000,rateTable,x0:col*1000,y0:-row*1000,missing:255,
        key:['fr',col,row,width,height].join('/'),projection:proj4('EPSG:4326',projection),values:new Uint8Array(buffer,16)};
}
root.FranceRadar={loadFrames,decode,dbz,headers};
if(typeof module==='object'&&module.exports)module.exports=root.FranceRadar;
})(typeof globalThis!=='undefined'?globalThis:this);
