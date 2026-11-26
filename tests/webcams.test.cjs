const test=require('node:test');
const assert=require('node:assert/strict');
const {cameras,photo}=require('../app/src/main/assets/web/webcam-catalog.js');

test('each webcam has a unique full image, a public source and a usable HTTPS thumbnail',()=>{
    const seen=new Set();
    for(const camera of cameras){
        const large=photo(camera,true);
        assert.ok(!seen.has(large),large);seen.add(large);
        assert.ok(camera.town&&camera.title&&camera.area);
        for(const url of [camera.source,photo(camera),large])assert.equal(new URL(url).protocol,'https:');
    }
    assert.ok(cameras.length>=100);
    assert.ok(new Set(cameras.map(c=>c.area)).size>=7);
});

test('mobile gallery thumbnails use the published small files and municipal views retain their camera ID',()=>{
    const annecy=cameras.find(c=>c.town==='Annecy');
    assert.match(photo(annecy),/\/small_annecy\.jpg$/);
    assert.notEqual(photo(annecy),photo(annecy,true));
    const saleve=cameras.find(c=>c.town==='Salève');
    assert.match(photo(saleve),/\/small\.jpg$/);
    assert.match(photo(saleve,true),/\/large\.jpg$/);
    for(const c of cameras.filter(c=>['Les pistes','Ardent'].includes(c.title))){
        assert.equal(new URL(photo(c)).hostname,'api.skaping.com');
    }
    const sciez=cameras.filter(c=>c.town==='Sciez');
    assert.deepEqual(sciez.map(c=>new URL(photo(c)).searchParams.get('cam')).sort(),['10','11','7']);
});
