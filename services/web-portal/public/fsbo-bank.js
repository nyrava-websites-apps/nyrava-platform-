'use strict';
(() => {
const $=id=>document.getElementById(id),mode=document.body.dataset.bank;
let records=[],page=1,loading=false;
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
function contacts(p){
 let evidence={};try{evidence=JSON.parse(p.contactEvidenceJson||'{}')}catch{}
 const out=[],seen=new Set();
 const add=(name,email,phone)=>{email=typeof email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:'';phone=typeof phone==='string'&&phone.replace(/\D/g,'').length>=10?phone:'';if(!email&&!phone)return;const key=(email+'|'+phone).toLowerCase();if(seen.has(key))return;seen.add(key);out.push({name:name||'',email,phone})};
 for(const c of evidence.publishedContacts||[])add(c.name,c.email,c.phone);
 add(p.ownerName,p.observedEmail,p.observedPhone);
 for(const c of evidence.evidence||[])if(c.kind==='EMAIL')add('',c.value,'');else if(c.kind==='PHONE')add('','',c.value);
 return out;
}
const hasContact=p=>contacts(p).length>0;
function matching(){
 const query=$('search').value.trim().toLowerCase(),zip=$('zip').value.trim(),source=$('source').value;
 return records.filter(p=>(mode==='contact'?hasContact(p):!hasContact(p))&&(!zip||String(p.zipCode||'').startsWith(zip))&&(!source||String(p.sourceUrl||'').includes(source))&&(!query||[p.title,p.address,p.zipCode,p.ownerName,p.observedEmail,p.observedPhone,p.description,p.reviewNote,...contacts(p).flatMap(c=>[c.name,c.email,c.phone])].join(' ').toLowerCase().includes(query))).sort((a,b)=>($('sort').value==='oldest'?1:-1)*(Date.parse(a.firstSeenAt)-Date.parse(b.firstSeenAt)));
}
function render(){
 const matches=matching(),size=Number($('size').value),pages=Math.max(1,Math.ceil(matches.length/size));page=Math.min(Math.max(page,1),pages);
 $('contactCount').textContent=records.filter(hasContact).length;
 $('reserveCount').textContent=records.filter(p=>!hasContact(p)).length;
 $('rows').replaceChildren();
 for(const p of matches.slice((page-1)*size,page*size)){
  const row=el('tr'),property=el('td');property.append(el('strong',p.title||p.address||'Property'),el('div',p.address||'','muted'));row.append(property,el('td',p.zipCode||'—'));
  const cell=el('td');for(const c of contacts(p)){const block=el('div',undefined,'contact');if(c.name)block.append(el('strong',c.name));if(c.email)block.append(el('div',c.email));if(c.phone)block.append(el('div',c.phone));cell.append(block)}
  if(!cell.childNodes.length)cell.append(el('span','Awaiting published contact','muted'));row.append(cell);
  row.append(el('td',p.status==='DISMISSED'?'Dismissed':hasContact(p)?'Contact available':'Missing contact'));
  row.append(el('td',p.firstSeenAt?new Date(p.firstSeenAt).toLocaleDateString():'—'));
  const action=el('td'),button=el('button','Details');button.type='button';button.setAttribute('aria-expanded','false');action.append(button);row.append(action);
  const detailRow=el('tr');detailRow.hidden=true;const detailCell=el('td');detailCell.colSpan=6;
  detailCell.append(el('h3',p.title||p.address||'Property'),el('p','Published contact details are unverified. This record has not been delivered to subscribers.','muted'));
  const desc=el('details'),summary=el('summary','Property description');desc.append(summary,el('p',p.description||'No description published.'));detailCell.append(desc);
  try{const url=new URL(p.sourceUrl);if(url.protocol==='https:'&&['www.zillow.com','forsalebyowner.com','www.forsalebyowner.com'].includes(url.hostname)){const link=el('a','Open source listing ↗');link.href=url.href;link.target='_blank';link.rel='noopener noreferrer';detailCell.append(link)}}catch{}
  const evidence=el('details');evidence.append(el('summary','Published evidence'));try{const data=JSON.parse(p.contactEvidenceJson||'{}');for(const item of data.evidence||[])evidence.append(el('p',[item.kind,item.value,item.excerpt].filter(Boolean).join(' · ')))}catch{}detailCell.append(evidence);
  const form=el('form'),label=el('label','Admin review note'),input=el('textarea');input.maxLength=1000;input.required=true;input.value=p.reviewNote||'';label.append(input);
  const select=el('select');select.setAttribute('aria-label','Review status');for(const [value,text] of [['REVIEW_CONTACT_AND_PERMISSION','Keep in review'],['DISMISSED','Dismiss']]){const o=el('option',text);o.value=value;select.append(o)}select.value=p.status==='DISMISSED'?p.status:'REVIEW_CONTACT_AND_PERMISSION';
  const save=el('button','Save review');save.type='submit';form.append(label,select,save);form.onsubmit=async event=>{event.preventDefault();save.disabled=true;try{const r=await fetch('/api/admin/fsbo/prospects/'+p.id,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Nyrava-Fsbo':'1'},body:JSON.stringify({status:select.value,note:input.value})});if(!r.ok)throw Error('Review could not be saved.');p.status=select.value;p.reviewNote=input.value;$('notice').textContent='Review saved; no delivery initiated.'}catch(e){$('notice').textContent=e.message}finally{save.disabled=false}};
  detailCell.append(form);detailRow.append(detailCell);button.onclick=()=>{detailRow.hidden=!detailRow.hidden;button.setAttribute('aria-expanded',String(!detailRow.hidden));button.textContent=detailRow.hidden?'Details':'Close'};
  $('rows').append(row,detailRow);
 }
 $('empty').hidden=matches.length>0;$('page').textContent='Page '+page+' of '+pages+' · '+matches.length+' matching records';$('prev').disabled=page<=1;$('next').disabled=page>=pages;
}
async function load(){
 if(loading)return;loading=true;$('refresh').disabled=true;$('notice').textContent='Loading admin inventory…';const collected=[],ids=new Set();let target=1,requested=1;
 try{
  while(collected.length<target){
   const r=await fetch('/api/admin/fsbo/?page='+requested,{credentials:'same-origin',headers:{'Accept':'application/json'}});
   if(!r.ok)throw Error(r.status===403?'Administrator sign-in required.':'Inventory could not be loaded.');
   const d=await r.json();target=d.total;
   if(!Number.isSafeInteger(target)||target<0)throw Error('Unexpected inventory response.');
   if(!(d.prospects||[]).length)break;
   const before=collected.length;for(const p of d.prospects)if(!ids.has(p.id)){ids.add(p.id);collected.push(p)}
   if(collected.length===before)throw Error('Inventory pagination repeated records. Refresh to try again.');
   if(requested>=10000)throw Error('Inventory exceeds this view’s supported size.');
   requested++;
  }
  records=collected;render();$('notice').textContent=collected.length<target?'Inventory changed while loading. Refresh for the latest records.':'Loaded '+records.length+' records. Search and page counts apply to this bank only.';
 }catch(e){$('notice').textContent=e.message}finally{loading=false;$('refresh').disabled=false}
}
for(const id of ['search','zip','source','size','sort'])$(id).addEventListener(id==='search'||id==='zip'?'input':'change',()=>{page=1;render()});
$('prev').onclick=()=>{page--;render()};$('next').onclick=()=>{page++;render()};$('refresh').onclick=load;
$('search').value=new URL(location.href).searchParams.get('search')||'';window.NyravaBank={contacts,hasContact};load();
})();
