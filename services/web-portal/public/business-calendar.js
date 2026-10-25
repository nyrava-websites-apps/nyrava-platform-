'use strict';
const $ = id => document.getElementById(id);
const h = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = { view: 'month', cursor: new Date(), selected: new Date(), contacts: [], leads: [], appointments: [], tasks: [], leadAppointments: [], leadTasks: [], loading: false };
const dateKey = d => [d.getFullYear(), String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const localInput = d => `${dateKey(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
const timeFmt = iso => new Date(iso).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
const dateFmt = iso => new Date(iso).toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'});
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
function tell(msg, error=false) { $('notice').textContent=msg; $('notice').className='notice'+(error?' error':'');$('notice').hidden=false; }
async function request(path, options={}) {
 const resp=await fetch(path,{credentials:'same-origin',headers:{'Content-Type':'application/json'},...options});
 if(resp.status===401 || resp.redirected && /subscriber-login/.test(resp.url)) throw Error('Please sign in with your subscriber account first.');
 if(resp.status===403) throw Error('This feature is available only to the subscriber account owner.');
 const data=await resp.json().catch(()=>({}));
 if(!resp.ok)throw Error(data.error || `Calendar request failed (HTTP ${resp.status}).`);
 return data;
}
function normalized() {
 const events=state.appointments.filter(x=>x.status==='SCHEDULED').map(x=>({...x,kind:'appointment',source:'manual'}));
 for(const x of state.leadAppointments) if(x.status==='SCHEDULED')events.push({...x,kind:'appointment',source:'lead'});
 const tasks=state.tasks.map(x=>({...x,kind:'task',source:'manual'}));
 for(const x of state.leadTasks)tasks.push({...x,kind:'task',source:'lead'});
 return [...events,...tasks].sort((a,b)=>new Date(a.startsAt||a.dueAt)-new Date(b.startsAt||b.dueAt));
}
async function reload() {
 const anchor=new Date(state.cursor.getFullYear(),state.cursor.getMonth()-1,1);
 const finish=new Date(state.cursor.getFullYear(),state.cursor.getMonth()+2,1);
 const range=`?start=${encodeURIComponent(anchor.toISOString())}&end=${encodeURIComponent(finish.toISOString())}`;
 try {
  const results=await Promise.all([request('/api/business-calendar/contacts'),request('/api/business-calendar/events'+range),request('/api/business-calendar/tasks'+range)]);
  [state.contacts,state.appointments,state.tasks]=results;
  state.leads=[];state.leadAppointments=[];state.leadTasks=[];
  // Current Nyrava lead appointments are included in the same calendar, without copying records.
  // Unavailable lead CRM must never stop personal scheduling from working.
  try {
   const crm=await request('/api/crm/workspace');
   state.leads=crm.leads||[];
   state.leadAppointments=(crm.appointments||[]).map(x=>({...x,source:'lead',contactName:state.leads.find(l=>l.id===x.inquiryId)?.fullName||'Nyrava lead'}));
   state.leadTasks=(crm.tasks||[]).map(x=>({...x,source:'lead',contactName:state.leads.find(l=>l.id===x.inquiryId)?.fullName||'Nyrava lead'}));
  } catch(err) { console.warn('Lead appointment overlay unavailable; personal calendar remains accessible.'); }
  updateSelectors();render();
 } catch(e) {tell(e.message,true);}
}
function updateSelectors() {
 for(const el of [$('eventContact'),$('taskContact')]){
  const current=el.value;
  el.innerHTML='<option value="">No contact — personal / independent</option>'+
   (state.contacts.length?'<optgroup label="My Contacts">'+state.contacts.map(c=>`<option value="manual:${h(c.id)}">${h(c.fullName)}</option>`).join('')+'</optgroup>':'')+
   (state.leads.length?'<optgroup label="Nyrava Leads">'+state.leads.map(c=>`<option value="lead:${h(c.id)}">${h(c.fullName)}</option>`).join('')+'</optgroup>':'');
  if([...el.options].some(x=>x.value===current))el.value=current;
 }
}
function itemDate(x){return new Date(x.startsAt||x.dueAt)}
function dayItems(day){return normalized().filter(x=>dateKey(itemDate(x))===dateKey(day));}
function title(){
 const d=state.cursor;
 if(state.view==='month')return d.toLocaleDateString([],{month:'long',year:'numeric'});
 if(state.view==='day')return state.selected.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'});
 if(state.view==='week'){
  const start=weekStart(state.selected),end=new Date(start);end.setDate(start.getDate()+6);
  return `${dateFmt(start)} – ${dateFmt(end)}`;
 }
 return 'All upcoming appointments';
}
function weekStart(d){const start=new Date(d.getFullYear(),d.getMonth(),d.getDate());start.setDate(start.getDate()-start.getDay());return start;}
function drawMonth(){
 const year=state.cursor.getFullYear(),month=state.cursor.getMonth();
 const first=new Date(year,month,1),start=weekStart(first);
 let html='<div class="weekday-grid">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<span>${x}</span>`).join('')+'</div><div class="calendar-grid">';
 for(let i=0;i<42;i++){
  const d=new Date(start);d.setDate(start.getDate()+i);
  const items=dayItems(d),today=dateKey(d)===dateKey(new Date());
  html+=`<div class="day ${d.getMonth()!==month?'faded':''} ${today?'is-today':''} ${dateKey(d)===dateKey(state.selected)?'is-selected':''}" data-day="${dateKey(d)}" role="button" tabindex="0" aria-label="View ${dateFmt(d)}"><div class="day-label"><span class="${today?'today-label':''}">${d.getDate()}</span></div>`+
   items.slice(0,3).map(x=>`<button type="button" class="day-item ${x.kind==='task'?'task':x.source==='lead'?'lead':''}" data-item="${h(x.id)}" data-source="${x.source}" data-kind="${x.kind}" title="${h(x.title)}">${timeFmt(x.startsAt||x.dueAt)} ${h(x.title)}</button>`).join('')+
   (items.length>3?`<span class="day-more">+${items.length-3} more</span>`:'')+'</div>';
 }
 return html+'</div>';
}
function drawWeek(){
 const start=weekStart(state.selected);
 let html='<div class="weekday-grid">'+['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(x=>`<span>${x}</span>`).join('')+'</div><div class="calendar-grid">';
 for(let i=0;i<7;i++){
  const d=new Date(start);d.setDate(start.getDate()+i);
  html+=`<div class="day" data-day="${dateKey(d)}" role="button" tabindex="0"><div class="day-label">${d.toLocaleDateString([],{month:'short',day:'numeric'})}</div>`+
   dayItems(d).map(x=>`<button type="button" class="day-item ${x.kind==='task'?'task':x.source==='lead'?'lead':''}" data-item="${h(x.id)}" data-source="${x.source}" data-kind="${x.kind}">${timeFmt(x.startsAt||x.dueAt)} ${h(x.title)}</button>`).join('')+'</div>';
 }
 return html+'</div>';
}
function drawList(onlyDay=false){
 const items=normalized().filter(x=>{
  const d=itemDate(x);
  return onlyDay?dateKey(d)===dateKey(state.selected):d>=new Date(state.selected.getFullYear(),state.selected.getMonth(),state.selected.getDate());
 });
 if(!items.length)return '<div class="empty">Nothing scheduled. Use New Appointment or New Task to get started.</div>';
 return '<div class="single-list">'+items.map(x=>`<div class="list-item"><div><strong>${h(x.title)}</strong><small class="muted">${dateFmt(x.startsAt||x.dueAt)} · ${timeFmt(x.startsAt||x.dueAt)} · ${h(x.contactName||'Independent')} · ${x.source==='lead'?'Nyrava lead':x.kind==='task'?'Task':'My appointment'}</small></div><button type="button" class="outline" data-item="${h(x.id)}" data-kind="${x.kind}" data-source="${x.source}">Details</button></div>`).join('')+'</div>';
}
function render(){
 $('calendarTitle').textContent=title();
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('selected',b.dataset.view===state.view));
 $('calendar').innerHTML=state.view==='month'?drawMonth():state.view==='week'?drawWeek():drawList(state.view==='day');
 const month=state.cursor.getMonth(),year=state.cursor.getFullYear();
 const events=normalized();
 $('appointmentCount').textContent=events.filter(x=>x.kind==='appointment' && itemDate(x).getMonth()===month && itemDate(x).getFullYear()===year).length;
 $('taskCount').textContent=events.filter(x=>x.kind==='task'&&!x.completed).length;
 $('contactCount').textContent=state.contacts.length;
 $('agendaTitle').textContent=state.selected.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'});
 const selected=dayItems(state.selected);
 $('dayList').innerHTML=selected.length?selected.map(x=>`<button class="agenda-row" data-item="${h(x.id)}" data-kind="${x.kind}" data-source="${x.source}"><span class="agenda-time">${timeFmt(x.startsAt||x.dueAt)}</span><span class="agenda-info"><strong>${h(x.title)}</strong><small>${h(x.contactName||'Independent')} · ${x.source==='lead'?'Lead':x.kind==='task'?'Task':'Appointment'}</small></span><span>›</span></button>`).join(''):'<div class="empty">No items for this date.<p>Use + Add to schedule one.</p></div>';
 renderContacts();
}
function renderContacts(){
 const q=$('contactSearch').value.trim().toLowerCase();
 const filtered=state.contacts.filter(c=>[c.fullName,c.email,c.phone].join(' ').toLowerCase().includes(q));
 $('contactsList').innerHTML=filtered.length?filtered.map(c=>`<button class="contact-row" data-contact="${h(c.id)}"><span><strong>${h(c.fullName)}</strong><small>${h(c.phone||c.email||'Contact details optional')}</small></span><span>›</span></button>`).join(''):'<div class="empty">No contacts found. Add your own clients here.</div>';
}
function setDefaultTimes(){
 const date=new Date(state.selected.getFullYear(),state.selected.getMonth(),state.selected.getDate(),9,0);
 const now=new Date();if(dateKey(now)===dateKey(date) && now.getHours()>=9){date.setHours(now.getHours()+1,0)}
 $('eventStart').value=localInput(date);
 const end=new Date(date);end.setMinutes(end.getMinutes()+30);
 $('eventEnd').value=localInput(end);$('taskDue').value=localInput(date);
}
function appointmentEnd(){const start=new Date($('eventStart').value);if(!Number.isFinite(+start))throw Error('Choose the appointment date and time.');const minutes=Number($('eventForm').dataset.durationMinutes)||30;return new Date(+start+minutes*60000).toISOString();}
function openEvent(item=null){
 $('eventForm').reset();$('eventId').value=item?.id||'';const minutes=item?Math.max(1,Math.round((Date.parse(item.endsAt)-Date.parse(item.startsAt))/60000)):30;$('eventForm').dataset.durationMinutes=String(minutes);$('eventDurationNote').textContent=item?'Your existing '+minutes+'-minute slot is preserved when rescheduling.':'A 30-minute slot is reserved automatically.';
 $('eventHeading').textContent=item?'Edit Appointment':'New Appointment';$('cancelEvent').hidden=!item;
 if(item){
  $('eventTitle').value=item.title;$('eventLocation').value=item.location||'';$('eventNotes').value=item.notes||'';
  $('eventStart').value=localInput(new Date(item.startsAt));$('eventEnd').value=localInput(new Date(item.endsAt));
  $('eventContact').value=item.contactId?`manual:${item.contactId}`:'';
  if(item.contactId && !$('eventContact').value) $('eventContact').value='';
 } else setDefaultTimes();
 $('eventDialog').showModal();
}
function openTask(item=null){
 $('taskForm').reset();$('taskId').value=item?.id||'';$('taskHeading').textContent=item?'Edit Task':'New Follow-up Task';$('completeTask').hidden=!item;
 if(item){$('taskTitle').value=item.title;$('taskNotes').value=item.notes||'';$('taskDue').value=localInput(new Date(item.dueAt));$('taskContact').value=item.contactId?`manual:${item.contactId}`:'';}else setDefaultTimes();
 $('taskDialog').showModal();
}
function openContact(item=null){
 $('contactForm').reset();$('contactId').value=item?.id||'';$('contactHeading').textContent=item?'Edit Contact':'Add Your Contact';$('archiveContact').hidden=!item;
 if(item){$('contactName').value=item.fullName;$('contactEmail').value=item.email||'';$('contactPhone').value=item.phone||'';$('contactNotes').value=item.notes||'';}
 $('contactDialog').showModal();
}
async function saveEvent(e){e.preventDefault();
 const id=$('eventId').value, contact=$('eventContact').value;
 const payload={title:$('eventTitle').value.trim(),startsAt:new Date($('eventStart').value).toISOString(),endsAt:appointmentEnd(),timeZone:timezone,location:$('eventLocation').value.trim(),notes:$('eventNotes').value.trim(),contactId:contact.startsWith('manual:')?contact.slice(7):null};
 if(new Date(payload.endsAt)<=new Date(payload.startsAt))throw Error('Appointment end must be after start.');
 if(id)await request(`/api/business-calendar/events/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(payload)});
 else if(contact.startsWith('lead:')) {
  if(payload.notes)tell('Notes are saved only with independent appointments; lead appointment notes should go in the lead CRM.');
  await request(`/api/crm/leads/${encodeURIComponent(contact.slice(5))}/appointments`,{method:'POST',body:JSON.stringify(payload)});
 } else await request('/api/business-calendar/events',{method:'POST',body:JSON.stringify(payload)});
 $('eventDialog').close();await reload();tell('Appointment saved to your calendar.');
}
async function saveTask(e){e.preventDefault();const id=$('taskId').value,contact=$('taskContact').value;
 const payload={title:$('taskTitle').value.trim(),notes:$('taskNotes').value.trim(),dueAt:new Date($('taskDue').value).toISOString(),contactId:contact.startsWith('manual:')?contact.slice(7):null};
 if(id)await request(`/api/business-calendar/tasks/${encodeURIComponent(id)}`,{method:'PUT',body:JSON.stringify(payload)});
 else if(contact.startsWith('lead:'))await request(`/api/crm/leads/${encodeURIComponent(contact.slice(5))}/tasks`,{method:'POST',body:JSON.stringify(payload)});
 else await request('/api/business-calendar/tasks',{method:'POST',body:JSON.stringify(payload)});
 $('taskDialog').close();await reload();tell('Follow-up task saved.');
}
async function saveContact(e){e.preventDefault();const id=$('contactId').value;
 const payload={fullName:$('contactName').value.trim(),email:$('contactEmail').value.trim(),phone:$('contactPhone').value.trim(),notes:$('contactNotes').value.trim()};
 await request(id?`/api/business-calendar/contacts/${encodeURIComponent(id)}`:'/api/business-calendar/contacts',{method:id?'PUT':'POST',body:JSON.stringify(payload)});
 $('contactDialog').close();await reload();tell('Contact saved to your account.');
}
function guarded(fn){return async e=>{try{await fn(e)}catch(error){tell(error.message,true)}}}
function move(n){if(state.view==='month'||state.view==='agenda')state.cursor.setMonth(state.cursor.getMonth()+n);else if(state.view==='week')state.selected.setDate(state.selected.getDate()+n*7);else state.selected.setDate(state.selected.getDate()+n);if(state.view!=='month')state.cursor=new Date(state.selected);reload();}
$('prev').onclick=()=>move(-1);$('next').onclick=()=>move(1);$('today').onclick=()=>{state.selected=new Date();state.cursor=new Date();reload()};
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view;render()});
$('newEvent').onclick=()=>openEvent();$('newTask').onclick=()=>openTask();$('newContact').onclick=()=>openContact();$('addContactSide').onclick=()=>openContact();$('addForDate').onclick=()=>openEvent();
$('contactSearch').oninput=renderContacts;
$('eventForm').onsubmit=guarded(saveEvent);$('taskForm').onsubmit=guarded(saveTask);$('contactForm').onsubmit=guarded(saveContact);
$('cancelEvent').onclick=guarded(async()=>{const id=$('eventId').value;if(!id||!confirm('Cancel this appointment?'))return;await request(`/api/business-calendar/events/${encodeURIComponent(id)}/cancel`,{method:'POST'});$('eventDialog').close();await reload();tell('Appointment canceled.')});
$('completeTask').onclick=guarded(async()=>{const id=$('taskId').value;if(!id)return;await request(`/api/business-calendar/tasks/${encodeURIComponent(id)}/complete`,{method:'POST'});$('taskDialog').close();await reload();tell('Task completed.')});
$('archiveContact').onclick=guarded(async()=>{const id=$('contactId').value;if(!id||!confirm('Archive this contact? Existing appointments will remain.'))return;await request(`/api/business-calendar/contacts/${encodeURIComponent(id)}`,{method:'DELETE'});$('contactDialog').close();await reload();tell('Contact archived; appointment history preserved.')});
document.addEventListener('click',e=>{
 const close=e.target.closest('[data-close]');if(close){$(close.dataset.close).close();return;}
 const contact=e.target.closest('[data-contact]');if(contact){openContact(state.contacts.find(x=>x.id===contact.dataset.contact));return;}
 const item=e.target.closest('[data-item]');if(item){
  if(item.dataset.source==='lead'){tell('This is a Nyrava lead appointment or task. Open Contacts & CRM to manage its details.');return;}
  const data=item.dataset.kind==='task'?state.tasks:state.appointments;
  const found=data.find(x=>x.id===item.dataset.item);
  if(found)item.dataset.kind==='task'?openTask(found):openEvent(found);
  return;
 }
 const day=e.target.closest('[data-day]');if(day){const [y,m,d]=day.dataset.day.split('-').map(Number);state.selected=new Date(y,m-1,d);render();}
});
document.addEventListener('keydown',e=>{if(e.key==='Enter' && e.target.matches('[data-day]')){e.preventDefault();e.target.click();}});

// Initial load is owned by crm-calendar.js.
