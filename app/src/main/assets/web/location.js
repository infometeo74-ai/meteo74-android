/* One foreground location watch serves the moving favorite. */
(function (root) {
'use strict';
function create({onPosition,onError,fetchJSON}) {
    let watch=null, generation=0, pendingPermission=false, paused=false, last=null, lookup=null;
    let resolvedName='', lastLookup=0;
    function stop() {
        generation++;
        if(watch!==null)navigator.geolocation?.clearWatch(watch);
        watch=null; pendingPermission=false;
        lookup?.abort(); lookup=null;
    }
    async function locality(latitude,longitude,signal) {
        if(latitude>=41&&latitude<=52&&longitude>=-6&&longitude<=10) {
            const query=new URLSearchParams({lat:latitude,lon:longitude,fields:'nom'});
            try{
                const cities=await fetchJSON('https://geo.api.gouv.fr/communes?'+query,signal,7000);
                if(cities[0]?.nom)return cities[0].nom;
            }catch(e){if(signal.aborted)throw e;}
        }
        const params=new URLSearchParams({lat:latitude,lon:longitude,lang:'fr'});
        const result=await fetchJSON('https://photon.komoot.io/reverse?'+params,signal,8000);
        const p=result.features?.[0]?.properties;
        return p?.city||p?.town||p?.village||p?.district||'';
    }
    function start(userAction=false) {
        if(paused||watch!==null)return;
        if(!navigator.geolocation){onError('Localisation indisponible. Vous pouvez ajouter une ville.',true);return;}
        const id=++generation;
        pendingPermission=userAction;
        let first=true;
        watch=navigator.geolocation.watchPosition(async position=>{
            if(id!==generation)return;
            pendingPermission=false;
            if(paused){stop();return;}
            const {latitude,longitude}=position.coords;
            if(!Number.isFinite(latitude)||!Number.isFinite(longitude))return;
            const moved=!last||Math.hypot((latitude-last.latitude)*111200,(longitude-last.longitude)*111200*Math.cos(latitude*Math.PI/180))>=450;
            if(!moved&&!first&&(resolvedName||Date.now()-lastLookup<60000))return;
            first=false;
            if(moved)resolvedName='';
            const p={latitude,longitude,name:resolvedName||'Ma position'};
            last=p;onPosition(p);lookup?.abort();
            const ctl=new AbortController();lookup=ctl;lastLookup=Date.now();
            try{
                const name=await locality(latitude.toFixed(4),longitude.toFixed(4),ctl.signal);
                if(id===generation&&!ctl.signal.aborted&&name){resolvedName=name;onPosition({...p,name});}
            }catch{/* Coordinates still give the forecast when the town name is unavailable. */}
        },error=>{
            if(id!==generation)return;
            pendingPermission=false;
            const denied=error.code===1;
            if(denied||paused)stop();
            onError(denied?'Localisation refusée. Vous pouvez ajouter une ville.':'Position indisponible. Réessayez ou choisissez une ville.',denied);
        },{enableHighAccuracy:false,maximumAge:60000,timeout:18000});
    }
    return {start,stop,pause(){paused=true;if(!pendingPermission)stop();},resume(){paused=false;}};
}
root.MeteoLocation={create};
})(window);
