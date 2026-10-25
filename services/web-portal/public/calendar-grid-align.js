(()=>{'use strict';const calendar=document.getElementById('calendar');if(!calendar)return;let observed=null;const resize=new ResizeObserver(align);let frame=0;
function align(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const head=calendar.querySelector('.cal-time-head'),grid=calendar.querySelector('.cal-time-grid');if(!head||!grid){if(observed){resize.unobserve(observed);observed=null;}return;}if(observed!==grid){if(observed)resize.unobserve(observed);observed=grid;resize.observe(grid);}const width=grid.getBoundingClientRect().width;head.style.width=width+'px';head.style.maxWidth='100%';head.style.marginRight='0px';});}
new MutationObserver(align).observe(calendar,{childList:true});window.addEventListener('resize',align);align();
})();
