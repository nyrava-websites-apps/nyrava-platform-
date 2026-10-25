(()=>{'use strict';
const fields=[...document.querySelectorAll('input[type="password"]')];
for(const input of fields){
 if(input.dataset.nhPassword)continue;input.dataset.nhPassword='1';
 if(!input.id)input.id='nh-password-'+fields.indexOf(input);
 if(!input.name)input.name=input.id;
 const form=input.form;if(form){form.autocomplete='on';const email=form.querySelector('input[type="email"]');if(email){if(!email.name)email.name='email';if(input.autocomplete==='current-password')email.autocomplete='username';}}
 const wrap=document.createElement('span');wrap.className='nh-password-field';input.before(wrap);wrap.append(input);
 const button=document.createElement('button');button.type='button';button.className='nh-password-toggle';button.setAttribute('aria-controls',input.id);button.setAttribute('aria-pressed','false');
 const label=input.labels?.[0]?.textContent.trim()||'password';
 const hidden=()=>{input.type='password';button.textContent='Show';button.setAttribute('aria-label','Show '+label);button.setAttribute('aria-pressed','false');};hidden();
 button.addEventListener('click',()=>{const start=input.selectionStart,end=input.selectionEnd;if(input.type==='password'){input.type='text';button.textContent='Hide';button.setAttribute('aria-label','Hide '+label);button.setAttribute('aria-pressed','true');}else hidden();input.focus({preventScroll:true});if(start!==null)input.setSelectionRange(start,end);});
 wrap.append(button);form?.addEventListener('submit',hidden,true);document.addEventListener('visibilitychange',()=>{if(document.hidden)hidden();});window.addEventListener('pagehide',hidden);
}
})();
