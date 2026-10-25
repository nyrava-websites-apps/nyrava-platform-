(function(){
  'use strict';
  const main=document.querySelector('main');if(!main)return;
  const box=document.createElement('aside');box.setAttribute('aria-live','polite');box.style.cssText='padding:12px 16px;margin:12px 0;background:#F4F7FC;border:1px solid #DFE6F0;border-radius:10px';box.hidden=true;main.prepend(box);
  let lastIds=null;
  async function refresh(){
    try{const r=await fetch('/api/crm/distribution',{credentials:'same-origin',cache:'no-store'});if(!r.ok)return;const d=await r.json();
      box.hidden=false;box.replaceChildren();
      const quota=document.createElement('span');quota.textContent=`Verified leads today: ${d.deliveredToday}/${d.dailyLimit} · resets at midnight ${d.businessTimeZone}. `;box.append(quota);
      if(d.notifications.length){const notice=document.createElement('strong');notice.textContent=`${d.notifications.length} new lead notification(s). `;box.append(notice);
        const view=document.createElement('a');view.href='/dashboard/crm';view.textContent='View CRM';box.append(view);
        const read=document.createElement('button');read.type='button';read.textContent='Mark read';read.style.marginLeft='12px';read.onclick=async()=>{const response=await fetch('/api/crm/distribution/notifications/read',{method:'POST',credentials:'same-origin'});if(response.ok)refresh()};box.append(read);}
      const ids=d.notifications.map(n=>n.inquiryId).join(',');
      if(lastIds!==null&&ids&&ids!==lastIds&&typeof load==='function')load();lastIds=ids;
    }catch(_){}
  }
  refresh();setInterval(refresh,60000);
})();
