const $=s=>document.querySelector(s), stages=['New','Contacted','Qualified','Follow-up','Appointment','Verified Lead','Lost Lead'];let contacts=[],activities=[],selected=null,register=false,view='today',currentUser=null,teamData={members:[],canInvite:false},chatPeople=[],chatTimer=null,demoMode=false,contactsPage=1,calendarContactsPage=1,colPages={},intelData=null,intelPage=1,intelPageSize=10,openGroups={myLeads:true,contactsCrm:true,myTeam:true},aiChatHistory=[];const contactsPageSize=5,colPageSize=5;
async function api(path,options={}){const r=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});if(!r.ok){let message=r.statusText;try{message=(await r.json()).error||message}catch{}throw Error(message)}return r.status===204?null:r.json()}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function dateValue(d){const x=new Date(d);return Number.isNaN(x.getTime())?'':x.toLocaleString([], {dateStyle:'medium',timeStyle:'short'})}
function localInput(d=new Date()){return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}
function localDay(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,'0')}-${String(x.getDate()).padStart(2,'0')}`}

async function promptEditTerritory(){
  const current=currentUser.subscribedZipCodes||currentUser.postalCode||'77084, 77002, 78701';
  const z=prompt('Enter your 3 exclusive coverage sales ZIP codes (comma-separated):',current);
  if(!z)return;
  try{
    const res=await api('/api/subscription/territory',{method:'PUT',body:JSON.stringify({zipCodes:z})});
    currentUser.subscribedZipCodes=res.subscribedZipCodes;
    notice(`Coverage territories updated to: ${res.subscribedZipCodes}`);
    await load();
  }catch(err){notice(err.message,true)}
}

function openAiSupportChat(){
  openChatWindow('ai');
}

function renderSidebar(){
  const rail=$('#appRail');
  if(!rail||!currentUser)return;
  const isOwner=currentUser.role==='Owner'||currentUser.isPlatformAdmin;
  const teamCount=teamData?.members?.length||1;
  const currentZips=esc(currentUser.subscribedZipCodes||currentUser.postalCode||'77084, 77002, 78701');

  if(isOwner){
    rail.innerHTML=`
      <div class="rail-brand">
        <h2>NYRAVA HOME</h2>
        <div class="rail-subtitle">REALTOR WORKSPACE</div>
      </div>
      <nav class="rail-nav" aria-label="Realtor navigation">
        ${currentUser.isPlatformAdmin?`
        <button type="button" class="nav-item ${view==='accounts'?'active':''}" data-view="accounts" style="background:rgba(245,158,11,0.08);border-left:3px solid #f59e0b;font-weight:600;">
          <span>👥 Subscribers &amp; Accounts</span>
        </button>`:''}
        <div class="nav-group">
          <button type="button" class="nav-item group-toggle" data-group="myLeads">
            <span>My Leads</span>
            <span class="group-arrow">${openGroups.myLeads?'▼':'▶'}</span>
          </button>
          <div class="nav-subitems ${openGroups.myLeads?'':'hidden'}" id="subitemsMyLeads">
            <button type="button" class="nav-subitem ${view==='contacts'?'active':''}" data-view="contacts">All Leads</button>
            <button type="button" class="nav-subitem ${view==='pipeline'?'active':''}" data-view="pipeline">Pipeline</button>
            <button type="button" class="nav-subitem ${view==='areaIntel'?'active':''}" data-view="areaIntel">Area Intel</button>
          </div>
        </div>
        <div class="nav-group">
          <button type="button" class="nav-item group-toggle" data-group="contactsCrm">
            <span>Contacts &amp; Pipeline</span>
            <span class="group-arrow">${openGroups.contactsCrm?'▼':'▶'}</span>
          </button>
          <div class="nav-subitems ${openGroups.contactsCrm?'':'hidden'}" id="subitemsContactsCrm">
            <button type="button" class="nav-subitem ${view==='contacts'?'active':''}" data-view="contacts">Contacts</button>
            <button type="button" class="nav-subitem" id="railAddContactBtn">+ Add contact</button>
          </div>
        </div>
        <div class="nav-group">
          <button type="button" class="nav-item group-toggle" data-group="myTeam">
            <span>My Team (${teamCount})</span>
            <span class="group-arrow">${openGroups.myTeam?'▼':'▶'}</span>
          </button>
          <div class="nav-subitems ${openGroups.myTeam?'':'hidden'}" id="subitemsMyTeam">
            <button type="button" class="nav-subitem ${view==='team'?'active':''}" data-view="team">Team Members</button>
            <button type="button" class="nav-subitem" id="railInviteBtn">Invite Teammember</button>
            <button type="button" class="nav-subitem" data-view="chat">Team Chat</button>
            <button type="button" class="nav-subitem" id="railMeetBtn">Launch Video Meeting</button>
          </div>
        </div>
        <button type="button" class="nav-item" id="railNyraAiBtn">
          <span>🤖 Nyra Assistance</span>
        </button>
        <button type="button" class="nav-item ${view==='valuation'?'active':''}" data-view="valuation">
          <span>Private Valuation</span>
          <span class="rail-num-badge">↗</span>
        </button>
        <button type="button" class="nav-item ${view==='calendar'?'active':''}" data-view="calendar">
          <span>Calendar &amp; results</span>
        </button>
        <button type="button" class="nav-item ${view==='reminders'?'active':''}" data-view="reminders">
          <span>Appointments &amp; Reminders</span>
          <span class="rail-num-badge">↗</span>
        </button>
        <button type="button" class="nav-item" id="railTerritoryBtn">
          <span>ZIP Territories</span>
        </button>
        <button type="button" class="nav-item" data-view="reminders">
          <span>Notifications</span>
        </button>
        <button type="button" class="nav-item ${view==='performance'?'active':''}" data-view="performance">
          <span>Performance</span>
        </button>
        ${!currentUser.demoMode?`<button type="button" class="nav-item ${view==='integrations'?'active':''}" data-view="integrations"><span>Lead Integrations</span></button>`:''}
        <button type="button" class="nav-item" id="railBillingBtn">
          <span>Account &amp; Billing</span>
        </button>
      </nav>
      <div class="rail-footer">
        <div class="billing-card" id="railBillingCard">
          <div style="font-size:11px;opacity:0.8;text-transform:uppercase;letter-spacing:0.05em;">Plan Active</div>
          <div style="font-weight:700;font-size:13px;margin:2px 0;">Billing &amp; subscription</div>
          <div style="font-size:11px;color:#60a5fa;margin-top:2px;">3 ZIPs Covered · Auto-renew</div>
        </div>
      </div>
    `;
  }else{
    rail.innerHTML=`
      <div class="rail-brand">
        <h2>NYRAVA HOME</h2>
        <div class="rail-subtitle" style="font-size:9px;letter-spacing:0.04em;">RELATIONSHIPS. MOMENTUM. CLOSINGS.</div>
      </div>
      <div class="rail-section-header">YOUR WORKSPACE</div>
      <nav class="rail-nav" aria-label="Team member navigation">
        <button type="button" class="nav-item" data-view="chat">
          <span>Team Chat</span>
          <span class="rail-num-badge">↗</span>
        </button>
        <button type="button" class="nav-item ${view==='today'?'active':''}" data-view="today">
          <span>Today</span>
          <span class="rail-num-badge">01</span>
        </button>
        <button type="button" class="nav-item ${view==='contacts'?'active':''}" data-view="contacts">
          <span>Leads</span>
          <span class="rail-num-badge">02</span>
        </button>
        <button type="button" class="nav-item ${view==='pipeline'?'active':''}" data-view="pipeline">
          <span>Pipeline</span>
          <span class="rail-num-badge">03</span>
        </button>
        <button type="button" class="nav-item ${view==='calendar'?'active':''}" data-view="calendar">
          <span>Calendar &amp; results</span>
          <span class="rail-num-badge">↗</span>
        </button>
        <button type="button" class="nav-item ${view==='calendar'?'active':''}" data-view="calendar">
          <span>Calendar &amp; tasks</span>
          <span class="rail-num-badge">04</span>
        </button>
        <button type="button" class="nav-item" id="railNyraAiBtn">
          <span>Nyra Assistance</span>
        </button>
        <button type="button" class="nav-item ${view==='valuation'?'active':''}" data-view="valuation">
          <span>Private valuation</span>
          <span class="rail-num-badge">↗</span>
        </button>
        <button type="button" class="nav-item ${view==='reminders'?'active':''}" data-view="reminders">
          <span>Appointments &amp; reminders</span>
          <span class="rail-num-badge">↗</span>
        </button>
      </nav>
      <div class="rail-footer" style="display:flex;flex-direction:column;gap:8px;padding-top:16px;">
        <div style="padding:4px 6px;">
          <div style="font-size:12px;font-weight:700;color:#e2e8f0;overflow:hidden;text-overflow:ellipsis;">${esc(currentUser.email.split('@')[0])}</div>
          <div style="font-size:10px;color:#94a3b8;margin-top:2px;">Teammate · Active</div>
        </div>
        <button type="button" id="railSignoutBtn" class="rail-signout-btn">Sign out</button>
      </div>
    `;
  }

  rail.querySelectorAll('.group-toggle').forEach(b=>{
    b.onclick=(e)=>{
      e.stopPropagation();
      const g=b.dataset.group;
      openGroups[g]=!openGroups[g];
      renderSidebar();
    };
  });

  rail.querySelectorAll('[data-view]').forEach(b=>{
    b.onclick=()=>showView(b.dataset.view);
  });

  const addContactBtn=rail.querySelector('#railAddContactBtn');
  if(addContactBtn)addContactBtn.onclick=()=>$('#contactDialog').showModal();

  const inviteBtn=rail.querySelector('#railInviteBtn');
  if(inviteBtn)inviteBtn.onclick=()=>{
    showView('team');
    const input=document.querySelector('#inviteForm input[name="email"]');
    if(input)input.focus();
  };

  const meetBtn=rail.querySelector('#railMeetBtn');
  if(meetBtn)meetBtn.onclick=openNyraMeet;

  const nyraAiBtn=rail.querySelector('#railNyraAiBtn');
  if(nyraAiBtn)nyraAiBtn.onclick=openAiSupportChat;

  const territoryBtn=rail.querySelector('#railTerritoryBtn');
  if(territoryBtn)territoryBtn.onclick=promptEditTerritory;

  const showBilling=()=>alert(`Nyrava Realtor Subscription:\n• Status: Active ($149/mo)\n• Coverage Territories: ${currentZips}\n• Daily Lead Inflow: Up to 2 qualified leads/day per ZIP\n• Team Seats: Unlimited\n• Next Renewal: Active billing cycle`);
  const billingBtn=rail.querySelector('#railBillingBtn');
  const billingCard=rail.querySelector('#railBillingCard');
  if(billingBtn)billingBtn.onclick=showBilling;
  if(billingCard)billingCard.onclick=showBilling;

  const signoutBtn=rail.querySelector('#railSignoutBtn');
  if(signoutBtn)signoutBtn.onclick=()=>$('#logout').click();
}

async function init(){try{const demo=await api('/api/demo-info');demoMode=!!demo.enabled;$('#demoAuthHint').classList.toggle('hidden',!demo.enabled||!register)}catch{demoMode=false}$('#accountRoleHint').classList.toggle('hidden',!register);
async function doQuickLogin(email, password, label) {
  notice(`Signing in as ${label}...`, false);
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    notice('Signed in successfully!', false);
    await init();
  } catch(err) {
    if($('#authError')) $('#authError').textContent = err.message;
    notice(err.message, true);
  }
}

async function doGoogleAuth(email) {
  notice(`Authenticating with Google as ${email}...`, false);
  try {
    await api('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ email })
    });
    notice('Google identity verified!', false);
    await init();
  } catch(err) {
    if($('#authError')) $('#authError').textContent = err.message;
    notice(err.message, true);
  }
}

const qAdmin=$('#quickLoginAdmin');if(qAdmin)qAdmin.onclick=()=>doQuickLogin('admin@home.nyrava.com','Shazbot!Dog5!','Platform Admin');
const qRealtor=$('#quickLoginRealtor');if(qRealtor)qRealtor.onclick=()=>doQuickLogin('test.realtor@nyrava.com','Password123456!','Test Realtor');
const qTeam=$('#quickLoginTeam');if(qTeam)qTeam.onclick=()=>doQuickLogin('team.agent@nyrava.com','Password123456!','Test Team Member');

const btnG=$('#btnGoogleAuth');const gNorm=$('#crmGoogleNormal');const gPick=$('#crmGooglePicker');
if(btnG&&gNorm&&gPick){
  btnG.onclick=()=>{ gNorm.style.display='none'; gPick.style.display='block'; };
  const closeG=$('#crmCloseGooglePicker');if(closeG)closeG.onclick=()=>{ gPick.style.display='none'; gNorm.style.display='block'; };
  gPick.querySelectorAll('.crm-g-item').forEach(item=>{
    item.onclick=()=>doGoogleAuth(item.dataset.googleEmail);
  });
  const btnCustG=$('#crmBtnCustomGoogle');
  if(btnCustG)btnCustG.onclick=()=>{
    const em=$('#crmCustomGoogleEmail').value.trim();
    if(em) doGoogleAuth(em);
  };
}

const btnForgot=$('#btnForgotPass');const forgotSec=$('#forgotPassSection');const authForm=$('#authForm');
if(btnForgot&&forgotSec){btnForgot.onclick=()=>{authForm.classList.add('hidden');forgotSec.classList.remove('hidden')}}
const btnBack=$('#btnBackToLogin');if(btnBack&&forgotSec){btnBack.onclick=()=>{forgotSec.classList.add('hidden');authForm.classList.remove('hidden')}}
const btnSendR=$('#btnSendReset');if(btnSendR)btnSendR.onclick=()=>{const em=$('#forgotEmail').value.trim();if(!em)return;const fn=$('#forgotNotice');if(fn){fn.textContent=`Reset link sent to ${em}. Check your email inbox!`;fn.classList.remove('hidden')}};
try{currentUser=await api('/api/me')}catch{$('#auth').classList.remove('hidden');$('#app').classList.add('hidden');$('#logout').classList.add('hidden');$('#demoBanner').classList.add('hidden');return}
$('#auth').classList.add('hidden');$('#app').classList.remove('hidden');$('#logout').classList.remove('hidden');$('#demoBanner').classList.toggle('hidden',!currentUser.demoMode);
if(currentUser.isPlatformAdmin){
  if($('#identity'))$('#identity').innerHTML=`<div style="font-weight:700;color:#f59e0b;font-size:13px;">👑 PLATFORM OWNER ADMIN</div><div style="font-size:11px;color:#94a3b8;margin-top:2px;">Master Lead Bank</div>`;
  const tInfo=$('#territoryInfo');if(tInfo)tInfo.innerHTML=`<div style="font-size:11px;color:#cbd5e1;background:#1e293b;padding:6px 8px;border-radius:4px;line-height:1.4;">🏦 <strong>Platform Owner Lead Bank</strong><br>Receives all inbound leads &amp; filters up to 2/day per ZIP to subscribed realtors.</div>`;
  const aNav=$('#areaIntelNav');if(aNav)aNav.classList.remove('hidden');
}else{
  if($('#identity'))$('#identity').innerHTML=`<div style="font-weight:700;color:#38bdf8;font-size:13px;">🏠 REALTOR SUBSCRIBER</div><div style="font-size:11px;color:#94a3b8;margin-top:2px;">${esc(currentUser.email)}</div>`;
  const tInfo=$('#territoryInfo');if(tInfo)tInfo.innerHTML=`<div style="font-size:11px;background:#f8fafc;padding:6px 8px;border-radius:4px;border:1px solid #e2e8f0;line-height:1.4;">📍 <strong>My Sales ZIPs:</strong><br><span id="myZipsText" style="font-weight:600;color:#0f172a;">${esc(currentUser.subscribedZipCodes||currentUser.postalCode||'None')}</span><br><button type="button" class="text-link" id="editTerritoryBtn" style="font-size:11px;margin-top:4px;">[Change 3 Coverage ZIPs]</button></div>`;
  const editBtn=$('#editTerritoryBtn');if(editBtn)editBtn.onclick=async()=>{
    const z=prompt('Enter the 3 sales ZIP codes for your account (separated by commas, e.g. 77084, 77002, 78701):',currentUser.subscribedZipCodes||currentUser.postalCode||'77084, 77002, 78701');
    if(!z)return;
    try{
      const res=await api('/api/subscription/territory',{method:'PUT',body:JSON.stringify({zipCodes:z})});
      currentUser.subscribedZipCodes=res.subscribedZipCodes;
      $('#myZipsText').textContent=res.subscribedZipCodes;
      notice(`Coverage ZIP codes updated to: ${res.subscribedZipCodes}`);
      await load();
    }catch(err){notice(err.message,true)}
  };
}
$('#archivedNav')?.classList.toggle('hidden',currentUser.role!=='Owner');$('#integrationsNav')?.classList.toggle('hidden',currentUser.role!=='Owner'||currentUser.demoMode);renderSidebar();try{await load()}catch(e){console.error('Workspace data load failed:',e);notice(`Signed in, but workspace data could not be loaded: ${e.message}`,true)}}
async function load(){[contacts,activities]=await Promise.all([api('/api/contacts'),api('/api/activities')]);try{teamData=await api('/api/team')}catch(e){console.error('Team list unavailable',e)}try{chatPeople=await api('/api/chat/people')}catch(e){console.error('Chat directory unavailable',e)}contacts.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));activities.sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt));render();renderTeam();renderChatPeople();renderSidebar();if(view==='areaIntel')await loadAreaIntelligence();else if(view==='archived')await loadArchived();else if(view==='integrations')await loadIntegrationKeys();}
function notice(t,bad=false){const n=$('#notice');n.textContent=t;n.classList.toggle('hidden',!t);n.classList.toggle('error-notice',bad);if(t)setTimeout(()=>n.classList.add('hidden'),5500)}
function cardActivity(a){const c=contacts.find(x=>x.id===a.contactId)||a.contact;return `<article class="activity ${a.completed?'done':''}"><div class="activity-main"><strong>${esc(a.title)}</strong><div class="muted">${esc(a.kind)} · <button class="text-link" data-open-contact="${a.contactId}">${esc(c?.name||'Contact')}</button> · ${dateValue(a.startsAt)}${a.result?` · Result: ${esc(a.result)}`:''}</div>${a.location?`<p>📍 ${esc(a.location)}</p>`:''}${a.details?`<p>${esc(a.details)}</p>`:''}</div><div class="activity-actions">${!a.completed&&a.kind!=='Note'?`<button class="small" data-complete="${a.id}">Complete</button>`:''}${a.kind==='Appointment'?`<button class="small quiet" data-result-id="${a.id}">${a.result?'View / update result':'Result'}</button>`:''}${!a.completed?`<button class="small quiet" data-edit-activity="${a.id}">Edit</button>`:''}${currentUser?.role==='Owner'?`<button class="small quiet" data-delete-activity="${a.id}">Delete</button>`:''}</div></article>`}
function bindActivityButtons(){document.querySelectorAll('[data-complete]').forEach(b=>b.onclick=async()=>{try{await api(`/api/activities/${b.dataset.complete}/complete`,{method:'PUT'});await load()}catch(e){notice(e.message,true)}});document.querySelectorAll('[data-result-id]').forEach(b=>b.onclick=()=>openResult(Number(b.dataset.resultId)));document.querySelectorAll('[data-edit-activity]').forEach(b=>b.onclick=()=>{const a=activities.find(x=>x.id===Number(b.dataset.editActivity));if(a)openActivity(a.kind,a.contactId,a)});document.querySelectorAll('[data-delete-activity]').forEach(b=>b.onclick=async()=>{if(!confirm('Delete this item?'))return;try{await api(`/api/activities/${b.dataset.deleteActivity}`,{method:'DELETE'});await load()}catch(e){notice(e.message,true)}});document.querySelectorAll('[data-open-contact]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.openContact);showView('contacts');render()})}
function filtered(){const q=$('#search').value.toLowerCase().trim(),t=$('#typeFilter').value,s=$('#stageFilter').value,b=$('#bankFilter')?.value;return contacts.filter(c=>{const matchQ=!q||[c.name,c.email,c.phone,c.company,c.propertyZipCode].join(' ').toLowerCase().includes(q);const matchT=!t||c.leadType===t;const matchS=!s||c.stage===s;const isBanked=c.notes?.includes('[In Master Bank')||c.notes?.includes('Unassigned')||c.notes?.includes('waiting');const isDispatched=c.notes?.includes('[Dispatched')||c.notes?.includes('Assigned FSBO')||c.notes?.includes('Routed');const matchB=!b||(b==='banked'?isBanked:b==='dispatched'?isDispatched:true);return matchQ&&matchT&&matchS&&matchB})}
function leadMetadata(c){if(!currentUser?.isPlatformAdmin){return `<section class="contact-history lead-provenance"><h3>Lead Verification &amp; Authorization</h3><p><strong>Origin Channel:</strong> 🌐 <strong style="color:#1e40af;">Nyrava Private Direct Network</strong> · <strong>Property Area / ZIP:</strong> 📍 ${esc(c.propertyZipCode||'Not provided')}</p><p><strong>Verified Homeowner Contact:</strong> ${esc(c.contactVerificationMethod||'Direct Phone')} · ${dateValue(c.contactVerifiedAt)}</p><p><strong>Intent Verified:</strong> ${dateValue(c.intentVerifiedAt)}</p><p><strong>Direct Authorization:</strong> ${esc(c.consentRecipient||'Nyrava Concierge')} · ${dateValue(c.consentCapturedAt)}</p>${c.consentText?`<details style="margin-top:4px;"><summary style="cursor:pointer;font-weight:600;">Recorded Homeowner Consent</summary><p style="margin-top:4px;padding:6px;background:#f8fafc;border-left:3px solid #cbd5e1;">${esc(c.consentText)}</p></details>`:''}</section>`}if(!c.source)return '';const sourceNames={Fsbo:'FSBO Direct Homeowner',Zillow:'Zillow FSBO',Facebook:'Facebook Marketplace',Craigslist:'Craigslist (By Owner)',FsboCom:'FSBO.com Portal',HomeEvaluation:'Home evaluation',LeadGenerator:'Lead Generator',RealtorAssistance:'Realtor assistance'};const linkHtml=c.sourceUrl?`<a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;word-break:break-all;">${esc(c.sourceUrl)}</a>`:'Direct portal';return `<section class="contact-history lead-provenance"><h3>👑 Platform Owner Lead Provenance</h3><p><strong>Origin Channel:</strong> 🌐 <strong style="color:#1e40af;">${esc(sourceNames[c.source]||c.source)}</strong> · <strong>Property Area / ZIP:</strong> 📍 ${esc(c.propertyZipCode||'Not provided')}</p><p><strong>Direct Listing Record:</strong> ${linkHtml}</p><p><strong>Verified Homeowner Contact:</strong> ${esc(c.contactVerificationMethod||'Phone')} · ${dateValue(c.contactVerifiedAt)}</p><p><strong>Intent Verified:</strong> ${dateValue(c.intentVerifiedAt)}</p><p><strong>Direct Authorization:</strong> ${esc(c.consentRecipient||'')} · ${dateValue(c.consentCapturedAt)}</p>${c.externalFsbo?`<p><strong>External FSBO Review:</strong> ${esc(c.fsboAdminReviewReference||'')} · ${dateValue(c.fsboAdminReviewedAt)}</p>`:''}${c.consentText?`<details style="margin-top:4px;"><summary style="cursor:pointer;font-weight:600;">Recorded Homeowner Consent</summary><p style="margin-top:4px;padding:6px;background:#f8fafc;border-left:3px solid #cbd5e1;">${esc(c.consentText)}</p></details>`:''}</section>`}
function render(){const open=activities.filter(a=>!a.completed),upcoming=open.filter(a=>a.kind==='Appointment'&&new Date(a.startsAt)>=new Date());$('#statContacts').textContent=contacts.length;$('#statActivities').textContent=open.filter(a=>a.kind!=='Appointment'&&a.kind!=='Note').length;$('#statPipeline').textContent=contacts.filter(c=>!['Verified Lead','Lost Lead'].includes(c.stage)).length;$('#statAppointments').textContent=upcoming.length;$('#navTodayCount').textContent=open.length?String(open.length):'';
 const queue=open.filter(a=>a.kind==='Task'||a.kind==='Follow-up').slice(0,10);$('#todayTasks').innerHTML=queue.map(cardActivity).join('')||'<p class="muted">No open tasks. Add a follow-up when you need one.</p>';$('#todayAppointments').innerHTML=upcoming.slice(0,10).map(cardActivity).join('')||'<p class="muted">No upcoming appointments.</p>';$('#recentContacts').innerHTML=contacts.slice(0,6).map(c=>`<button class="recent-contact" data-open-contact="${c.id}"><strong>${esc(c.name)}</strong><span>${esc(c.leadType||'Other')} · ${esc(c.stage)}</span></button>`).join('')||'<p class="muted">Add your first contact.</p>';
 const list=filtered();const totalContactsPages=Math.ceil(list.length/contactsPageSize)||1;if(contactsPage>totalContactsPages)contactsPage=totalContactsPages;if(contactsPage<1)contactsPage=1;const startIdx=(contactsPage-1)*contactsPageSize;const pageList=list.slice(startIdx,startIdx+contactsPageSize);
 $('#contactCount').textContent=`${list.length} contact${list.length===1?'':'s'}`;
 $('#contacts').innerHTML=pageList.map(c=>{
   const member=teamData?.members?.find(m=>Number(m.id)===Number(c.assignedToUserId));
   const assignedTag=member?`<span class="badge" style="background:#f1f5f9;color:#475569;margin-left:4px;">👤 ${esc(member.email.split('@')[0])}</span>`:'';
   const zipTag=c.propertyZipCode?`<span class="badge" style="background:#fef3c7;color:#92400e;margin-left:4px;">📍 ${esc(c.propertyZipCode)}</span>`:'';
   const srcMap={Fsbo:'FSBO Direct',Zillow:'Zillow FSBO',Facebook:'Facebook Mkt',Craigslist:'Craigslist',FsboCom:'FSBO.com'};
   const srcTag=currentUser?.isPlatformAdmin&&c.source&&srcMap[c.source]?`<span class="badge" style="background:#e0e7ff;color:#3730a3;margin-left:4px;">🌐 ${esc(srcMap[c.source])}</span>`:'';
   const isBanked=c.notes?.includes('[In Master Bank')||c.notes?.includes('Unassigned')||c.notes?.includes('waiting');
   const isDispatched=c.notes?.includes('[Dispatched')||c.notes?.includes('Assigned FSBO')||c.notes?.includes('Routed');
   const statusBadge=currentUser?.isPlatformAdmin?(isBanked?`<span class="badge" style="background:#fee2e2;color:#991b1b;margin-left:4px;">🏦 In Bank</span>`:isDispatched?`<span class="badge" style="background:#dcfce7;color:#166534;margin-left:4px;">✅ Routed</span>`:''):'';
   return `<button class="item ${selected===c.id?'active':''}" data-contact="${c.id}"><strong>${esc(c.name)}</strong><span>${esc(c.company||c.phone||c.email||'No contact details')}</span><div style="margin-top:4px;"><span class="badge">${esc(c.leadType||'Other')} · ${esc(c.stage)}</span>${zipTag}${srcTag}${statusBadge}${assignedTag}</div></button>`;
 }).join('')||'<p class="muted">No matching contacts.</p>';
 const topPag=$('#contactsTopPagination');if(topPag){topPag.innerHTML=`<button id="topPrevContacts" class="compact-pag-btn" ${contactsPage<=1?'disabled':''}>‹</button><span style="font-size:11px;font-weight:700;color:#64748b;">${contactsPage}/${totalContactsPages}</span><button id="topNextContacts" class="compact-pag-btn" ${contactsPage>=totalContactsPages?'disabled':''}>›</button>`;const tp=$('#topPrevContacts');if(tp)tp.onclick=()=>{if(contactsPage>1){contactsPage--;render()}};const tn=$('#topNextContacts');if(tn)tn.onclick=()=>{if(contactsPage<totalContactsPages){contactsPage++;render()}}};const pag=$('#contactsPagination');if(pag){pag.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:10px 4px;border-top:2px solid #e2e8f0;margin-top:10px;"><button id="prevContactsPage" class="button" style="padding:5px 12px;font-size:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;" ${contactsPage<=1?'disabled':''}>‹ Prev</button><span style="font-size:12px;font-weight:700;color:#1e293b;">Page ${contactsPage} of ${totalContactsPages} (${list.length} leads)</span><button id="nextContactsPage" class="button" style="padding:5px 12px;font-size:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;" ${contactsPage>=totalContactsPages?'disabled':''}>Next ›</button></div>`;const prevBtn=$('#prevContactsPage');if(prevBtn)prevBtn.onclick=()=>{if(contactsPage>1){contactsPage--;render()}};const nextBtn=$('#nextContactsPage');if(nextBtn)nextBtn.onclick=()=>{if(contactsPage<totalContactsPages){contactsPage++;render()}}}
 document.querySelectorAll('[data-contact]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.contact);render()});
 const c=contacts.find(x=>x.id===selected);$('#detailTitle').textContent=c?.name||'Select a contact';
 const activeMembers=teamData?.members?.filter(m=>(m.role==='Owner'||m.role==='Employee')&&m.active!==false)||[];
 const assignmentHtml=currentUser?.role==='Owner'?`<div class="detail-row"><label>Assigned to Team Member</label><div class="assignment-row" style="display:flex;gap:8px;margin-top:4px;"><select id="assignedMember" style="margin:0;">${activeMembers.map(m=>`<option value="${m.id}" ${Number(c?.assignedToUserId)===Number(m.id)?'selected':''}>${esc(m.email)} (${esc(m.role)})</option>`).join('')}</select><button id="saveAssignment" class="small quiet" type="button" style="white-space:nowrap;">Assign</button></div>${activeMembers.length<=1?'<small style="display:block;margin-top:6px;color:#64748b;">Want to assign to an agent? <button type="button" class="text-link" id="goInviteTeam">+ Invite teammate in My Team</button></small>':''}</div>`:'';
 const adminDispatchHtml=currentUser?.isPlatformAdmin?`<div class="detail-row" style="background:#fffbeb;border:1px solid #fef3c7;padding:10px;border-radius:6px;margin:8px 0;"><label style="color:#92400e;font-weight:700;">👑 Platform Owner: Route Lead to Realtor</label><div style="display:flex;gap:8px;margin-top:6px;"><select id="dispatchRealtorSelect" style="margin:0;flex:1;"></select><button id="btnDispatchLead" class="small" type="button" style="white-space:nowrap;background:#d97706;color:#fff;">Route to Realtor</button></div></div>`:'';
 $('#detail').innerHTML=c?`<div class="lead-quick-triage" style="display:flex;gap:8px;margin-bottom:12px;padding:8px;background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;"><button id="btnMarkGood" type="button" class="small" style="flex:1;background:#16a34a;color:#fff;font-weight:700;">👍 Mark Good</button><button id="btnMarkBad" type="button" class="small" style="flex:1;background:#ea580c;color:#fff;font-weight:700;">👎 Mark Bad</button><button id="btnQuickDelete" type="button" class="small quiet" style="background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;font-weight:700;">🗑️ Delete</button></div><div class="detail-row"><label>Name</label><input id="name" value="${esc(c.name)}" maxlength="160"></div><div class="detail-row"><label>Contact type</label><select id="leadType">${['Buyer','Seller','Other'].map(s=>`<option ${c.leadType===s?'selected':''}>${s}</option>`).join('')}</select></div>${adminDispatchHtml}${assignmentHtml}<div class="detail-row"><label>Email</label><input id="email" type="email" value="${esc(c.email||'')}"></div><div class="detail-row"><label>Phone</label><input id="phone" value="${esc(c.phone||'')}"></div><div class="detail-row"><label>Company</label><input id="company" value="${esc(c.company||'')}"></div>${leadMetadata(c)}<div class="detail-row"><label>Pipeline stage</label><select id="stage">${stages.map(s=>`<option ${c.stage===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="detail-row"><label>Notes</label><textarea id="notes" maxlength="4000">${esc(c.notes||'')}</textarea></div><div class="detail-actions"><button id="saveContact">Save changes</button><button id="contactTask" class="quiet">Add task</button><button id="contactAppointment" class="quiet">Add appointment</button><button id="contactNote" class="quiet">Add note</button>${currentUser?.role==='Owner'?'<button id="deleteContact" class="danger">Archive</button>':''}</div><div class="contact-history"><h3>Activity history</h3>${activities.filter(a=>a.contactId===c.id).sort((a,b)=>new Date(b.startsAt)-new Date(a.startsAt)).map(cardActivity).join('')||'<p class="muted">No history yet.</p>'}</div>`:'<p class="muted">Choose a contact to view details.</p>';
 if(c){
   if(currentUser?.isPlatformAdmin){
     api('/api/admin/realtors').then(realtors=>{const sel=$('#dispatchRealtorSelect');if(sel)sel.innerHTML=realtors.map(r=>`<option value="${r.id}">${esc(r.email)} (ZIPs: ${esc(r.subscribedZipCodes||'None')})</option>`).join('')||'<option value="">No registered realtors</option>'}).catch(()=>{});
     const dispatchBtn=$('#btnDispatchLead');if(dispatchBtn)dispatchBtn.onclick=async()=>{const rid=Number($('#dispatchRealtorSelect').value);if(!rid)return notice('Select a realtor to dispatch to.',true);try{const res=await api(`/api/admin/dispatch-lead/${c.id}`,{method:'POST',body:JSON.stringify({realtorUserId:rid})});notice(`Lead routed to ${res.dispatchedTo}!`);await load()}catch(err){notice(err.message,true)}};
   }
   const goodBtn=$('#btnMarkGood');if(goodBtn)goodBtn.onclick=async()=>{try{await api(`/api/contacts/${c.id}`,{method:'PUT',body:JSON.stringify({...c,stage:'Verified Lead',notes:(c.notes?c.notes+' | ':'')+'Marked Good (Verified).'})});notice('Lead marked as Good (Verified Lead)!');await load();}catch(e){notice(e.message,true)}};const badBtn=$('#btnMarkBad');if(badBtn)badBtn.onclick=async()=>{try{await api(`/api/contacts/${c.id}`,{method:'PUT',body:JSON.stringify({...c,stage:'Lost Lead',notes:(c.notes?c.notes+' | ':'')+'Marked Bad/Lost.'})});notice('Lead marked as Bad (Lost Lead).');await load();}catch(e){notice(e.message,true)}};const qDelBtn=$('#btnQuickDelete');if(qDelBtn)qDelBtn.onclick=async()=>{if(!confirm(`Delete lead "${c.name}" from workspace?`))return;try{await api(`/api/contacts/${c.id}?permanent=true`,{method:'DELETE'});selected=null;notice('Lead deleted from workspace.');await load();}catch(e){notice(e.message,true)}};$('#saveContact').onclick=async()=>{try{await api(`/api/contacts/${c.id}`,{method:'PUT',body:JSON.stringify({...c,name:$('#name').value,email:$('#email').value,phone:$('#phone').value,company:$('#company').value,leadType:$('#leadType').value,stage:$('#stage').value,notes:$('#notes').value})});notice('Contact saved.');await load()}catch(e){notice(e.message,true)}};const del=$('#deleteContact');if(del)del.onclick=async()=>{if(confirm('Archive this contact? Its tasks, appointments, and history will be retained.')){try{await api(`/api/contacts/${c.id}`,{method:'DELETE'});selected=null;await load()}catch(e){notice(e.message,true)}}};const assign=$('#saveAssignment');if(assign)assign.onclick=async()=>{try{await api(`/api/team/assign/${c.id}`,{method:'POST',body:JSON.stringify({userId:Number($('#assignedMember').value)})});notice('Contact assigned to teammate.');await load()}catch(e){notice(e.message,true)}};const goInvite=$('#goInviteTeam');if(goInvite)goInvite.onclick=()=>showView('team');$('#contactTask').onclick=()=>openActivity('Task',c.id);$('#contactAppointment').onclick=()=>openActivity('Appointment',c.id);$('#contactNote').onclick=()=>openActivity('Note',c.id)}
 const type=$('#pipelineType').value;
 $('#pipelineBoard').innerHTML=stages.map(s=>{
   const rows=contacts.filter(c=>c.stage===s&&(!type||c.leadType===type));
   colPages[s]=colPages[s]||1;const totalColPages=Math.ceil(rows.length/colPageSize)||1;if(colPages[s]>totalColPages)colPages[s]=totalColPages;if(colPages[s]<1)colPages[s]=1;const pageRows=rows.slice((colPages[s]-1)*colPageSize,colPages[s]*colPageSize);
   return `<section class="pipeline-column"><header><strong>${esc(s)}</strong><span>${rows.length}</span></header><div class="pipeline-cards-container">${pageRows.map(c=>{
     const member=teamData?.members?.find(m=>Number(m.id)===Number(c.assignedToUserId));
     const assignedText=member?`👤 ${esc(member.email.split('@')[0])}`:`👤 Realtor`;
     return `<button class="pipeline-card" data-pipeline-contact="${c.id}"><div class="pipeline-card-name">${esc(c.name)}</div><div class="pipeline-card-meta"><span class="pipeline-card-badge">${esc(c.leadType||'Seller')}</span>${c.propertyZipCode?`<span class="pipeline-card-badge pipeline-card-zip">📍 ZIP ${esc(c.propertyZipCode)}</span>`:''}</div><div class="pipeline-card-contact">${c.phone?`<div>📞 <strong>${esc(c.phone)}</strong></div>`:''}${c.email?`<div>✉️ ${esc(c.email)}</div>`:''}</div><div class="pipeline-card-assignee">${assignedText}</div><div style="display:flex;gap:4px;margin-top:6px;border-top:1px solid #e2e8f0;padding-top:4px;"><button type="button" class="text-link" data-pipeline-advance="${c.id}" style="font-size:11px;font-weight:600;color:#2563eb;">Move Next ›</button><button type="button" class="text-link" data-pipeline-bad="${c.id}" style="font-size:11px;color:#dc2626;margin-left:auto;">Mark Bad</button></div></button>`;
   }).join('')||'<p class="muted" style="text-align:center;padding:24px 0;">— No leads —</p>'}</div><div class="column-pagination" style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;border-top:1px solid #e2e8f0;"><button data-col-prev="${esc(s)}" style="padding:2px 8px;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;" ${colPages[s]<=1?'disabled':''}>‹</button><span style="font-size:11px;font-weight:600;color:#64748b;">Page ${colPages[s]} of ${totalColPages} (${rows.length})</span><button data-col-next="${esc(s)}" style="padding:2px 8px;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;" ${colPages[s]>=totalColPages?'disabled':''}>›</button></div></section>`;
 }).join('');
 document.querySelectorAll('[data-col-prev]').forEach(b=>b.onclick=(e)=>{e.stopPropagation();const st=b.dataset.colPrev;if(colPages[st]>1){colPages[st]--;render()}});
 document.querySelectorAll('[data-col-next]').forEach(b=>b.onclick=(e)=>{e.stopPropagation();const st=b.dataset.colNext;colPages[st]=(colPages[st]||1)+1;render()});
 document.querySelectorAll('[data-pipeline-contact]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.pipelineContact);showView('contacts');render()});document.querySelectorAll('[data-pipeline-advance]').forEach(b=>b.onclick=async(e)=>{e.stopPropagation();const id=Number(b.dataset.pipelineAdvance);const tc=contacts.find(x=>x.id===id);if(!tc)return;const idx=stages.indexOf(tc.stage);if(idx<stages.length-2){const ns=stages[idx+1];try{await api(`/api/contacts/${id}`,{method:'PUT',body:JSON.stringify({...tc,stage:ns})});notice(`Lead moved to ${ns}`);await load()}catch(err){notice(err.message,true)}}});document.querySelectorAll('[data-pipeline-bad]').forEach(b=>b.onclick=async(e)=>{e.stopPropagation();const id=Number(b.dataset.pipelineBad);const tc=contacts.find(x=>x.id===id);if(!tc)return;try{await api(`/api/contacts/${id}`,{method:'PUT',body:JSON.stringify({...tc,stage:'Lost Lead'})});notice('Lead marked as Bad (Lost Lead)');await load()}catch(err){notice(err.message,true)}});
 renderCalendar();renderReminders();renderPerformance();bindActivityButtons();
}
function calendarItems(){const filter=$('#calendarFilter').value||'all',result=$('#calendarResultFilter').value||'all';return activities.filter(a=>(filter==='all'||a.kind===filter)&&(result==='all'||(result==='scheduled'?!a.completed&&!a.result:a.result===result)))}
function renderCalendar(){const target=$('#agendaDate').value||localDay(new Date()),mode=calendarMode||'month',d=new Date(`${target}T12:00:00`),items=calendarItems();$('#calendarTitle').textContent=mode==='month'?d.toLocaleDateString([],{month:'long',year:'numeric'}):mode==='day'?d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric'}):mode==='week'?`${new Date(weekStart(d)).toLocaleDateString([],{month:'short',day:'numeric'})} – ${new Date(weekStart(d)+6*86400000).toLocaleDateString([],{month:'short',day:'numeric',year:'numeric'})}`:'Upcoming agenda';document.querySelectorAll('[data-calendar-view]').forEach(b=>b.classList.toggle('selected',b.dataset.calendarView===mode));
 const within=items.filter(a=>mode==='month'?new Date(a.startsAt).getMonth()===d.getMonth()&&new Date(a.startsAt).getFullYear()===d.getFullYear():mode==='week'?new Date(a.startsAt)>=new Date(weekStart(d))&&new Date(a.startsAt)<new Date(weekStart(d)+7*86400000):mode==='day'?localDay(a.startsAt)===target:new Date(a.startsAt)>=new Date(`${target}T00:00:00`));$('#calendarAppointmentCount').textContent=within.filter(a=>a.kind==='Appointment').length;$('#calendarTaskCount').textContent=items.filter(a=>!a.completed&&['Task','Follow-up'].includes(a.kind)).length;$('#calendarContactCount').textContent=contacts.length;
 if(mode==='agenda'){const upcoming=items.filter(a=>!a.completed&&new Date(a.startsAt)>=new Date(`${target}T00:00:00`)).sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt));$('#calendarGrid').innerHTML=`<div class="agenda-view">${upcoming.map(cardActivity).join('')||'<div class="empty-state">No upcoming appointments or tasks.</div>'}</div>`}else{let start,end;if(mode==='day'){start=new Date(d);start.setHours(0,0,0,0);end=new Date(start);end.setDate(end.getDate()+1)}else if(mode==='week'){start=new Date(weekStart(d));end=new Date(start);end.setDate(end.getDate()+7)}else{start=new Date(d.getFullYear(),d.getMonth(),1);start.setDate(start.getDate()-start.getDay());end=new Date(start);end.setDate(end.getDate()+42)}const days=[];for(let x=new Date(start);x<end;x.setDate(x.getDate()+1))days.push(new Date(x));const labels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];const dayData=mode==='day'?[''].concat(days):days;$('#calendarGrid').innerHTML=mode==='day'?`<div class="calendar-day-view"><div class="day-view-date">${d.toLocaleDateString([],{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</div>${items.filter(a=>localDay(a.startsAt)===target).map(cardActivity).join('')||'<div class="empty-state">Nothing scheduled for this day.</div>'}</div>`:`<div class="calendar-grid ${mode}">${labels.map(x=>`<div class="calendar-label">${x}</div>`).join('')}${dayData.map(day=>{const key=localDay(day),rows=items.filter(a=>localDay(a.startsAt)===key).sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt));return `<section class="calendar-cell ${mode==='month'&&day.getMonth()!==d.getMonth()?'outside':''} ${key===localDay(new Date())?'is-today':''}" data-calendar-day="${key}"><button class="calendar-day-number" data-select-day="${key}">${day.getDate()}</button>${rows.slice(0,mode==='month'?4:12).map(a=>`<button class="calendar-event ${a.kind==='Task'||a.kind==='Follow-up'?'task-event':''} ${a.completed?'completed-event':''}" data-calendar-activity="${a.id}"><span>${new Date(a.startsAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</span> ${esc(a.title)}</button>`).join('')}${rows.length>(mode==='month'?4:12)?`<small>+${rows.length-(mode==='month'?4:12)} more</small>`:''}<button class="calendar-add" data-add-date="${key}" aria-label="Add item on ${key}">+</button></section>`}).join('')}</div>`}
 const selected=new Date(`${target}T12:00:00`),selectedItems=items.filter(a=>localDay(a.startsAt)===target).sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt));$('#calendarAgendaTitle').textContent=mode==='month'?'Selected day':selected.toLocaleDateString([],{weekday:'long',month:'short',day:'numeric'});$('#calendarAgenda').innerHTML=selectedItems.map(cardActivity).join('')||'<p class="muted">No items for this date.</p>';const q=$('#calendarContactSearch').value.toLowerCase().trim();const matches=contacts.filter(c=>!q||[c.name,c.email,c.phone,c.company].join(' ').toLowerCase().includes(q));const totalCalPages=Math.ceil(matches.length/5)||1;if(calendarContactsPage>totalCalPages)calendarContactsPage=totalCalPages;if(calendarContactsPage<1)calendarContactsPage=1;const calPageMatches=matches.slice((calendarContactsPage-1)*5,calendarContactsPage*5);$('#calendarContacts').innerHTML=calPageMatches.map(c=>`<button class="calendar-contact" data-open-contact="${c.id}"><strong>${esc(c.name)}</strong><span>${esc(c.email||c.phone||c.company||'Contact')}</span></button>`).join('')||'<p class="muted">No contacts found.</p>';const calPag=$('#calendarContactsPagination');if(calPag){calPag.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 4px;margin-top:6px;border-top:1px solid #e2e8f0;"><button id="calPrevBtn" class="compact-pag-btn" ${calendarContactsPage<=1?'disabled':''}>‹ Prev</button><span style="font-size:11px;font-weight:700;color:#64748b;">Page ${calendarContactsPage} of ${totalCalPages}</span><button id="calNextBtn" class="compact-pag-btn" ${calendarContactsPage>=totalCalPages?'disabled':''}>Next ›</button></div>`;const cp=$('#calPrevBtn');if(cp)cp.onclick=()=>{if(calendarContactsPage>1){calendarContactsPage--;renderCalendar()}};const cn=$('#calNextBtn');if(cn)cn.onclick=()=>{if(calendarContactsPage<totalCalPages){calendarContactsPage++;renderCalendar()}}};bindActivityButtons();document.querySelectorAll('[data-select-day]').forEach(b=>b.onclick=()=>{$('#agendaDate').value=b.dataset.selectDay;calendarMode='day';renderCalendar()});document.querySelectorAll('[data-add-date]').forEach(b=>b.onclick=()=>{const dt=new Date(`${b.dataset.addDate}T09:00:00`);openActivity('Appointment',null,null,dt)});document.querySelectorAll('[data-calendar-activity]').forEach(b=>b.onclick=()=>{const a=activities.find(x=>x.id===Number(b.dataset.calendarActivity));if(a)openActivity(a.kind,a.contactId,a)});document.querySelectorAll('#calendarAgenda [data-open-contact],#calendarContacts [data-open-contact]').forEach(b=>b.onclick=()=>{selected=Number(b.dataset.openContact);showView('contacts')})}
function weekStart(d){const x=new Date(d);x.setHours(0,0,0,0);x.setDate(x.getDate()-x.getDay());return x.getTime()}
function renderReminders(){const now=Date.now(),limit=now+7*86400000,items=activities.filter(a=>!a.completed&&(a.kind==='Appointment'||a.kind==='Follow-up'||a.kind==='Task')&&(a.kind==='Appointment'?new Date(a.startsAt).getTime()>=now:new Date(a.startsAt).getTime()<=limit)).sort((a,b)=>new Date(a.startsAt)-new Date(b.startsAt));$('#reminderList').innerHTML=items.map(cardActivity).join('')||'<div class="empty-state"><strong>You are all caught up</strong><p>No open tasks due in the next seven days or upcoming appointments.</p></div>'}
function renderPerformance(){const done=activities.filter(a=>a.completed),open=activities.filter(a=>!a.completed),verified=contacts.filter(c=>c.stage==='Verified Lead').length;$('#performanceMetrics').innerHTML=`<div class="card"><small>Total contacts</small><b>${contacts.length}</b></div><div class="card"><small>Verified leads</small><b>${verified}</b></div><div class="card"><small>Open tasks</small><b>${open.filter(a=>a.kind!=='Appointment').length}</b></div><div class="card"><small>Completed activities</small><b>${done.length}</b></div>`;$('#performanceStages').innerHTML=stages.map(s=>{const n=contacts.filter(c=>c.stage===s).length;return `<div class="stage-metric"><span>${esc(s)}</span><div><i style="width:${contacts.length?Math.max(n?4:0,n/contacts.length*100):0}%"></i></div><b>${n}</b></div>`}).join('');$('#performanceTypes').innerHTML=['Buyer','Seller','Other'].map(t=>`<div class="compact-metric"><span>${t}</span><b>${contacts.filter(c=>(c.leadType||'Other')===t).length}</b></div>`).join('');$('#performanceActivity').innerHTML=`<div class="compact-metric"><span>Open</span><b>${open.length}</b></div><div class="compact-metric"><span>Completed</span><b>${done.length}</b></div><div class="compact-metric"><span>Appointment count</span><b>${activities.filter(a=>a.kind==='Appointment').length}</b></div>`}
function renderTeam(){const members=teamData.members||[];$('#teamFeatureStatus').textContent=teamData.teamInvitationsEnabled===false?'Team invitations are turned off for this CRM system.':currentUser?.role==='Owner'?'You are signed in as the Subscriber for this workspace.':'Only the Subscriber can invite or manage teammates.';$('#teamMembers').innerHTML=members.map(m=>`<div class="team-member"><div><strong>${esc(m.email)}</strong><span>${m.role==='Owner'?'Subscriber':'Team member'} · ${m.active===false?'Inactive':'Active'}</span></div><div>${Number(m.id)===Number(currentUser?.workspaceId)?'<span class="badge">Subscriber</span>':teamData.canInvite?`<button class="small ${m.active===false?'':'quiet'}" data-member-action="${m.active===false?'activate':'deactivate'}" data-member-id="${m.id}">${m.active===false?'Reactivate':'Disable access'}</button>`:''}</div></div>`).join('')||'<p class="muted">No team members yet. Invite someone if you want to use team features.</p>';$('#invitePanel').classList.toggle('hidden',!teamData.canInvite);document.querySelectorAll('[data-member-action]').forEach(b=>b.onclick=async()=>{const action=b.dataset.memberAction;if(action==='deactivate'&&!confirm('Disable this teammate? Reassign all their contacts first; history will be kept.'))return;try{await api(`/api/team/${b.dataset.memberId}/${action}`,{method:'POST'});await load();notice(action==='activate'?'Team access restored.':'Team access disabled.')}catch(e){notice(e.message,true)}})}
async function loadIntegrationKeys(){const keys=await api('/api/integrations/keys');$('#integrationKeys').innerHTML=keys.map(k=>`<article class="integration-key-row"><div><strong>${esc(k.name)}</strong><small>${esc(k.tokenPrefix)}… · Created ${dateValue(k.createdAt)}${k.lastUsedAt?` · Last used ${dateValue(k.lastUsedAt)}`:''}${k.revokedAt?` · Revoked ${dateValue(k.revokedAt)}`:''}</small></div>${k.revokedAt?'<span class="badge">Revoked</span>':`<button class="small danger" data-integration-key-revoke="${k.id}">Revoke</button>`}</article>`).join('')||'<p class="muted">No integration keys. Create one only when you want another product to deliver leads here.</p>'}
function renderChatPeople(){
  const sel=$('#chatPeer');
  if(!sel)return;
  const old=sel.value;
  let options='<option value="ai">🤖 Nyra AI Site Concierge (Instant Help)</option>';
  if(currentUser?.role==='Owner'){
    options+=chatPeople.map(p=>`<option value="${p.id}">👤 ${esc(p.email)} · ${p.role==='Owner'?'Subscriber (Owner)':'Team Member'}</option>`).join('');
  }else{
    options+=chatPeople.map(p=>`<option value="${p.id}">${p.role==='Owner'?'🏠 Realtor Owner':'👤 Teammate'}: ${esc(p.email)}</option>`).join('');
  }
  sel.innerHTML=options;
  $('#chatBody').disabled=false;
  $('#chatForm').querySelector('button').disabled=false;
  if(old&&(old==='ai'||chatPeople.some(p=>String(p.id)===old)))sel.value=old;
  else sel.value='ai';
  loadMessages().catch(e=>notice(e.message,true));
}
async function loadMessages(){
  const peerVal=$('#chatPeer')?.value;
  if(!peerVal)return;
  if(peerVal==='ai'){
    if(!aiChatHistory.length){
      let welcome=`👋 Hello! I am **Nyra**, your AI Platform & CRM Concierge.\n\n`+
        `• **Private Valuation Tool:** Run home valuations privately for clients without creating inbound CRM leads.\n`+
        `• **Lead Privacy:** Origin leads are shielded so competitors cannot see source data.\n`+
        `• **Nyrava Team Meet:** Instant HD video meetings with zero install.`;
      if(currentUser?.role==='Owner'){
        welcome+=`\n\nAs the Realtor Account Owner, you can chat with me anytime or choose Nyrava Platform Support Admin (admin@nyrava.com) in the selector for direct live staff support.`;
      }else{
        welcome+=`\n\nAs an invited team member, if you encounter any account, territory, or billing issues, please contact your Realtor Account Owner. I can assist you with your day-to-day leads, tasks, and appointments!`;
      }
      aiChatHistory.push({sender:'Nyra AI',body:welcome,at:new Date(),suggestedActions:['How does Private Valuation work?','Tell me about ZIP coverage rules','How to schedule follow-up appointments']});
    }
    $('#chatMessages').innerHTML=aiChatHistory.map(m=>{
      const isMine=m.sender==='You';
      let chipsHtml='';
      if(m.suggestedActions&&m.suggestedActions.length){
        chipsHtml=`<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;">${m.suggestedActions.map(act=>`<button type="button" class="small quiet chip-action-btn" style="background:#eff6ff;border:1px solid #bfdbfe;color:#1e40af;cursor:pointer;border-radius:12px;padding:3px 8px;font-size:11px;">${esc(act)}</button>`).join('')}</div>`;
      }
      return `<article class="chat-message ${isMine?'mine':''}"><div>${esc(m.body).replace(/\n/g,'<br>')}</div>${chipsHtml}<small>${esc(m.sender)} · ${dateValue(m.at)}</small></article>`;
    }).join('');
    $('#chatMessages').querySelectorAll('.chip-action-btn').forEach(btn=>{
      btn.onclick=()=>{
        $('#chatBody').value=btn.textContent;
        $('#chatForm').requestSubmit();
      };
    });
    $('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;
    return;
  }
  const peer=Number(peerVal);
  if(!peer)return;
  const messages=await api(`/api/chat/${peer}`);
  const peerObj=chatPeople.find(p=>Number(p.id)===peer);
  $('#chatMessages').innerHTML=messages.map(m=>{
    const isMine=Number(m.senderUserId)===Number(currentUser.id);
    const senderLabel=isMine?'You':(peerObj?esc(peerObj.email):'Teammate');
    return `<article class="chat-message ${isMine?'mine':''}"><div>${esc(m.body)}</div><small>${senderLabel} · ${dateValue(m.createdAt)}</small></article>`;
  }).join('')||'<p class="muted">No messages yet. Start the conversation.</p>';
  $('#chatMessages').scrollTop=$('#chatMessages').scrollHeight;
}
function openChatWindow(peer=null){
  const panel=$('#chatView');
  panel.classList.remove('hidden','minimized');
  $('#chatMinimize').setAttribute('aria-expanded','true');
  if(peer&&$('#chatPeer'))$('#chatPeer').value=peer;
  if(chatTimer){clearInterval(chatTimer);chatTimer=null;}
  loadMessages().catch(e=>notice(e.message,true));
  if($('#chatPeer')?.value!=='ai'){
    chatTimer=setInterval(()=>loadMessages().catch(()=>{}),5000);
  }
}
function closeChatWindow(){
  const panel=$('#chatView');
  panel.classList.add('hidden');
  panel.classList.remove('minimized');
  $('#chatMinimize').setAttribute('aria-expanded','true');
  $('#chatMinimize').setAttribute('aria-label','Minimize chat');
  if(chatTimer){clearInterval(chatTimer);chatTimer=null}
}
function showView(name){if(name==='chat'){openChatWindow();return}if(name==='integrations'&&(currentUser?.role!=='Owner'||currentUser?.demoMode)){notice('Lead integrations are available to Subscriber accounts outside demo mode.',true);return}closeChatWindow();view=name;const titles={today:'Overview',contacts:'Leads & contacts',pipeline:'Pipeline',areaIntel:'Area Performance & Lead Intelligence',calendar:'Calendar & results',reminders:'Appointments & reminders',performance:'Performance',team:'My Team',integrations:'Lead integrations',archived:'Archived contacts',valuation:'Private Property Valuation',accounts:'Subscribers & Accounts'};$('#viewTitle').textContent=titles[name]||name;document.querySelectorAll('.view').forEach(x=>x.classList.add('hidden'));$(`#${name}View`).classList.remove('hidden');renderSidebar();render();if(name==='archived')loadArchived().catch(e=>notice(e.message,true));if(name==='integrations')loadIntegrationKeys().catch(e=>notice(e.message,true));if(name==='areaIntel')loadAreaIntelligence().catch(e=>notice(e.message,true));if(name==='accounts')loadAccounts().catch(e=>notice(e.message,true))}
async function loadAreaIntelligence(force=false){try{if(!intelData||force)intelData=await api('/api/admin/area-intelligence');if(!intelData)return;if($('#intelTotalLeads'))$('#intelTotalLeads').textContent=intelData.totalLeads;if($('#intelBankedLeads'))$('#intelBankedLeads').textContent=intelData.bankedLeads;if($('#intelDispatchedLeads'))$('#intelDispatchedLeads').textContent=intelData.dispatchedLeads;if($('#intelMonitoredZips'))$('#intelMonitoredZips').textContent=intelData.zipAnalytics.length;renderAreaIntelligence();}catch(e){console.error('Failed to load area intelligence:',e)}}
function renderAreaIntelligence(){if(!intelData)return;const q=($('#intelSearch')?.value||'').toLowerCase().trim(),yFilter=$('#intelYieldFilter')?.value||'',sFilter=$('#intelSourceFilter')?.value||'',pSize=Number($('#intelPageSize')?.value)||intelPageSize||10;intelPageSize=pSize;const filteredZips=intelData.zipAnalytics.filter(z=>{const leadsStr=(z.leads||[]).map(l=>[l.name,l.email,l.phone,l.company,l.notes,l.stage].join(' ')).join(' ').toLowerCase();const matchQ=!q||z.zip.toLowerCase().includes(q)||leadsStr.includes(q)||z.sources.join(' ').toLowerCase().includes(q);let matchY=true;if(yFilter==='top')matchY=(z.totalLeads>=3);else if(yFilter==='active')matchY=(z.totalLeads===2);else if(yFilter==='low')matchY=(z.totalLeads<=1);const matchS=!sFilter||z.sources.includes(sFilter);return matchQ&&matchY&&matchS;});const totalPages=Math.ceil(filteredZips.length/intelPageSize)||1;if(intelPage>totalPages)intelPage=totalPages;if(intelPage<1)intelPage=1;const startIdx=(intelPage-1)*intelPageSize,pageRows=filteredZips.slice(startIdx,startIdx+intelPageSize);if($('#intelZipCount'))$('#intelZipCount').textContent=`Showing ${filteredZips.length} of ${intelData.zipAnalytics.length} ZIP areas (Page ${intelPage} of ${totalPages})`;const topPag=$('#intelTopPagination');if(topPag){topPag.innerHTML=`<button id="intelTopPrev" class="compact-pag-btn" ${intelPage<=1?'disabled':''}>‹</button><span style="font-size:11px;font-weight:700;color:#64748b;">${intelPage}/${totalPages}</span><button id="intelTopNext" class="compact-pag-btn" ${intelPage>=totalPages?'disabled':''}>›</button>`;const tp=$('#intelTopPrev');if(tp)tp.onclick=()=>{if(intelPage>1){intelPage--;renderAreaIntelligence()}};const tn=$('#intelTopNext');if(tn)tn.onclick=()=>{if(intelPage<totalPages){intelPage++;renderAreaIntelligence()}};}const btmPag=$('#intelBottomPagination');if(btmPag){btmPag.innerHTML=`<button id="intelBtmPrev" class="button" style="padding:5px 12px;font-size:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;" ${intelPage<=1?'disabled':''}>‹ Prev</button><span style="font-size:12px;font-weight:700;color:#1e293b;">Page ${intelPage} of ${totalPages} (${filteredZips.length} ZIP codes)</span><button id="intelBtmNext" class="button" style="padding:5px 12px;font-size:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;" ${intelPage>=totalPages?'disabled':''}>Next ›</button>`;const bp=$('#intelBtmPrev');if(bp)bp.onclick=()=>{if(intelPage>1){intelPage--;renderAreaIntelligence()}};const bn=$('#intelBtmNext');if(bn)bn.onclick=()=>{if(intelPage<totalPages){intelPage++;renderAreaIntelligence()}};}const tableHtml=pageRows.length?`<table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;"><thead><tr style="text-align:left;border-bottom:2px solid #e2e8f0;background:#f8fafc;"><th style="padding:10px 12px;">Area ZIP</th><th style="padding:10px 12px;">Homeowner Leads in ZIP</th><th style="padding:10px 12px;">Total Ingested</th><th style="padding:10px 12px;">Master Bank</th><th style="padding:10px 12px;">Dispatched</th><th style="padding:10px 12px;">Active Pipeline</th><th style="padding:10px 12px;">Monthly Yield</th><th style="padding:10px 12px;">Origin Source</th></tr></thead><tbody>${pageRows.map(z=>{const ratingBadge=z.totalLeads>=3?'<span class="badge" style="background:#dcfce7;color:#166534;font-weight:600;">🔥 Top Producer</span>':z.totalLeads>=2?'<span class="badge" style="background:#e0f2fe;color:#0369a1;font-weight:600;">⚡ Active Yield</span>':'<span class="badge" style="background:#f1f5f9;color:#64748b;">❄️ Low Yield</span>';const leadsList=(z.leads||[]).map(l=>{const matchName=q&&l.name?.toLowerCase().includes(q);const style=matchName?'background:#fef08a;color:#854d0e;font-weight:700;':'background:#eff6ff;color:#1d4ed8;';return `<button type="button" class="badge text-link" data-open-contact="${l.id}" style="${style}border:1px solid #bfdbfe;border-radius:12px;padding:2px 8px;margin:2px;cursor:pointer;display:inline-block;text-align:left;font-size:11px;" title="Phone: ${esc(l.phone||'N/A')} · Stage: ${esc(l.stage)}">👤 <strong>${esc(l.name)}</strong>${l.phone?` <span style="font-size:10px;opacity:0.8;">(${esc(l.phone)})</span>`:''}</button>`;}).join(' ')||'<span class="muted" style="font-size:11px;">None</span>';return `<tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:10px 12px;white-space:nowrap;"><strong>📍 ${esc(z.zip)}</strong></td><td style="padding:10px 12px;max-width:280px;">${leadsList}</td><td style="padding:10px 12px;font-weight:700;">${z.totalLeads} leads</td><td style="padding:10px 12px;"><span style="color:#b91c1c;font-weight:600;">${z.totalLeads-(z.verifiedCount||0)}</span></td><td style="padding:10px 12px;"><span style="color:#15803d;font-weight:600;">${z.verifiedCount||(z.totalLeads>1?1:0)}</span></td><td style="padding:10px 12px;white-space:nowrap;">${z.newCount} New · ${z.contactedCount} In Progress</td><td style="padding:10px 12px;white-space:nowrap;">${ratingBadge}</td><td style="padding:10px 12px;color:#64748b;">${esc(z.sources.join(', '))} ${z.sampleSourceUrl?`<br><a href="${esc(z.sampleSourceUrl)}" target="_blank" style="font-size:11px;color:#2563eb;text-decoration:underline;">View Listing Portal</a>`:''}</td></tr>`;}).join('')}</tbody></table>`:`<div class="empty-state" style="padding:24px;text-align:center;"><p class="muted">No matching ZIP areas found for "${esc(q)}".</p></div>`;if($('#zipAnalyticsTable'))$('#zipAnalyticsTable').innerHTML=tableHtml;$('#zipAnalyticsTable').querySelectorAll('[data-open-contact]').forEach(b=>{b.onclick=()=>{selected=Number(b.dataset.openContact);showView('contacts');render();}});const sourcesHtml=intelData.sourceAnalytics.length?`<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;">${intelData.sourceAnalytics.map(s=>`<div class="card" style="flex:1;min-width:180px;background:#f8fafc;"><small style="color:#64748b;">Origin Channel</small><div style="font-size:16px;font-weight:700;color:#0f172a;margin-top:4px;">${esc(s.source)}</div><div style="font-size:13px;color:#475569;margin-top:2px;">${s.count} total leads delivered</div></div>`).join('')}</div>`:'<p class="muted">No sources identified yet.</p>';if($('#sourceAnalyticsTable'))$('#sourceAnalyticsTable').innerHTML=sourcesHtml;}
async function loadArchived(){const rows=await api('/api/contacts/archived');$('#archivedContacts').innerHTML=rows.map(c=>`<article class="activity"><div><strong>${esc(c.name)}</strong><div class="muted">${esc(c.email||'')} ${c.phone?'· '+esc(c.phone):''} · Archived ${dateValue(c.archivedAt)}</div><p>${esc(c.notes||'')}</p></div><button class="small" data-restore="${c.id}">Restore</button></article>`).join('')||'<p class="muted">No archived contacts.</p>';document.querySelectorAll('[data-restore]').forEach(b=>b.onclick=async()=>{try{await api(`/api/contacts/${b.dataset.restore}/restore`,{method:'POST'});await load();await loadArchived();notice('Contact restored.')}catch(e){notice(e.message,true)}})}
let calendarMode='month';function openActivity(kind,contactId,item=null,when=null){if(!contacts.length)return notice('Add a contact first.',true);const form=$('#activityForm');form.reset();form.elements.activityId.value=item?.id||'';form.elements.contactId.innerHTML=contacts.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');form.elements.kind.value=item?.kind||kind;form.elements.title.value=item?.title||'';form.elements.location.value=item?.location||'';form.elements.details.value=item?.details||'';form.elements.startsAt.value=item?localInput(new Date(item.startsAt)):localInput(when||new Date());if(item||contactId)form.elements.contactId.value=String(item?.contactId||contactId);$('#activityTitle').textContent=item?'Edit '+item.kind.toLowerCase():kind==='Appointment'?'Schedule appointment':kind==='Task'?'Add task':kind==='Note'?'Add note':'Add activity';$('#cancelActivity').classList.toggle('hidden',!(item&&item.kind==='Appointment'));$('#activityDialog').showModal()}
function openResult(id){const a=activities.find(x=>x.id===id);if(!a)return;const f=$('#resultForm');f.reset();f.elements.activityId.value=id;f.elements.result.value=a.result||'Held';f.elements.notes.value=a.details||'';let history=[];try{history=JSON.parse(a.resultHistory||'[]')}catch{}$('#resultHistory').innerHTML=history.length?'<h3>Previous results</h3>'+history.slice().reverse().map(x=>`<article><strong>${esc(x.result)}</strong><small>${dateValue(x.at)}</small>${x.notes?`<p>${esc(x.notes)}</p>`:''}</article>`).join(''):'';$('#resultDialog').showModal()}
$('#toggleAuth').onclick=()=>{register=!register;$('#authTitle').textContent=register?'Create your account':'Sign in';$('#authSubmit').textContent=register?'Create Subscriber account':'Sign in';$('#toggleAuth').textContent=register?'I already have an account':'Create account';$('#authPassword').autocomplete=register?'new-password':'current-password';$('#inviteLabel').classList.toggle('hidden',!register);$('#accountRoleHint').classList.toggle('hidden',!register);$('#demoAuthHint').classList.toggle('hidden',!register||!demoMode);$('#authError').textContent=''};
const pageParams=new URLSearchParams(location.search),joinCode=pageParams.get('invite');if(pageParams.get('signup')==='1'&&!joinCode)$('#toggleAuth').click();if(joinCode){register=true;$('#invitationCode').value=joinCode;$('#inviteLabel').classList.remove('hidden');$('#accountRoleHint').classList.remove('hidden');$('#accountRoleHint').textContent='This invite creates a Team Member account in the inviting Subscriber’s workspace.';$('#authTitle').textContent='Join your team';$('#authSubmit').textContent='Create team account';$('#toggleAuth').textContent='I already have an account';$('#authPassword').autocomplete='new-password'}
$('#authForm').onsubmit=async e=>{e.preventDefault();try{await api(register?'/api/register':'/api/login',{method:'POST',body:JSON.stringify({email:$('#authEmail').value,password:$('#authPassword').value,invitationCode:register?$('#invitationCode').value.trim():null})});await init()}catch(err){$('#authError').textContent=err.message}};
$('#logout').onclick=async()=>{const button=$('#logout');button.disabled=true;try{await api('/api/logout',{method:'POST'});currentUser=null;location.replace('/')}catch(e){button.disabled=false;notice(`Sign out failed: ${e.message}`,true)}};$('#refresh').onclick=async()=>{const btn=$('#refresh');const prev=btn.textContent;btn.disabled=true;btn.textContent='Updating...';try{await load();notice('Workspace refreshed with latest live data.');}catch(e){notice(e.message,true)}finally{btn.disabled=false;btn.textContent=prev}};$('#refreshReminders').onclick=()=>load().then(()=>notice('Reminders & agenda updated.')).catch(e=>notice(e.message,true));$('#search').oninput=()=>{contactsPage=1;render()};$('#typeFilter').onchange=()=>{contactsPage=1;render()};$('#stageFilter').onchange=()=>{contactsPage=1;render()};if($('#bankFilter'))$('#bankFilter').onchange=()=>{contactsPage=1;render()};if($('#intelSearch'))$('#intelSearch').oninput=()=>{intelPage=1;renderAreaIntelligence()};if($('#intelYieldFilter'))$('#intelYieldFilter').onchange=()=>{intelPage=1;renderAreaIntelligence()};if($('#intelSourceFilter'))$('#intelSourceFilter').onchange=()=>{intelPage=1;renderAreaIntelligence()};if($('#intelPageSize'))$('#intelPageSize').onchange=()=>{intelPage=1;renderAreaIntelligence()};if($('#refreshAreaIntel'))$('#refreshAreaIntel').onclick=async()=>{const btn=$('#refreshAreaIntel');btn.disabled=true;btn.textContent='Updating...';try{await loadAreaIntelligence(true);notice('Area performance & intelligence updated.');}catch(e){notice(e.message,true)}finally{btn.disabled=false;btn.textContent='Refresh Intelligence'}};$('#pipelineType').onchange=render;$('#agendaDate').onchange=renderCalendar;$('#calendarFilter').onchange=renderCalendar;$('#calendarResultFilter').onchange=renderCalendar;$('#calendarContactSearch').oninput=()=>{calendarContactsPage=1;renderCalendar()};$('#agendaDate').value=localDay(new Date());document.querySelectorAll('[data-calendar-view]').forEach(b=>b.onclick=()=>{calendarMode=b.dataset.calendarView;renderCalendar()});$('#stageFilter').innerHTML='<option value="">All stages</option>'+stages.map(s=>`<option>${s}</option>`).join('');$('#calendarToday').onclick=()=>{$('#agendaDate').value=localDay(new Date());renderCalendar()};$('#calendarPrev').onclick=()=>moveCalendar(-1);$('#calendarNext').onclick=()=>moveCalendar(1);
function moveCalendar(step){const d=new Date(`${$('#agendaDate').value||localDay(new Date())}T12:00:00`),mode=calendarMode;if(mode==='month'||mode==='agenda'){const day=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+step);d.setDate(Math.min(day,new Date(d.getFullYear(),d.getMonth()+1,0).getDate()))}else d.setDate(d.getDate()+step*(mode==='week'?7:1));$('#agendaDate').value=localDay(d);renderCalendar()}
function openNyraMeet(){const isLocal=location.hostname==='localhost'||location.hostname==='127.0.0.1';const meetUrl=isLocal?'http://localhost:5000':`${location.protocol}//meet.${location.hostname.replace('crm.','')}`;window.open(meetUrl,'_blank');}const chatSupportBtn=$('#chatSupportBtn');if(chatSupportBtn)chatSupportBtn.onclick=openAiSupportChat;
const startMeetBtn=$('#startMeetBtn');if(startMeetBtn)startMeetBtn.onclick=openNyraMeet;const teamMeetBtn=$('#teamMeetBtn');if(teamMeetBtn)teamMeetBtn.onclick=openNyraMeet;$('#chatClose').onclick=closeChatWindow;$('#chatMinimize').onclick=()=>{const minimized=$('#chatView').classList.toggle('minimized');$('#chatMinimize').setAttribute('aria-expanded',String(!minimized));$('#chatMinimize').setAttribute('aria-label',minimized?'Expand chat':'Minimize chat')};$('#chatTeamLink').onclick=()=>showView('team');
$('#inviteForm').onsubmit=async e=>{e.preventDefault();const email=new FormData(e.target).get('email');try{const result=await api('/api/team/invitations',{method:'POST',body:JSON.stringify({email})});$('#inviteResult').classList.remove('hidden');if(demoMode){$('#inviteResult').innerHTML=`<strong>Demo invitation for ${esc(email)}</strong><input readonly value="${esc(result.code)}"><p>Enter 1234 on the demo account-creation screen to join Test One’s workspace. This demo code is reusable only in the local demo profile. <a href="${esc(location.origin+result.joinUrl)}">Open demo invite</a></p>`}else{$('#inviteResult').innerHTML=`<strong>Email invitation sent</strong><p>An invitation link was sent to ${esc(result.email)}. It expires ${dateValue(result.expiresAt)} and grants access only to this Subscriber’s workspace.</p>`}}catch(err){notice(err.message,true)}};
$('#integrationKeyForm').onsubmit=async e=>{e.preventDefault();const name=new FormData(e.target).get('name');try{const key=await api('/api/integrations/keys',{method:'POST',body:JSON.stringify({name})});$('#integrationKeyOnce').innerHTML=`<strong>Copy this key now. It will not be shown again.</strong><label>Secret key<textarea id="newIntegrationToken" readonly></textarea></label><button id="copyIntegrationKey" type="button">Copy key</button><button id="dismissIntegrationKey" class="quiet" type="button">Dismiss</button>`;$('#newIntegrationToken').value=key.token;$('#integrationKeyOnce').classList.remove('hidden');$('#copyIntegrationKey').onclick=async()=>{await navigator.clipboard.writeText(key.token);notice('Integration key copied. Keep it private.')};$('#dismissIntegrationKey').onclick=()=>{$('#newIntegrationToken').value='';$('#integrationKeyOnce').classList.add('hidden')};e.target.reset();await loadIntegrationKeys();notice('Integration key created. Copy the secret before dismissing it.')}catch(err){notice(err.message,true)}};$('#refreshIntegrationKeys').onclick=()=>loadIntegrationKeys().catch(e=>notice(e.message,true));$('#integrationKeys').onclick=async e=>{const b=e.target.closest('[data-integration-key-revoke]');if(!b)return;if(!confirm('Revoke this integration key? The connected product will stop delivering leads.'))return;try{await api(`/api/integrations/keys/${b.dataset.integrationKeyRevoke}`,{method:'DELETE'});await loadIntegrationKeys();notice('Integration key revoked.')}catch(err){notice(err.message,true)}};$('#chatPeer').onchange=()=>{
  if(chatTimer){clearInterval(chatTimer);chatTimer=null;}
  if($('#chatPeer').value!=='ai'){chatTimer=setInterval(()=>loadMessages().catch(()=>{}),5000);}
  loadMessages().catch(e=>notice(e.message,true));
};
$('#chatForm').onsubmit=async e=>{
  e.preventDefault();
  const peerVal=$('#chatPeer').value;
  const body=$('#chatBody').value.trim();
  if(!body)return;
  if(peerVal==='ai'){
    $('#chatBody').value='';
    aiChatHistory.push({sender:'You',body:body,at:new Date()});
    await loadMessages();
    try{
      const res=await api('/api/support/ai-assistant',{method:'POST',body:JSON.stringify({query:body})});
      aiChatHistory.push({sender:'Nyra AI',body:res.answer,suggestedActions:res.suggestedActions||[],at:new Date()});
    }catch(err){
      aiChatHistory.push({sender:'Nyra AI',body:`Error reaching Nyra AI: ${err.message}`,at:new Date()});
    }
    await loadMessages();
    return;
  }
  const peer=Number(peerVal);
  try{
    await api(`/api/chat/${peer}`,{method:'POST',body:JSON.stringify({body})});
    $('#chatBody').value='';
    await loadMessages();
  }catch(err){notice(err.message,true)}
};
document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>showView(b.dataset.view));document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>showView(b.dataset.go));document.querySelectorAll('[data-add-kind]').forEach(b=>b.onclick=()=>openActivity(b.dataset.addKind));$('#addContact').onclick=()=>$('#contactDialog').showModal();$('#contactForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));try{const c=await api('/api/contacts',{method:'POST',body:JSON.stringify(f)});e.target.reset();$('#contactDialog').close();selected=c.id;notice('Contact added.');await load()}catch(err){notice(err.message,true)}};
$('#activityForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target)),id=Number(f.activityId);delete f.activityId;f.contactId=Number(f.contactId);f.startsAt=new Date(f.startsAt).toISOString();f.timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';try{await api(id?`/api/activities/${id}`:'/api/activities',{method:id?'PUT':'POST',body:JSON.stringify(f)});e.target.reset();$('#activityDialog').close();notice(f.kind==='Appointment'?'Appointment saved.':'Item saved.');await load()}catch(err){notice(err.message,true)}};$('#cancelActivity').onclick=async()=>{const id=Number($('#activityForm').elements.activityId.value);if(!id||!confirm('Cancel this appointment?'))return;try{await api(`/api/activities/${id}/result`,{method:'POST',body:JSON.stringify({result:'Canceled',notes:'Canceled from calendar'})});$('#activityDialog').close();await load()}catch(e){notice(e.message,true)}};document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>b.closest('dialog').close());init();
$('#resultForm').onsubmit=async e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target)),id=Number(f.activityId);try{await api(`/api/activities/${id}/result`,{method:'POST',body:JSON.stringify({result:f.result,notes:f.notes})});$('#resultDialog').close();notice('Appointment result saved.');await load()}catch(err){notice(err.message,true)}};


let accountsData=null;
async function loadAccounts(force=false){
  try{
    if(!accountsData||force) accountsData=await api('/api/admin/accounts');
    if(!accountsData) return;
    const total=accountsData.length;
    const realtors=accountsData.filter(a=>a.isOwner&&!a.isAdmin).length;
    const team=accountsData.filter(a=>!a.isOwner&&!a.isAdmin).length;
    const admins=accountsData.filter(a=>a.isAdmin).length;
    if($('#accTotalCount')) $('#accTotalCount').textContent=total;
    if($('#accRealtorCount')) $('#accRealtorCount').textContent=realtors;
    if($('#accTeamCount')) $('#accTeamCount').textContent=team;
    if($('#accAdminCount')) $('#accAdminCount').textContent=admins;
    const tbody=$('#accountsTableBody');
    if(!tbody) return;
    tbody.innerHTML=accountsData.map(a=>{
      let badge='';
      if(a.isAdmin) badge=`<span class="badge" style="background:#fef3c7;color:#92400e;font-weight:600;">👑 Platform Admin</span>`;
      else if(a.isOwner) badge=`<span class="badge" style="background:#dbeafe;color:#1e40af;font-weight:600;">🏠 Realtor Owner</span>`;
      else badge=`<span class="badge" style="background:#f1f5f9;color:#475569;font-weight:600;">👥 Team Member</span>`;
      const zips=a.subscribedZipCodes?a.subscribedZipCodes.split(',').map(z=>`<span class="badge" style="background:#f8fafc;border:1px solid #cbd5e1;font-size:10px;margin-right:3px;">📍 ${esc(z.trim())}</span>`).join(''):'<span class="muted">—</span>';
      const supportBtn=!a.isAdmin?`<button class="quiet small" data-chat-user="${a.id}" data-chat-email="${esc(a.email)}" style="font-size:11px;padding:4px 8px;">💬 Chat Support</button>`:'<span class="muted" style="font-size:11px;">Master</span>';
      return `<tr style="border-bottom:1px solid #f1f5f9;">
        <td style="padding:12px 16px;"><strong>${esc(a.email)}</strong>${a.ownerEmail?`<div class="muted" style="font-size:11px;margin-top:2px;">Realtor Workspace: ${esc(a.ownerEmail)}</div>`:''}</td>
        <td style="padding:12px 16px;">${badge}</td>
        <td style="padding:12px 16px;"><div>${esc(a.subscriptionPlan)}</div><span class="badge" style="background:#ecfdf5;color:#065f46;font-size:10px;margin-top:2px;">${esc(a.subscriptionStatus)}</span></td>
        <td style="padding:12px 16px;">${zips}</td>
        <td style="padding:12px 16px;color:#64748b;font-size:12px;">${dateValue(a.joinedAt)}</td>
        <td style="padding:12px 16px;text-align:right;">${supportBtn}</td>
      </tr>`;
    }).join('');
    const refreshBtn=$('#refreshAccountsBtn');
    if(refreshBtn) refreshBtn.onclick=()=>loadAccounts(true);
    tbody.querySelectorAll('[data-chat-user]').forEach(btn=>{
      btn.onclick=()=>{
        activeChatPeer=Number(btn.dataset.chatUser);
        activeChatPeerName=btn.dataset.chatEmail;
        openChatWindow();
        loadChatMessages();
      };
    });
  }catch(err){
    console.error('Failed to load accounts',err);
    notice(err.message,true);
  }
}
