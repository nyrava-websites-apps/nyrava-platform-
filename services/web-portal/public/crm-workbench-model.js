(function(root,factory){const model=factory();if(typeof module==='object'&&module.exports)module.exports=model;else root.NyravaCrm=model;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const buyer=['NEW','CONTACTED','QUALIFIED','SHOWING','OFFER','UNDER_CONTRACT','CLOSED','NURTURE','LOST'];
const seller=['NEW','CONTACTED','CONSULTATION','PREPARING','LISTED','OFFER','UNDER_CONTRACT','CLOSED','NURTURE','LOST'];
const labels={NEW:'New lead',CONTACTED:'Contacted',QUALIFIED:'Qualified',SHOWING:'Touring',OFFER:'Offer',UNDER_CONTRACT:'Under contract',CLOSED:'Closed',NURTURE:'Nurture',LOST:'Lost',CONSULTATION:'Consultation',PREPARING:'Listing preparation',LISTED:'Listed',FOLLOW_UP:'Follow up',APPOINTMENT:'Appointment'};
return {
emailDraft:(email,subject,body)=>{if(!/^[^\s@<>:,;?&#%]+@[^\s@<>:,;?&#%]+\.[^\s@<>:,;?&#%]+$/.test(email))throw Error('A valid client email is required.');return 'mailto:'+encodeURIComponent(email)+'?subject='+encodeURIComponent(subject||'')+'&body='+encodeURIComponent(body||'');},
phoneLink:(phone,kind='tel')=>{if(!/^\+?[0-9() .-]{7,30}$/.test(phone||''))throw Error('A valid client phone number is required.');const clean=phone.replace(/[^+0-9]/g,'');if(clean.replace(/\D/g,'').length<7||clean.replace(/\D/g,'').length>15)throw Error('A valid client phone number is required.');return (kind==='sms'?'sms:':'tel:')+clean;},
stages:type=>(String(type).toUpperCase()==='SELLER'?seller:buyer).slice(),stageLabel:s=>labels[s]||s||'New',
esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
openTasks:rows=>rows.filter(x=>!x.completed).slice().sort((a,b)=>new Date(a.dueAt)-new Date(b.dueAt)),
sourceLabel:c=>c.kind==='manual'?'Manually added · not platform verified':'Nyrava-delivered lead',
iso:value=>{const d=new Date(value);if(!value||!Number.isFinite(d.getTime()))throw Error('Choose a valid date and time.');return d.toISOString();},
key:c=>c.kind+':'+c.id};
});
