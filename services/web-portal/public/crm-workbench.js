/* One CRM for Realtors and employees. Server authorization remains authoritative. */
(()=>{'use strict';
const M=window.NyravaCrm,$=id=>document.getElementById(id),esc=M.esc;
const state={me:null,staffId:null,view:'today',page:1,total:0,contacts:[],staff:[],canManage:false,selected:null,detail:null,tab:'activity',today:null};
let listVersion=0,detailVersion=0,todayVersion=0,searchTimer,saveHandler,saveBusy=false;
const fmt=value=>value?new Date(value).toLocaleString([],{dateStyle:'medium',timeStyle:'short'}):'Not scheduled';
const money=value=>value==null?'Not recorded':new Intl.NumberFormat(undefined,{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value);
const stageOptions=type=>[...new Set([...M.stages(type),'FOLLOW_UP','APPOINTMENT'])];
function message(text,error=false){$('notice').hidden=!text;$('notice').textContent=text;$('notice').classList.toggle('error',error);}
function scoped(path){const url=new URL('/api/workbench'+path,location.origin);if(state.staffId)url.searchParams.set('staffId',state.staffId);return url.pathname+url.search;}
async function api(url,options={}){
 const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){if(response.status===401)throw Error('Your session expired. Sign in again.');throw Error(data.error||data.detail||data.message||'Request failed ('+response.status+').');}return data;
}
const send=(path,body,method='POST')=>api(scoped(path),{method,body:JSON.stringify(body)});
const current=()=>state.detail?.contact;
function currentKey(){const c=current();return c?M.key(c):null;}
function clearSelection(){state.selected=null;state.detail=null;detailVersion++;$('detail').innerHTML='<div class="empty"><h2>Select a lead</h2><p>Your client history and next steps will appear here.</p></div>';}
async function loadContacts(){
 const version=++listVersion;$('contactList').classList.add('loading');
 try{
  const qs=new URLSearchParams({page:state.page,search:$('search').value,type:$('type').value,stage:$('stage').value});
  const data=await api(scoped('/workspace?'+qs));if(version!==listVersion)return;
  state.contacts=data.contacts;state.total=data.total;state.canManage=data.canManage;state.staff=data.staff;
  if(state.page>1&&state.contacts.length===0&&state.total>0){state.page=Math.ceil(state.total/50);return await loadContacts();}
  $('management').hidden=!data.canManage;renderContacts();renderPipeline();
 }catch(e){if(version===listVersion){state.contacts=[];$('contactList').innerHTML='<div class="empty">Leads could not be loaded.</div>';message(e.message,true);}}
 finally{if(version===listVersion)$('contactList').classList.remove('loading');}
}
function renderContacts(){
 $('resultCount').textContent=state.total+' total';$('pageLabel').textContent=state.page+' / '+Math.max(1,Math.ceil(state.total/50));
 $('previous').disabled=state.page<=1;$('next').disabled=state.page*50>=state.total;
 $('contactList').innerHTML=state.contacts.length?state.contacts.map(c=>'<button class="contact-item '+(state.selected===M.key(c)?'active':'')+'" aria-pressed="'+(state.selected===M.key(c))+'" data-open="'+esc(c.id)+'" data-kind="'+esc(c.kind)+'"><div class="lead-row-heading"><strong>'+esc(c.fullName)+'</strong><span class="stage-badge '+(c.crmStatus==='NEW'?'fresh':'')+'">'+esc(M.stageLabel(c.crmStatus))+'</span></div><small>'+esc(c.email||c.phone||'No contact channel')+'</small><div class="contact-meta"><span class="type-badge">'+esc(String(c.leadType).toUpperCase())+'</span><span>ZIP '+esc(c.zipCode||'Not recorded')+'</span></div><span class="source-badge '+(c.kind==='manual'?'manual':'platform')+'">'+(c.kind==='manual'?'Manually added':'Nyrava lead')+'</span></button>').join(''):'<div class="empty"><h2>No matching leads</h2><p>Add a lead or adjust your search.</p></div>';
}
function renderPipeline(){
 const type=$('type').value||'BUYER';
 $('pipeline').innerHTML=stageOptions(type).map(s=>'<button class="'+($('stage').value===s?'active':'')+'" data-stage-filter="'+esc(s)+'">'+esc(M.stageLabel(s))+'</button>').join('');
}
async function selectContact(kind,id,scroll=false){
 const version=++detailVersion;state.selected=kind+':'+id;state.detail=null;renderContacts();
 $('detail').innerHTML='<div class="empty">Loading client workspace…</div>';
 try{const d=await api(scoped('/contacts/'+encodeURIComponent(kind)+'/'+encodeURIComponent(id)));if(version!==detailVersion)return;
  window.dispatchEvent(new CustomEvent('nyrava-operator-context',{detail:{kind,id,label:d.contact.fullName}}));state.detail=d;state.tab='activity';renderDetail();if(scroll&&matchMedia('(max-width:800px)').matches)$('detail').scrollIntoView({behavior:'smooth',block:'start'});
 }catch(e){if(version===detailVersion){clearSelection();message(e.message,true);}}
}
function renderDetail(){
 const d=state.detail;if(!d)return;const c=d.contact;
 const tasks=M.openTasks(d.tasks);const next=tasks[0];
 const assignment=state.staff.find(s=>s.id===c.staffId);
 const stageValues=stageOptions(c.leadType);if(c.crmStatus&&!stageValues.includes(c.crmStatus))stageValues.push(c.crmStatus);
 $('detail').innerHTML='<div class="detail-header"><div class="detail-name"><div><span class="pill">'+esc(c.leadType)+'</span><h2>'+esc(c.fullName)+'</h2></div><button class="icon" data-close-contact aria-label="Close client workspace">×</button></div><p class="source">'+esc(M.sourceLabel(c))+'</p><div class="detail-links"><span>'+esc(c.email||'Email not recorded')+'</span><span>'+esc(c.phone||'Phone not recorded')+'</span></div></div>'+
 '<div class="facts"><div class="fact"><small>Budget / property value</small><strong>'+esc(money(c.budgetMax))+'</strong></div><div class="fact"><small>Timeframe</small><strong>'+esc(c.timeframe||'Not recorded')+'</strong></div><div class="fact"><small>Working with</small><strong>'+esc(assignment?.fullName||(c.staffId?'Assigned team member':'Business owner'))+'</strong></div><div class="fact"><small>Location / ZIP</small><strong>'+esc(c.zipCode||'Not recorded')+'</strong></div><div class="fact"><small>Property address</small><strong>'+esc(c.propertyAddress||'Not recorded')+'</strong></div></div>'+
 (c.statement?'<p class="brief">'+esc(c.statement)+'</p>':'')+
 '<div class="next-action"><small>NEXT FOLLOW-UP</small>'+(next?esc(next.title)+' · '+esc(fmt(next.dueAt)):'Set a follow-up so this client always has a next step.')+'</div>'+
 '<div class="detail-actions"><button data-edit="note">+ Note</button><button data-edit="task">+ Follow-up</button><button data-edit="appointment">+ Appointment</button><button data-edit="email" '+(!c.email?'disabled':'')+'>Email</button><button data-edit="sms" '+(!c.phone?'disabled':'')+'>Text</button><button data-edit="call" '+(!c.phone?'disabled':'')+'>Call</button>'+(c.kind==='manual'?'<button data-edit-contact>Edit details</button>':'')+'</div>'+
 '<div class="detail-controls"><label>Pipeline stage<select id="clientStage">'+stageValues.map(s=>'<option '+(s===c.crmStatus?'selected':'')+' value="'+esc(s)+'">'+esc(M.stageLabel(s))+'</option>').join('')+'</select></label>'+
 (state.canManage?'<label>Assigned to<select id="clientAssignment"><option value="">Business owner</option>'+state.staff.filter(s=>(s.active&&s.userId)||s.id===c.staffId).map(s=>'<option value="'+esc(s.id)+'" '+(s.id===c.staffId?'selected':'')+'>'+esc(s.fullName)+(s.active?'':' (access removed)')+'</option>').join('')+'</select></label>':'')+'</div>'+
 (c.kind==='platform'?'<div class="detail-actions"><button data-quality-report>Report lead quality</button>'+(state.canManage?'<button data-quality-review>Review quality reports</button>':'')+'</div>':'')+
 '<div id="contactAttemptEditor"></div>'+
 '<div class="detail-tabs">'+[['activity','Activity & notes'],['tasks','Tasks ('+tasks.length+')'],['appointments','Appointments'],['messages','Messages']].map(([id,label])=>'<button data-detail-tab="'+id+'" class="'+(state.tab===id?'active':'')+'">'+esc(label)+'</button>').join('')+'</div><div class="record-list" id="records"></div>';
 const tools=document.createElement('div');tools.className='detail-actions';
 const toolQuery=new URLSearchParams({kind:c.kind,id:c.id});if(state.staffId)toolQuery.set('staffId',state.staffId);
 for(const [href,label]of [['/professional-ai.html','AI work assistant'],['/professional-valuation.html','Private property valuation'],['/personal-reminders.html','Appointment reminders']]){const a=document.createElement('a');a.textContent=label;a.href=href+'?'+toolQuery;a.target='_top';tools.append(a);}
 $('detail').insertBefore(tools,$('detail').querySelector('.detail-controls'));
 renderRecords();
}
function renderRecords(){
 const d=state.detail;if(!d)return;let rows=[];
 if(state.tab==='activity')rows=d.notes.map(n=>'<article class="record"><small>'+esc(fmt(n.createdAt))+'</small><p>'+esc(n.details)+'</p></article>');
 if(state.tab==='tasks')rows=d.tasks.slice().sort((a,b)=>Number(a.completed)-Number(b.completed)||new Date(a.dueAt)-new Date(b.dueAt)).map(t=>'<article class="record"><h3 class="'+(t.completed?'completed':'')+'">'+esc(t.title)+'</h3><p>'+esc(fmt(t.dueAt))+' · '+(t.completed?'Completed':'Open')+'</p>'+(!t.completed?'<div class="record-actions"><button data-work="completeTask" data-record="'+esc(t.id)+'">Mark complete</button><button data-work="moveTask" data-record="'+esc(t.id)+'">Reschedule</button></div>':'')+'</article>');
 if(state.tab==='appointments')rows=d.appointments.slice().sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt)).map(a=>'<article class="record"><h3>'+esc(a.title)+'</h3><p>'+esc(fmt(a.startsAt))+' — '+esc(fmt(a.endsAt))+'</p><small>'+esc(a.location||'No location recorded')+' · '+esc(a.status)+'</small>'+(a.status==='SCHEDULED'?'<div class="record-actions"><button data-work="moveAppointment" data-record="'+esc(a.id)+'">Reschedule</button><button data-work="cancelAppointment" data-record="'+esc(a.id)+'">Cancel appointment</button></div>':'')+'</article>');
 if(state.tab==='messages')rows=d.communications.map(x=>'<article class="record"><small>'+esc(x.channel)+' · '+esc(x.direction)+' · '+esc(x.status)+' · '+esc(fmt(x.createdAt))+'</small><p>'+esc(x.body||'Communication event')+'</p></article>');
 $('records').innerHTML=rows.join('')||'<div class="empty"><p>'+(state.tab==='messages'&&d.contact.kind==='manual'?'Sending and reply integration for manual contacts is not connected yet.':'No '+({activity:'notes',tasks:'tasks',appointments:'appointments',messages:'messages'}[state.tab])+' yet.')+'</p></div>';
}
async function loadToday(){const version=++todayVersion;try{const data=await api(scoped('/today'));if(version!==todayVersion)return;state.today=data;
 $('metrics').innerHTML=[['Leads',data.contactCount],['Open follow-ups',data.openTasks],['Overdue',data.overdue],['Upcoming appointments',data.upcoming]].map(([label,value])=>'<div class="metric '+(label==='Overdue'&&value?'alert':'')+'"><span>'+label+'</span><strong>'+value+'</strong></div>').join('');
 if($('todayNewLeads'))$('todayNewLeads').innerHTML=(data.newLeads||[]).length?(data.newLeads||[]).map(c=>'<div class="queue-item"><div><h3>'+esc(c.fullName)+'</h3><p>'+esc(String(c.leadType).toUpperCase())+' · ZIP '+esc(c.zipCode||'Not recorded')+' · '+esc(M.sourceLabel(c))+'</p></div><button data-queue-id="'+esc(c.id)+'" data-kind="'+esc(c.kind)+'">Work lead →</button></div>').join(''):'<div class="empty"><p>No new leads awaiting first contact.</p></div>';
 if($('newLeadCount'))$('newLeadCount').textContent=(data.newLeadCount||0)+' new · showing up to 10';
 $('todayTasks').innerHTML=queue(data.tasks,'No outstanding follow-ups.');$('todayAppointments').innerHTML=queue(data.appointments,'No upcoming appointments.');renderAgenda();
 }catch(e){if(version===todayVersion){state.today=null;message(e.message,true);$('todayTasks').textContent='Unable to load follow-ups.';$('todayAppointments').textContent='Unable to load appointments.';}}
}
function queue(rows,empty){return rows.length?rows.map(x=>'<div class="queue-item '+(new Date(x.at)<new Date()?'overdue':'')+'"><div><h3>'+esc(x.title)+'</h3><p>'+esc(fmt(x.at))+'</p></div><button data-queue-id="'+esc(x.contactId)+'" data-kind="'+esc(x.kind)+'">Open client →</button></div>').join(''):'<div class="empty"><p>'+esc(empty)+'</p></div>';}
let agendaVersion=0;
async function renderAgenda(){const version=++agendaVersion;
 try{
  const start=new Date($('agendaDate').value+'T00:00:00');if(!Number.isFinite(start.getTime()))return;
  const end=new Date(start);end.setDate(end.getDate()+1);
  const data=await api(scoped('/agenda?'+new URLSearchParams({start:start.toISOString(),end:end.toISOString()})));
  if(version!==agendaVersion)return;
  const rows=[...data.tasks.map(x=>({...x,title:(x.completed?'Completed follow-up · ':'Follow-up · ')+x.title})),...data.appointments.map(x=>({...x,title:'Appointment · '+x.title}))].sort((a,b)=>new Date(a.at)-new Date(b.at));
  $('agenda').innerHTML=queue(rows,'No tasks or appointments on this date.');
 }catch(e){if(version===agendaVersion){$('agenda').textContent='Unable to load this date.';message(e.message,true);}}
}
function localDay(value){const d=new Date(value);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function localInput(value){if(!value)return'';const d=new Date(value);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);}
async function view(name){if(!['today','contacts','pipeline','calendar'].includes(name))name='contacts';state.view=name;
 $('viewTitle').textContent=({today:'Today',contacts:'Leads',pipeline:'Your pipeline',calendar:'Calendar & tasks'})[name];
 $('todayView').hidden=name!=='today';$('contactView').hidden=!['contacts','pipeline'].includes(name);$('calendarView').hidden=name!=='calendar';$('pipeline').hidden=name!=='pipeline';
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===name));
 if(name==='pipeline'&&!$('type').value)$('type').value='BUYER';
 if(name==='today'||name==='calendar')await loadToday();else await loadContacts();
}
window.addEventListener('nyrava-operator-updated',()=>refresh());
async function refresh(){message('');await Promise.all([loadContacts(),loadToday()]);const c=current();if(c)await selectContact(c.kind,c.id);}
function field(name,label,type='text',value='',full=false,attributes=''){return '<label class="'+(full?'full':'')+'">'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+attributes+'></label>';}
function textArea(name,label,value='',limit=4000){return '<label class="full">'+esc(label)+'<textarea name="'+name+'" maxlength="'+limit+'" required>'+esc(value)+'</textarea></label>';}
function editor(title,fields,handler,saveLabel='Save'){
 $('editorTitle').textContent=title;$('editorFields').innerHTML=fields;$('editorError').textContent='';$('saveEditor').textContent=saveLabel;saveHandler=handler;$('editor').showModal();
 const first=$('editorFields').querySelector('input,textarea,select');first?.focus();
}
function contactEditor(existing=null){const c=existing||{};
 const fields=field('fullName','Full name','text',c.fullName||'',true,'required maxlength="160"')+field('email','Email','email',c.email||'',false,'maxlength="320"')+field('phone','Phone','tel',c.phone||'',false,'maxlength="40"')+
 '<label>Client type<select name="leadType"><option value="BUYER" '+(c.leadType==='BUYER'?'selected':'')+'>Buyer</option><option value="SELLER" '+(c.leadType==='SELLER'?'selected':'')+'>Seller</option></select></label>'+
 field('zipCode','ZIP / location','text',c.zipCode||'',false,'maxlength="16"')+field('propertyAddress','Property address','text',c.propertyAddress||'',true,'maxlength="300"')+
 field('budgetMax','Budget / estimated value ($)','number',c.budgetMax??'',false,'min="0" max="9999999999999999" step="0.01"')+field('timeframe','Timeframe','text',c.timeframe||'',false,'maxlength="100"')+
 '<label class="full">Client requirements / background<textarea name="statement" maxlength="4000">'+esc(c.statement||'')+'</textarea></label><p class="caption full">This business contact is manually entered. It is not a verified Nyrava lead and does not grant permission to send messages.</p>';
 editor(existing?'Edit contact':'Add a contact',fields,async values=>{
  const body={...values,budgetMax:values.budgetMax===''?null:Number(values.budgetMax)};
  if(!values.email&&!values.phone)throw Error('Enter an email address or phone number.');
  const result=await send(existing?'/contacts/'+c.id:'/contacts',body,existing?'PUT':'POST');
  $('editor').close();await view('contacts');await selectContact('manual',existing?c.id:result.id,true);await loadToday();message(existing?'Contact updated.':'Contact added to your business CRM.');
 });
}
async function action(p,contact=current()){
 if(!contact)throw Error('Select a lead first.');const key=M.key(contact);
 const result=await send('/contacts/'+contact.kind+'/'+contact.id+'/action',p);
 await Promise.all([loadToday(),loadContacts()]);if(state.selected===key)await selectContact(contact.kind,contact.id);return result;
}
function qualityUrl(path=''){const u=new URL('/api/crm/quality-reports'+path,location.origin);if(state.staffId)u.searchParams.set('staffId',state.staffId);return u.pathname+u.search;}
async function qualityEditor(review=false){
 const c=current();if(!c||c.kind!=='platform')return;const result=await api(qualityUrl());
 const submit=(path,body)=>api(qualityUrl(path),{method:'POST',body:JSON.stringify(body),headers:{'X-Nyrava-CSRF':result.csrf}});
 if(review){const rows=(result.rows||[]).filter(r=>r.state==='OWNER_REVIEW');
  if(!rows.length){message('No employee reports are awaiting your review.');return;}
  editor('Review employee lead reports','<label class="full">Report<select name="reportId">'+rows.map(r=>'<option value="'+esc(r.id)+'">'+esc(r.reason)+'</option>').join('')+'</select></label><label>Decision<select name="agree"><option value="true">Agree — send to admin</option><option value="false">Dismiss report</option></select></label>'+textArea('notes','Review notes','',2000),async v=>{
   if(v.notes.trim().length<8)throw Error('Enter review notes of at least 8 characters.');await submit('/'+encodeURIComponent(v.reportId)+'/owner-review',{agree:v.agree==='true',notes:v.notes});$('editor').close();message('Review saved. Admin makes the final decision.');
  });return;
 }
 editor('Report lead quality','<label class="full">Reason<select name="reasonCategory" required>'+['Wrong contact','Denies inquiry','Spam/test','Duplicate','Wrong ZIP','Represented','No longer buying/selling','Unable to reach','Other'].map(r=>'<option value="'+esc(r)+'">'+esc(r)+'</option>').join('')+'</select></label>'+textArea('reason','Notes','',1900)+'<p class="caption full">Employee reports go to the Realtor first. Admin makes the final decision about reassignment or rejection.</p>',async v=>{
  if(v.reason.trim().length<8)throw Error('Enter notes of at least 8 characters.');const reason=v.reasonCategory+': '+v.reason;if(reason.length>2000)throw Error('Keep the reason and notes within 2,000 characters.');await submit('',{inquiryId:c.id,reason});$('editor').close();message('Lead quality report submitted for review.');
 },'Submit report');
}
function workEditor(kind,recordId){
 const c=current();if(!c)return;
 if(kind==='note'){editor('Add a note',textArea('text','Conversation notes'),async v=>{await action({action:'note',text:v.text},c);$('editor').close();message('Note saved.');});return;}
 if(kind==='call'||kind==='sms'){
  try{const uri=M.phoneLink(c.phone,kind==='sms'?'sms':'tel');editor(kind==='sms'?'Text using your phone':'Call using your phone','<p class="caption full">This opens your device app. Your own configured number is used. Opening the app does not record a sent message or completed contact.</p><p class="full"><a class="primary" href="'+esc(uri)+'">Open '+(kind==='sms'?'texting':'calling')+' app</a></p>',async()=>{$('editor').close();},'Done');}catch(e){message(e.message,true);}return;
 }
 if(kind==='email'){
  (async()=>{const key=M.key(c);try{const profile=await api('/api/subscriber/profile');if(state.selected!==key)return;const prefs=profile.communications||{};editor('Email using your work account',field('subject','Subject','text','',true,'required maxlength="200"')+textArea('body','Message',prefs.signature?'\n\n'+prefs.signature:'',10000)+'<p class="caption full">Opens your email app. Choose '+esc(prefs.workEmail||state.me.email||'your work email')+' as the sender there. Nyrava does not send this message or automatically mark the lead contacted.</p><div class="full" id="deviceDraft"></div>',async v=>{const uri=M.emailDraft(c.email,v.subject,v.body);$('deviceDraft').innerHTML='<a href="'+esc(uri)+'">Open draft in my email app →</a>';},'Prepare draft');}catch(e){message(e.message,true);}})();return;
 }
 const isAppointment=kind==='appointment'||kind==='moveAppointment';
 const existing=(kind==='moveTask'?state.detail.tasks:state.detail.appointments).find(x=>x.id===recordId);
 const fields=(!recordId?field('text','Title','text','',true,'required maxlength="200"'):'')+
 field('startsAt',isAppointment?'Start':'Due','datetime-local',localInput(existing?.dueAt||existing?.startsAt),'', 'required')+
 (isAppointment?'<p class="caption full">'+(existing?'The existing appointment duration is preserved.':'A 30-minute slot is reserved automatically.')+'</p>':'')+
 (kind==='appointment'?field('location','Location','text','',true,'maxlength="300"'):'');
 editor(({task:'Add follow-up',appointment:'Book appointment',moveTask:'Reschedule follow-up',moveAppointment:'Reschedule appointment'})[kind],fields,async v=>{
  const startsAt=M.iso(v.startsAt),duration=existing?.endsAt&&existing?.startsAt?Date.parse(existing.endsAt)-Date.parse(existing.startsAt):1800000,endsAt=isAppointment?new Date(Date.parse(startsAt)+duration).toISOString():undefined;
  if(isAppointment&&(new Date(endsAt)<=new Date(startsAt)||(new Date(endsAt)-new Date(startsAt))>43200000))throw Error('Choose an appointment interval up to 12 hours.');
  await action({action:kind,text:v.text,startsAt,endsAt,recordId:recordId||undefined,location:v.location,timeZone:Intl.DateTimeFormat().resolvedOptions().timeZone},c);
  $('editor').close();message('Schedule saved.');
 });
}
$('editorForm').onsubmit=async event=>{event.preventDefault();if(saveBusy||!saveHandler)return;saveBusy=true;$('business').disabled=true;$('saveEditor').disabled=true;$('closeEditor').disabled=true;$('cancelEditor').disabled=true;$('editorError').textContent='';
 try{await saveHandler(Object.fromEntries(new FormData(event.currentTarget)));}catch(e){$('editorError').textContent=e.message;}
 finally{saveBusy=false;$('business').disabled=false;$('saveEditor').disabled=false;$('closeEditor').disabled=false;$('cancelEditor').disabled=false;}};
$('editor').addEventListener('cancel',e=>{if(saveBusy)e.preventDefault();});
$('closeEditor').onclick=$('cancelEditor').onclick=()=>{if(!saveBusy)$('editor').close();};
document.addEventListener('click',async event=>{
 const b=event.target.closest('button');if(!b)return;
 try{
  if(b.dataset.view)await view(b.dataset.view);
  if(b.dataset.open)await selectContact(b.dataset.kind,b.dataset.open,true);
  if(b.dataset.queueId){await view('contacts');await selectContact(b.dataset.kind,b.dataset.queueId,true);}
  if(b.hasAttribute('data-close-contact')){clearSelection();renderContacts();}
  if(b.dataset.edit)workEditor(b.dataset.edit);
  if(b.hasAttribute('data-quality-report'))await qualityEditor();
  if(b.hasAttribute('data-quality-review'))await qualityEditor(true);
  if(b.hasAttribute('data-edit-contact'))contactEditor(current());
  if(b.dataset.detailTab){state.tab=b.dataset.detailTab;renderDetail();}
  if(b.dataset.stageFilter){$('stage').value=$('stage').value===b.dataset.stageFilter?'':b.dataset.stageFilter;state.page=1;await loadContacts();}
  if(b.dataset.work){if(b.dataset.work.startsWith('move'))workEditor(b.dataset.work,b.dataset.record);
   else if(b.dataset.work!=='cancelAppointment'||confirm('Cancel this appointment?')){b.disabled=true;await action({action:b.dataset.work,recordId:b.dataset.record});message('Work updated.');}}
 }catch(e){message(e.message,true);}finally{if(b.isConnected)b.disabled=false;}
});
document.addEventListener('change',async event=>{
 const el=event.target;
 if(el.id==='clientStage'&&el.value==='CONTACTED'&&current()?.kind==='platform'){
  el.value=current().crmStatus;el.disabled=true;
  $('contactAttemptEditor').innerHTML='<form id="contactAttemptForm" class="record"><label>Contact attempt note<textarea id="contactAttemptNote" required minlength="8" maxlength="4000"></textarea></label><p>A recorded attempt does not mean the person answered.</p><p id="contactAttemptError" role="alert"></p><button type="submit">Save contacted stage</button><button type="button" id="cancelContactAttempt">Cancel</button></form>';
  $('cancelContactAttempt').onclick=()=>{renderDetail();};
  $('contactAttemptForm').onsubmit=async e=>{e.preventDefault();const note=$('contactAttemptNote').value;if(note.trim().length<8){$('contactAttemptError').textContent='Describe the contact attempt in at least 8 characters.';return;}
   const buttons=[...e.currentTarget.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);
   try{await action({action:'status',text:'CONTACTED',contactNote:note});message('Contact attempt recorded.');}catch(error){if($('contactAttemptError'))$('contactAttemptError').textContent=error.message;}finally{buttons.forEach(b=>b.disabled=false);}
  };$('contactAttemptNote').focus();return;
 }
 if(el.id==='clientStage'){el.disabled=true;try{await action({action:'status',text:el.value});message('Pipeline stage updated.');}catch(e){message(e.message,true);renderDetail();}finally{el.disabled=false;}}
 if(el.id==='clientAssignment'){
  const c=current();if(!c)return;el.disabled=true;
  try{const target=el.value||null;
   if(c.kind==='manual')await send('/contacts/'+c.id+'/assign',{staffId:target});
   else await api('/api/team/leads/'+c.id+'/assign',{method:'POST',body:JSON.stringify({staffId:target})});
   await selectContact(c.kind,c.id);message('Work reassigned. History preserved.');
  }catch(e){message(e.message,true);renderDetail();}finally{el.disabled=false;}
 }
});
$('search').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{state.page=1;loadContacts();},250);};
$('type').onchange=$('stage').onchange=()=>{state.page=1;loadContacts();};
$('previous').onclick=()=>{if(state.page>1){state.page--;loadContacts();}};$('next').onclick=()=>{if(state.page*50<state.total){state.page++;loadContacts();}};
$('newContact').onclick=()=>contactEditor();$('refresh').onclick=()=>refresh().catch(e=>message(e.message,true));$('agendaDate').value=localDay(new Date());$('agendaDate').onchange=renderAgenda;
$('business').onchange=async()=>{if(saveBusy)return;if($('editor').open)$('editor').close();state.staffId=$('business').value;listVersion++;todayVersion++;clearSelection();state.page=1;state.today=null;agendaVersion++;await refresh();};
$('logout').onclick=async()=>{try{await api('/api/auth/logout',{method:'POST'});try{localStorage.removeItem('hsi_token');localStorage.removeItem('hsi_user');sessionStorage.removeItem('hsi_token');sessionStorage.removeItem('hsi_user');}catch(_){}window.top.location.replace('/');}catch(e){message(e.message,true);}};
async function boot(){
 if(window.self!==window.top)document.body.classList.add('embedded');
 $('stage').innerHTML='<option value="">All stages</option>'+[...new Set([...stageOptions('BUYER'),...stageOptions('SELLER')])].map(s=>'<option value="'+s+'">'+esc(M.stageLabel(s))+'</option>').join('');
 try{
  state.me=await api('/api/auth/me');$('identity').textContent=state.me.fullName||state.me.email;
  state.canManage=state.me.role==='RealtorSubscriber';$('management').hidden=!state.canManage;
  if(state.me.role==='BusinessEmployee'){
   const memberships=await api('/api/team/employee/memberships');
   if(!memberships.length)throw Error('No active team membership. Contact your Realtor.');
   $('business').innerHTML=memberships.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.businessName)+'</option>').join('');state.staffId=memberships[0].id;$('businessLabel').hidden=false;
  }else if(!state.canManage)throw Error('This workspace is available to Realtors and their active team members.');
  const params=new URLSearchParams(location.search);const requested=params.get('view');
  await view(requested==='tasks'||requested==='appointments'?'calendar':requested||'today');
  // Load the roster once even when opening Today; management controls use the same data for both pages.
  if(state.view==='today'||state.view==='calendar')await loadContacts();
  const manual=params.get('kind')==='manual'?params.get('id'):null;if(manual&&/^[\da-f-]{36}$/i.test(manual)){await view('contacts');await selectContact('manual',manual);}
  const lead=params.get('lead');if(lead&&/^[\da-f-]{36}$/i.test(lead)){await view('contacts');await selectContact('platform',lead);}
 }catch(e){message(e.message,true);$('newContact').disabled=true;$('refresh').disabled=true;}
}
let backgroundBusy=false;
async function checkAssignments(){
 if(backgroundBusy||!state.me||document.hidden||saveBusy||$('editor').open||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
 backgroundBusy=true;try{await loadContacts();if(state.view==='today')await loadToday();}finally{backgroundBusy=false;}
}
window.addEventListener('focus',checkAssignments);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkAssignments();});
setInterval(checkAssignments,60000);
boot();
})();
