(function(){
  "use strict";
  if(document.getElementById("subscriber-sign-out"))return;
  const host=document.querySelector("body > header nav")||document.querySelector("header")||document.body;
  const existing=document.getElementById("logout");
  const button=existing||document.createElement("button");
  button.id="subscriber-sign-out";button.type="button";button.textContent="Sign out";
  button.style.cssText="flex:0 0 auto;display:inline-block;background:#0866FF;color:#fff;border:1px solid #DFE6F0;border-radius:8px;padding:9px 14px;font:600 14px system-ui;cursor:pointer;margin-left:10px";
  window.nyravaSignOut=async function(){
    button.disabled=true;button.textContent="Signing out…";
    try{
      const response=await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin",cache:"no-store"});
      if(!response.ok)throw Error("Sign out failed. Please try again.");
      try{localStorage.removeItem("hsi_token");localStorage.removeItem("hsi_user");sessionStorage.removeItem("hsi_token");sessionStorage.removeItem("hsi_user");}catch(_){}
      location.replace("/");
    }catch(error){button.disabled=false;button.textContent="Retry sign out";button.title=error.message;alert(error.message);}
  };
  button.onclick=window.nyravaSignOut;if(!existing)host.appendChild(button);
  window.addEventListener("pageshow",async event=>{
    if(!event.persisted)return;
    try{const r=await fetch("/api/auth/me",{credentials:"same-origin",cache:"no-store"});if(!r.ok)location.replace("/");}catch(_){}
  });
})();
