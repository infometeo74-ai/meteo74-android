// Météo74 · images publiques proposées par les offices de tourisme et les domaines.
(function(root){
'use strict';
const sources={
 "annecy": "https://www.lac-annecy.com/webcams/",
 "clusaz": "https://www.laclusaz.com/webcams/",
 "bornand": "https://www.legrandbornand.com/webcams/",
 "chatel": "https://www.chatel.com/webcams/",
 "gets": "https://www.lesgets.com/webcams/",
 "brevent": "https://domaineschamonix.montblancnaturalresort.com/fr/info-live/brevent",
 "flegere": "https://domaineschamonix.montblancnaturalresort.com/fr/info-live/flegere",
 "grands": "https://domaineschamonix.montblancnaturalresort.com/fr/info-live/grands-montets",
 "balme": "https://domaineschamonix.montblancnaturalresort.com/fr/info-live/balme",
 "massif": "https://www.grand-massif.com/webcams/"
};
const cameras=[
 ["Annecy", "Vue sur le lac", "Lac d’Annecy", "annecy", "mega_annecy"],
 ["Doussard", "Plage du Bout-du-Lac", "Lac d’Annecy", "annecy", "2gUqi-p9lYX-Jbt5V-5LJfy"],
 ["Talloires", "Baie de Talloires", "Lac d’Annecy", "annecy", "pere-bise_auberge"],
 ["Semnoz", "Sommet du télémix", "Lac d’Annecy", "annecy", "mega_semnoz_somnoz-sommet-tmx"],
 ["La Clusaz", "Plateau de Beauregard", "Aravis et Bornes", "clusaz", "la-clusaz_beauregard"],
 ["La Clusaz", "Massif de l’Étale", "Aravis et Bornes", "clusaz", "la-clusaz_massif-de-l-etale"],
 ["Le Grand-Bornand", "Le village", "Aravis et Bornes", "bornand", "qGF7r-nm5xr-GdeyA-KsJVW"],
 ["Le Grand-Bornand", "Le Chinaillon", "Aravis et Bornes", "bornand", "1vkjM-btDJb-I0RrE-GfIeL"],
 ["Le Grand-Bornand", "Mont Lachat", "Aravis et Bornes", "bornand", "TWYys-vfsKu-ZeRxz-0YTRq"],
 ["Plateau des Glières", "Le plateau", "Aravis et Bornes", "annecy", "mega_cg74_plateau-des-glieres"],
 ["Châtel", "Le village", "Chablais", "chatel", "chatel_village"],
 ["Châtel", "Lac de Vonnes", "Chablais", "chatel", "EBZ9O-Aw377-GbriG-1LWTl"],
 ["Châtel", "Sommet du Morclan", "Chablais", "chatel", "chatel_morclan"],
 ["Les Gets", "Panorama des pistes", "Chablais", "gets", "RwG3k-rmnHA-mK6y9-coMkh"],
 ["Flaine", "Le Forum", "Grand Massif", "massif", "mega_grand-massif_flaine-1600"],
 ["Les Carroz", "Arrivée de la télécabine", "Grand Massif", "massif", "mega_carroz"],
 ["Morillon", "Les Esserts", "Grand Massif", "massif", "mega_grand-massif_morillon-1100"],
 ["Samoëns", "Tête des Saix", "Grand Massif", "massif", "mega_grand-massif_samoens-tete-des-saix"],
 ["Chamonix", "Le Brévent", "Mont-Blanc", "brevent", "xaWrY-m5fOs-XSrlx-8hsL4"],
 ["Les Praz", "La Flégère", "Mont-Blanc", "flegere", "AmGPg-3mU1u-abPyA-pZdTV"],
 ["Argentière", "Plateau de Lognan", "Mont-Blanc", "grands", "s97kZ-pTJy3-EHTnV-2B4qC"],
 ["Vallorcine", "Tête de Balme", "Mont-Blanc", "balme", "ZIRrq-eWGqc-8S4Zb-w3J8p"]
];
const minute=60000;
const formatter=new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Paris'});
function photo(camera,large=false){
 const id=camera[4];
 return /^[a-z0-9]{5}(-[a-z0-9]{5}){3}$/i.test(id)?'https://api.skaping.com/'+id+'/media/latest/'+(large?'large':'small')+'.jpg':'https://www.trinum.com/ibox/ftpcam/'+id+'.jpg';
}
function create({$,icon,escape,openDialog}){
 const groups=[...new Set(cameras.map(c=>c[2]))],cache=new Map(),pending=new Map();
 let group='',visible=false,observer=null,activeId=null,detailGeneration=0,lastDraw=0;
 $('cam-area').innerHTML='<option value="">Toute la Haute-Savoie</option>'+groups.map(x=>'<option>'+escape(x)+'</option>').join('');
 function dated(time){
  return time?(Date.now()-time>86400000?'Dernière image · ':'Image du ')+formatter.format(time):'Heure de l’image non publiée';
 }
 async function load(id,large=false,force=false){
  const camera=cameras[id],url=photo(camera,large),old=cache.get(url);
  if(!force&&old&&Date.now()-old.at<5*minute)return old;
  if(pending.has(url))return pending.get(url).task;
  const ctl=new AbortController(),timeout=setTimeout(()=>ctl.abort(),16000);
  const job=(async()=>{
   const res=await fetch(url,{signal:ctl.signal,credentials:'omit',cache:force?'reload':'default'});
   if(!res.ok||!res.headers.get('Content-Type')?.startsWith('image/'))throw Error('Image indisponible');
   const blob=await res.blob();
   if(ctl.signal.aborted||!blob.size)throw Error('Image indisponible');
   const image=URL.createObjectURL(blob),time=Date.parse(res.headers.get('Last-Modified'));
   const item={image,time:Number.isFinite(time)?time:null,at:Date.now()};
   if(old)URL.revokeObjectURL(old.image);
   cache.set(url,item);return item;
  })().finally(()=>{clearTimeout(timeout);if(pending.get(url)?.ctl===ctl)pending.delete(url);});
  pending.set(url,{ctl,task:job});return job;
 }
 function showImage(img,data){img.src=data.image;img.hidden=false;}
 async function card(button,force=false){
  const id=Number(button.dataset.camera),time=button.querySelector('time'),img=button.querySelector('img');
  try{
   const data=await load(id,false,force);if(!visible||!button.isConnected)return;
   showImage(img,data);time.textContent=dated(data.time);
  }catch{
   if(!visible||!button.isConnected)return;
   const old=cache.get(photo(cameras[id]));
   if(old){showImage(img,old);time.textContent=dated(old.time)+' · enregistrée';}
   else time.textContent='Image indisponible';
  }
 }
 function render(force=false){
  if(!visible)return;lastDraw=Date.now();observer?.disconnect();
  const list=cameras.map((c,id)=>({c,id})).filter(({c})=>!group||c[2]===group);
  $('cam-count').textContent=list.length+' webcams';
  $('cam-grid').innerHTML=list.map(({c,id})=>'<button class="cam-card" data-camera="'+id+'" aria-label="Agrandir la webcam · '+escape(c[0]+' · '+c[1])+'"><span class="cam-image">'+icon('camera')+'<img hidden alt="" decoding="async"></span><span class="cam-text"><b>'+escape(c[0])+'</b><span>'+escape(c[1])+'</span><time>Chargement…</time></span></button>').join('');
  const buttons=[...$('cam-grid').children];
  if('IntersectionObserver' in root){
   observer=new IntersectionObserver(entries=>entries.filter(e=>e.isIntersecting).forEach(e=>{observer.unobserve(e.target);card(e.target,force);}),{rootMargin:'75px'});
   buttons.forEach(b=>observer.observe(b));
  }else buttons.forEach(b=>card(b,force));
 }
 async function detail(id,force=false){
  const c=cameras[id],gen=++detailGeneration;activeId=id;
  $('cam-title').textContent=c[0];$('cam-location').textContent=c[1]+' · '+c[2];$('cam-credit').href=sources[c[3]];
  const img=$('cam-large'),small=cache.get(photo(c)),old=cache.get(photo(c,true));
  const initial=old||small;
  if(initial)showImage(img,initial);else{img.removeAttribute('src');img.hidden=true;}
  $('cam-time').textContent=initial?dated(initial.time):'Chargement de l’image…';openDialog('cam-dialog');
  try{
   const data=await load(id,true,force);
   if(gen!==detailGeneration||!$('cam-dialog').open)return;
   showImage(img,data);$('cam-time').textContent=dated(data.time);
  }catch{if(gen===detailGeneration)$('cam-time').textContent=initial?dated(initial.time)+' · agrandissement indisponible':'Image momentanément indisponible.';}
 }
 $('cam-area').onchange=()=>{group=$('cam-area').value;render();};
 $('cam-grid').onclick=e=>{const b=e.target.closest('[data-camera]');if(b)detail(Number(b.dataset.camera));};
 $('cam-retry').onclick=()=>{if(activeId!==null)detail(activeId,true);};
 $('cam-dialog').addEventListener('close',()=>{detailGeneration++;activeId=null;});
 return {enter(){visible=true;render();},refresh(force=false){if(visible&&(force||Date.now()-lastDraw>5*minute))render(force);},leave(){
  visible=false;observer?.disconnect();for(const p of pending.values())p.ctl.abort();pending.clear();
  $('cam-grid').replaceChildren();for(const x of cache.values())URL.revokeObjectURL(x.image);cache.clear();
 }};
}
root.MeteoWebcams={create};
})(globalThis);
