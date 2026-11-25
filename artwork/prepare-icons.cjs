/* Optional artwork preparation for maintainers. Android builds use the bundled WebP files.
   Run with Node and sharp. Raw Drive artwork and the approved retouches stay outside the APK. */
const sharp = require('sharp');
const path = require('node:path');
const fs = require('node:fs/promises');
const {createHash} = require('node:crypto');
const original = id => path.join(__dirname, 'originaux', id + '.png');
const master = name => path.join(__dirname, 'masters', name + '.png');
const output = path.join(__dirname, '../app/src/main/assets/web/assets/weather/hd');
const clear = {r:0,g:0,b:0,alpha:0};
const size = 512;
const clampByte = n => Math.max(0, Math.min(255, Math.round(n)));
const blank = (width,height) => sharp({create:{width,height,channels:4,background:clear}});
const crop = (input,left,top,width,height) => sharp(input).extract({left,top,width,height}).png().toBuffer();
const resize = (input,width,height) => sharp(input).resize(width,height,{fit:'inside',kernel:'lanczos3'}).png().toBuffer();

async function cropAlpha(input, threshold=10) {
    const {data,info:{width,height}} = await sharp(input).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    let left=width,top=height,right=-1,bottom=-1;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
        if(data[(y*width+x)*4+3]<=threshold)continue;
        left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
    }
    if(right<left)throw Error('Empty artwork');
    left=Math.max(0,left-2);top=Math.max(0,top-2);
    return crop(input,left,top,Math.min(width,right+3)-left,Math.min(height,bottom+3)-top);
}
async function restoreMaster(name,rect,threshold=104) {
    const im=await crop(master(name),...rect);
    const gain=255/(252-threshold);
    const cleaned=await sharp(im).linear([1,1,1,gain],[0,0,0,-threshold*gain]).png().toBuffer();
    return cropAlpha(cleaned);
}
async function drawLayers(width,height,layers) {
    const parts=[];
    for(const [photo,x,y,w,h] of layers){
        const bitmap=await resize(photo,w,h);
        const m=await sharp(bitmap).metadata();
        parts.push({input:bitmap,left:Math.round(x+(w-m.width)/2),top:Math.round(y+(h-m.height)/2)});
    }
    return blank(width,height).composite(parts).png().toBuffer();
}
async function main(){
    await fs.mkdir(output,{recursive:true});
    const shadows=new Map();
    const restores=new Map();
    async function source(id){
        if(restores.has(id))return restores.get(id);
        const {data,info:{width,height}}=await sharp(original(id)).ensureAlpha().raw().toBuffer({resolveWithObject:true});
        if(!shadows.has(width)){
            const sample=width===132?'324':'11';
            const shadow=await sharp(original(sample)).ensureAlpha().raw().toBuffer();
            shadows.set(width,shadow);
        }
        const template=shadows.get(width);
        const windsock=['01','02','23','24','43'].includes(id);
        const bolt=['00','03','04','031','041','17','35','37','38','47'].includes(id);
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
            const k=(y*width+x)*4,a=data[k+3]/255;
            // Undo the common black oval by its measured alpha; overlapping flakes and bolts survive.
            const bg=y>=(width===132?101:98)?template[k+3]/255:0;
            if(bg>0){
                const fg=Math.max(0,(a-bg)/(1-bg));
                if(fg<.012){data.fill(0,k,k+4);continue;}
                for(let c=0;c<3;c++)data[k+c]=clampByte(data[k+c]*a/fg);
                data[k+3]=clampByte(fg*255);
            }
            if(y>=98&&((windsock&&(x<24||x>30||y>116))||(bolt&&data[k]-data[k+2]<35))){
                data.fill(0,k,k+4);continue;
            }
            // Preserve the feathered outline of the originals, including partly transparent wisps.
            if((id==='08'||id==='09')&&a){
                const w=Math.max(0,Math.min(1,(79-y)/24)),blend=w*w*(3-2*w);
                for(let c=0;c<3;c++)data[k+c]=clampByte(data[k+c]*(1-blend*(.32-.025*c)));
                data[k+3]=clampByte(255*Math.min(1,a*(1+.28*blend)));
            }
            const snowStart={'05':55,'07':55,'13':57,'14':57,'15':0,'16':57,'41':57,'42':57,'43':57,'46':59,'031':60,'041':60,'322':88,'326':90,'329':92,'3291':90}[id];
            if(snowStart!=null&&y>snowStart){
                const chroma=Math.max(data[k],data[k+1],data[k+2])-Math.min(data[k],data[k+1],data[k+2]);
                const amount=Math.min(1,(y-snowStart)/9)*Math.max(0,1-chroma/25);
                const light=Math.min(data[k],data[k+1],data[k+2])/255;
                for(let c=0;c<3;c++)data[k+c]=clampByte(data[k+c]*(1-amount*light*(.28-.04*c)));
            }
        }
        const full=await sharp(data,{raw:{width,height,channels:4}}).png().toBuffer();
        restores.set(id,full);
        return full;
    }
    async function hdOriginal(id){
        const original=await cropAlpha(await source(id));
        const scaled=await resize(original,480,460);
        // A small edge-preserving median pass suppresses steps left by the original 128 px raster.
        return sharp(scaled).median(3).sharpen({sigma:1,m1:.55,m2:.8}).png().toBuffer();
    }
    const sky=await restoreMaster('echantillons',[38,34,548,486]);
    const rain=await restoreMaster('echantillons',[660,41,552,405]);
    const snow=await restoreMaster('echantillons',[37,666,552,429]);
    const fog=await restoreMaster('echantillons',[654,752,551,291],60);
    const sun=await restoreMaster('ciel',[92,42,450,450],150);
    const moon=await restoreMaster('ciel',[728,68,415,413],145);
    const cloudBank=await restoreMaster('ciel',[27,665,560,370],115);
    const storm=await restoreMaster('ciel',[648,655,570,505],120);
    const flake=await restoreMaster('echantillons',[266,943,98,128],105);
    const drop=await restoreMaster('echantillons',[724,287,84,123],108);
    // Use the cloud from the snow picture, whose top and precipitation are separate.
    const cloud=await restoreMaster('echantillons',[42,675,537,250],105);
    const iconSources={
        'mostly-clear-day':'30','mostly-clear-night':'29','broken-night':'27',
        'drizzle-light':'08','drizzle':'09','drizzle-heavy':'10','rain-heavy':'12',
        'snow-light':'13','snow-heavy':'16','snow-grains':'06',
        'showers-light-day':'281','showers-day':'325','showers-heavy-day':'39',
        'showers-heavy-night':'45','snow-showers-day':'322','snow-showers-heavy-night':'46',
        'thunder-night':'47'
    };
    const pictures={ 'clear-day':sun,'clear-night':moon,'broken-day':sky,'overcast':cloudBank,
        fog,rain,snow,'thunder-day':storm };
    for(const [name,id] of Object.entries(iconSources))pictures[name]=await hdOriginal(id);

    // Only draw combinations that have no complete source in the collection.
    const ice=await hdOriginal('25');
    const freeze=async(base)=>drawLayers(500,420,[[base,0,0,490,385],[ice,360,278,112,112]]);
    pictures['freezing-drizzle']=await freeze(pictures.drizzle);
    pictures['freezing-rain']=await freeze(pictures['drizzle-heavy']);
    pictures.rime=await drawLayers(500,246,[[fog,0,0,480,211],[flake,340,148,106,94]]);
    pictures['rain-light']=await drawLayers(500,380,[[cloud,0,0,500,238],[drop,132,231,72,112],[drop,295,235,72,112]]);
    const nightSky=pictures['broken-night'];
    const nightShower=async(positions)=>drawLayers(500,420,[[nightSky,0,0,500,308],...positions.map(([x,y])=>[drop,x,y,65,98])]);
    pictures['showers-light-night']=await nightShower([[140,295],[281,304]]);
    pictures['showers-night']=await nightShower([[80,290],[173,315],[267,306],[361,292]]);
    pictures['snow-showers-night']=await drawLayers(500,425,[[nightSky,0,0,500,310],[flake,122,301,98,105],[flake,281,294,98,105]]);
    const daySnowSky=await hdOriginal('324');
    pictures['snow-showers-heavy-day']=await drawLayers(500,452,[[daySnowSky,0,0,500,343],...[[36,314],[123,350],[212,326],[304,347],[395,318]].map(([x,y])=>[flake,x,y,69,88])]);
    const grain=await cropAlpha(await crop(await source('06'),9,61,23,16));
    pictures['thunder-hail']=await drawLayers(500,450,[[storm,0,0,500,438],[grain,45,324,48,52],[grain,332,350,49,48],[grain,396,366,57,47]]);
    const labels=JSON.parse(await fs.readFile(path.join(__dirname,'noms.json'),'utf8'));
    const files=(await fs.readdir(path.join(__dirname,'originaux'))).filter(f=>f.endsWith('.png')).sort((a,b)=>a.localeCompare(b,'fr',{numeric:true}));
    const fingerprint=async file=>createHash('sha256').update(await fs.readFile(file)).digest('hex');
    const existing=new Map();
    const direct={...iconSources,'clear-day':'32','clear-night':'31','broken-day':'28','overcast':'26','fog':'20','rain':'11','snow':'14','thunder-day':'04'};
    for(const [name,id] of Object.entries(direct))existing.set(await fingerprint(original(id)),'wx-'+name);
    const catalogue=[];
    for(const file of files){
        const id=path.basename(file,'.png'),hash=await fingerprint(original(id));
        let key=existing.get(hash);
        if(!key){
            key='collection-'+(id==='Sans titre'?'nuages-sombres':id);
            pictures[key]=await hdOriginal(id);
            existing.set(hash,key);
        }
        if(!labels[id])throw Error('Missing label for '+id);
        catalogue.push({id,label:labels[id],file:key+'.webp'});
    }
    await fs.writeFile(path.join(output,'../collection.json'),JSON.stringify(catalogue,null,2)+'\n');
        for(const [name,picture] of Object.entries(pictures)){
        const tight=await cropAlpha(picture,7);
        const side=name.startsWith('clear-')?415:474;
        const framed=await drawLayers(size,size,[[tight,(size-side)/2,12,side,488]]);
        await sharp(framed).webp({quality:94,alphaQuality:100,effort:5,smartSubsample:true}).toFile(path.join(output,(name.startsWith('collection-')?'':'wx-')+name+'.webp'));
    }
    console.log(Object.keys(pictures).length+' images Météo74');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
