(function () {
  "use strict";
  if (document.getElementById("nyrava-global-nav")) return;
  const style = document.createElement("style");
  style.textContent = `
    #nyrava-global-nav{position:relative;flex:0 0 auto;z-index:40;font:14px system-ui,Arial,sans-serif;color:#fff}
    #nyrava-global-nav details{position:relative}
    #nyrava-global-nav summary{cursor:pointer;white-space:nowrap;list-style:none;display:inline-flex;align-items:center;min-height:38px;padding:9px 14px;background:#081A3A;color:#fff;border:1px solid #0866FF;border-radius:9px;font-weight:600}
    #nyrava-global-nav summary::-webkit-details-marker{display:none}
    #nyrava-global-nav nav{position:absolute;right:0;top:calc(100% + 6px);background:#081A3A;min-width:245px;max-width:min(320px,90vw);max-height:70vh;overflow:auto;border-radius:10px;border:1px solid #0866FF;box-shadow:0 12px 30px #0006}
    #nyrava-global-nav a,#nyrava-global-nav button{display:block;width:100%;box-sizing:border-box;color:#fff;padding:11px 14px;text-decoration:none;font:14px system-ui,Arial,sans-serif;text-align:left;background:transparent;border:0;cursor:pointer}
    #nyrava-global-nav a:hover,#nyrava-global-nav button:hover,#nyrava-global-nav a:focus-visible{background:#0866FF}
    header:has(#nyrava-global-nav){gap:18px;flex-wrap:wrap;align-items:center}
    header:has(#nyrava-global-nav)>*{min-width:0}
    #nyrava-global-nav:focus-within{z-index:60}
    @media(max-width:650px){#nyrava-global-nav{margin-left:auto}#nyrava-global-nav nav{max-width:calc(100vw - 30px)}}
  `;
  document.head.appendChild(style);
  const wrap = document.createElement("div"); wrap.id = "nyrava-global-nav";
  const details = document.createElement("details");
  const summary = document.createElement("summary"); summary.textContent = "☰ My Account";
  details.appendChild(summary);
  const links = document.createElement("nav"); links.setAttribute("aria-label", "Account navigation");
  details.appendChild(links); wrap.appendChild(details);
  const host = document.querySelector("main > header") || document.querySelector("body > header") || document.querySelector("header");
  if (host) { host.appendChild(wrap); }
  else { const bar=document.createElement("div");bar.style.cssText="display:flex;justify-content:flex-end;padding:12px 18px;background:#081A3A;position:relative;z-index:40";bar.appendChild(wrap);document.body.prepend(bar); }
  const link = (label, url) => {const el=document.createElement("a");el.textContent=label;el.href=url;links.appendChild(el);};
  document.addEventListener("click", e => {if(!wrap.contains(e.target)) details.open=false;});
  fetch("/api/auth/me", {credentials:"same-origin"}).then(r => {if(!r.ok)throw Error("not logged in");return r.json();}).then(user => {
    link("Realtor Workspace", "/dashboard/home");
    link("My Leads & ZIP Territories", "/dashboard");
    link("CRM & Appointments", "/dashboard/crm");
    if(user.role==="RealtorSubscriber"){link("My Profile", "/subscriber-profile.html");link("AI Work Assistant", "/professional-ai.html");link("Private Valuation", "/professional-valuation.html");link("Appointments & Reminders", "/personal-reminders.html");}
    if ((user.role||"").toLowerCase()==="superadmin") {
      link("Lead Management", "/admin");


    }
    const logout=document.createElement("button");logout.type="button";logout.textContent="Sign Out";
    logout.addEventListener("click",async()=>{if(window.nyravaSignOut)return window.nyravaSignOut();const r=await fetch("/api/auth/logout",{method:"POST",credentials:"same-origin"});if(!r.ok)return alert("Sign out failed. Please try again.");localStorage.removeItem("hsi_token");localStorage.removeItem("hsi_user");location.replace("/");});links.appendChild(logout);
  }).catch(()=>wrap.remove());
})();
