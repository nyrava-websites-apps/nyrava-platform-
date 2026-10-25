(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else {root.NyravaTeamMembers=api;api.mount(root.document,root);}
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function memberStatus(member){return member.archived?'Archived':!member.active?'Disabled':member.userId?'Active':'Pending setup';}
  function canArchive(member,count){return !member.active&&!member.archived&&count===0;}
  function searchMembers(members,query,includeArchived=false){const q=String(query||'').trim().toLocaleLowerCase();return members.filter(m=>(includeArchived||!m.archived)&&(!q||[m.fullName,m.email].some(v=>String(v||'').toLocaleLowerCase().includes(q))));}
  function memberWorkspace(id,team,crm){
    const staff=(team.staff||[]).find(s=>String(s.id)===String(id));
    if(!staff)throw Error('Team member not found in your business.');
    const assigned=new Set((team.assignments||[]).filter(a=>String(a.staffId)===String(id)).map(a=>String(a.inquiryId)));
    const manual=(team.manualAssignments||[]).filter(a=>String(a.staffId)===String(id)).map(a=>({...a,id:a.contactId,kind:"manual"}));
    const leads=(crm.leads||[]).filter(l=>assigned.has(String(l.id)));
    const visible=new Set(leads.map(l=>String(l.id)));
    const related=items=>(items||[]).filter(item=>visible.has(String(item.inquiryId)));
    return {staff,assignedCount:assigned.size+manual.length,unavailableCount:assigned.size-leads.length,leads:[...leads,...manual],notes:related(crm.notes),tasks:related(crm.tasks),appointments:related(crm.appointments)};
  }
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function mount(doc,win){
    const toggle=doc.querySelector('#menu > button[data-tab="team"]');if(!toggle||doc.getElementById('nyrava-team-picker'))return;
    toggle.id='teamMenuToggle';toggle.type='button';toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-controls','nyrava-team-picker');
    toggle.innerHTML='My Team <span id="team-picker-count"></span><span class="crm-chevron" aria-hidden="true">▾</span>';
    const picker=doc.createElement('div');picker.id='nyrava-team-picker';picker.className='crm-submenu team-picker';picker.hidden=true;
    picker.innerHTML='<button type="button" id="team-show-all">All Team Members</button><button type="button" id="team-invite-new">Invite Team Member</button><button type="button" id="team-show-assignments">Lead Assignments</button><label for="team-member-search">Search team members</label><input id="team-member-search" type="search" autocomplete="off" placeholder="Name or email"><label class="team-archive-toggle"><input id="team-include-archived" type="checkbox"> Show archived employees</label><p id="team-picker-status" role="status" aria-live="polite">Loading your team…</p><div id="team-member-results" class="team-picker-results"></div><a class="team-manage" href="/team.html">Business &amp; Team Settings →</a>';
    toggle.insertAdjacentElement('afterend',picker);
    function setOpen(value){picker.hidden=!value;toggle.setAttribute('aria-expanded',String(value));}
    const input=doc.getElementById('team-member-search'),results=doc.getElementById('team-member-results'),notice=doc.getElementById('team-picker-status');
    let roster=null,busy=false,selected=null,reviewVersion=0;
    async function request(url){const response=await win.fetch(url,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||data.detail||data.message||(response.status===401?'Please sign in again.':'Team unavailable ('+response.status+').'));return data;}
    function draw(){
      if(!roster)return;
      const staff=roster.staff||[],filtered=searchMembers(staff,input.value,doc.getElementById('team-include-archived').checked);
      doc.getElementById('team-picker-count').textContent='('+staff.filter(m=>!m.archived&&m.active&&m.userId).length+')';
      notice.textContent=staff.length?(filtered.length+' of '+staff.length+' team members'):'No team members yet. Add an employee and send an invitation.';
      results.replaceChildren();
      for(const member of filtered){
        const count=[...(roster.assignments||[]),...(roster.manualAssignments||[])].filter(a=>String(a.staffId)===String(member.id)).length;
        const button=doc.createElement('button');button.type='button';button.className='team-picker-person';
        const name=doc.createElement('strong');name.textContent=member.fullName||member.email;
        const email=doc.createElement('span');email.textContent=member.email||'';
        const status=doc.createElement('small');status.textContent=memberStatus(member)+' · '+count+' assigned lead'+(count===1?'':'s');
        button.append(name,email,status);button.onclick=()=>openMember(member.id);results.append(button);
      }
    }
    async function refresh(){
      if(busy)return;busy=true;
      try{roster=await request('/api/team/workspace');draw();
        // Keep the existing My Team directory in sync after employee acceptance.
        if(typeof state!=='undefined'&&typeof renderTeam==='function'&&doc.activeElement?.tagName!=='SELECT'){state.team=roster;renderTeam();}
      }catch(error){roster=null;results.replaceChildren();doc.getElementById('team-picker-count').textContent='';notice.textContent=error.message;}
      finally{busy=false;}
    }
    function reviewPanel(){let panel=doc.getElementById('employeeReview');if(!panel){panel=doc.createElement('section');panel.id='employeeReview';panel.className='box';(doc.getElementById('panel-team')||doc.querySelector('main')).append(panel);}return panel;}
    async function openMember(id){
      selected=id;const version=++reviewVersion;
      if(typeof navigate==='function')navigate('team');
      const panel=reviewPanel();panel.hidden=false;panel.textContent='Loading team member CRM…';
      try{
        const [team,crm]=await Promise.all([request('/api/team/workspace'),request('/api/crm/workspace')]);
        if(version!==reviewVersion)return;
        roster=team;draw();const data=memberWorkspace(id,team,crm);renderReview(panel,data,team);
        panel.scrollIntoView({behavior:'smooth',block:'start'});
      }catch(error){if(version===reviewVersion)panel.textContent=error.message;}
    }
    function renderReview(panel,data,team){
      const {staff,leads,notes,tasks,appointments}=data;
      const date=value=>{if(!value)return 'Not scheduled';const d=new Date(value);return Number.isFinite(d.getTime())?d.toLocaleString():'Not scheduled';};
      const list=(items,render)=>items.length?items.map(render).join(''):'<p class="muted">No records yet.</p>';
      panel.innerHTML='<div class="actions"><h3>'+escape(staff.fullName||staff.email)+' — Team CRM</h3><button type="button" class="secondary" id="team-review-refresh">Refresh member</button><button type="button" class="secondary" id="team-review-close">Close</button></div><p>'+escape(staff.email)+' · <strong>'+escape(memberStatus(staff))+'</strong></p><p>'+data.assignedCount+' assigned CRM contacts · '+tasks.filter(t=>!t.completed).length+' open tasks · '+appointments.filter(a=>a.status==='SCHEDULED').length+' scheduled appointments</p>'+
        (!staff.userId?'<p class="muted">This employee must accept the emailed invitation before receiving lead assignments.</p>':'')+
        '<h4>Assigned leads</h4>'+list(leads,l=>'<article class="item"><div><strong>'+escape(l.fullName)+'</strong><small>'+escape(l.leadType)+' · ZIP '+escape(l.zipCode)+' · '+escape(l.crmStatus)+'</small><small>'+escape(l.email)+' '+escape(l.phone)+'</small></div><a class="card-link" href="/crm.html?'+(l.kind==='manual'?'kind=manual&id=':'lead=')+encodeURIComponent(l.id)+'">Open contact CRM →</a></article>')+
        (data.unavailableCount?'<p class="muted">'+data.unavailableCount+' assignments are outside the latest CRM results. Open the main CRM to review available contacts.</p>':'')+
        '<h4>Activity &amp; notes</h4>'+list(notes,n=>'<article class="item"><div>'+escape(n.details||n.activityType)+'<small>'+escape(date(n.createdAt))+'</small></div></article>')+
        '<h4>Follow-ups &amp; tasks</h4>'+list(tasks,t=>'<article class="item"><div><strong>'+escape(t.title)+'</strong><small>'+escape(date(t.dueAt))+' · '+(t.completed?'Completed':'Open')+'</small></div></article>')+
        '<h4>Appointments</h4>'+list(appointments,a=>'<article class="item"><div><strong>'+escape(a.title)+'</strong><small>'+escape(date(a.startsAt))+' · '+escape(a.status)+'</small></div></article>');
      const controls=doc.createElement('div');controls.className='team-lifecycle-controls';
      const targets=(team.staff||[]).filter(m=>m.id!==staff.id&&m.active&&m.userId&&!m.archived);
      controls.innerHTML=(!staff.archived?'<label for="team-transfer-target">Reassign all remaining work</label><div class="actions"><select class="field" id="team-transfer-target"><option value="">Choose an active employee</option>'+targets.map(m=>'<option value="'+escape(m.id)+'">'+escape(m.fullName||m.email)+'</option>').join('')+'</select><button type="button" class="secondary" id="team-transfer-work" '+(!data.assignedCount||!targets.length?'disabled':'')+'>Reassign '+data.assignedCount+' contacts</button></div>':'')+
        (staff.archived?'<button type="button" class="secondary" id="team-restore-member">Restore employee record</button>':!staff.active?'<button type="button" class="secondary" id="team-archive-member" '+(!canArchive(staff,data.assignedCount)?'disabled title="Reassign all remaining work first"':'')+'>Archive employee</button>':'')+
        '<p class="muted">Removing access keeps this business’s work. Reassign leads before archiving. Archived records stay available through Show archived employees.</p>';
      panel.append(controls);
      const status=doc.createElement('p');status.setAttribute('role','status');controls.append(status);
      async function change(button,action,body){
        button.disabled=true;status.textContent='Saving…';
        try{
          const response=await win.fetch('/api/team/staff/'+encodeURIComponent(staff.id)+'/'+action,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{})});
          const result=await response.json().catch(()=>({}));if(!response.ok)throw Error(result.error||result.detail||result.message||'Operation failed.');
          await refresh();await openMember(staff.id);
        }catch(error){button.disabled=false;status.textContent=error.message;}
      }
      const transfer=doc.getElementById('team-transfer-work');if(transfer)transfer.onclick=()=>{
        const target=doc.getElementById('team-transfer-target').value;if(!target){status.textContent='Choose another active employee.';return;}
        if(win.confirm('Transfer all '+data.assignedCount+' assigned CRM contacts and their existing work history to this employee?'))change(transfer,'reassign-all',{targetStaffId:target});
      };
      const archive=doc.getElementById('team-archive-member');if(archive)archive.onclick=()=>{if(win.confirm('Archive this disabled employee? Their record and business work history will be retained.'))change(archive,'archive');};
      const restore=doc.getElementById('team-restore-member');if(restore)restore.onclick=()=>change(restore,'restore');
      doc.getElementById('team-review-close').onclick=()=>{reviewVersion++;selected=null;panel.hidden=true;panel.replaceChildren();};
      doc.getElementById('team-review-refresh').onclick=()=>openMember(staff.id);
    }
    // Replace the legacy Open CRM action, which referenced an unavailable review endpoint.
    doc.addEventListener('click',event=>{const button=event.target.closest('[data-team-review]');if(!button)return;event.preventDefault();event.stopImmediatePropagation();openMember(button.dataset.teamReview);},true);
    input.oninput=draw;
    doc.getElementById('team-include-archived').onchange=draw;
    toggle.addEventListener('click',()=>{setOpen(picker.hidden);if(!picker.hidden){const rail=doc.getElementById('rail');if(rail)rail.classList.add('open');doc.getElementById('mobileMenu')?.setAttribute('aria-expanded','true');refresh();}});
    doc.getElementById('team-show-all').onclick=()=>{if(typeof navigate==='function')navigate('team');input.focus();refresh();};
    doc.getElementById('team-invite-new').onclick=()=>{if(typeof navigate==='function')navigate('team');doc.getElementById('staffName')?.focus();};
    doc.getElementById('team-show-assignments').onclick=()=>{if(typeof navigate==='function')navigate('team');doc.getElementById('teamLeads')?.scrollIntoView({behavior:'smooth',block:'start'});};
    picker.addEventListener('keydown',event=>{if(event.key==='Escape'){setOpen(false);toggle.focus();}});
    doc.querySelectorAll('#menu > button[data-tab]:not([data-tab="team"])').forEach(button=>button.addEventListener('click',()=>setOpen(false)));
    win.addEventListener('focus',()=>{if(!doc.hidden)refresh();});
    doc.addEventListener('visibilitychange',()=>{if(!doc.hidden)refresh();});
    const interval=win.setInterval(()=>{if(!doc.hidden)refresh();},15000);
    win.addEventListener('pagehide',event=>{if(!event.persisted)win.clearInterval(interval);});
    refresh();return {refresh,openMember};
  }
  return {memberStatus,searchMembers,memberWorkspace,canArchive,mount};
});
