(function(r,f){const m=f();if(typeof module==='object'&&module.exports)module.exports=m;else r.CrmCalendar=m;})(globalThis,()=>({
 onDay:(e,d)=>{const start=new Date(d.getFullYear(),d.getMonth(),d.getDate()),end=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1);return new Date(e.startsAt)<end&&new Date(e.endsAt)>start;},
 lanes:rows=>{const result={};let cluster=[],edge=-Infinity;function flush(){const ends=[];for(const e of cluster){let column=ends.findIndex(end=>end<=+new Date(e.startsAt));if(column<0)column=ends.length;ends[column]=+new Date(e.endsAt);result[e.key]={column};}for(const e of cluster)result[e.key].total=ends.length;cluster=[];}for(const e of rows.slice().sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt))){if(+new Date(e.startsAt)>=edge){flush();edge=-Infinity;}cluster.push(e);edge=Math.max(edge,+new Date(e.endsAt));}flush();return result;},
 unique:rows=>Array.from(new Map(rows.map(x=>[x.key,x])).values()),
 matches:(e,a,d)=>a.has(e.attendance)&&d.has(e.disposition),
 labels:{SET:'Appointment set',KEPT:'Appointment kept',MISSED:'Missed / no-show',CANCELLED:'Cancelled',RESCHEDULED:'Rescheduled',NONE:'No outcome yet',CALLBACK:'Callback needed',FOLLOW_UP:'Follow-up needed',NOT_INTERESTED:'Not interested',SOLD:'Sold by team',BOUGHT:'Bought with team',ALREADY_SOLD:'Already sold elsewhere',ALREADY_BOUGHT:'Already bought elsewhere'}
}));
