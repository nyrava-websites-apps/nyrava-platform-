'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(s){document.querySelector('#message').textContent=s}
async function api(url,options={}){const r=await fetch(url,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers}});if(r.status===401)throw Error('Please sign in at the home page, then return here.');if(r.status===403)throw Error('Access unavailable. Check your membership, subscription and lead assignment.');const j=await r.json().catch(()=>({}));if(!r.ok)throw Error(j.error||j.detail||j.message||j.title||'Request failed ('+r.status+')');return j}
const post=(url,body)=>api(url,{method:'POST',body:JSON.stringify(body)});
async function run(fn){try{await fn()}catch(e){message(e.message)}}
