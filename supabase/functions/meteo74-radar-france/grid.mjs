// OPERA CIRRUS 1 km grid, cropped to metropolitan France including Corsica.
// Extract only the DBZH band. Preserve the distinction between dry and missing.
export const area = { column: 740, row: 2400, width: 1280, height: 1300 };

export async function extractGrid(buffer) {
  const view = new DataView(buffer);
  if (view.getUint16(0, true) !== 0x4949 || view.getUint16(2, true) !== 42) throw Error("TIFF header");
  const offset = view.getUint32(4, true);
  const fields = new Map();
  for (let i = 0; i < view.getUint16(offset, true); i++) {
    const at = offset + 2 + 12 * i;
    fields.set(view.getUint16(at, true), { type: view.getUint16(at+2,true), count: view.getUint32(at+4,true), at: at+8 });
  }
  function value(tag, index=0) {
    const f=fields.get(tag);
    if (!f || index>=f.count) throw Error("TIFF field "+tag);
    const size=({3:2,4:4,12:8})[f.type];
    const at=(f.count*size<=4?f.at:view.getUint32(f.at,true))+index*size;
    if (f.type===3) return view.getUint16(at,true);
    if (f.type===4) return view.getUint32(at,true);
    if (f.type===12) return view.getFloat64(at,true);
    throw Error("Unexpected TIFF field type");
  }
  const strip=fields.get(42112);
  const meta=strip && new TextDecoder().decode(new Uint8Array(buffer,view.getUint32(strip.at,true),strip.count));
  if (value(256)!==3800 || value(257)!==4400 || value(258)!==32 || value(259)!==8 ||
      value(277)!==2 || value(284)!==1 || value(317)!==1 || value(339)!==3 ||
      value(33550)!==1000 || value(33550,1)!==1000 || Math.abs(value(33922,3))>1 ||
      Math.abs(value(33922,4))>1 || value(34736)!==55 || value(34736,1)!==10 ||
      !meta?.includes('role="description">DBZH<')) throw Error("Unexpected OPERA grid");
  const {column,row,width,height}=area, tw=value(322), th=value(323);
  if (tw!==512||th!==512) throw Error("Unexpected radar tile");
  const out=new Uint8Array(16+width*height);
  out.set([77,55,52,70]);
  const head=new DataView(out.buffer);
  [width,height,column,row].forEach((v,i)=>head.setUint16(4+2*i,v,true));
  for (let ty=Math.floor(row/th); ty<=Math.floor((row+height-1)/th); ty++) {
    for (let tx=Math.floor(column/tw); tx<=Math.floor((column+width-1)/tw); tx++) {
      const tile=ty*Math.ceil(value(256)/tw)+tx, start=value(324,tile), length=value(325,tile);
      if(!length || start+length>buffer.byteLength)throw Error("Incomplete radar block");
      const bytes=new Uint8Array(buffer,start,length);
      const decoded=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer();
      if(decoded.byteLength!==tw*th*8)throw Error("Incomplete radar tile");
      const data=new Float32Array(decoded);
      const left=Math.max(column,tx*tw), right=Math.min(column+width,(tx+1)*tw);
      const top=Math.max(row,ty*th), bottom=Math.min(row+height,(ty+1)*th);
      for(let y=top;y<bottom;y++){
        let source=2*((y-ty*th)*tw+left-tx*tw), dest=16+(y-row)*width+left-column;
        for(let x=left;x<right;x++,source+=2,dest++){
          const z=data[source];
          out[dest]=z===-9999000?255:!Number.isFinite(z)||z<=-8888000?0:Math.max(1,Math.min(254,Math.round((z+32)*2)+1));
        }
      }
    }
  }
  return new Uint8Array(await new Response(new Blob([out]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}
