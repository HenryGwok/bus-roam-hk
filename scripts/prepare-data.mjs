import fs from 'node:fs/promises';
import path from 'node:path';
const input=path.resolve(process.argv[2] || '../../work/bus-data');
const out=path.resolve(process.argv[3] || 'data');
await fs.mkdir(out+'/routes',{recursive:true});
const json=async p=>JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));
function csv(s){let rows=[],row=[],v='',q=false;for(let i=0;i<s.length;i++){let c=s[i];if(c==='"'){if(q&&s[i+1]==='"'){v+='"';i++}else q=!q;}else if(c===','&&!q){row.push(v);v=''}else if(c==='\n'&&!q){row.push(v.replace(/\r$/,''));rows.push(row);row=[];v=''}else v+=c;}if(v){row.push(v);rows.push(row)}return rows;}
const table=async n=>{let [head,...rows]=csv((await fs.readFile(input+'/gtfs/'+n+'.txt','utf8')).replace(/^\uFEFF/,''));return rows.map(r=>Object.fromEntries(head.map((k,i)=>[k,r[i]])))};
const seconds=s=>s?.split(':').reduce((a,b)=>a*60+Number(b),0);
const routes=new Map(),stops=new Map();
const clean=s=>{s=s.replace(/<br\s*\/?\s*>/gi,' ').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();const parts=s.split('/ ');return parts.length===2&&parts[1].startsWith(parts[0])?parts[1]:s;};
for(const file of ['bus','gmb'])for(const f of (await json(input+'/'+file+'.json')).features){
 const p=f.properties;if(!['KMB','LWB','CTB','KMB+CTB','LWB+CTB','NLB','LRTFeeder','GMB'].includes(p.companyCode))continue;
 const key=p.routeId+'-'+p.routeSeq;
 if(!routes.has(key))routes.set(key,{id:key,number:p.routeNameC,company:p.companyCode,region:p.district,origin:clean(p.routeSeq===2?p.locEndNameC:p.locStartNameC),destination:clean(p.routeSeq===2?p.locStartNameC:p.locEndNameC),circular:/循環/.test(p.locEndNameC),special:p.specialType,updated:p.lastUpdateDate.slice(0,10),source:p.hyperlinkC,stops:[],schedule:[]});
 const id=String(p.stopId);if(!stops.has(id))stops.set(id,{id,name:clean(p.stopNameC),coord:f.geometry.coordinates,entries:[]});
 routes.get(key).stops.push({id,seq:p.stopSeq,pick:p.stopPickDrop!==1});
}
for(const r of routes.values())r.stops.sort((a,b)=>a.seq-b.seq);
const windows=new Map();
function add(trip,a,b){const [route,seq,service]=trip.split('-');const id=route+'-'+seq;if(!routes.has(id)||!Number.isFinite(a)||!Number.isFinite(b))return;const key=id+':'+service;if(!windows.has(key))windows.set(key,[id,service,a,b]);else{let w=windows.get(key);w[2]=Math.min(w[2],a);w[3]=Math.max(w[3],b)}}
for(const f of await table('frequencies'))add(f.trip_id,seconds(f.start_time),seconds(f.end_time));
// GTFS trip IDs are documented route-direction-service-departure tuples.
for(const t of await table('trips')){const hhmm=t.trip_id.split('-')[3];if(/^\d{4}$/.test(hhmm||'')){const sec=Number(hhmm.slice(0,2))*3600+Number(hhmm.slice(2))*60;add(t.trip_id,sec,sec)}}
for(const [id,service,a,b] of windows.values())routes.get(id).schedule.push([service,a,b]);
const calendar=Object.fromEntries((await table('calendar')).map(c=>[c.service_id,[c.start_date,c.end_date,...['monday','tuesday','wednesday','thursday','friday','saturday','sunday'].map(k=>+c[k])]]));
const exceptions={};for(const c of await table('calendar_dates'))(exceptions[c.service_id]??={})[c.date]=+c.exception_type;
const geos=new Map(),geoDir=input+'/geometry/route-waypoints-gh-pages';
for(const file of await fs.readdir(geoDir)){if(!/^\d+-[OI]\.json$/.test(file))continue;let d=await json(geoDir+'/'+file);for(const f of d.features||[]){const p=f.properties;geos.set(p.ROUTE_ID+'-'+p.ROUTE_SEQ,f.geometry)}}
const dist=(a,b)=>Math.hypot((a[0]-b[0])*103000,(a[1]-b[1])*111200);
function project(p,a,b){const x=(b[0]-a[0])*103000,y=(b[1]-a[1])*111200;const t=Math.max(0,Math.min(1,(((p[0]-a[0])*103000*x+(p[1]-a[1])*111200*y)/(x*x+y*y))||0));const c=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];return {t,d:dist(p,c),c}}
let matched=0,missing=[],bad=[],maxError=0;
for(const r of routes.values()){
 const geom=geos.get(r.id);let coords=[];
 if(geom){const pieces=geom.type==='LineString'?[geom.coordinates]:geom.coordinates;for(const line of pieces)for(const p of line){const c=p.slice(0,2);if(!coords.length||dist(coords.at(-1),c)>0.15)coords.push(c)}}
 if(coords.length>1){
  const first=stops.get(r.stops[0].id).coord,last=stops.get(r.stops.at(-1).id).coord;
  if(dist(first,coords.at(-1))+dist(last,coords[0])+50<dist(first,coords[0])+dist(last,coords.at(-1)))coords.reverse();
  let prev=0,errors=[];
  for(let j=0;j<r.stops.length;j++){
   let p=stops.get(r.stops[j].id).coord,candidates=[];
   for(let i=Math.floor(prev);i<coords.length-1;i++){const v=project(p,coords[i],coords[i+1]);if(i+v.t+0.0001<prev)continue;candidates.push({pos:i+v.t,...v})}
   let min=Math.min(...candidates.map(c=>c.d));let best=candidates.find(c=>c.d<=min+4);
   if(j===r.stops.length-1&&dist(p,coords.at(-1))<60)best={pos:coords.length-1,d:dist(p,coords.at(-1))};
   if(best){r.stops[j].at=+best.pos.toFixed(5);prev=best.pos+0.00001;errors.push(best.d)}else errors.push(9999);
  }
  const error=Math.max(...errors);maxError=Math.max(maxError,error);
  if(error>250){bad.push({id:r.id,number:r.number,error:Math.round(error)});coords=[]}else matched++;
 }
 if(!coords.length)missing.push(r.id);
 r.geometry=!!coords.length;
 // Keep directions distinct even when an official stop is visited twice.
 for(let i=0;i<r.stops.length-1;i++){const s=r.stops[i];if(s.pick){const point=stops.get(s.id);const next=stops.get(r.stops[i+1].id).coord;const dx=(next[0]-point.coord[0])*103000,dy=(next[1]-point.coord[1])*111200;s.bearing=(Math.atan2(dx,dy)*180/Math.PI+360)%360;point.entries.push([r.id,i,Math.round(s.bearing)])}}
 await fs.writeFile(out+'/routes/'+r.id+'.json',JSON.stringify({coords,stops:r.stops}));
}
const used=[...stops.values()].filter(s=>s.entries.length);
const index={meta:{built:new Date().toISOString(),routeCount:routes.size,stopCount:used.length,geometryCount:matched,geometryVersions:await json(geoDir+'/0versions.json').catch(()=>({})),sources:['https://data.gov.hk/tc-data/dataset/hk-td-tis_23-routes-fares-geojson','https://data.gov.hk/tc-data/dataset/hk-td-tis_11-pt-headway-en','https://github.com/hkbus/route-waypoints']},routes:[...routes.values()].map(({stops,...r})=>({...r,stopCount:stops.length})),stops:used,calendar,exceptions};
// Include alighting-only stops in the route details lookup.
index.locations=Object.fromEntries([...stops.values()].map(s=>[s.id,[s.name,...s.coord]]));
await fs.writeFile(out+'/network.json',JSON.stringify(index));
const report={routes:routes.size,stops:used.length,geometry:matched,missing:missing.length,rejected:bad,byCompany:Object.fromEntries([...new Set(index.routes.map(r=>r.company))].map(c=>[c,{total:index.routes.filter(r=>r.company===c).length,geometry:index.routes.filter(r=>r.company===c&&r.geometry).length}]))};
await fs.writeFile(out+'/coverage.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
