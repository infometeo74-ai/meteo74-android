const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=path.join(__dirname,'../app/src/main/assets/web');
const R=require(path.join(web,'swiss-radar.js'));
const hdf5=Function(fs.readFileSync(path.join(web,'vendor/hdf5.js'),'utf8')+';return hdf5;')();
const proj4=require(path.join(web,'vendor/proj4.js'));
const bytes=fs.readFileSync(path.join(__dirname,'fixtures/rzc263290735vl.001.h5'));
const frame=R.decode(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),hdf5,proj4);
test('RZC timestamp is UTC, including leap years and year boundaries',()=>{
 assert.equal(R.timestamp('rzc263290735vl.001.h5'),Date.UTC(2026,10,25,7,35)/1000);
 assert.equal(R.timestamp('rzc243660005vl.001.h5'),Date.UTC(2024,11,31,0,5)/1000);
 assert.equal(R.timestamp('rzc253660005vl.001.h5'),null);
 assert.equal(R.timestamp('rzc263292500vl.001.h5'),null);
 assert.equal(R.timestamp('tzc263290735vl.001.h5'),null);
});
test('STAC selection keeps only official RZC, spans midnight and excludes future files',()=>{
 const assets={};for(const name of ['rzc263282355vl.001.h5','rzc263290000vl.001.h5','rzc263290005vl.001.h5','rzc263290200vl.001.h5','tzc263290005vl.001.h5'])assets[name]={href:'https://data.geo.admin.ch/ch.meteoschweiz.ogd-radar-precip/day/'+name};
 assets['rzc263290010vl.001.h5']={href:'https://example.com/other.h5'};
 const selected=R.framesFromItems([{assets}],Date.UTC(2026,10,25,0,12)/1000);
 assert.equal(selected.length,3);assert.equal(new Date(selected[0].time*1000).toISOString(),'2026-11-24T23:55:00.000Z');
});
test('HDF5 decoding agrees with independent h5py reference values and missing-data count',()=>{
 assert.equal(frame.values.length,454400);assert.equal(frame.values.filter(Number.isFinite).length,352861);
 for(const [row,col,value] of [[370,254,.28],[380,254,.24],[344,192,.02],[400,260,.44],[200,300,.39]])assert.ok(Math.abs(frame.values[row*710+col]-value)<1e-6);
 assert.ok(Number.isNaN(frame.values[0]));assert.equal(frame.x0,2255000);assert.equal(frame.y0,1480000);
});
test('Swiss grid registration uses north-to-south rows and 1 km cells',()=>{
 assert.equal(R.cell(frame,6.268,46.134),370*710+254);
 assert.ok(Math.abs(R.valueAt(frame,6.268,46.134)-.28)<1e-6);
 assert.ok(Number.isNaN(R.valueAt(frame,-2,53)));
 const lonlat=frame.projection.inverse([2255500,1479500]);assert.equal(R.cell(frame,...lonlat),0);
 const last=frame.projection.inverse([2964500,840500]);assert.equal(R.cell(frame,...last),454399);
});
const S=require(path.join(web,'radar-render.js'));
test('Interpolation smooths an observed front and preserves missing cells and dry observations',()=>{
 const data={width:2,values:Uint16Array.from([0,100,0,100])};
 for(const [x,expected] of [[0,0],[.25,25],[.5,50],[.75,75],[1,100]])assert.equal(S.sampledRate(data,{index:[0],fx:[x],fy:[.5]},0),expected);
 data.values[1]=65535;assert.equal(S.sampledRate(data,{index:[0],fx:[.8],fy:[0]},0),-1);
 assert.equal(S.sampledRate(data,{index:[-1],fx:[0],fy:[0]},0),-1);
});
test('Snowline follows the location and observation time and keeps unavailable data unknown',()=>{
 const row={hourly:{time:[3600,7200],snowfall_height:[950,1250]}};
 assert.equal(S.clockSample(row,5400),1100);assert.ok(Number.isNaN(S.clockSample(row,8000)));
 assert.ok(Number.isNaN(S.clockSample({hourly:{time:[3600,7200],snowfall_height:[null,1250]}},5400)));
 const grid={west:6,south:46,nx:2,ny:2,step:.25};assert.equal(S.modelAt([900,1100,1000,1200],grid,6.125,46.125),1050);
});
test('Projection follows the actual viewport in France, Switzerland and Italy at high zoom',()=>{
 for(const [lon,lat] of [[6.63,45.93],[7.45,46.95],[7.69,45.07]]){
   const z=14,scale=256*2**z,left=(lon+180)/360*scale-143,top=(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*scale-121;
   const v={w:143,h:121,cssW:286,cssH:242,left,top,z},g=S.gridCoordinates(frame,v),i=60*v.w+71;
   const label=frame.projection.forward([lon,lat]),gx=Math.floor(g.index[i]%frame.width)+g.fx[i],gy=Math.floor(g.index[i]/frame.width)+g.fy[i];
   assert.ok(Math.abs(gx-(label[0]-frame.x0)/frame.dx+.5)<.01);assert.ok(Math.abs(gy-(frame.y0-label[1])/frame.dy+.5)<.01);
 }
});

test('A continental viewport keeps model samples over the actual precipitation radar footprint',()=>{
 const area=S.coverageBounds(frame),z=4,scale=256*2**z;
 const v={z,left:(6+180)/360*scale-260,top:(1-Math.asinh(Math.tan(46*Math.PI/180))/Math.PI)/2*scale-220,cssW:520,cssH:440};
 const grid=S.modelGrid(v,area);assert.ok(grid.west<=6&&grid.west+grid.step*(grid.nx-1)>=7);assert.ok(grid.nodes.length<50);
 assert.ok(grid.nodes.every(n=>n.lon>=area.west-grid.step&&n.lon<=area.east+grid.step));assert.ok(Number.isNaN(S.modelAt(grid.nodes.map(()=>1500),grid,-42,46)));
});
