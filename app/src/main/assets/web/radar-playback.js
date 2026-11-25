/* Move already prepared radar observations on compositor layers. */
(function (root) {
    'use strict';
    const observationDuration = 820; // screen milliseconds per five weather minutes at 1×
    function interval(gap, cadence, wraps) {
        const connected = !wraps && gap > 0 && gap <= cadence * 1.51;
        return {connected, duration: connected ? observationDuration * gap / 300 : 360};
    }
    function bufferSufficient(ahead, outstanding, count, period, speed, loadTime) {
        if (!outstanding) return ahead > 0;
        const minimum = Math.min(count, Math.max(3, 1 + Math.ceil(1600 * speed / period)));
        const runway = (ahead - 1) * period / speed;
        return ahead >= minimum && runway >= Math.min((count - 1) * period / speed, outstanding * loadTime * 1.35);
    }
    function createPainter(container) {
        const layers = Array.from({length: 3}, () => {
            const node = document.createElement('canvas');
            node.className = 'radar-keyframe';
            container.appendChild(node);
            return {node, ctx: node.getContext('2d'), frame: null};
        });
        const canAnimate = typeof layers[0].node.animate === 'function';
        const offset = (x, y) => 'translate3d(' + x * 100 + '%,' + y * 100 + '%,0)';
        const state = (position, opacity, motion) => ({
            transform: offset(position * motion[0], position * motion[1]), opacity
        });
        let first, second, shownA, shownB, current, upcoming, lastPosition = -1;

        function hide(layer) {
            layer.node.style.opacity = 0;
            layer.node.style.visibility = 'hidden';
        }
        function upload(layer, frame) {
            if (layer.frame === frame) return;
            const {image} = frame, {node, ctx} = layer;
            if (node.width !== image.width || node.height !== image.height) {
                node.width = image.width;
                node.height = image.height;
            }
            ctx.globalCompositeOperation = 'copy';
            ctx.drawImage(image, 0, 0);
            layer.frame = frame;
        }
        function cancel(segment) {
            if (segment) for (const animation of segment.animations) animation.cancel();
        }
        function discardUpcoming() {
            if (!upcoming) return;
            cancel(upcoming);
            hide(upcoming.to);
            upcoming = null;
        }
        function animate(from, to, motion, duration, start, fill) {
            const options = {duration, fill, easing: 'linear'};
            const outgoing = from.node.animate([state(0, 1, motion), state(1, 0, motion)], options);
            const incoming = to.node.animate([state(-1, 0, motion), state(0, 1, motion)], options);
            outgoing.startTime = incoming.startTime = start;
            return {from, to, duration, start, animations: [outgoing, incoming]};
        }
        function show(a, b, motion, t, duration, run, now) {
            const changed = a !== shownA || b !== shownB;
            const moving = !!(b && run && canAnimate);
            if (!changed && moving && current?.duration === duration) return false;
            if (!changed && !moving && !current && t === lastPosition) return false;
            const start = now - t * duration;
            // A scheduled animation has already crossed the boundary on the compositor.
            if (moving && upcoming && upcoming.from.frame === a && upcoming.to.frame === b &&
                    upcoming.duration === duration && Math.abs(upcoming.start - start) < 3) {
                cancel(current);
                hide(first);
                current = upcoming;
                upcoming = null;
                first = current.from;
                second = current.to;
            } else {
                discardUpcoming();
                cancel(current);
                current = null;
                first = layers.find(layer => layer.frame === a) || layers.find(layer => layer.frame !== b) || layers[0];
                second = b ? (layers.find(layer => layer !== first && layer.frame === b) || layers.find(layer => layer !== first)) : null;
                for (const layer of layers) if (layer !== first && layer !== second) hide(layer);
                upload(first, a);
                first.node.style.visibility = 'visible';
                Object.assign(first.node.style, state(t, 1 - t, motion));
                if (second) {
                    upload(second, b);
                    second.node.style.visibility = 'visible';
                    Object.assign(second.node.style, state(t - 1, t, motion));
                    if (moving) current = animate(first, second, motion, duration, start, 'both');
                }
            }
            shownA = a;
            shownB = b;
            lastPosition = t;
            return changed || moving;
        }
        function prepareNext(a, b, motion, duration) {
            if (!second || a !== shownB || !b || b === shownA) return;
            if (upcoming && upcoming.to.frame === b && upcoming.duration === duration) return;
            discardUpcoming();
            const spare = layers.find(layer => layer !== first && layer !== second);
            upload(spare, b);
            if (!current) { hide(spare); return; }
            spare.node.style.opacity = 0;
            spare.node.style.visibility = 'visible';
            // 'forwards' leaves both elements' current effects intact until this future start time.
            upcoming = animate(second, spare, motion, duration, current.start + current.duration, 'forwards');
        }
        function hold() {
            discardUpcoming();
            if (current) for (const animation of current.animations) animation.pause();
            // Keep the paused picture until a new view or a resumed segment takes over.
            if (current) current.duration = -1;
            lastPosition = -1;
        }
        function clear() {
            discardUpcoming();
            cancel(current);
            current = null;
            for (const layer of layers) {
                hide(layer);
                layer.frame = null;
                layer.ctx.clearRect(0, 0, layer.node.width, layer.node.height);
            }
            first = second = shownA = shownB = null;
            lastPosition = -1;
        }
        return {show, prepareNext, clear, hold};
    }
    const api = {interval, bufferSufficient, createPainter, observationDuration};
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.RadarPlayback = api;
})(globalThis);
