'use strict';
importScripts('vendor/hdf5.js','vendor/proj4.js','swiss-radar.js','observations-field.js');
onmessage=event=>{
 try{
  const {bytes,terrain}=event.data;
  const frame=SwissRadar.decode(bytes,hdf5,proj4,'CPC');
  const values=ObservationField.sampleRain(frame,SwissRadar.valueAt,new Uint16Array(terrain));
  postMessage({values:values.buffer},[values.buffer]);
 }catch{postMessage({error:'Cumul de pluie illisible'});}
};
