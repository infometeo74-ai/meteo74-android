const test=require('node:test');
const assert=require('node:assert/strict');
const radar=require('../app/src/main/assets/web/france-radar.js');
const proj4=require('../app/src/main/assets/web/vendor/proj4.js');
const render=require('../app/src/main/assets/web/radar-render.js');

test('France accepts only real five-minute timestamps from its catalog',async()=>{
    const now=Math.floor(Date.now()/300000)*300;
    const values=[now,now-300,now-300,now+900,now-86400,now-1,'bad'];
    const frames=await radar.loadFrames(async()=>({times:values}));
    assert.deepEqual(frames.map(f=>f.time),[now-300,now]);
    assert.ok(frames.every(f=>new URL(f.url).hostname==='bepcgggpdtxwaifiyrah.supabase.co'));
});
test('France decodes georeferenced reflectivity and distinguishes dry from missing',()=>{
    const b=new ArrayBuffer(20),h=new DataView(b);
    h.setUint32(0,0x4d373446);
    [2,2,1649,3080].forEach((v,i)=>h.setUint16(4+i*2,v,true));
    new Uint8Array(b,16).set([0,255,105,89]);
    const d=radar.decode(b,proj4);
    assert.equal(d.x0,1649000);assert.equal(d.y0,-3080000);
    const at=(fx,fy)=>render.sampledRate(d,{index:[0],fx:[fx],fy:[fy]},0);
    assert.equal(at(0,0),0);assert.equal(at(1,0),-1);
    assert.equal(radar.dbz(d.values[2]),20);
    assert.equal(at(0,1),65); // 20 dBZ yields 0.65 mm/h before interpolation.
    assert.throws(()=>radar.decode(b.slice(0,19),proj4));
});
