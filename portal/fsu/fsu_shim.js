/* fsu: запросы сайта к API → снимки в /fsu/_api/ (сайт работает внутри портала без связи с fabrikant.su) */
(function(){var A=__AMAP__,K=Object.keys(A);
function norm(k){var i=k.indexOf('?');if(i<0)return k;var q=k.slice(i+1).split('&').filter(function(x){return x&&!/^rand=/.test(x)}).sort();return k.slice(0,i)+(q.length?'?'+q.join('&'):'')}
var N={};K.forEach(function(k){N[norm(k)]=A[k]});
/* 20.11.2026 (Рекс, CG-51): только точное совпадение пути и всех параметров, кроме rand — похожий снимок другой страницы или фильтра не подставляем */
function find(u){try{var x=new URL(u,document.baseURI);if(x.pathname.indexOf('/fsu/api/')!==0)return null;
 var k=x.pathname.slice(4)+x.search;if(A[k])return A[k];var h=N[norm(k)];if(h)return h;if(/[?&]action=products\.getItemsShortByFilter(&|$)/.test(x.search))return 'Q'+x.search;try{(window.__fsuMiss=window.__fsuMiss||[]).push(k)}catch(e2){}return '';}catch(e){return null}}   /* 21.11.2026: какие запросы сайта не нашли снимка — window.__fsuMiss (для проверки) */   /* 21.11.2026 (Т. В.): списка с таким фильтром нет в снимках — его собирает Service Worker из индекса фильтров */
/* 20.11.2026 (Рекс, CG-52): нет снимка — не «пустая выдача», а явная пометка «данные не сохранены в копии» */
var MISS=0;(function(){var P=history.pushState,R=history.replaceState;history.pushState=function(){MISS=0;return P.apply(this,arguments)};history.replaceState=function(){return R.apply(this,arguments)};addEventListener('popstate',function(){MISS=0})})();   /* 21.11.2026 (Рекс, CG-53): плашка — заново на каждом переходе по сайту */
function miss(){if(MISS++)return;var f=function(){if(!document.body)return setTimeout(f,300);var d=document.createElement('div');d.setAttribute('role','status');d.textContent='Часть данных этой страницы не сохранена в копии сайта — откройте fabrikant.su для полной версии.';d.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:84px;z-index:2147483000;background:#141A26;color:#fff;padding:10px 14px;border-radius:12px;font:14px/1.35 system-ui,sans-serif;max-width:90vw';document.body.appendChild(d);setTimeout(function(){d.remove()},8000)};f()}
function to(h){if(h&&h.charAt(0)==='Q')return '/fsu/_q'+h.slice(1);if(h)return '/fsu/_api/'+h+'.json';miss();return '/fsu/_api/_miss.json'}   /* 21.11.2026 (аудит): файл, а не data: — строгая CSP не пропускает data: в запросах */
var O=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){var h=find(u);if(h!==null){arguments[0]='GET';arguments[1]=to(h);if(h&&h.charAt(0)==='Q'){var x=this;x.addEventListener('load',function(){if(x.status!==200)miss()})}}return O.apply(this,arguments)};   /* 21.11.2026 (Рекс CG-56): список из индекса не собрался — плашка «не сохранено», а не пустой каталог */
var F=window.fetch;window.fetch=function(i,o){var u=typeof i==='string'?i:(i&&i.url);if(/(^|\/fsu\/)acct\.json$/.test(u||''))return F('/acct.json',o);var h=find(u);if(h!==null)return F(to(h));return F.apply(this,arguments)};
})();
/* 20.11.2026: фото под экран — srcset из вариантов 640/1280/2560 (fsu_img.py), лениво; карта вариантов _img.json грузится сразу, параллельно с приложением */
(function(){var M=null,Q=[];var PF='upload/als-1c/catalog/products/';
function rel(u){try{var p=new URL(u,document.baseURI).pathname;if(p.indexOf('/fsu/')!==0)return null;p=decodeURIComponent(p.slice(5));return p.indexOf(PF)===0?'~'+p.slice(PF.length):p}catch(e){return null}}
/* 21.11.2026 (аудит): ширина под экран — видимая часть (фото вписано по высоте: галерея 850×321 при экране 390), на телефоне плотность не выше 1,9 — берётся вариант 640 */
function sz(im,def){var r=im.getBoundingClientRect(),w=r.width,h=r.height,cs=getComputedStyle(im);if(!w){if(!def)return 0;w=def;h=0}if(h&&/contain|scale-down/.test(cs.objectFit||'')&&h<w)w=h;w=Math.min(w,innerWidth);var d=window.devicePixelRatio||1;if(Math.min(screen.width,innerWidth)<1000&&d>1.9)w=w*1.9/d;return Math.max(1,Math.round(w))}
function fix(im){if(!M){Q.push(im);return}var s=im.getAttribute('src');if(!s||im.srcset)return;s=s.replace(/\.640\.webp(\?|$)/,'$1');var k=rel(s),v=k&&M[k];if(!v)return;
 var b=s.split('?')[0],ss=[b+' '+v[0]+'w'];if(v[1])ss.unshift(b+'.640.webp '+v[1]+'w');if(v[2]&&Math.min(screen.width,innerWidth)>=1000)ss.push(b+'.2560.webp '+v[2]+'w');   /* 20.11.2026: Safari на iPhone падал (память) — 2560 только на больших экранах */
 var w=sz(im,im.width||v[0]);im.sizes=w+'px';im.srcset=ss.join(', ');im.__fsu=1}
/* 20.11.2026 (Рекс): «лениво» — только то, что ниже экрана; главное фото карточки грузится сразу */
function lz(i){if(i.getAttribute('loading'))return;   /* 21.11.2026 (аудит): свойство loading у картинки всегда «eager» — проверяем атрибут */
 var r=i.getBoundingClientRect();if(r.top>innerHeight*1.2||r.left>=innerWidth||r.right<0)i.loading='lazy'}
function scan(n){if(n.tagName==='IMG'){lz(n);n.decoding='async';fix(n)}else if(n.querySelectorAll)n.querySelectorAll('img').forEach(function(i){lz(i);i.decoding='async';fix(i)})}
new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==='attributes'){if(m.target.tagName==='IMG'&&m.attributeName==='src'){var im=m.target;if(im.__fsu){im.removeAttribute('srcset');im.removeAttribute('sizes');im.__fsu=0}fix(im)}}else m.addedNodes.forEach(scan)})}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
var rt;addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(function(){document.querySelectorAll('img[srcset]').forEach(function(i){if(!i.__fsu)return;var w=sz(i);if(w)i.sizes=w+'px'})},300)});
/* 21.11.2026 (аудит): Angular ставит src раньше srcset — крупный файл начинал качаться сразу. На экранах меньше 1000 px адрес фото подменяется на вариант 640 ещё до загрузки */
var SMALL=Math.min(screen.width,innerWidth)<1000;function pick(u){try{if(!SMALL||!M||typeof u!=='string'||/\.(640|2560)\.webp(\?|$)/.test(u))return u;var k=rel(u),v=k&&M[k];return v&&v[1]?u.split('?')[0]+'.640.webp':u}catch(e){return u}}
try{var D=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');if(D&&D.set)Object.defineProperty(HTMLImageElement.prototype,'src',{configurable:true,enumerable:D.enumerable,get:D.get,set:function(u){D.set.call(this,pick(u))}});var SA=Element.prototype.setAttribute;Element.prototype.setAttribute=function(n,v){if(this.tagName==='IMG'&&String(n).toLowerCase()==='src')v=pick(v);return SA.call(this,n,v)}}catch(e){}
function load(){fetch('/fsu/_img.json').then(function(r){return r.ok?r.json():{}}).then(function(j){M=j||{};var q=Q;Q=[];q.forEach(fix);document.querySelectorAll('img').forEach(function(i){if(!i.__fsu)fix(i)})}).catch(function(){M={}})}
load();
})();
