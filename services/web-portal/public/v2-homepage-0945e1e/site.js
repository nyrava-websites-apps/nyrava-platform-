(() => {
  const menu = document.querySelector("#main-nav");
  const toggle = document.querySelector(".menu-toggle");
  const dialog = document.querySelector("#notice-dialog");
  const dialogTitle = document.querySelector("#dialog-title");
  const dialogMessage = document.querySelector("#dialog-message");

  toggle.addEventListener("click", () => {
    const isOpen = menu.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
  });

  menu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      menu.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open navigation");
    });
  });

  document.querySelectorAll("[data-unavailable]").forEach((button) => {
    button.addEventListener("click", () => {
      const feature = button.dataset.unavailable;
      dialogTitle.textContent = `${feature} is not available yet`;
      dialogMessage.textContent = "This V2 homepage preview does not collect or send information. The feature will be linked here after its new implementation is ready and tested.";
      dialog.showModal();
    });
  });

  let dialogOpener=null;
  const realtorDialog = document.querySelector("#realtor-intake-dialog");
  const realtorFrame = document.querySelector("#realtor-intake-frame");

  document.querySelectorAll("[data-open-realtor]").forEach(button => {
    button.addEventListener("click", () => {
      dialogOpener=button;
      const query=new URLSearchParams();
      if(['buyer','seller'].includes(button.dataset.intakeType))query.set('type',button.dataset.intakeType);
      const entry=new URLSearchParams(location.search);
      ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','ref'].forEach(key=>{if(entry.has(key))query.set(key,entry.get(key).slice(0,120));});
      realtorFrame.src = "/find-a-realtor"+(query.size?'?'+query:'');
      realtorDialog.showModal();
    });
  });

  document.querySelector("#close-realtor-dialog").addEventListener("click", () => {
    realtorDialog.close();
  });

  realtorDialog.addEventListener("close", () => {
    realtorFrame.removeAttribute("src");dialogOpener?.focus();
  });
  window.addEventListener('message', event => {
    if(event.origin!==window.location.origin || event.source!==realtorFrame.contentWindow ||
       event.data?.type!=='NYRAVA_INQUIRY_SUCCESS' || !realtorDialog.open)return;
    const message=typeof event.data.message==='string'?event.data.message:'Your inquiry is saved. Check your confirmation message.';
    let notice=document.getElementById('intake-success-notice');
    if(!notice){
      notice=document.createElement('div');notice.id='intake-success-notice';
      notice.setAttribute('role','status');notice.setAttribute('tabindex','-1');
      notice.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:10000;background:#081A3A;color:white;padding:16px 20px;border-radius:10px;width:min(90vw,620px);box-shadow:0 6px 25px #0004';
      const text=document.createElement('span');text.className='intake-message';notice.append(text);
      const close=document.createElement('button');close.type='button';close.textContent='Dismiss';
      close.style.cssText='margin-left:16px;background:white;color:#081A3A;border:0;border-radius:4px;padding:6px 10px';
      close.addEventListener('click',()=>notice.remove());notice.append(close);document.body.append(notice);
    }
    notice.querySelector('.intake-message').textContent=message;
    realtorDialog.close();notice.focus();
  });
  const valuationDialog = document.querySelector("#valuation-preview-dialog");
  const valuationFrame = document.querySelector("#valuation-preview-frame");
  document.querySelectorAll("[data-open-valuation]").forEach(button => {
    button.addEventListener("click", () => {
      dialogOpener=button;
      valuationFrame.src = "/valuation-preview/index.html?v=20261018-live";
      valuationDialog.showModal();
    });
  });
  document.querySelector("#close-valuation-dialog").addEventListener("click", () => valuationDialog.close());
  valuationDialog.addEventListener("close", () => {valuationFrame.removeAttribute("src");dialogOpener?.focus();});
  document.querySelector("#dialog-ok").addEventListener("click", () => dialog.close());
  const login=document.querySelector('.nyrava-login-menu');
  document.addEventListener('click',event=>{if(login&&!login.contains(event.target))login.open=false;});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&login?.open){login.open=false;login.querySelector('summary').focus();}});
  const zipForm=document.getElementById('zip-availability-form');
  zipForm?.addEventListener('submit',async event=>{
    event.preventDefault();const button=zipForm.querySelector('button'),result=document.getElementById('zip-check-result');
    const zip=document.getElementById('public-zip').value.trim();
    if(!/^[0-9]{5}$/.test(zip)){result.textContent='Enter a five-digit ZIP code.';return;}
    if(button.disabled)return;button.disabled=true;result.textContent='Checking current capacity…';
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),10000);
    try{const response=await fetch('/api/territories/check/'+zip,{credentials:'omit',signal:abort.signal});
      const data=await response.json();if(!response.ok)throw Error('Capacity check unavailable.');
      if(!Number.isInteger(data.availableSlots)||!Number.isInteger(data.maxSlots)||data.availableSlots<0||data.maxSlots<1||data.availableSlots>data.maxSlots)throw Error('Capacity response unavailable.');
      result.textContent=data.availableSlots===0?'Current subscriber capacity is full for '+zip+'. Check another ZIP or return later.':zip+': '+data.availableSlots+' of '+data.maxSlots+' subscriber slots currently available. Sign in to confirm eligibility and select your territory.';
    }catch{result.textContent='Capacity could not be checked right now. Please retry or use your signed-in territory workspace.';}
    finally{clearTimeout(timer);button.disabled=false;}
  });
})();
