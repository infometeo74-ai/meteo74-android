const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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
