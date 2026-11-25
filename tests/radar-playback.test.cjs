const test = require('node:test');
const assert = require('node:assert/strict');
const {interval, bufferSufficient, createPainter} = require('../app/src/main/assets/web/radar-playback.js');

test('Only adjacent observations interpolate, including ten-minute European observations', () => {
    assert.deepEqual(interval(300, 300, false), {connected: true, duration: 820});
    assert.deepEqual(interval(600, 600, false), {connected: true, duration: 1640});
    assert.equal(interval(600, 300, false).connected, false);
    assert.equal(interval(-7200, 300, true).connected, false);
});

test('Startup accounts for outstanding frames, connection speed and the selected playback rate', () => {
    assert.equal(bufferSufficient(2, 23, 25, 820, 1, 70), false);
    assert.equal(bufferSufficient(5, 20, 25, 820, 1, 70), true);
    assert.equal(bufferSufficient(5, 20, 25, 820, 4, 70), false);
    assert.equal(bufferSufficient(5, 20, 25, 820, 1, 350), false);
    assert.equal(bufferSufficient(1, 0, 1, 820, 4, 900), true);
    assert.equal(bufferSufficient(2, 0, 2, 820, 4, 900), true);
});

for (const compositor of [true, false]) {
    test('Reuses the incoming image across an observation boundary, compositor ' + compositor, t => {
        const uploads = [], nodes = [], animations = [];
        const original = global.document;
        t.after(() => { if (original) global.document = original; else delete global.document; });
        global.document = {createElement() {
            const node = {style: {}, getContext: () => ({drawImage: image => uploads.push(image.id), clearRect() {}})};
            if (compositor) node.animate = (keys, options) => {
                const animation = {keys, options, cancel() {}, pause() {}};
                animations.push(animation);
                return animation;
            };
            return node;
        }};
        const painter = createPainter({appendChild: n => nodes.push(n)});
        const frames = [1, 2, 3].map(id => ({key:id, image:{id, width:256, height:256}}));
        for (let i = 0; i < 50; i++) painter.show(frames[0], frames[1], [.1, 0], i / 50, 820, true, i * 16.4);
        assert.deepEqual(uploads, [1, 2]);
        assert.equal(animations.length, compositor ? 2 : 0);
        if (compositor) assert.equal(animations[0].options.easing, 'linear');
        painter.show(frames[1], frames[2], [0, 0], .05, 820, true, 861);
        assert.deepEqual(uploads, [1, 2, 3]);
        painter.show(frames[1], frames[2], [0, 0], .25, 820, false, 1025);
        assert.deepEqual(nodes.filter(layer => layer.style.visibility === 'visible').map(layer => layer.style.opacity).sort(), [.25, .75]);
        painter.show(frames[2], null, [0, 0], 0, 360, false, 2000);
        assert.equal(nodes.filter(n => n.style.visibility === 'visible').length, 1);
        painter.clear();
        assert.ok(nodes.every(n => n.style.visibility === 'hidden'));
    });
}

test('The next observation starts on the compositor even when JavaScript wakes late', t => {
    const drawn = [], animations = [], nodes = [];
    const original = global.document;
    t.after(() => { if (original) global.document = original; else delete global.document; });
    global.document = {createElement() { return {
        style: {}, getContext: () => ({drawImage(image) { drawn.push(image.id); }, clearRect() {}}),
        animate(keys, options) {
            const animation = {options, cancel() {this.cancelled = true;}, pause() {}};
            animations.push(animation);
            return animation;
        }
    }; }};
    const paint = createPainter({appendChild(node) { nodes.push(node); }});
    const [a,b,c] = [1,2,3].map(id => ({image:{id,width:640,height:480}}));
    paint.show(a,b,[.05,0],.2,820,true,1264);
    paint.prepareNext(b,c,[.06,.01],820);
    assert.deepEqual(drawn,[1,2,3]);
    const planned = animations.slice(2);
    assert.equal(planned.length,2);
    assert.ok(planned.every(effect => effect.startTime === 1920 && effect.options.fill === 'forwards'));
    paint.show(b,c,[.06,.01],.1,820,true,2002);
    assert.equal(animations.length,4);
    assert.ok(planned.every(effect => !effect.cancelled));
    assert.deepEqual(drawn,[1,2,3]);
    paint.show(b,c,[.06,.01],.1,820,false,2002);
    assert.ok(planned.every(effect => effect.cancelled));
    paint.clear();
    assert.ok(nodes.every(layer => layer.style.visibility === 'hidden'));
});
