import {creaSites,creaReadings,dailyStations,mountainReports,combineDay,validDay} from './normalize.mjs';

const frost='https://frost-server.monitoring.creamontblanc.org/FROST-Server/v1.1/Datastreams?';
const dayMs=86400000;
const asIso=t=>new Date(t).toISOString();
const query=p=>new URLSearchParams(p).toString();
export function createNetworks(json,memo,area) {
    async function thermometers(start,end) {
        const sites=await memo('crea-sites',dayMs,async()=>{
            const data=await json(frost+query({$filter:"endswith(name,':temperature_200cm')",$top:1000,$select:'id,name,unitOfMeasurement',$expand:'Thing($select=id;$expand=Locations($select=name,location))'}));
            return creaSites(data.value,area);
        });
        if(!sites.length)return [];
        const times='phenomenonTime ge '+asIso(start)+' and phenomenonTime le '+asIso(end);
        const data=await json(frost+query({$top:sites.length,$select:'id',$filter:sites.map(s=>'id eq '+s.id).join(' or '),$expand:'Observations($filter='+times+';$top=1;$orderby=phenomenonTime desc;$select=phenomenonTime,result)'}));
        return creaReadings(sites,data.value,area,start,end);
    }
    const dailyDataset='6569b51ae64326786e4e8e1a';
    const nivoDataset='68aeced879316c333d564f95';
    async function resource(dataset,search,match) {
        const catalog=await json('https://www.data.gouv.fr/api/2/datasets/'+dataset+'/resources/?'+query({q:search,page_size:100}));
        const item=catalog.data.filter(x=>match.test(x.url)).sort((a,b)=>b.url.localeCompare(a.url))[0];
        if(!item||!/^[-\da-f]{36}$/i.test(item.id))throw Error('Ressource absente');
        return item.id;
    }
    async function table(id,params){
        const res=await json('https://tabular-api.data.gouv.fr/api/resources/'+id+'/data/?'+query(params));
        if(!Array.isArray(res.data)||res.links?.next&&Number(params.page_size)>1)throw Error('Tableau incomplet');
        return res.data;
    }
    const dailyId=()=>memo('daily-resource',dayMs,()=>resource(dailyDataset,'QUOT_departement_74_periode',/\/Q_74_latest-\d{4}-\d{4}_RR-T-Vent\.csv\.gz$/i));
    async function latestDaily(){
        const rows=await table(await dailyId(),{AAAAMMJJ__sort:'desc',page_size:1,columns:'AAAAMMJJ'});
        const day=rows[0]?.AAAAMMJJ;
        if(!validDay(day))throw Error('Date inconnue');
        return day;
    }
    function mountainDay(day){
        const start=Date.parse(day+'T00:00:00Z'),end=start+dayMs-1,year=day.slice(0,4);
        return memo('nivo-resource-'+year,dayMs,()=>resource(nivoDataset,'nivo_'+year,new RegExp('/nivo_'+year+'\\.csv\\.gz$'))).then(id=>table(id,{geo_id_wigos__contains:'0-250-0-74',validity_time__greater:asIso(start-1),validity_time__less:asIso(end+1),page_size:100,columns:'geo_id_wigos,validity_time,name,Altitude,lat,lon,ht_neige,t,ff,dd,u'})).then(rows=>mountainReports(rows,area,start,end));
    }
    async function dayObservations(day) {
        const start=Date.parse(day+'T00:00:00Z');
        const [daily,nivo]=await Promise.allSettled([
            dailyId().then(id=>table(id,{AAAAMMJJ__exact:day,page_size:100,columns:'AAAAMMJJ,NUM_POSTE,NOM_USUEL,LAT,LON,ALTI,TN,QTN,TX,QTX,RR,QRR,FFM,QFFM,FXI,QFXI'})).then(rows=>dailyStations(rows,area,day)),
            mountainDay(day)
        ]);
        if(daily.status==='rejected'&&nivo.status==='rejected')throw Error('Bulletins indisponibles');
        const missing=[];
        if(daily.status==='rejected')missing.push('Météo-France quotidien');
        if(nivo.status==='rejected')missing.push('Réseau nivo-météorologique');
        return {mode:'daily',day,time:start,retrievedAt:Date.now(),stations:combineDay(daily.status==='fulfilled'?daily.value:[],nivo.status==='fulfilled'?nivo.value:[]),missing};
    }
    return {thermometers,latestDaily,dayObservations,mountainDay};
}
