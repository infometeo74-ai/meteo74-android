/* Decode RainViewer's published Universal Blue RGBA codes before any map resampling.
   https://www.rainviewer.com/files/rainviewer_api_colors_table.csv */
(function(root){
'use strict';
const colors=root.RadarColors||require('./radar-colors.js');
const unknown=127, snowFlag=128;
const rain=`
    63615914 66635a19 69665c1e 6c685d24 6f6b5f29 726e612e 75706234 78736439
    7c75653e 7f786744 827b6949 857d6a4e 88806c54 8b826d59 8e856f5e 92887164
    9e93756e aa9e7978 b6a97e82 c2b4828c cec08796 d2c48ba0 d6c88faa dacc93b4
    ded097be 88ddeeff 6cd1ebff 51c5e8ff 36bae5ff 1baee2ff 00a3e0ff 009ad5ff
    0091caff 0088bfff 007fb4ff 0077aaff 0070a3ff 00699cff 006295ff 005b8eff
    005588ff 005180ff 004e78ff 004a70ff 004768ff ffee00ff ffe000ff ffd200ff
    ffc500ff ffb700ff ffaa00ff ff9f00ff ff9500ff ff8b00ff ff8100ff ff4400ff
    f23600ff e62800ff d91b00ff cd0d00ff c10000ff a80000ff 8f0000ff 760000ff
    5d0000ff ffaaffff ff9fffff ff95ffff ff8bffff ff81ffff ff77ffff ff6cffff
    ff62ffff ff58ffff ff4effff ffffffff ffffffff ffffffff ffffffff ffffffff
    ffffffff ffffffff ffffffff ffffffff ffffffff 00ff00ff
`.trim().split(/\s+/);
const snow=`
    cfffff00 ceffff0c cdffff19 ccffff26 cbffff33 cbffff3f caffff4c c9ffff59
    c8ffff66 c7ffff72 c7ffff7f c6ffff8c c5ffff99 c4ffffa5 c3ffffb2 c3ffffbf
    c2ffffcc c1ffffd8 c0ffffe5 bffffff2 bfffffff b8f8ffff b2f2ffff abebffff
    a5e5ffff 9fdfffff 98d8ffff 92d2ffff 8bcbffff 85c5ffff 7fbfffff 78b8ffff
    72b2ffff 6babffff 65a5ffff 5f9fffff 5b9bffff 5898ffff 5595ffff 5292ffff
    4f8fffff 4b8bffff 4888ffff 4585ffff 4282ffff 3f7fffff 3b7bffff 3878ffff
    3575ffff 3272ffff 2f6fffff 2b6bffff 2868ffff 2565ffff 2262ffff 1f5fffff
    1b5bffff 1858ffff 1555ffff 1252ffff 0f4fffff 0c4bffff 0948ffff 0645ffff
    0242ffff 003fffff 003bffff 0038ffff 0035ffff 0032ffff 002fffff 002bffff
    0028ffff 0025ffff 0022ffff 001fffff 001bffff 0018ffff 0015ffff 0012ffff
    000fffff 000cffff 0009ffff 0006ffff 0002ffff 0000ffff
`.trim().split(/\s+/);
const rates=new Uint16Array(256);
const codes=new Map(),byAlpha=new Map();
function packed(r,g,b,a){return ((a*256+r)*256+g)*256+b;}
for(const [scheme,flag] of [[rain,0],[snow,snowFlag]]){
    for(let i=0;i<scheme.length;i++){
        const hex=scheme[i],dbz=i-10,code=i+1+flag;
        const [r,g,b,a]=[0,2,4,6].map(k=>parseInt(hex.slice(k,k+2),16));
        rates[code]=colors.reflectivityRate(dbz);
        const key=packed(r,g,b,a);
        if(!a||codes.has(key))continue; // Transparent, or already in the saturated top band.
        codes.set(key,code);
        if(a<255){
            if(!byAlpha.has(a))byAlpha.set(a,[]);
            byAlpha.get(a).push([r,g,b,code]);
        }
    }
}
function pixelCode(r,g,b,a){
    if(!a)return 0;
    const key=packed(r,g,b,a),exact=codes.get(key);
    if(exact!==undefined)return exact;
    // Android canvases round RGB through premultiplied alpha. Compare in that space
    // only among published colours with exactly this opacity. Other phases stay unknown.
    const candidates=byAlpha.get(a);
    if(candidates){
        for(const [cr,cg,cb,code] of candidates){
            if(Math.max(Math.abs(r-cr),Math.abs(g-cg),Math.abs(b-cb))*a/255<=1.05){
                codes.set(key,code);
                return code;
            }
        }
    }
    return unknown;
}
function decode(rgba){
    const values=new Uint8Array(rgba.length/4);
    let hasUnknown=false;
    for(let i=0;i<values.length;i++){
        const k=4*i,code=pixelCode(rgba[k],rgba[k+1],rgba[k+2],rgba[k+3]);
        values[i]=code;
        if(code===unknown)hasUnknown=true;
    }
    return {values,hasUnknown};
}
root.EuropeRadar={decode,rates,snowFlag,unknown};
if(typeof module==='object'&&module.exports)module.exports=root.EuropeRadar;
})(globalThis);
