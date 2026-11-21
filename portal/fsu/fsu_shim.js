/* fsu: запросы сайта к API → снимки в /fsu/_api/ (сайт работает внутри портала без связи с fabrikant.su) */
(function(){var A=__AMAP__,K=Object.keys(A);
function norm(k){var i=k.indexOf('?');if(i<0)return k;var q=k.slice(i+1).split('&').filter(function(x){return x&&!/^rand=/.test(x)}).sort();return k.slice(0,i)+(q.length?'?'+q.join('&'):'')}
var N={};K.forEach(function(k){N[norm(k)]=A[k]});
/* 20.11.2026 (Рекс, CG-51): только точное совпадение пути и всех параметров, кроме rand — похожий снимок другой страницы или фильтра не подставляем */
function find(u){try{var x=new URL(u,document.baseURI);if(x.pathname.indexOf('/fsu/api/')!==0)return null;
 var k=x.pathname.slice(4)+x.search;if(A[k])return A[k];return N[norm(k)]||'';}catch(e){return null}}
/* 20.11.2026 (Рекс, CG-52): нет снимка — не «пустая выдача», а явная пометка «данные не сохранены в копии» */
var MISS=0;(function(){var P=history.pushState,R=history.replaceState;history.pushState=function(){MISS=0;return P.apply(this,arguments)};history.replaceState=function(){return R.apply(this,arguments)};addEventListener('popstate',function(){MISS=0})})();   /* 21.11.2026 (Рекс, CG-53): плашка — заново на каждом переходе по сайту */
function miss(){if(MISS++)return;var f=function(){if(!document.body)return setTimeout(f,300);var d=document.createElement('div');d.setAttribute('role','status');d.textContent='Часть данных этой страницы не сохранена в копии сайта — откройте fabrikant.su для полной версии.';d.style.cssText='position:fixed;left:50%;transform:translateX(-50%);bottom:84px;z-index:2147483000;background:#141A26;color:#fff;padding:10px 14px;border-radius:12px;font:14px/1.35 system-ui,sans-serif;max-width:90vw';document.body.appendChild(d);setTimeout(function(){d.remove()},8000)};f()}
function to(h){if(h)return '/fsu/_api/'+h+'.json';miss();return 'data:application/json,'+encodeURIComponent('{"success":false,"offline":true,"message":"нет снимка"}')}
var O=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){var h=find(u);if(h!==null){arguments[0]='GET';arguments[1]=to(h)}return O.apply(this,arguments)};
var F=window.fetch;window.fetch=function(i,o){var u=typeof i==='string'?i:(i&&i.url);if(/(^|\/fsu\/)acct\.json$/.test(u||''))return F('/acct.json',o);var h=find(u);if(h!==null)return F(to(h));return F.apply(this,arguments)};
})();
/* 20.11.2026: фото под экран — srcset из вариантов 640/1280/2560 (fsu_img.py), лениво; карта вариантов _img.json грузится сразу, параллельно с приложением */
(function(){var M=null,Q=[];var PF='upload/als-1c/catalog/products/';
function rel(u){try{var p=new URL(u,document.baseURI).pathname;if(p.indexOf('/fsu/')!==0)return null;p=decodeURIComponent(p.slice(5));return p.indexOf(PF)===0?'~'+p.slice(PF.length):p}catch(e){return null}}
function fix(im){if(!M){Q.push(im);return}var s=im.getAttribute('src');if(!s||im.srcset)return;var k=rel(s),v=k&&M[k];if(!v)return;
 var b=s.split('?')[0],ss=[b+' '+v[0]+'w'];if(v[1])ss.unshift(b+'.640.webp '+v[1]+'w');if(v[2]&&Math.min(screen.width,innerWidth)>=1000)ss.push(b+'.2560.webp '+v[2]+'w');   /* 20.11.2026: Safari на iPhone падал (память) — 2560 только на больших экранах */
 var w=Math.round(im.getBoundingClientRect().width)||im.width||v[0];im.sizes=w+'px';im.srcset=ss.join(', ');im.__fsu=1}
/* 20.11.2026 (Рекс): «лениво» — только то, что ниже экрана; главное фото карточки грузится сразу */
function lz(i){if(i.loading)return;var r=i.getBoundingClientRect();if(r.top>innerHeight*1.2||r.left>=innerWidth||r.right<0)i.loading='lazy'}
function scan(n){if(n.tagName==='IMG'){lz(n);n.decoding='async';fix(n)}else if(n.querySelectorAll)n.querySelectorAll('img').forEach(function(i){lz(i);i.decoding='async';fix(i)})}
new MutationObserver(function(ms){ms.forEach(function(m){if(m.type==='attributes'){if(m.target.tagName==='IMG'&&m.attributeName==='src'){var im=m.target;if(im.__fsu){im.removeAttribute('srcset');im.removeAttribute('sizes');im.__fsu=0}fix(im)}}else m.addedNodes.forEach(scan)})}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
var rt;addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(function(){document.querySelectorAll('img[srcset]').forEach(function(i){if(!i.__fsu)return;var w=Math.round(i.getBoundingClientRect().width);if(w)i.sizes=w+'px'})},300)});
function load(){fetch('/fsu/_img.json').then(function(r){return r.ok?r.json():{}}).then(function(j){M=j||{};var q=Q;Q=[];q.forEach(fix);document.querySelectorAll('img').forEach(function(i){if(!i.__fsu)fix(i)})}).catch(function(){M={}})}
load();
})();
