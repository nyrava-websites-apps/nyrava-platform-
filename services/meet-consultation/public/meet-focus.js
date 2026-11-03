// Viewer-local layout only: enlarging a tile never changes another person's view.
(() => {
 const grid=document.getElementById('videoGrid');if(!grid)return;
 let focused=null;
 function restore(){if(focused){focused.classList.remove('is-focused');focused.querySelector('.tile-enlarge')?.setAttribute('aria-pressed','false');}focused=null;grid.classList.remove('has-focused-tile');}
 function focus(card){if(focused===card){restore();return;}restore();focused=card;card.classList.add('is-focused');grid.classList.add('has-focused-tile');card.querySelector('.tile-enlarge')?.setAttribute('aria-pressed','true');}
 function decorate(){if(focused&&!grid.contains(focused))restore();for(const card of grid.querySelectorAll('.video-card')){
  if(card.querySelector('.tile-enlarge'))continue;
  const enlarge=document.createElement('button');enlarge.type='button';enlarge.className='tile-enlarge';enlarge.textContent='Enlarge';enlarge.setAttribute('aria-label','Enlarge video or shared screen');enlarge.setAttribute('aria-pressed','false');
  enlarge.onclick=e=>{e.stopPropagation();focus(card);};
  const back=document.createElement('button');back.type='button';back.className='tile-back';back.textContent='Back to grid';back.onclick=e=>{e.stopPropagation();restore();if(document.fullscreenElement===card)document.exitFullscreen?.().catch(()=>{});};
  const full=document.createElement('button');full.type='button';full.className='tile-fullscreen';full.textContent='Fullscreen';full.onclick=async e=>{e.stopPropagation();if(focused!==card)focus(card);try{if(card.requestFullscreen)await card.requestFullscreen();else card.querySelector('video')?.webkitEnterFullscreen?.();}catch{full.textContent='Enlarged view';}};
  card.append(enlarge,back,full);
 }}
 grid.addEventListener('click',e=>{if(e.target.closest('button,a,input,select'))return;const card=e.target.closest('.video-card');if(card)focus(card);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')restore();});
 new MutationObserver(decorate).observe(grid,{childList:true,subtree:true});decorate();
})();
