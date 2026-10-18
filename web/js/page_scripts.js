// Scripts embedded in the generated report (they run inside the report page, not in the upload page).
// Ported from src/build_report.R; the full-screen chart viewer works on SVG charts instead of PNG images.

export const THEME_INIT = `<script>(function(){var t='dark',u='us';try{t=localStorage.getItem('theme')==='light'?'light':'dark';u=localStorage.getItem('units')==='si'?'si':'us';}catch(e){}
document.documentElement.setAttribute('data-theme',t);document.documentElement.setAttribute('data-units',u);})();</script>`;

export const TOGGLE_JS = `<script>(function(){var r=document.documentElement;
function wire(id,attr,a,b,key,labelA,labelB){var btn=document.getElementById(id);
function show(){btn.innerHTML=r.getAttribute(attr)===a?labelA:labelB;}
btn.addEventListener('click',function(){var v=r.getAttribute(attr)===a?b:a;r.setAttribute(attr,v);
try{localStorage.setItem(key,v);}catch(e){}show();});show();}
wire('theme-toggle','data-theme','light','dark','theme','\\u263E','\\u2600');
wire('units-toggle','data-units','si','us','units','<i>km \\u00b7 </i>\\u00b0C','<i>mi \\u00b7 </i>\\u00b0F');
var bar=document.getElementById('topbar');function onscroll(){bar.classList.toggle('scrolled',window.scrollY>8);}
window.addEventListener('scroll',onscroll,{passive:true});onscroll();
var links=document.querySelectorAll('#topbar nav a');
function spy(){var cur=links[0],line=Math.max(140,window.innerHeight*0.3);for(var i=0;i<links.length;i++){var el=document.getElementById(links[i].hash.slice(1));
if(el&&el.getBoundingClientRect().top<=line)cur=links[i];}
if(window.innerHeight+window.scrollY>=document.body.scrollHeight-4)cur=links[links.length-1];
for(var j=0;j<links.length;j++)links[j].classList.toggle('on',links[j]===cur);}
var busy=false;function follow(){if(busy)return;busy=true;var last=-1,still=0;(function tick(){spy();var y=window.scrollY;still=y===last?still+1:0;last=y;
if(still<20)requestAnimationFrame(tick);else busy=false;})();}
['scroll','touchmove','touchend','scrollend','resize','load'].forEach(function(n){window.addEventListener(n,follow,{passive:true});});spy();})();</script>`;

export const TABS_JS = `<script>(function(){var segs=document.querySelectorAll('.seg');
function wire(seg){var g=seg.getAttribute('data-group'),btns=seg.querySelectorAll('button'),
panes=document.querySelectorAll('.pane[data-group="'+g+'"]');
function pick(id){for(var i=0;i<btns.length;i++){var on=btns[i].getAttribute('data-pane')===id;btns[i].classList.toggle('on',on);btns[i].setAttribute('aria-pressed',on);}
for(var j=0;j<panes.length;j++)panes[j].hidden=panes[j].getAttribute('data-pane')!==id;}
seg.addEventListener('click',function(e){var b=e.target.closest('button');if(b)pick(b.getAttribute('data-pane'));});pick('all');}
for(var k=0;k<segs.length;k++)wire(segs[k]);})();</script>`;

// Tap a chart on a phone to see it full screen with its title and subtitle. In portrait the block is turned sideways
// and scaled to fit. Tap anywhere, the close button or Escape to go back.
export const LIGHTBOX_JS = `<script>(function(){var mq=window.matchMedia('(max-width:760px)');
var box=document.createElement('div');box.id='lightbox';box.hidden=true;
box.innerHTML='<div class="lbstage"><button type="button" aria-label="Close">\\u2715</button><p class="lbt"></p><p class="lbs"></p><div class="lbfig"></div></div>';document.body.appendChild(box);
var st=box.querySelector('.lbstage'),lt=box.querySelector('.lbt'),ls=box.querySelector('.lbs'),fg=box.querySelector('.lbfig');
function fit(){var sv=fg.firstChild;if(box.hidden||!sv)return;var vb=sv.viewBox.baseVal,W=window.innerWidth,H=window.innerHeight,rot=H>W&&vb.width>vb.height,pad=12,
aw=(rot?H:W)-2*pad,ah=(rot?W:H)-2*pad,tf='translate(-50%,-50%)'+(rot?' rotate(90deg)':'');
st.style.width=aw+'px';st.style.transform=tf;st.style.transform=tf+' scale('+Math.min(1,ah/st.offsetHeight)+')';}
function text(el,src){var n=src&&src.textContent.trim();el.textContent=n||'';el.hidden=!n;}
function open(sv){var c=sv.closest('.chart');text(lt,c&&c.querySelector('.ctitle'));text(ls,c&&c.querySelector('.csub'));
var cp=sv.cloneNode(true);cp.removeAttribute('width');cp.removeAttribute('height');var vb=sv.viewBox.baseVal;cp.style.aspectRatio=vb.width+' / '+vb.height;
fg.replaceChildren(cp);box.hidden=false;document.documentElement.classList.add('lb-open');fit();}
function close(){box.hidden=true;fg.replaceChildren();document.documentElement.classList.remove('lb-open');}
document.addEventListener('click',function(e){var t=e.target;if(!t.closest)return;
if(t.closest('#lightbox')){close();return;}var sv=t.closest('.chart .fig svg');if(mq.matches&&sv)open(sv);});
document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!box.hidden)close();});
window.addEventListener('resize',fit);window.addEventListener('orientationchange',fit);})();</script>`;
