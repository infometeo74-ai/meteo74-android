/* The shared Météo74 scale. All intensities passed to the painter are in hundredths of mm/h. */
(function(root){
'use strict';
const limit=(n,low,high)=>Math.max(low,Math.min(high,n));
const mix=(a,b,t)=>a+(b-a)*t;
// The map and its legend use the same intensity intervals (mm/h).
const intensityBands=[
    {from:0,  rain:'#60c5e0',snow:'#c6a1ea'},
    {from:.1, rain:'#329fdb',snow:'#b282e1'},
    {from:.3, rain:'#177cc8',snow:'#a166d2'},
    {from:1,  rain:'#079b9d',snow:'#904dc5'},
    {from:2,  rain:'#2a9c58',snow:'#803aad'},
    {from:5,  rain:'#efba2e',snow:'#702e99'},
    {from:10, rain:'#ea7926',snow:'#612281'},
    {from:20, rain:'#d54140',snow:'#521b70'},
    {from:50, rain:'#aa1d50',snow:'#431456'}
];
function palette(kind) {
    const table=new Uint8Array(12001*4);
    const colors=intensityBands.map(band=>[1,3,5].map(start=>parseInt(band[kind].slice(start,start+2),16)));
    table.set(colors[0]); // A genuinely dry sample has zero alpha.
    let band=0;
    for(let i=1;i<=12000;i++){
        const rate=i/100;
        while(band+1<intensityBands.length&&rate>=intensityBands[band+1].from)band++;
        const next=Math.min(band+1,intensityBands.length-1);
        const t=next===band?0:(rate-intensityBands[band].from)/(intensityBands[next].from-intensityBands[band].from);
        // Most of an interval retains its own hue; a short ramp softens the isoline.
        const blend=.12*t+.88*limit((t-.86)/.14,0,1);
        for(let c=0;c<3;c++)table[4*i+c]=Math.round(mix(colors[band][c],colors[next][c],blend));
        table[4*i+3]=Math.round(140+105*Math.min(1,rate/.10));
    }
    return table;
}
const rainColors=palette('rain'),snowColors=palette('snow');

function reflectivityRate(dbz) {
    // Marshall–Palmer Z = 200 R^1.6. Reserve 65535 for missing observations.
    return Math.min(65534,Math.round(100*Math.pow(Math.pow(10,dbz/10)/200,1/1.6)));
}
function paint(rgba,index,rate,snow=false) {
    const colors=snow?snowColors:rainColors;
    const value=limit(rate,0,12000),lo=Math.min(11999,Math.floor(value)),p=4*lo,t=value-lo;
    for(let channel=0;channel<4;channel++)rgba[index+channel]=mix(colors[p+channel],colors[p+4+channel],t);
}
root.RadarColors={intensityBands,reflectivityRate,paint};
if(typeof module==='object'&&module.exports)module.exports=root.RadarColors;
})(globalThis);
