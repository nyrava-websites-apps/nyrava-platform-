(()=>{'use strict';
const q=new URLSearchParams(location.search);
if(location.pathname==='/business-calendar.html'){
 if(window.self!==window.top&&(q.get('workspace')==='1'||q.get('callWorkspace')==='1')){
  document.documentElement.setAttribute('data-calendar-embedded','1');
  // Keep client video in the outer workspace so changing tabs cannot dispose it.
  if(window.frameElement?.id==='nh-calendar-frame'&&window.parent.NyravaClientCall)
   window.NyravaClientCall=window.parent.NyravaClientCall;
  if(window.frameElement?.id==='nh-calendar-frame')for(const type of ['nyrava-operator-context','crm-calendar-event-selected'])
   window.addEventListener(type,e=>window.parent.dispatchEvent(new window.parent.CustomEvent(type,{detail:e.detail})));

 }
 return;
}
const menu=document.getElementById('menu'),rail=document.getElementById('rail');
if(!menu||!rail||typeof navigate!=='function')return;
const link=menu.querySelector('a[href="/business-calendar.html"]');if(!link)return;link.setAttribute('data-nh-calendar-link','1');
let panel,frame;
function open(){
 if(!panel){
  panel=document.createElement('section');panel.id='panel-unified-calendar';panel.className='panel';
  frame=document.createElement('iframe');frame.id='nh-calendar-frame';frame.title='Calendar and appointment results';frame.src='/business-calendar.html?workspace=1';
  frame.allow='camera; microphone; display-capture; autoplay';
  panel.append(frame);document.querySelector('.content main').append(panel);
 }
 navigate('unified-calendar');document.getElementById('pageTitle').textContent='Calendar & results';
 link.classList.add('active');link.setAttribute('aria-current','page');
}
link.addEventListener('click',e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button>0)return;e.preventDefault();open();});
// Existing dashboard navigation remains responsible for every other workspace area.
menu.addEventListener('click',e=>{if(e.target.closest('[data-tab],[data-crm-view],[data-leads-view]')){link.classList.remove('active');link.removeAttribute('aria-current');}});
if(location.hash==='#unified-calendar')open();
})();
