(()=>{'use strict';
const $=id=>document.getElementById(id);let saved=null,employee=false,admin=false,busy=false,loadFailed=false,dirty=false,saveTimer=null,savedPayload=null,saveChain=Promise.resolve();
const definitions=[['phoneNumber','Phone / SMS number (include country code)'],['businessAddress','Agency address'],['businessCity','City'],['businessState','State'],['businessZipCode','Business ZIP'],['licenseNumber','License number (self-reported)'],['licenseState','License state'],['website','Website'],['facebookUrl','Facebook URL'],['instagramUrl','Instagram URL'],['linkedInUrl','LinkedIn URL'],['biography','Biography']];
const agencyKeys=['businessAddress','businessCity','businessState','businessZipCode'];
function status(text,error=false){$('notice').style.display='block';$('notice').className='status'+(error?' error':'');$('notice').textContent=text;}
async function request(url,options={}){const response=await fetch(url,{credentials:'same-origin',cache:'no-store',...options,headers:{Accept:'application/json',...(options.body&&!(options.body instanceof FormData)?{'Content-Type':'application/json'}:{}),...options.headers}});const data=await response.json().catch(()=>({}));if(!response.ok)throw Error(data.error||data.detail||'Request failed ('+response.status+').');if(url.startsWith('/api/subscriber/profile')&&(!data||typeof data.email!=='string'||!Object.hasOwn(data,'fullName')))throw Error('Server did not confirm your profile. Your form has been kept.');return data;}
function fields(){for(const [key,label] of definitions){if(employee&&agencyKeys.includes(key))continue;const cell=document.createElement('div'),caption=document.createElement('label'),input=document.createElement(key==='biography'?'textarea':'input');input.id='detail-'+key;input.dataset.profileDetail=key;input.maxLength=key==='biography'?2000:300;caption.htmlFor=input.id;caption.textContent=label;if(key==='phoneNumber')input.type='tel';if(key==='website'||key.endsWith('Url'))input.type='url';cell.append(caption,input);$('profileFields').append(cell);}}
function agencyView(agencies){$('agencyDetails').replaceChildren();for(const a of agencies){const box=document.createElement('div'),name=document.createElement('strong'),text=document.createElement('p');box.className='agency';name.textContent=a.name||a.realtorName||'Agency';text.textContent=[a.realtorName,[a.businessAddress,a.businessCity,a.businessState,a.businessZipCode].filter(Boolean).join(', '),a.website,a.phoneNumber].filter(Boolean).join('\n');box.append(name,text);$('agencyDetails').append(box);}if(!agencies.length)$('agencyDetails').textContent=employee?'No active agency membership. Contact your Realtor.':'Add your agency details above.';}
function bannerView(u){
 $('bannerControls').hidden=employee;const agencies=u.agencies||[],previous=$('bannerAgency').value;
 $('bannerChoice').hidden=!employee||agencies.length<2;$('bannerAgency').replaceChildren();
 for(const a of agencies){const option=document.createElement('option');option.value=a.staffId;option.textContent=a.name||a.realtorName||'Agency';$('bannerAgency').append(option);}
 if(agencies.some(a=>a.staffId===previous))$('bannerAgency').value=previous;
 const selected=agencies.find(a=>a.staffId===$('bannerAgency').value)||agencies[0];
 $('profileCover').hidden=employee&&!selected;$('bannerAgencyName').textContent=employee?(selected?.name||selected?.realtorName||'Agency'):(u.brokerage||'Your agency');
 const img=$('bannerImage');img.hidden=true;img.onload=()=>{img.hidden=false;};img.onerror=()=>{img.hidden=true;};
 if(employee&&selected)img.src='/api/subscriber/profile/banner?staffId='+encodeURIComponent(selected.staffId)+'&v='+Date.now();
 else if(!employee){if(u.bannerUrl)img.src=u.bannerUrl+'?v='+Date.now();else img.removeAttribute('src');}
}
$('bannerAgency').onchange=()=>{if(saved)bannerView(saved);};
function mediaView(u){bannerView(u);$('avatar').replaceChildren();if(u.profilePhotoUrl){const img=document.createElement('img');img.alt='Profile photo';img.src=u.profilePhotoUrl+'?v='+Date.now();img.style.cssText='width:104px;height:104px;object-fit:cover;border-radius:50%';$('avatar').append(img);}else $('avatar').textContent=(u.fullName||u.email||'?').slice(0,1).toUpperCase();
}
function draw(u){dirty=false;saved=u;mediaView(u);$('name').value=u.fullName||'';$('email').value=u.email||'';$('brokerage').value=u.brokerage||'';$('role').value=u.details?.professionalTitle||(admin?'Website administrator':employee?'Team employee':'Realtor');$('displayName').textContent=u.fullName||u.email;$('displayEmail').textContent=u.email;$('accountRole').textContent=$('role').value;$('badge').textContent=admin?'Website administrator':employee?'Team employee':(u.planCode||'Realtor')+' · '+(u.subscriptionStatus||'');$('brokerage').readOnly=employee;$('brokerage').required=!employee&&!admin;
for(const [key] of definitions){const input=$('detail-'+key);if(input)input.value=u.details?.[key]||'';}
$('workEmail').value=u.communications?.workEmail??u.email??'';$('signature').value=u.communications?.signature||'';
$('subscription').hidden=employee;$('subscriptionSummary').textContent=(u.deliveredToday??0)+' delivered today · '+(u.delivered30Days??0)+' in the past 30 days';$('zips').replaceChildren();for(const zip of u.activeZips||[]){const el=document.createElement('span');el.className='zip';el.textContent=zip;$('zips').append(el);}
agencyView(employee?(u.agencies||[]):[{name:u.brokerage,realtorName:u.fullName,...u.details}]);
  savedPayload=profilePayload();
  if(window.parent && window.parent !== window) {
    setTimeout(() => {
      window.parent.postMessage({ type: 'nyrava-embedded-size', section: 'profile', height: document.documentElement.scrollHeight }, '*');
    }, 150);
  }
}
function profilePayload(){const details={};for(const input of document.querySelectorAll('[data-profile-detail]'))details[input.dataset.profileDetail]=input.value.trim();details.professionalTitle=$('role').value.trim();return{fullName:$('name').value.trim(),...(!employee?{brokerage:$('brokerage').value.trim()}:{}),details,communications:{workEmail:$('workEmail').value.trim(),signature:$('signature').value.trim()}};}
function patchPayload(next,previous){const patch={};for(const k of ['fullName','brokerage'])if(k in next&&next[k]!==previous?.[k])patch[k]=next[k];for(const group of ['details','communications']){const changes={};for(const [k,v]of Object.entries(next[group]))if(v!==previous?.[group]?.[k])changes[k]=v;if(Object.keys(changes).length)patch[group]=changes;}return patch;}
function persistDraft(){clearTimeout(saveTimer);const snapshot=profilePayload();const task=saveChain.catch(()=>{}).then(async()=>{const patch=patchPayload(snapshot,savedPayload);if(!Object.keys(patch).length)return saved;status('Saving profile…');const result=await request('/api/subscriber/profile',{method:'PUT',body:JSON.stringify(patch)});for(const [k,v]of Object.entries(patch)){if(v&&typeof v==='object'){if(!Object.entries(v).every(([key,value])=>result[k]?.[key]===value))throw Error('Server did not confirm your saved changes. Your form has been kept.');}else if(result[k]!==v)throw Error('Server did not confirm your saved changes. Your form has been kept.');}saved=result;savedPayload=snapshot;dirty=JSON.stringify(profilePayload())!==JSON.stringify(savedPayload);$('displayName').textContent=result.fullName||result.email;status(dirty?'Saved. New edits are waiting to save.':'Profile saved.');return result;});saveChain=task;return task;}
function scheduleSave(){if(!saved||loadFailed)return;dirty=true;clearTimeout(saveTimer);saveTimer=setTimeout(()=>{if(busy){scheduleSave();return;}persistDraft().catch(e=>status('Save failed: '+e.message,true));},900);}
$('profileForm').addEventListener('input',scheduleSave);$('profileForm').addEventListener('change',scheduleSave);window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
$('profileForm').onsubmit=async event=>{event.preventDefault();if(busy||!saved||loadFailed)return;busy=true;$('save').disabled=true;try{await persistDraft();status(dirty?'Saved. New edits will save shortly.':'Profile saved successfully.');}catch(e){status('Save failed: '+e.message,true);}finally{busy=false;$('save').disabled=false;if(dirty)scheduleSave();}};
$('cancel').onclick=async()=>{if(busy||loadFailed)return;clearTimeout(saveTimer);try{await saveChain.catch(()=>{});draw(await request('/api/subscriber/profile'));status('Saved profile loaded.');}catch(e){status(e.message,true);}};
$('logout').onclick=async()=>{try{await request('/api/auth/logout',{method:'POST'});try{localStorage.removeItem('hsi_token');localStorage.removeItem('hsi_user');sessionStorage.removeItem('hsi_token');sessionStorage.removeItem('hsi_user');}catch(_){}window.top.location.replace('/');}catch(e){status(e.message,true);}};
async function upload(kind,inputId){if(busy||loadFailed||!saved)return;const file=$(inputId).files[0];if(!file)return status('Choose an image first.',true);if(file.size>2097152)return status('Choose an image up to 2 MB.',true);const form=new FormData();form.append('image',file);busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await persistDraft();const result=await request('/api/subscriber/profile/'+kind,{method:'POST',body:form});saved=result;mediaView(result);$(inputId).value='';dirty=JSON.stringify(profilePayload())!==JSON.stringify(savedPayload);status((kind==='photo'?'Profile photo':'Banner')+' saved.');}catch(e){status(e.message,true);}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);if(dirty)scheduleSave();}}
async function removeImage(kind){if(busy||loadFailed||!saved)return;busy=true;try{await persistDraft();const result=await request('/api/subscriber/profile/'+kind,{method:'DELETE'});saved=result;mediaView(result);status((kind==='photo'?'Profile photo':'Banner')+' removed.');}catch(e){status(e.message,true);}finally{busy=false;if(dirty)scheduleSave();}}
$('uploadBanner').onclick=()=>upload('banner','bannerUpload');$('removeBanner').onclick=()=>removeImage('banner');$('uploadPhoto').onclick=()=>upload('photo','photoUpload');
const removePhoto=document.createElement('button');removePhoto.type='button';removePhoto.className='outline';removePhoto.textContent='Remove photo';removePhoto.onclick=()=>removeImage('photo');$('uploadPhoto').after(removePhoto);
(async()=>{try{const me=await request('/api/auth/me');if(!['RealtorSubscriber','Owner','Admin','BusinessEmployee','Employee'].includes(me.role))throw Error('Sign in as a Realtor or team employee.');employee=['BusinessEmployee','Employee'].includes(me.role);admin=['Admin','SuperAdmin'].includes(me.role);$('workspaceLink').href=admin?'/admin.html':employee?'/employee.html':'/dashboard/home';if(admin){$('workspaceLink').textContent='← Back to Admin';document.querySelector('.brand').textContent='NYRAVA HOME · ADMIN PROFILE';$('menu').replaceChildren();for(const [name,url]of [['Admin dashboard','/admin.html'],['Subscribers','/admin.html#subscribers'],['My profile','/subscriber-profile.html'],['Sales Partner Center','/sales-partners']]){const a=document.createElement('a');a.className='menu-link';a.textContent=name;a.href=url;$('menu').append(a);}}fields();draw(await request('/api/subscriber/profile'));$('content').hidden=false;
if (window.parent !== window) {
  const sendProfileHeight = () => {
    window.parent.postMessage({
      type: 'nyrava-embedded-size',
      section: 'profile',
      height: Math.max(
        document.body.scrollHeight,
        document.documentElement.scrollHeight
      )
    }, location.origin);
  };
  requestAnimationFrame(sendProfileHeight);
  window.addEventListener('load', sendProfileHeight);
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(sendProfileHeight);
    observer.observe(document.querySelector('main'));
  }
}}catch(e){loadFailed=true;status(e.message,true);$('signin').style.display='block';}})();
if(new URLSearchParams(location.search).get('onboarding')==='1'){
 const box=document.createElement('section'),title=document.createElement('h2'),text=document.createElement('p'),button=document.createElement('button');
 title.textContent='Complete your profile and start';text.textContent='Save your name and brokerage above, then continue to your workspace.';button.textContent='Finish setup and open workspace';button.type='button';
 button.onclick=async()=>{button.disabled=true;try{const session=await request('/api/billing/session');await request('/api/billing/account/profile-complete',{method:'POST',headers:{'X-Nyrava-Stripe':'settings','X-Nyrava-CSRF':session.csrf},body:'{}'});location.assign('/dashboard/home');}catch(e){status(e.message,true);}finally{button.disabled=false;}};
 const billingLink=document.createElement('a');billingLink.href='/billing-checkout.html?manage=1';billingLink.textContent='Manage subscription';box.append(title,text,button,billingLink);document.querySelector('main').append(box);
}
})();
