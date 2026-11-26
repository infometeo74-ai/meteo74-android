/* Frames share a geographic extent. Only Leaflet positions their parent on the map. */
(function (root) {
    'use strict';
    const observationDuration = 820; // Screen milliseconds per five weather minutes at 1×.

    function interval(gap, cadence, wraps) {
        const connected = !wraps && gap > 0 && gap <= cadence * 1.51;
        const duration = connected ? observationDuration * gap / 300 : wraps ? 1600 : observationDuration;
        return {connected, duration};
    }

    function bufferSufficient(ahead, outstanding, count, period, speed) {
        if (!outstanding) return ahead > 0;
        // Start with a short runway. At a slow connection hold the last observation when needed.
        const target = Math.min(count, 5, Math.max(2, 1 + Math.ceil(900 * speed / period)));
        return ahead >= target;
    }

    // Hold each source image, then briefly dissolve into the next adjacent observation.
    function fadeFraction(progress) {
        return Math.max(0, Math.min(1, (progress - .8) / .2));
    }

    function createPainter(container) {
        const layers = Array.from({length: 2}, () => {
            const node = document.createElement('canvas');
            node.className = 'radar-keyframe';
            container.appendChild(node);
            return {node, ctx: node.getContext('2d'), frame: null, opacity: -1};
        });

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

        function opacity(layer, value) {
            if (layer.opacity === value) return;
            layer.node.style.opacity = value;
            layer.node.style.visibility = value > 0 ? 'visible' : 'hidden';
            layer.opacity = value;
        }

        function show(frame, next, fraction) {
            const current = layers.find(layer => layer.frame === frame) || layers.find(layer => layer.frame !== next) || layers[0];
            const other = current === layers[0] ? layers[1] : layers[0];
            upload(current, frame);
            if (next) upload(other, next);
            opacity(current, next ? 1 - fraction : 1);
            opacity(other, next ? fraction : 0);
        }

        function clear() {
            for (const layer of layers) {
                opacity(layer, 0);
                layer.frame = null;
                layer.ctx.clearRect(0, 0, layer.node.width, layer.node.height);
            }
        }
        return {show, clear};
    }
    const api = {interval, bufferSufficient, createPainter, fadeFraction, observationDuration};
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.RadarPlayback = api;
})(globalThis);
