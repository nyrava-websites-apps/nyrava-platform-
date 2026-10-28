/* NYRAVA CRM COMPACT GRID V1 - uses existing CRM handlers; no API changes. */
(()=>{'use strict';
 const detail=document.getElementById('detail'), editor=document.getElementById('editor');
 if(!detail||!editor||document.getElementById('crm-grid-backdrop'))return;
 const backdrop=document.createElement('div');backdrop.id='crm-grid-backdrop';backdrop.setAttribute('aria-hidden','true');document.body.appendChild(backdrop);
 let focused=null;
 const sync=()=>{const open=!!detail.querySelector('.detail-header');const was=document.body.classList.contains('crm-detail-open');document.body.classList.toggle('crm-detail-open',open);if(open&&!was){focused=document.activeElement;detail.setAttribute('role','dialog');detail.setAttribute('aria-modal','true');detail.setAttribute('aria-label','Client details');detail.querySelector('[data-close-contact]')?.focus({preventScroll:true});}if(!open&&was){detail.removeAttribute('role');detail.removeAttribute('aria-modal');detail.removeAttribute('aria-label');if(focused?.isConnected)focused.focus({preventScroll:true});}};
 new MutationObserver(sync).observe(detail,{childList:true});
 backdrop.addEventListener('click',()=>detail.querySelector('[data-close-contact]')?.click());
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('crm-detail-open')&&!editor.open){e.preventDefault();detail.querySelector('[data-close-contact]')?.click();}});
 sync();
})();
