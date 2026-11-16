import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const geometryHash=coords=>createHash('sha256').update(JSON.stringify(coords)).digest('hex');
export function locateStops(coords,stops,locations){
 let previous=0;const result=[];
 for(let j=0;j<stops.length;j++){
  const loc=locations[stops[j].id],p=[loc[1],loc[2]];let best=null;
  for(let i=Math.floor(previous);i<coords.length-1;i++){
   const a=coords[i],b=coords[i+1],dx=(b[0]-a[0])*103000,dy=(b[1]-a[1])*111200;
   const t=Math.max(0,Math.min(1,(((p[0]-a[0])*103000*dx+(p[1]-a[1])*111200*dy)/(dx*dx+dy*dy))||0));
   if(i+t<previous)continue;
   const distance=Math.hypot((p[0]-a[0]-t*(b[0]-a[0]))*103000,(p[1]-a[1]-t*(b[1]-a[1]))*111200);
   if(!best||distance<best.distance-1)best={at:i+t,distance};
  }
  if(!best||best.distance>100)throw Error('Correction does not match stop '+stops[j].id+' at position '+j);
  previous=best.at;result.push({...stops[j],at:+best.at.toFixed(5)});
 }
 return result;
}
export async function applyCorrections(dataDir){
 const read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
 const net=await read(path.join(dataDir,'network.json'));
 const rules=await read(path.join(root,'corrections/routes.json'));const review=[];
 for(const rule of rules){
  const route=net.routes.find(r=>r.id===rule.routeId);if(!route){review.push({routeId:rule.routeId,status:'route-missing'});continue}
  const filename=path.join(dataDir,'routes',rule.routeId+'.json'),data=await read(filename);
  const replacement=await read(path.join(root,'corrections',rule.geometryFile));
  const stopMatch=JSON.stringify(data.stops.map(s=>s.id))===JSON.stringify(rule.expectedStopIds);
  const hash=geometryHash(data.coords),sourceMatch=hash===rule.baseGeometryHash||hash===geometryHash(replacement);
  let valid=stopMatch&&sourceMatch;
  if(valid){try{data.stops=locateStops(replacement,data.stops,net.locations);data.coords=replacement}catch{valid=false}}
  if(!valid)data.coords=[];
  route.geometry=data.coords.length>1;
  route.correction={status:valid?'verified':'needs-review',checked:rule.checked,source:rule.source,sourceName:rule.sourceName,note:valid?rule.note:'上游站序或道路已有變動，這筆人工修正需要重新核對；暫不顯示道路。'};
  await fs.writeFile(filename,JSON.stringify(data));review.push({routeId:rule.routeId,status:route.correction.status});
 }
 net.meta.geometryCount=net.routes.filter(r=>r.geometry).length;net.meta.corrections=review;
 await fs.writeFile(path.join(dataDir,'network.json'),JSON.stringify(net));
 const coverage=await read(path.join(dataDir,'coverage.json'));
 coverage.geometry=net.meta.geometryCount;coverage.missing=net.routes.length-net.meta.geometryCount;coverage.corrections=review;
 for(const [company,v]of Object.entries(coverage.byCompany))v.geometry=net.routes.filter(r=>r.company===company&&r.geometry).length;
 await fs.writeFile(path.join(dataDir,'coverage.json'),JSON.stringify(coverage,null,2));return review;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(await applyCorrections(path.resolve(process.argv[2]||'data')),null,2));
