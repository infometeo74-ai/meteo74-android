/* Shared cartography for the radar, observations and snow maps. */
(function (root) {
    'use strict';
    const files = new Map();
    const fonts = [
        { size: 14.5, weight: 700 }, { size: 13, weight: 650 }, { size: 12, weight: 600 }
    ];

    function loadFile(key) {
        if (!files.has(key)) {
            const request = fetch('assets/places/' + key + '.json').then(response => {
                if (!response.ok) throw Error('Noms de lieux indisponibles');
                return response.json();
            }).catch(error => { files.delete(key); throw error; });
            files.set(key, request);
        }
        return files.get(key);
    }

    function basemap(map, pane) {
        const {leafletLayer, PolygonSymbolizer, LineSymbolizer} = protomapsL;
        const polygon = (dataLayer, fill) => ({dataLayer, symbolizer: new PolygonSymbolizer({fill})});
        const line = (dataLayer, color, width) => ({
            dataLayer, symbolizer: new LineSymbolizer({color, width, lineJoin:'round', lineCap:'round'})
        });
        const greens = new Set(['wood', 'forest', 'park', 'nature_reserve', 'grass', 'meadow', 'orchard']);
        const major = new Set(['motorway', 'trunk', 'primary']);
        const rules = [
            polygon('land', (z, f) => greens.has(f.props.kind) ? '#d5dfd4' : '#e1e4dc'),
            polygon('ocean', '#91c3d4'),
            polygon('water_polygons', (z, f) => f.props.kind === 'glacier' ? '#e8eeed' : '#68aec4'),
            line('water_lines', '#80b4c5', z => z < 11 ? 0.8 : 1.4),
            polygon('buildings', '#d5d6cf'),
            {...line('streets', '#d1d1c9', z => z < 10 ? 0.6 : 1.1),
                filter:(z, f) => !major.has(f.props.kind)},
            {...line('streets', '#c0b5a0', z => z < 9 ? 0.85 : 1.65),
                filter:(z, f) => major.has(f.props.kind)},
            {...line('boundaries', '#969b9f', (z, f) => +f.props.admin_level <= 2 ? 1.2 : 0.65),
                filter:(z, f) => Number(f.props.admin_level) <= (z < 7 ? 2 : 6)}
        ];
        leafletLayer({
            url:'https://vector.openstreetmap.org/shortbread_v1/{z}/{x}/{y}.mvt',
            pane, maxDataZoom:14, levelDiff:1, backgroundColor:'#eff0e9',
            paintRules:rules, labelRules:[], updateWhenIdle:true,
            attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);
    }

    function detailCells(bounds) {
        const cells = new Map();
        const south = Math.max(-85, Math.floor(bounds.getSouth()));
        const north = Math.min(85, Math.floor(bounds.getNorth()));
        const west = Math.floor(bounds.getWest());
        const east = Math.min(west + 359, Math.floor(bounds.getEast()));
        for (let lat = south; lat <= north; lat++) {
            for (let lon = west; lon <= east; lon++) {
                const x = ((lon + 180) % 360 + 360) % 360 - 180;
                const pack = Math.floor((lat + 90) / 30) * 12 + Math.floor((x + 180) / 30);
                if (!cells.has(pack)) cells.set(pack, []);
                cells.get(pack).push(lat + ',' + x);
            }
        }
        return cells;
    }

    async function placesIn(bounds, details) {
        const overview = await loadFile('overview');
        const entries = details ? [...detailCells(bounds)].filter(([key]) => overview.packs.includes(key)) : [];
        const chunks = await Promise.all(entries.map(async ([key, ids]) => {
            const pack = await loadFile(key).catch(() => ({}));
            return ids.flatMap(cell => pack[cell] || []);
        }));
        return overview.places.concat(...chunks);
    }

    const touches = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
    const compare = (a, b) => a[3] - b[3] || b[4] - a[4] || a[1] - b[1] || a[2] - b[2];

    function attach(map, basePane = 'tilePane') {
        basemap(map, basePane);
        const pane = map.createPane('townNames');
        pane.style.zIndex = '450';
        pane.style.pointerEvents = 'none';
        const labels = L.layerGroup().addTo(map);
        const measure = document.createElement('canvas').getContext('2d');
        let raf = 0, revision = 0;
        map.attributionControl.addAttribution('Lieux : <a href="https://geo.api.gouv.fr/">Étalab</a>, <a href="https://www.geonames.org/">GeoNames</a>');

        function draw(rows, zoom, bounds) {
            const container = map.getContainer(), size = map.getSize();
            if (!container.clientWidth || !size.y) return;
            const origin = container.getBoundingClientRect(), center = map.getCenter().lng;
            const occupied = Array.from(container.querySelectorAll('.leaflet-control')).map(el => {
                const b = el.getBoundingClientRect();
                return [b.left-origin.left-3, b.top-origin.top-3, b.right-origin.left+3, b.bottom-origin.top+3];
            });
            const wrapper = container.parentElement;
            for (const button of wrapper.querySelectorAll('.obs-center, #radar-badge, #retry-radar')) {
                const b = button.getBoundingClientRect();
                if (b.width) occupied.push([b.left-origin.left-2,b.top-origin.top-2,b.right-origin.left+2,b.bottom-origin.top+2]);
            }
            // A ski-station marker stays tappable and its icon cannot cover a town name.
            for (const marker of container.querySelectorAll('.resort-marker')) {
                const b = marker.getBoundingClientRect();
                occupied.push([b.left-origin.left-2,b.top-origin.top-2,b.right-origin.left+2,b.bottom-origin.top+2]);
            }
            const south = bounds.getSouth(), north = bounds.getNorth(), west = bounds.getWest(), east = bounds.getEast();
            const nearby = [];
            for (const row of rows) {
                const lat = row[1] / 10000, lng = row[2] / 10000;
                if (row[3] > zoom || lat < south || lat > north) continue;
                const wrapped = lng + 360 * Math.round((center - lng) / 360);
                if (wrapped >= west && wrapped <= east) nearby.push(row);
            }
            nearby.sort(compare);
            labels.clearLayers();
            const anchors = [], nameBoxes = [];
            // Keep open space for the weather field. Higher zooms admit smaller, closer towns.
            const detail = Math.min(1, Math.max(0, (zoom - 6) / 6));
            const minDistance = 50 - 10 * detail;
            const maxLabels = Math.max(1, Math.floor(size.x * size.y / (11200 - 2700 * detail)));
            for (const row of nearby) {
                if (anchors.length >= maxLabels) break;
                const [name, y, x, level] = row, lng = x / 10000;
                const coord = [y / 10000, lng + 360 * Math.round((center - lng) / 360)];
                const point = map.latLngToContainerPoint(coord), px = point.x, py = point.y;
                if (anchors.some(anchor => point.distanceTo(anchor) < minDistance)) continue;
                const pin = [px-4,py-4,px+4,py+4];
                if (nameBoxes.some(box => touches(box,pin))) continue;
                const tier = level <= 6 ? 0 : level <= 9 ? 1 : 2;
                const {size:fontSize, weight} = fonts[tier];
                measure.font = weight + ' ' + fontSize + 'px system-ui, sans-serif';
                const w = Math.ceil(measure.measureText(name).width), h = fontSize + 3;
                const offsets = [[8,-h/2],[-8-w,-h/2],[-w/2,-h-7],[-w/2,7],[15,-h/2],[-15-w,-h/2]];
                for (const [dx, dy] of offsets) {
                    const box = [px+dx-7,py+dy-5,px+dx+w+7,py+dy+h+5];
                    if (box[0]<1 || box[1]<1 || box[2]>size.x-1 || box[3]>size.y-1 || occupied.some(b => touches(box,b))) continue;
                    const span = document.createElement('span');
                    span.textContent = name;
                    Object.assign(span.style,{left:dx+'px',top:dy+'px',fontSize:fontSize+'px',
                        fontWeight:String(weight),lineHeight:h+'px'});
                    const icon = L.divIcon({className:'meteo-town', iconAnchor:[0,0], iconSize:[0,0], html:span});
                    L.marker(coord,{pane:'townNames',icon,keyboard:false,interactive:false}).addTo(labels);
                    occupied.push(box, pin);
                    nameBoxes.push(box);
                    anchors.push(point);
                    break;
                }
            }
        }

        async function refresh() {
            const id = ++revision;
            const zoom = map.getZoom(), bounds = map.getBounds();
            const rows = await placesIn(bounds, zoom >= 8);
            if (id === revision) draw(rows, zoom, bounds);
        }
        function schedule() {
            if (raf) return;
            raf = requestAnimationFrame(() => { raf = 0; refresh().catch(() => {}); });
        }
        map.on('moveend zoomend resize', schedule);
        map.whenReady(schedule);
        return schedule;
    }
    root.MeteoMapPlaces = {attach, basemap, placesIn};
})(globalThis);
