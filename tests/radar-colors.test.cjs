const test=require('node:test');
const assert=require('node:assert/strict');
const colors=require('../app/src/main/assets/web/radar-colors.js');
const europe=require('../app/src/main/assets/web/europe-radar.js');
const france=require('../app/src/main/assets/web/france-radar.js');
const renderer=require('../app/src/main/assets/web/radar-render.js');
const proj4=require('../app/src/main/assets/web/vendor/proj4.js');

function franceGrid(raw){
    const buffer=new ArrayBuffer(20),header=new DataView(buffer);
    header.setUint32(0,0x4d373446);
    header.setUint16(4,2,true);header.setUint16(6,2,true);
    new Uint8Array(buffer,16).set(raw);
    return france.decode(buffer,proj4);
}
function color(rate,neige){
    const rgba=new Uint8ClampedArray(4);
    colors.paint(rgba,0,rate,neige);
    return [...rgba];
}
test('the historic Swiss rain and snow colours and the nine legend thresholds stay in sync',()=>{
    const thresholds=[0,.1,.3,1,2,5,10,20,50];
    assert.deepEqual(colors.intensityBands.map(b=>b.from),thresholds);
    for(const [i,band] of colors.intensityBands.entries()){
        for(const snow of [false,true]){
            const rgb=color(100*band.from,snow);
            assert.equal('#'+Buffer.from(rgb.slice(0,3)).toString('hex'),band[snow?'snow':'rain']);
            assert.equal(rgb[3],i===0?0:245);
        }
    }
    assert.deepEqual(color(50000,false),color(5000,false));
});
test('a French echo and both European phases match a Swiss rate pixel for pixel',()=>{
    const examples=[
        // dBZ, independently rounded hundredths of mm/h, provider RGBA rain/snow.
        [10,15,'cec08796','bfffffff'],[20,65,'00a3e0ff','7fbfffff'],
        [30,273,'005588ff','4f8fffff'],[40,1153,'ffaa00ff','2f6fffff'],
        [50,4862,'c10000ff','0f4fffff']
    ];
    for(const [dbz,rate,rain,snow] of examples){
        const encoded=1+2*(dbz+32);
        const data=franceGrid([encoded,encoded,encoded,encoded]);
        const fr=renderer.sampledRate(data,{index:[0],fx:[.2],fy:[.7]},0);
        assert.equal(fr,rate);
        for(const [hex,frozen] of [[rain,false],[snow,true]]){
            const code=europe.decode(Buffer.from(hex,'hex')).values[0];
            assert.equal(!!(code&europe.snowFlag),frozen);
            assert.equal(europe.rates[code],rate);
            assert.deepEqual(color(europe.rates[code],frozen),color(fr,frozen));
        }
    }
});
test('interpolation uses intensity rather than reflectivity or display colours',()=>{
    const d=franceGrid([0,145,0,145]); // dry beside a 40 dBZ cell
    assert.equal(renderer.sampledRate(d,{index:[0],fx:[.5],fy:[.5]},0),1153/2);
});
test('European decoding handles canvas alpha rounding, transparency, undocumented phases and saturation',()=>{
    const decode=rgba=>europe.decode(Uint8Array.from(rgba));
    assert.equal(decode([0,0,0,0]).values[0],0);
    assert.equal(decode([255,156,185,255]).hasUnknown,true);
    const source=[146,136,113,100];
    const rounded=source.map((c,i)=>i===3?c:Math.round(255*Math.round(c*source[3]/255)/source[3]));
    assert.equal(decode(rounded).values[0],decode(source).values[0]);
    assert.equal(europe.rates[decode(source).values[0]],7);
    assert.deepEqual(color(europe.rates[decode([255,255,255,255]).values[0]],false),color(5000,false));
});
