(function(root){
'use strict';
const minute=60000;
const formatter=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'});

function create({$,icon,escape,openDialog,catalog,normalize}){
    const {cameras,photo}=catalog;
    const grid=$('cam-grid'),area=$('cam-area'),search=$('cam-search'),dialog=$('cam-dialog');
    const cmp=new Intl.Collator('fr',{sensitivity:'base',numeric:true});
    const groups=[...new Set(cameras.map(c=>c.area))].sort(cmp.compare);
    const searchText=text=>normalize(text).replace(/\bst\b/g,'saint').replace(/\bste\b/g,'sainte');
    const entries=cameras.map((camera,id)=>({
        camera,id,text:searchText([camera.town,camera.title,camera.area].join(' '))
    })).sort((a,b)=>cmp.compare(a.camera.town,b.camera.town)||cmp.compare(a.camera.title,b.camera.title));
    area.innerHTML='<option value="">Toute la Haute-Savoie</option>'+groups.map(g=>'<option>'+escape(g)+'</option>').join('');

    const cache=new Map(),pending=new Map(),nearby=new Set(),queue=new Map();
    const imageData=new WeakMap();
    let visible=false,observer=null,loading=0,active=null,revision=0,lastDraw=0;

    function dated(time){
        if(!time)return 'Heure de l’image non communiquée';
        return (Date.now()-time>24*60*minute?'Image ancienne · ':'Image du ')+formatter.format(time);
    }

    async function load(camera,large,force){
        const url=photo(camera,large),old=cache.get(url);
        if(!force&&old&&Date.now()-old.at<5*minute){
            cache.delete(url);cache.set(url,old);return old;
        }
        if(pending.has(url))return pending.get(url).task;
        const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),16000);
        const task=(async()=>{
            let data;
            if(camera.imageOnly){
                // These municipalities publish embeddable JPEGs without cross-origin response headers.
                const direct=new URL(url);
                direct.searchParams.set('t',String(force?Date.now():Math.floor(Date.now()/(5*minute))));
                data={url:direct.href,time:null};
            }else{
                const res=await fetch(url,{signal:ctl.signal,credentials:'omit',cache:force?'reload':'no-cache'});
                if(!res.ok||!res.headers.get('Content-Type')?.startsWith('image/'))throw Error('Image indisponible');
                const blob=await res.blob(),stamp=Date.parse(res.headers.get('Last-Modified'));
                if(!blob.size||ctl.signal.aborted)throw Error('Image indisponible');
                data={blob,time:Number.isFinite(stamp)?stamp:null};
            }
            data.at=Date.now();
            cache.delete(url);cache.set(url,data);
            // Only encoded files are cached. Offscreen cards release their decoded image.
            if(cache.size>24)cache.delete(cache.keys().next().value);
            return data;
        })().finally(()=>{
            clearTimeout(timeout);
            if(pending.get(url)?.ctl===ctl)pending.delete(url);
        });
        pending.set(url,{ctl,task});return task;
    }

    function detach(img){
        const current=imageData.get(img);
        if(current?.objectURL)URL.revokeObjectURL(current.objectURL);
        imageData.delete(img);img.removeAttribute('src');img.hidden=true;
    }

    async function display(img,data){
        if(imageData.get(img)?.data===data&&!img.hidden)return;
        detach(img);
        const objectURL=data.blob?URL.createObjectURL(data.blob):null;
        const current={data,objectURL};
        imageData.set(img,current);img.src=objectURL||data.url;
        try{
            await img.decode();
            if(imageData.get(img)===current)img.hidden=false;
        }catch(error){
            if(imageData.get(img)===current)detach(img);
            throw error;
        }
    }

    async function card(button,force){
        const c=cameras[Number(button.dataset.camera)],time=button.querySelector('time'),img=button.querySelector('img');
        const live=()=>visible&&button.isConnected&&nearby.has(button);
        try{
            let data;
            try{data=await load(c,false,force);}
            catch(error){
                if(!live()||!navigator.onLine||photo(c)===photo(c,true))throw error;
                data=cache.get(photo(c))||await load(c,true,false);
            }
            if(!live())return;
            await display(img,data);
            if(live())time.textContent=dated(data.time);
        }catch{
            if(!live())return;
            const old=cache.get(photo(c));
            if(old?.blob){
                try{
                    await display(img,old);
                    if(live())time.textContent=dated(old.time)+' · enregistrée';
                    return;
                }catch{}
            }
            if(live())time.textContent='Image momentanément indisponible';
        }
    }

    function pump(){
        while(visible&&loading<4&&queue.size){
            const [button,force]=queue.entries().next().value;
            queue.delete(button);loading++;
            card(button,force).finally(()=>{loading--;pump();});
        }
    }

    function forgetCards(){
        observer?.disconnect();nearby.clear();queue.clear();
        for(const img of grid.querySelectorAll('img[src]'))detach(img);
    }

    function render(force=false){
        if(!visible)return;
        lastDraw=Date.now();forgetCards();
        const terms=searchText(search.value).split(' ').filter(Boolean);
        const list=entries.filter(({camera,text})=>(!area.value||camera.area===area.value)&&terms.every(t=>text.includes(t)));
        const places=new Set(list.map(item=>item.camera.town)).size;
        $('cam-count').textContent=list.length+' webcam'+(list.length>1?'s':'')+(places?' · '+places+' lieu'+(places>1?'x':''):'');
        grid.innerHTML=list.map(({camera:c,id})=>
            '<button class="cam-card" data-camera="'+id+'" aria-label="Agrandir la webcam · '+escape(c.town+' · '+c.title)+'">'+
            '<span class="cam-image">'+icon('camera')+'<img hidden alt="" decoding="async" referrerpolicy="no-referrer"></span>'+
            '<span class="cam-text"><b>'+escape(c.town)+'</b><span>'+escape(c.title)+'</span><time>Chargement…</time></span></button>'
        ).join('');
        $('cam-empty').hidden=list.length!==0;
        if('IntersectionObserver' in root){
            const refreshed=new WeakSet();
            const current=new IntersectionObserver(changes=>{
                if(current!==observer||!visible)return;
                for(const {target,isIntersecting} of changes){
                    if(isIntersecting){
                        nearby.add(target);queue.set(target,force&&!refreshed.has(target));
                        refreshed.add(target);
                    }
                    else{nearby.delete(target);queue.delete(target);detach(target.querySelector('img'));}
                }
                pump();
            },{rootMargin:'160px'});
            observer=current;
            for(const button of grid.children)current.observe(button);
        }else{
            for(const button of grid.children){nearby.add(button);queue.set(button,force);}
            pump();
        }
    }

    async function detail(id,force=false){
        const c=cameras[id],gen=++revision,img=$('cam-large'),status=$('cam-time');
        const live=()=>revision===gen&&dialog.open;
        const preview=cache.get(photo(c,true))||cache.get(photo(c));
        active=id;
        $('cam-title').textContent=c.town;$('cam-location').textContent=c.title+' · '+c.area;
        $('cam-credit').href=c.source;
        openDialog('cam-dialog');
        status.textContent=preview?dated(preview.time):'Chargement de l’image…';
        if(preview){
            try{await display(img,preview);}catch{}
            if(!live())return;
        }else detach(img);
        try{
            const data=await load(c,true,force);
            if(!live())return;
            await display(img,data);
            if(live())status.textContent=dated(data.time);
        }catch{
            if(!live())return;
            if(preview){
                try{await display(img,preview);}catch{}
            }
            if(live())status.textContent=preview&&!img.hidden?dated(preview.time)+' · agrandissement indisponible':'Image momentanément indisponible.';
        }
    }

    search.addEventListener('input',()=>render());
    area.onchange=()=>render();
    grid.onclick=e=>{const button=e.target.closest('[data-camera]');if(button)detail(Number(button.dataset.camera));};
    $('cam-reset').onclick=()=>{area.value='';search.value='';render();};
    $('cam-retry').onclick=()=>{if(active!==null)detail(active,true);};
    dialog.addEventListener('close',()=>{if(!dialog.open){revision++;active=null;detach($('cam-large'));}});
    return {
        enter(){visible=true;render();},
        refresh(force=false){if(visible&&(force||Date.now()-lastDraw>5*minute))render(force);},
        leave(){
            visible=false;revision++;forgetCards();grid.replaceChildren();
            for(const job of pending.values())job.ctl.abort();
            pending.clear();cache.clear();
            if(dialog.open)dialog.close();
        }
    };
}
root.MeteoWebcams={create};
})(globalThis);
