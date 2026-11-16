import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const candidate=path.resolve(process.argv[2]);
const read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const old=await read('data/network.json'), next=await read(candidate+'/network.json');
const report=await read(candidate+'/update-report.json');
execFileSync(process.execPath,['scripts/validate-data.mjs',candidate],{stdio:'inherit'});
const errors=[...report.blocking];
if(report.changed.length>old.routes.length*.25) errors.push('More than 25% of routes changed');
if(Math.abs(next.stops.length-old.stops.length)>old.stops.length*.1) errors.push('Stop count changed by more than 10%');
const today=new Date().toISOString().slice(0,10).replaceAll('-','');
if(!Object.values(next.calendar).some(c=>c[1]>=today)) errors.push('Service calendar expired');
assert.equal(errors.length,0,errors.join('; '));
const normalize=n=>{const copy=structuredClone(n);delete copy.meta.built;return copy;};
let changed=JSON.stringify(normalize(old))!==JSON.stringify(normalize(next));
for(const r of next.routes){
 const previous=await fs.readFile('data/routes/'+r.id+'.json','utf8').catch(()=>null);
 if(previous!==await fs.readFile(candidate+'/routes/'+r.id+'.json','utf8')) changed=true;
}
await fs.mkdir('maintenance',{recursive:true});
if(changed){
 const active=path.resolve('data');
 assert.equal(active,path.join(process.cwd(),'data'));
 await fs.rm(active,{recursive:true});
 await fs.mkdir(active,{recursive:true});
 for(const name of ['network.json','coverage.json','routes']) await fs.cp(path.join(candidate,name),path.join(active,name),{recursive:true});
 report.requiresReview=false;report.activeUnchanged=false;report.candidate='validated GitHub Actions candidate';
 await fs.writeFile('maintenance/latest-update.json',JSON.stringify(report,null,2));
 await fs.copyFile(path.join(candidate,'download-manifest.json'),'maintenance/download-manifest.json');
}
await fs.writeFile('maintenance/last-check.json',JSON.stringify({checked:new Date().toISOString(),changed},null,2));
if(process.env.GITHUB_OUTPUT) await fs.appendFile(process.env.GITHUB_OUTPUT,'changed='+changed+'\n');
if(process.env.GITHUB_STEP_SUMMARY) await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'Bus data check: '+(changed?'validated update':'no changes')+'\n');
console.log({changed});
