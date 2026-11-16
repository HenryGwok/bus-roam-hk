export function serviceStatus(route,iso,calendar,exceptions){
 if(!route.schedule?.length)return 'unknown';
 const [date,time]=iso.split('T');if(!date||!time)return 'unknown';
 const seconds=Number(time.slice(0,2))*3600+Number(time.slice(3,5))*60;
 let dated=false,point=false;
 for(const back of [0,1]){
  const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-back);
  const key=d.toISOString().slice(0,10).replaceAll('-',''),day=(d.getUTCDay()+6)%7,t=seconds+back*86400;
  for(const [id,start,end]of route.schedule){const c=calendar[id],override=exceptions[id]?.[key];const active=override===1||(override!==2&&c&&key>=c[0]&&key<=c[1]&&c[2+day]===1);if(!active)continue;dated=true;if(start===end){point=true;if(t===start)return 'active'}else if(t>=start&&t<=end)return 'active';}
 }
 return point&&dated?'scheduled':'inactive';
}
export function clipPath(coords,at){if(!coords?.length||!Number.isFinite(at))return [];const i=Math.floor(at),t=at-i;if(i>=coords.length-1)return [coords.at(-1)];const a=coords[i],b=coords[i+1];return [[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])],...coords.slice(i+1)];}
export function pointSegmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y;const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy)||0));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
export function directionGroups(entries){const groups=new Map();for(const e of entries){const sector=Math.round(e[2]/45)%8;if(!groups.has(sector))groups.set(sector,{bearing:sector*45,entries:[]});groups.get(sector).entries.push(e)}return [...groups.entries()].sort((a,b)=>a[0]-b[0]).map(([,g])=>g);}
export const directionName=b=>['北','東北','東','東南','南','西南','西','西北'][Math.round(b/45)%8];
export function serviceHours(route,iso,calendar,exceptions){
 if(!route.schedule?.length)return '服務時間待確認・請查官方時間表';
 const date=iso.split('T')[0],key=date.replaceAll('-',''),day=(new Date(date+'T00:00:00Z').getUTCDay()+6)%7;
 const fmt=n=>(n>=86400?'翌日 ':'')+String(Math.floor(n/3600)%24).padStart(2,'0')+':'+String(Math.floor(n/60)%60).padStart(2,'0');
 const time=([,a,b])=>a===b?fmt(a)+' 開出':fmt(a)+'–'+fmt(b);
 const valid=id=>{const c=calendar[id],o=exceptions[id]?.[key];return o===1||(o!==2&&c&&key>=c[0]&&key<=c[1]&&c[2+day]===1)};
 const today=route.schedule.filter(s=>valid(s[0]));
 const previous=new Date(date+'T00:00:00Z');previous.setUTCDate(previous.getUTCDate()-1);const pk=previous.toISOString().slice(0,10).replaceAll('-',''),pd=(previous.getUTCDay()+6)%7,seconds=Number(iso.slice(11,13))*3600+Number(iso.slice(14,16))*60+86400;
 const overnight=route.schedule.filter(([id,a,b])=>{const c=calendar[id],o=exceptions[id]?.[pk];return b>=86400&&seconds>=a&&seconds<=b&&(o===1||(o!==2&&c&&pk>=c[0]&&pk<=c[1]&&c[2+pd]===1))});
 if(today.length||overnight.length)return (today.length?'所選日期總站開出：'+[...new Set(today.map(time))].join('；'):'')+(overnight.length?(today.length?'；':'')+'前一服務日延續班次：'+[...new Set(overnight.map(time))].join('；'):'');
 const labels=['一','二','三','四','五','六','日'];const rows=route.schedule.map(s=>{const c=calendar[s[0]];if(!c)return '指定服務日 '+time(s);const days=labels.filter((_,i)=>c[i+2]===1);const label=days.length===7?'每日':days.length?'週'+days.join('、'):'指定服務日';return label+' '+time(s)+'（'+c[0]+'–'+c[1]+'）'});
 return '所選日期沒有列載班次；資料列載總站時段：'+[...new Set(rows)].join('；');
}
export const companies={'KMB':'九巴','LWB':'龍運','CTB':'城巴','KMB+CTB':'九巴／城巴','LWB+CTB':'龍運／城巴','NLB':'嶼巴','LRTFeeder':'港鐵巴士','GMB':'綠色小巴'};
export const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
