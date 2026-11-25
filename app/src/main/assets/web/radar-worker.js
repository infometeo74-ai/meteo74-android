'use strict';
importScripts('vendor/hdf5.js','vendor/proj4.js','swiss-radar.js','france-radar.js','radar-render.js');
const handle=RadarRender.engine((message,transfer=[])=>self.postMessage(message,transfer));
self.onmessage=event=>handle(event.data);
self.postMessage({type:'ready'});
