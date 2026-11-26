const test = require('node:test');
const assert = require('node:assert/strict');
const {interval, bufferSufficient, createPainter, fadeFraction} = require('../app/src/main/assets/web/radar-playback.js');

test('only consecutive observations dissolve; the last observation holds before the loop', () => {
    assert.deepEqual(interval(300, 300, false), {connected: true, duration: 820});
    assert.deepEqual(interval(600, 600, false), {connected: true, duration: 1640});
    assert.equal(interval(600, 300, false).connected, false);
    const wrap = interval(-7200, 300, true);
    assert.equal(wrap.connected, false);
    assert.ok(wrap.duration > interval(300, 300, false).duration);
    assert.equal(fadeFraction(.75), 0);
    assert.ok(Math.abs(fadeFraction(.9) - .5) < .00001);
    assert.equal(fadeFraction(1.1), 1);
});

test('startup uses a bounded runway at every speed', () => {
    assert.equal(bufferSufficient(1, 22, 25, 820, 1), false);
    assert.equal(bufferSufficient(3, 22, 25, 820, 1), true);
    assert.equal(bufferSufficient(3, 22, 25, 820, 4), false);
    assert.equal(bufferSufficient(5, 20, 25, 820, 4), true);
    assert.equal(bufferSufficient(1, 0, 1, 820, 4), true);
    assert.equal(bufferSufficient(2, 0, 2, 820, 4), true);
    assert.equal(bufferSufficient(0, 0, 0, 820, 1), false);
});

test('coverage stays at identical coordinates across a fade, pause, seek, and wrap', t => {
    const uploads=[],nodes=[],previous=global.document;
    t.after(()=>{if(previous)global.document=previous;else delete global.document;});
    global.document={createElement(){
        return {style:{},getContext:()=>({
            drawImage(image,x,y){uploads.push([image.id,x,y]);},clearRect(){}
        })};
    }};
    const paint=createPainter({appendChild:node=>nodes.push(node)});
    const [a,b,c]=[1,2,3].map(id=>({image:{id,width:320,height:260}}));
    paint.show(a,b,0);
    paint.show(a,b,.25);
    assert.deepEqual(nodes.map(n=>n.style.opacity).sort(),[.25,.75]);
    assert.deepEqual(uploads,[[1,0,0],[2,0,0]]);
    paint.show(b,c,0);
    paint.show(b,null,0);
    paint.show(c,null,0);
    paint.show(a,null,0);
    assert.ok(nodes.every(n=>!n.style.transform));
    assert.ok(uploads.every(([,x,y])=>x===0&&y===0));
    assert.deepEqual(uploads.slice(2,3),[[3,0,0]]);
    assert.equal(nodes.filter(n=>n.style.visibility==='visible').length,1);
    paint.clear();
    assert.ok(nodes.every(n=>n.style.visibility==='hidden'));
});
