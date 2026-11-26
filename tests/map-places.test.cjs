const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {setImmediate: nextTurn} = require('node:timers/promises');

const directory = path.join(__dirname, '../app/src/main/assets/web/assets/places');
const read = key => JSON.parse(fs.readFileSync(path.join(directory, key + '.json'), 'utf8'));
const overview = read('overview');

test('Les grandes villes et les communes du Genevois apparaissent à des zooms successifs', () => {
    const regional = read(54)['46,6'];
    const zoom = (rows, name) => {
        const place = rows.find(row => row[0] === name);
        assert.ok(place, name);
        return place[3];
    };
    assert.ok(zoom(overview.places, 'Paris') < zoom(overview.places, 'Genève'));
    assert.ok(zoom(overview.places, 'Annecy') < zoom(regional, 'Reignier-Ésery'));
    assert.ok(zoom(regional, 'Reignier-Ésery') < zoom(regional, 'Scientrier'));
});

test('Chaque petite localité est accessible depuis le secteur de ses coordonnées', () => {
    assert.ok(overview.places.every(row => row[3] <= 7));
    for (const key of overview.packs) {
        for (const [cell, rows] of Object.entries(read(key))) {
            for (const [name, lat, lon, zoom] of rows) {
                const y = Math.floor(lat / 10000), x = Math.floor(lon / 10000);
                assert.equal(cell, y + ',' + x, name);
                assert.equal(key, Math.floor((y + 90) / 30) * 12 + Math.floor((x + 180) / 30), name);
                assert.ok(zoom > 7 && zoom <= 14, name);
            }
        }
    }
});

test('Le fond reste sans texte et les communes très proches sont espacées sur mobile', async () => {
    const rows = [['Ville principale', 5000, 5000, 4, 1000000]];
    for (let lat = 500; lat < 10000; lat += 500) {
        for (let lon = 500; lon < 10000; lon += 500) rows.push(['Bourg', lat, lon, 7, 25000]);
    }
    const points = [];
    let basemap;
    const container = {clientWidth:320, getBoundingClientRect:() => ({left:0,top:0}), querySelectorAll:() => []};
    container.parentElement = container;
    function project([lat, lon]) {
        const x = lon * 320, y = (1 - lat) * 300;
        return {x,y,distanceTo:p => Math.hypot(x-p.x,y-p.y)};
    }
    const map = {
        createPane:() => ({style:{}}), attributionControl:{addAttribution(){}}, on(){},
        whenReady:fn => fn(), getZoom:() => 7, getSize:() => ({x:320,y:300}),
        getCenter:() => ({lng:.5}), getContainer:() => container, latLngToContainerPoint:project,
        getBounds:() => ({getSouth:() => 0,getNorth:() => 1,getWest:() => 0,getEast:() => 1})
    };
    const context = {
        protomapsL:{PolygonSymbolizer:class {},LineSymbolizer:class {},
            leafletLayer:options => ({addTo(){basemap=options;}})},
        L:{layerGroup:() => ({addTo:() => ({clearLayers(){points.length=0;}})}),divIcon:opts => opts,
            marker:(coord,{icon}) => ({addTo(){points.push({...project(coord),name:icon.html.textContent});}})},
        document:{createElement:() => ({style:{},getContext:() => ({measureText:s => ({width:s.length*7})})})},
        requestAnimationFrame:fn => {queueMicrotask(fn);return 1;},
        fetch:async () => ({ok:true,json:() => ({places:rows,packs:[]})})
    };
    vm.runInNewContext(fs.readFileSync(path.join(directory, '../../map-places.js'), 'utf8'), context);
    context.MeteoMapPlaces.attach(map);
    await nextTurn();
    assert.equal(basemap.labelRules.length, 0);
    assert.ok(basemap.paintRules.length > 0);
    assert.equal(points[0].name, 'Ville principale');
    assert.ok(points.length >= 5 && points.length <= 9, String(points.length));
    for (const [i, point] of points.entries()) {
        for (const other of points.slice(i+1)) assert.ok(point.distanceTo(other) >= 46);
    }
});
