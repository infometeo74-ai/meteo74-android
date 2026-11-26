/* Estimate the regional field from forecast points on the same Mercator grid as the relief. */
(function(root) {
    'use strict';
    const bounds=[[45.48,5.48],[46.62,7.24]], width=192, height=179, count=6;
    const [[south,west],[north,east]]=bounds;
    const merc=lat=>Math.asinh(Math.tan(lat*Math.PI/180));
    const top=merc(north),bottom=merc(south);
    const latAt=y=>Math.atan(Math.sinh(top+(y+.5)*(bottom-top)/height))*180/Math.PI;
    const lonAt=x=>west+(x+.5)*(east-west)/width;
    function prepare(bytes,sites) {
        if(bytes.byteLength!==width*height*2)throw Error('Relief thermique incomplet');
        const view=new DataView(bytes);
        const dem=Uint16Array.from({length:width*height},(_,i)=>view.getUint16(i*2,true));
        const points=sites.map(({lat,lon})=>{
            const x=Math.min(width-1,Math.max(0,Math.floor((lon-west)*width/(east-west))));
            const y=Math.min(height-1,Math.max(0,Math.floor((merc(lat)-top)*height/(bottom-top))));
            return {lat,lon,z:dem[y*width+x]};
        });
        const indices=new Int16Array(dem.length*count).fill(-1);
        const distance=new Float32Array(indices.length).fill(Infinity), weights=new Float32Array(indices.length);
        for(let y=0;y<height;y++){
            const dy2=points.map(p=>((p.lat-latAt(y))*111.2)**2);
            for(let x=0;x<width;x++){
                const start=(y*width+x)*count, end=start+count, lon=lonAt(x);
                for(let p=0;p<points.length;p++){
                    const d=dy2[p]+((points[p].lon-lon)*77.25)**2;
                    if(d>=distance[end-1]||d>50*50)continue;
                    let k=end-1;
                    while(k>start && distance[k-1]>d){distance[k]=distance[k-1];indices[k]=indices[k-1];k--;}
                    distance[k]=d;indices[k]=p;
                }
                for(let k=start;k<end;k++)weights[k]=1/((1+distance[k])*(1+Math.sqrt(distance[k])/8));
            }
        }
        return {points,dem,indices,distance,weights};
    }
    function surface(plan,values,regional) {
        if(!plan||values.filter(Number.isFinite).length<3)return null;
        const {points,dem,indices,distance,weights}=plan;
        // Fit the local temperature/height relationship, including inversions. At long range the colours describe an area.
        const slopes=points.map(p=>{
            if(regional)return 0;
            let w=0,z=0,t=0,z2=0,zt=0;
            points.forEach((q,i)=>{
                if(!Number.isFinite(values[i]))return;
                const d2=((q.lon-p.lon)*77.25)**2+((q.lat-p.lat)*111.2)**2;
                if(d2>48*48)return;
                const weight=1/(1+d2/300), h=q.z-p.z;
                w+=weight;z+=weight*h;t+=weight*values[i];z2+=weight*h*h;zt+=weight*h*values[i];
            });
            const variance=w?z2-z*z/w:0;
            return variance>0?Math.max(-.009,Math.min(.006,(zt-z*t/w)/(variance+60000))):0;
        });
        const field=new Float32Array(dem.length).fill(NaN), alpha=new Uint8Array(dem.length);
        for(let i=0;i<dem.length;i++){
            let sum=0,total=0,nearest=Infinity;
            for(let k=i*count;k<(i+1)*count;k++){
                const p=indices[k];
                if(p<0||!Number.isFinite(values[p]))continue;
                const adjust=Math.max(-10,Math.min(10,(dem[i]-points[p].z)*slopes[p]));
                sum+=weights[k]*(values[p]+adjust);total+=weights[k];nearest=Math.min(nearest,distance[k]);
            }
            if(total){field[i]=sum/total;alpha[i]=220*Math.min(1,(50-Math.sqrt(nearest))/15);}
        }
        return {field,alpha};
    }
    function image(surface) {
        const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
        const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(width,height), {field,alpha}=surface;
        // Use the same continuous temperature ramp as the observations map.
        const lut=Array.from({length:601},(_,n)=>root.ObservationField.rgb('temp',n/10-21));
        for(let i=0;i<field.length;i++){
            if(!Number.isFinite(field[i]))continue;
            const c=lut[Math.min(600,Math.max(0,Math.round((field[i]+21)*10)))], j=4*i;
            pixels.data[j]=c[0];pixels.data[j+1]=c[1];pixels.data[j+2]=c[2];pixels.data[j+3]=alpha[i];
        }
        ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png');
    }
    const api={bounds,width,height,prepare,surface,image};
    if(typeof module==='object'&&module.exports)module.exports=api;else root.ForecastTemperature=api;
})(globalThis);
