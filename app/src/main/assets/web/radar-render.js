/* Terrain and radar frames are prepared once per map view, away from playback. */
(function (root) {
'use strict';
const colors=root.RadarColors||require('./radar-colors.js');
const world = 256;
const missing = 65535;
const trackingSize = 40;
const limit = (n, low, high) => Math.max(low, Math.min(high, n));
const latitude = y => Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI;
const longitude = x => x * 360 - 180;
const mix = (a,b,t) => a+(b-a)*t;
const aborted = signal => { if(signal.aborted) throw new DOMException('Aborted','AbortError'); };
function remember(cache, key, value, max) {
    cache.delete(key); cache.set(key, value);
    while (cache.size > max) { const first=cache.keys().next().value; cache.get(first)?.close?.(); cache.delete(first); }
    return value;
}
function canvas(width,height) {
    if(typeof OffscreenCanvas==='function') return new OffscreenCanvas(width,height);
    const node=document.createElement('canvas'); node.width=width; node.height=height; return node;
}
function bitmap(node) { return node.transferToImageBitmap ? node.transferToImageBitmap() : node; }
async function request(url,signal,read,headers) {
    const ctl=new AbortController(), abort=()=>ctl.abort(); aborted(signal);
    signal.addEventListener('abort',abort,{once:true}); const timer=setTimeout(abort,18000);
    try {
        const response=await fetch(url,{headers,signal:ctl.signal,credentials:'omit',referrerPolicy:'no-referrer'});
        if(!response.ok) throw Error('Service indisponible ('+response.status+')');
        return await response[read]();
    } finally {clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
async function loadImage(url,signal) {
    const blob=await request(url,signal,'blob');
    if(typeof createImageBitmap==='function') return createImageBitmap(blob);
    const src=URL.createObjectURL(blob); try {const img=new Image();img.src=src;await img.decode();return img;} finally {URL.revokeObjectURL(src);}
}
function corners(v) {
    const scale=world*2**v.z;
    return {west:longitude(v.left/scale),east:longitude((v.left+v.cssW)/scale),north:latitude(v.top/scale),south:latitude((v.top+v.cssH)/scale)};
}
function tileLayout(v,z) {
    const factor=2**(z-v.z),left=v.left*factor,top=v.top*factor,width=v.cssW*factor,height=v.cssH*factor,tiles=[];
    for(let y=Math.max(0,Math.floor(top/world));y<=Math.min(2**z-1,Math.floor((top+height-.0001)/world));y++) {
        for(let x=Math.floor(left/world);x<=Math.floor((left+width-.0001)/world);x++) {
            const wrapped=((x%2**z)+2**z)%2**z;tiles.push({x,y,key:z+'/'+wrapped+'/'+y});
        }
    }
    return {left,top,width,height,tiles};
}
function gridCoordinates(frame,v) {
    // Interpolate the map projection over short screen segments, then sample the meteorological grid at cell centres.
    const {w,h}=v,scale=world*2**v.z,index=new Int32Array(w*h),fx=new Float32Array(w*h),fy=new Float32Array(w*h);
    const stride=12,cols=Math.ceil((w-1)/stride)+1,rows=Math.ceil((h-1)/stride)+1,ax=new Float64Array(cols*rows),ay=new Float64Array(cols*rows);
    for(let j=0;j<rows;j++) for(let i=0;i<cols;i++) {
        const x=(v.left+(i*stride+.5)*v.cssW/w)/scale,y=(v.top+(j*stride+.5)*v.cssH/h)/scale;
        const [e,n]=frame.projection.forward([longitude(x),latitude(y)]); ax[j*cols+i]=(e-frame.x0)/frame.dx-.5;ay[j*cols+i]=(frame.y0-n)/frame.dy-.5;
    }
    for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
        const i=y*w+x,col=Math.min(cols-2,Math.floor(x/stride)),row=Math.min(rows-2,Math.floor(y/stride)),t=x/stride-col,u=y/stride-row,k=row*cols+col;
        const sx=mix(mix(ax[k],ax[k+1],t),mix(ax[k+cols],ax[k+cols+1],t),u),sy=mix(mix(ay[k],ay[k+1],t),mix(ay[k+cols],ay[k+cols+1],t),u);
        if(!(sx>=-.5&&sy>=-.5&&sx<frame.width-.5&&sy<frame.height-.5)){index[i]=-1;continue;}
        const a=limit(sx,0,frame.width-1),b=limit(sy,0,frame.height-1),left=Math.min(Math.floor(a),frame.width-2),top=Math.min(Math.floor(b),frame.height-2);
        index[i]=top*frame.width+left;fx[i]=a-left;fy[i]=b-top;
    }
    return {index,fx,fy};
}
function sampledRate(frame,coord,i) {
    const k=coord.index[i];if(k<0)return -1;
    const x=coord.fx[i],y=coord.fy[i],w=frame.width,d=frame.values, absent=frame.missing??missing;
    const a=d[k],b=d[k+1],c=d[k+w],e=d[k+w+1];
    const table=frame.rateTable;
    if(a!==absent&&b!==absent&&c!==absent&&e!==absent){
        if(table)return mix(mix(table[a],table[b],x),mix(table[c],table[e],x),y);
        return mix(mix(a,b,x),mix(c,e,x),y);
    }
    const near=d[k+(x>=.5?1:0)+(y>=.5?w:0)];
    if(near===absent)return -1;
    return table?table[near]:near;
}
function tracking(field,w,h) {
    const small=new Float32Array(trackingSize*trackingSize);
    for(let y=0;y<trackingSize;y++)for(let x=0;x<trackingSize;x++) {
        const k=Math.floor((y+.5)*h/trackingSize)*w+Math.floor((x+.5)*w/trackingSize);small[y*trackingSize+x]=field(k);
    }
    return small;
}
function estimateMotion(first,next) {
    // Match precipitation structures on a small grid. Weak or dry matches use a plain dissolve.
    const n=trackingSize,margin=5;
    function cost(dx,dy) {
        const ix=Math.floor(dx),iy=Math.floor(dy),fx=dx-ix,fy=dy-iy,offset=iy*n+ix;
        let sum=0,valid=0;
        for(let y=margin;y<n-margin;y+=2)for(let x=margin;x<n-margin;x+=2) {
            const i=y*n+x,k=i+offset,a=first[i];
            let b=next[k];if(a<0||b<0)continue;
            if(fx||fy){
                const right=next[k+1],lower=next[k+n],corner=next[k+n+1];
                if(right<0||lower<0||corner<0)continue;
                b=mix(mix(b,right,fx),mix(lower,corner,fx),fy);
            }
            if(a+b<.045)continue;
            sum+=Math.min(Math.abs(a-b),2);valid++;
        }
        return valid<12?Infinity:sum/valid;
    }

    const still=cost(0,0);if(!Number.isFinite(still)||still<.008)return [0,0];
    let best=still,dx=0,dy=0;
    for(let oy=-4;oy<=4;oy++)for(let ox=-4;ox<=4;ox++){
        const s=cost(ox,oy)+.003*Math.hypot(ox,oy);if(s<best){dx=ox;dy=oy;best=s;}
    }
    // A quarter tracking cell matters at small zooms, where a whole cell can span a town.
    for(const step of [.5,.25]){
        const bx=dx,by=dy;
        for(const sy of [-step,0,step])for(const sx of [-step,0,step]){
            const ox=limit(bx+sx,-4.5,4.5),oy=limit(by+sy,-4.5,4.5);
            const score=cost(ox,oy)+.003*Math.hypot(ox,oy);
            if(score<best){dx=ox;dy=oy;best=score;}
        }
    }
    return best<still*.8?[dx/n,dy/n]:[0,0];
}
function clockSample(row,time) {
    const times=row?.hourly?.time??[],levels=row?.hourly?.snowfall_height??[];
    let i=times.findIndex(t=>t>=time);if(i<0)return NaN;
    if(times[i]===time)return Number.isFinite(levels[i])?levels[i]:NaN;
    if(i===0||times[i]-times[i-1]>3700||!Number.isFinite(levels[i])||!Number.isFinite(levels[i-1]))return NaN;
    return mix(levels[i-1],levels[i],(time-times[i-1])/(times[i]-times[i-1]));
}
function coverageBounds(frame) {
    const positions=[];
    for(const t of [0,.5,1]) for(const edge of [[t,0],[t,1],[0,t],[1,t]]) {
        positions.push(frame.projection.inverse([frame.x0+edge[0]*frame.width*frame.dx,frame.y0-edge[1]*frame.height*frame.dy]));
    }
    return {west:Math.min(...positions.map(p=>p[0])),east:Math.max(...positions.map(p=>p[0])),south:Math.min(...positions.map(p=>p[1])),north:Math.max(...positions.map(p=>p[1]))};
}
function modelGrid(v,coverage,intervals=4) {
    const b=corners(v);
    if(coverage){b.west=Math.max(b.west,coverage.west);b.east=Math.min(b.east,coverage.east);b.south=Math.max(b.south,coverage.south);b.north=Math.min(b.north,coverage.north);}
    if(b.west>=b.east||b.south>=b.north)return null;
    const extent=Math.max(b.east-b.west,b.north-b.south),step=[.125,.25,.5,1,2,4,8,16,32].find(n=>n*intervals>=extent)??64;
    const west=Math.floor(b.west/step)*step,south=Math.floor(b.south/step)*step;
    const nx=Math.max(2,Math.ceil((b.east-west)/step)+1),ny=Math.max(2,Math.ceil((b.north-south)/step)+1),nodes=[];
    for(let j=0;j<ny;j++)for(let i=0;i<nx;i++)nodes.push({lat:south+j*step,lon:west+i*step});
    return {west,south,nx,ny,step,nodes};
}
function modelAt(values,grid,lon,lat) {
    if(lon<grid.west||lat<grid.south||lon>grid.west+(grid.nx-1)*grid.step||lat>grid.south+(grid.ny-1)*grid.step)return NaN;
    const x=limit((lon-grid.west)/grid.step,0,grid.nx-1),y=limit((lat-grid.south)/grid.step,0,grid.ny-1),i=Math.min(Math.floor(x),grid.nx-2),j=Math.min(Math.floor(y),grid.ny-2),k=j*grid.nx+i;
    return mix(mix(values[k],values[k+1],x-i),mix(values[k+grid.nx],values[k+grid.nx+1],x-i),y-j);
}
function engine(emit) {
    let view=null;
    const frames=new Map(),terrainTiles=new Map(),euroTiles=new Map(),modelNodes=new Map();
    const euroRequests=[];
    async function loadDemTile(t,signal) {
        if(terrainTiles.has(t.key))return terrainTiles.get(t.key);
        const b=await loadImage('https://s3.amazonaws.com/elevation-tiles-prod/terrarium/'+t.key+'.png',signal);
        const img=canvas(256,256),ctx=img.getContext('2d',{willReadFrequently:true});ctx.drawImage(b,0,0,256,256);b.close?.();
        const rgba=ctx.getImageData(0,0,256,256).data,heights=new Int16Array(65536);
        for(let i=0;i<heights.length;i++)heights[i]=rgba[i*4+3]?rgba[i*4]*256+rgba[i*4+1]-32768:-32768;
        return remember(terrainTiles,t.key,heights,48);
    }
    async function terrain(v) {
        const z=Math.min(14,Math.max(0,Math.round(v.z+Math.log2(v.w/v.cssW)))),layout=tileLayout(v,z),tiles=new Map();
        await Promise.all(layout.tiles.map(async t=>{try{tiles.set(t.x+','+t.y,await loadDemTile(t,v.signal));}catch{} }));aborted(v.signal);
        const heights=new Float32Array(v.w*v.h).fill(NaN),xInfo=new Array(v.w);
        for(let x=0;x<v.w;x++){const px=layout.left+(x+.5)*layout.width/v.w-.5,tx=Math.floor(px/256);xInfo[x]=[tx,limit(px-tx*256,0,254.999)];}
        for(let y=0;y<v.h;y++){
            const py=layout.top+(y+.5)*layout.height/v.h-.5,ty=Math.floor(py/256),p=limit(py-ty*256,0,254.999),iy=Math.floor(p),fy=p-iy;
            let lastX=null,tile;
            for(let x=0;x<v.w;x++){
                const [tx,px]=xInfo[x];if(tx!==lastX){tile=tiles.get(tx+','+ty);lastX=tx;}if(!tile)continue;
                const ix=Math.floor(px),fx=px-ix,k=iy*256+ix;
                if(tile[k]===-32768||tile[k+1]===-32768||tile[k+256]===-32768||tile[k+257]===-32768)continue;
                heights[y*v.w+x]=mix(mix(tile[k],tile[k+1],fx),mix(tile[k+256],tile[k+257],fx),fy);
            }
        }
        v.heights=heights;v.terrainOK=tiles.size===layout.tiles.length&&tiles.size>0;
        const node=canvas(v.w,v.h),ctx=node.getContext('2d'),pixels=ctx.createImageData(v.w,v.h),rgba=pixels.data;
        for(let y=1;y<v.h-1;y++){
            const meters=40075016.686*Math.cos(v.lat[y]*Math.PI/180)/(256*2**v.z);
            for(let x=1;x<v.w-1;x++){
                const i=y*v.w+x,dx=(heights[i+1]-heights[i-1])/(2*meters*v.cssW/v.w),dy=(heights[i+v.w]-heights[i-v.w])/(2*meters*v.cssH/v.h);
                if(!Number.isFinite(dx+dy))continue;
                const light=(.55*dx+.55*dy+.63)/Math.hypot(1,dx,dy),shade=limit((light-.63)*1.35,-.78,.45),k=4*i;
                rgba[k]=shade<0?34:255;rgba[k+1]=shade<0?44:251;rgba[k+2]=shade<0?57:238;rgba[k+3]=Math.round(Math.abs(shade)*240);
            }
        }
        ctx.putImageData(pixels,0,0);const image=bitmap(node);emit({type:'terrain',id:v.id,image,complete:v.terrainOK},[image]);
    }
    async function loadModel(v,data) {
        const french=v.provider==='france',model=french?'icon_eu':'meteoswiss_icon_ch1';
        const grid=modelGrid(v,coverageBounds(data),french?8:4);if(!grid)return;
        const day=t=>new Date(t*1000).toISOString().slice(0,10),start=day(v.firstTime-3600),end=day(v.lastTime+3600),key=n=>model+'/'+Math.floor(v.lastTime/3600)+'/'+start+'/'+end+'/'+n.lat+'/'+n.lon;
        const need=grid.nodes.filter(n=>!modelNodes.has(key(n)));
        for(let offset=0;offset<need.length;offset+=35){
            const batch=need.slice(offset,offset+35);
            const params=new URLSearchParams({latitude:batch.map(n=>n.lat).join(','),longitude:batch.map(n=>n.lon).join(','),models:model,hourly:'snowfall_height',timeformat:'unixtime',timezone:'GMT',start_date:start,end_date:end,cell_selection:'nearest'});
            const data=await request('https://api.open-meteo.com/v1/forecast?'+params,v.signal,'json'),rows=Array.isArray(data)?data:[data];
            for(let i=0;i<batch.length;i++){
                const row=rows[i],n=batch[i];if(!row||row.hourly_units?.snowfall_height!=='m'||Math.abs(row.latitude-n.lat)>.1||Math.abs(row.longitude-n.lon)>.15)continue;
                remember(modelNodes,key(n),row,180);
            }
        }
        grid.rows=grid.nodes.map(n=>modelNodes.get(key(n)));v.model=grid;
    }
    function prepare(options) {
        view?.ctl.abort(); const ctl=new AbortController();const v={...options,ctl,signal:ctl.signal,tracks:new Map(),samples:new Map()};view=v;
        const scale=world*2**v.z;v.lon=Float64Array.from({length:v.w},(_,i)=>longitude((v.left+(i+.5)*v.cssW/v.w)/scale));v.lat=Float64Array.from({length:v.h},(_,i)=>latitude((v.top+(i+.5)*v.cssH/v.h)/scale));
        v.relief=terrain(v).catch(()=>{if(!v.signal.aborted)emit({type:'terrainError',id:v.id});});

    }
    async function loadSwiss(frame,v) {
        if(frames.has(frame.url))return frames.get(frame.url);
        const raw=await request(frame.url,v.signal,'arrayBuffer');aborted(v.signal);
        const data=SwissRadar.decode(raw,root.hdf5,root.proj4),packed=new Uint16Array(data.values.length);
        for(let i=0;i<packed.length;i++)packed[i]=Number.isFinite(data.values[i])?limit(Math.round(data.values[i]*100),0,65534):missing;
        data.values=packed;return remember(frames,frame.url,data,27);
    }
    async function loadFrance(frame,v){
        if(frames.has(frame.url))return frames.get(frame.url);
        const raw=await request(frame.url,v.signal,'arrayBuffer',FranceRadar.headers);aborted(v.signal);
        return remember(frames,frame.url,FranceRadar.decode(raw,root.proj4),28);
    }
    async function observedFrame(frame,v){
        const french=v.provider==='france';
        const data=await (french?loadFrance:loadSwiss)(frame,v);aborted(v.signal);
        if(v.snow){
            v.modelJob??=loadModel(v,data).catch(()=>{});
            await Promise.all([v.modelJob,v.relief]);aborted(v.signal);
        }
        if(v.gridKey!==data.key){v.coord=gridCoordinates(data,v);v.gridKey=data.key;}
        const levels=v.model?.rows.map(row=>clockSample(row,frame.time));
        const modelAvailable=!!(v.snow&&levels&&v.heights);
        const node=canvas(v.w,v.h),ctx=node.getContext('2d'),pixels=ctx.createImageData(v.w,v.h),rgba=pixels.data;
        let known=0,wet=0;
        for(let y=0;y<v.h;y++)for(let x=0;x<v.w;x++){
            const i=y*v.w+x,k=4*i,rate=sampledRate(data,v.coord,i);
            if(rate<0){
                if((!french||v.coord.index[i]>=0)&&(x+y)%13<2){rgba[k]=96;rgba[k+1]=108;rgba[k+2]=118;rgba[k+3]=70;}
                continue;
            }
            if(rate===0)continue;
            wet++;let snowy=false;
            if(modelAvailable){
                const elevation=v.heights[i],line=modelAt(levels,v.model,v.lon[x],v.lat[y]);
                if(Number.isFinite(elevation)&&Number.isFinite(line)){known++;snowy=elevation>=line;}
            }
            colors.paint(rgba,k,rate,snowy);
        }
        const track=tracking(i=>{const rate=sampledRate(data,v.coord,i);return rate<0?-1:Math.log1p(rate*.025);},v.w,v.h);
        ctx.putImageData(pixels,0,0);
        const phaseReady=!v.snow||(modelAvailable&&levels.some(Number.isFinite)&&v.terrainOK&&known===wet);
        return {image:bitmap(node),track,phaseReady};
    }
    async function europeanTile(url,signal){
        if(euroTiles.has(url))return euroTiles.get(url);
        // Keep all European requests, including mixed-phase fallbacks, within the rolling device budget.
        while(true){
            aborted(signal);const now=Date.now();
            while(euroRequests.length&&now-euroRequests[0]>=60000)euroRequests.shift();
            if(euroRequests.length<90){euroRequests.push(now);break;}
            await new Promise(r=>setTimeout(r,Math.min(500,60000-now+euroRequests[0])));
        }
        const img=await loadImage(url,signal);
        try{
            aborted(signal);
            if(img.width!==512||img.height!==512)throw Error('Taille de tuile inattendue');
            const tile=canvas(512,512),ctx=tile.getContext('2d',{willReadFrequently:true});
            ctx.drawImage(img,0,0);
            return remember(euroTiles,url,EuropeRadar.decode(ctx.getImageData(0,0,512,512).data),64);
        }finally{img.close?.();}
    }
    function europeanGeometry(v){
        let z=Math.min(7,Math.floor(v.z));
        while(z>1&&tileLayout(v,z).tiles.length>6)z--;
        const layout=tileLayout(v,z),left=Math.floor(layout.left/world),top=Math.floor(layout.top/world);
        const width=(Math.ceil((layout.left+layout.width)/world)-left)*512;
        const height=(Math.ceil((layout.top+layout.height)/world)-top)*512;
        const near=new Int32Array(v.w*v.h),index=new Int32Array(v.w*v.h),fx=new Float32Array(v.w*v.h),fy=new Float32Array(v.w*v.h);
        const gx=new Float64Array(v.w);
        for(let x=0;x<v.w;x++)gx[x]=limit((layout.left-left*world+(x+.5)*layout.width/v.w)*2-.5,0,width-1);
        for(let y=0;y<v.h;y++){
            const gy=limit((layout.top-top*world+(y+.5)*layout.height/v.h)*2-.5,0,height-1),iy=Math.min(height-2,Math.floor(gy));
            for(let x=0;x<v.w;x++){
                const i=y*v.w+x,ix=Math.min(width-2,Math.floor(gx[x]));
                near[i]=Math.round(gy)*width+Math.round(gx[x]);index[i]=iy*width+ix;fx[i]=gx[x]-ix;fy[i]=gy-iy;
            }
        }
        return {left,top,width,height,tiles:layout.tiles,near,coord:{index,fx,fy}};
    }
    async function europe(frame,v){
        const geo=v.euroGeometry??=europeanGeometry(v);
        const values=new Uint8Array(geo.width*geo.height).fill(EuropeRadar.unknown);
        let unresolvedPhase;
        await Promise.all(geo.tiles.map(async t=>{
            const prefix=frame.url+'/512/'+t.key+'/2/0_';
            const tile=await europeanTile(prefix+(v.snow?'1':'0')+'.png',v.signal);
            const start=(t.y-geo.top)*512*geo.width+(t.x-geo.left)*512;
            for(let y=0;y<512;y++)values.set(tile.values.subarray(y*512,(y+1)*512),start+y*geo.width);
            // Preserve the intensity of mixed or undocumented phases via the phase-free tile.
            // If that tile is unavailable, the other radar observations can still play.
            if(tile.hasUnknown&&v.snow){
                let intensity;
                try{intensity=await europeanTile(prefix+'0.png',v.signal);}catch{aborted(v.signal);}
                unresolvedPhase??=new Uint8Array(values.length);
                for(let y=0;y<512;y++)for(let x=0;x<512;x++){
                    const i=y*512+x;
                    if(tile.values[i]!==EuropeRadar.unknown)continue;
                    const target=start+y*geo.width+x;
                    unresolvedPhase[target]=1;
                    if(intensity)values[target]=intensity.values[i];
                }
            }
        }));aborted(v.signal);
        const data={width:geo.width,values,missing:EuropeRadar.unknown,rateTable:EuropeRadar.rates};
        const node=canvas(v.w,v.h),ctx=node.getContext('2d'),pixels=ctx.createImageData(v.w,v.h),sample=new Uint8Array(v.w*v.h);
        let phaseReady=true;
        for(let i=0;i<sample.length;i++){
            const pos=geo.near[i],code=sample[i]=values[pos],rate=sampledRate(data,geo.coord,i);
            if(unresolvedPhase?.[pos])phaseReady=false;
            if(rate>0)colors.paint(pixels.data,4*i,rate,!!(code&EuropeRadar.snowFlag));
        }
        remember(v.samples,frame.time,sample,16);
        const track=tracking(i=>{const rate=sampledRate(data,geo.coord,i);return rate<0?-1:Math.log1p(rate*.025);},v.w,v.h);
        ctx.putImageData(pixels,0,0);
        return {image:bitmap(node),track,phaseReady};
    }
    function sample(m,v){
        let rate=null,phase=null;
        const i=limit(Math.floor(m.y*v.h),0,v.h-1)*v.w+limit(Math.floor(m.x*v.w),0,v.w-1);
        if(v.provider==='europe'){
            const code=v.samples.get(m.frame.time)?.[i];
            if(code!==undefined&&code!==EuropeRadar.unknown){
                rate=EuropeRadar.rates[code]/100;
                if(code&EuropeRadar.snowFlag)phase='Neige probable';
            }
        }else{
            const data=frames.get(m.frame.url);
            const raw=data?SwissRadar.valueAt(data,m.lon,m.lat):NaN;
            if(Number.isFinite(raw)&&raw!==(data.missing??missing))rate=(data.rateTable?data.rateTable[raw]:raw)/100;
            if(v.snow&&rate>0&&v.model&&v.heights){
                const levels=v.model.rows.map(row=>clockSample(row,m.frame.time)),line=modelAt(levels,v.model,m.lon,m.lat),alt=v.heights[i];
                if(Number.isFinite(line)&&Number.isFinite(alt))phase=alt>=line?'Neige probable':'Pluie probable';
            }
        }
        emit({type:'sample',id:v.id,token:m.token,rate,phase,time:m.frame.time});
    }
    async function handle(m) {
        if(m.type==='prepare'){prepare(m.view);return;}if(m.type==='stop'){view?.ctl.abort();view=null;return;}
        const v=view;if(!v||m.id!==v.id)return;
        if(m.type==='sample'){sample(m,v);return;}
        if(m.type==='frame')try{
            const {image,track,phaseReady}=await (v.provider==='europe'?europe:observedFrame)(m.frame,v);
            if(v!==view||v.signal.aborted){image.close?.();return;}
            const time=m.frame.time,motions=[],maxGap=(v.provider==='europe'?600:300)*1.51;
            // Tracks can arrive out of order. Compute each adjacent match as its second input arrives.
            for(const [other,field] of v.tracks){
                if(time===other||Math.abs(time-other)>maxGap)continue;
                const earlier=other<time;
                motions.push({from:earlier?other:time,to:earlier?time:other,
                    offset:earlier?estimateMotion(field,track):estimateMotion(track,field)});
            }
            remember(v.tracks,time,track,32);
            emit({type:'frame',id:v.id,key:time,image,phaseReady,motions},[image]);
        }catch(e){if(v===view&&!v.signal.aborted)emit({type:'error',id:v.id,key:m.frame.time});}
    }
    return handle;
}
root.RadarRender={engine,estimateMotion,clockSample,modelGrid,modelAt,coverageBounds,sampledRate,gridCoordinates,corners,trackingSize};
if(typeof module==='object'&&module.exports)module.exports=root.RadarRender;
})(globalThis);
