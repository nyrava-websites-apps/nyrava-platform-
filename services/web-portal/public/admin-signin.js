(()=>{'use strict';const form=document.getElementById('login'),button=document.getElementById('submit'),status=document.getElementById('status');let busy=false;
form.addEventListener('submit',async event=>{
 event.preventDefault();if(busy||!form.reportValidity())return;busy=true;button.disabled=true;status.textContent='Signing in…';
 try{
  const response=await fetch('/api/auth/login',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value.trim(),password:document.getElementById('password').value})});
  if(!response.ok){status.textContent='Email or password was not accepted. Please try again.';return;}
  const data=await response.json();
  if(!['SuperAdmin','PlatformReviewer'].includes(data.user?.role)){
   // Do not retain a non-admin login established by the shared authentication endpoint.
   await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});
   localStorage.removeItem('hsi_token');localStorage.removeItem('hsi_user');
   status.textContent='Administrator access is required. Use your SuperAdmin account.';return;
  }
  localStorage.removeItem('hsi_token');localStorage.setItem('hsi_user',JSON.stringify(data.user));
  
  location.assign('/admin');
 }catch{status.textContent='Unable to complete administrator sign-in. Please try again.';}
 finally{busy=false;button.disabled=false;}
});})();
