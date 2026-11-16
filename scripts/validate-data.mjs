import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=path.resolve(process.argv[2]||'data');
const net=JSON.parse(await fs.readFile(path.join(dir,'network.json'),'utf8'));
assert.ok(net.routes.length&&net.stops.length,'Empty network');
assert.equal(net.meta.routeCount,net.routes.length);
assert.equal(net.meta.stopCount,net.stops.length);
assert.equal(net.meta.geometryCount,net.routes.filter(r=>r.geometry).length);
const lookup=new Map();
for(const r of net.routes){
 assert.ok(!lookup.has(r.id),'Duplicate route '+r.id);
 const d=JSON.parse(await fs.readFile(path.join(dir,'routes',r.id+'.json'),'utf8'));
 assert.ok(d.stops.length>0,'No stops: '+r.id);
 assert.equal(r.geometry,d.coords.length>1,'Geometry flag: '+r.id);
 for(const p of d.coords)assert.ok(p.length===2&&p.every(Number.isFinite),'Invalid point: '+r.id);
 let last=-1;
 for(const s of d.stops){
  assert.ok(net.locations[s.id],'Missing stop '+s.id);
  if(r.geometry){assert.ok(Number.isFinite(s.at)&&s.at>=last&&s.at<=d.coords.length-1+.00001,'Invalid stop order '+r.id);last=s.at;}
 }
 for(const [id,a,b] of r.schedule){assert.ok(net.calendar[id]||net.exceptions[id],'Unknown service day '+id);assert.ok(Number.isFinite(a)&&Number.isFinite(b)&&a<=b,'Invalid timetable '+r.id);}
 lookup.set(r.id,d);
}
for(const stop of net.stops)for(const [id,index]of stop.entries){const s=lookup.get(id)?.stops[index];assert.ok(s&&s.id===stop.id&&s.pick&&index<lookup.get(id).stops.length-1,'Invalid boarding entry '+stop.id);}
console.log(JSON.stringify({valid:true,routes:net.routes.length,stops:net.stops.length,geometry:net.meta.geometryCount}));
