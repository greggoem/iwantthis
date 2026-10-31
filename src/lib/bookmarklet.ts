/**
 * Raccourci (« bookmarklet ») à glisser dans la barre de favoris.
 * Il s'exécute dans le navigateur de la personne, sur la page produit déjà affichée :
 * il fonctionne donc même quand le magasin bloque la lecture automatique par un serveur.
 * Il lit titre / image / prix dans la page et ouvre ce site avec le formulaire déjà rempli.
 */
export function bookmarkletHref(site: string): string {
  const code = `(function(){
var q=function(s){return document.querySelector(s)},
m=function(n){var e=q('meta[property="'+n+'"],meta[name="'+n+'"],meta[itemprop="'+n+'"]');return (e&&e.content)||''},
P,C,L=[];
document.querySelectorAll('script[type="application/ld+json"]').forEach(function(s){try{L.push(JSON.parse(s.textContent))}catch(e){}});
(function w(o,d){if(!o||typeof o!=='object'||d>8)return;
if(Array.isArray(o)){o.forEach(function(x){w(x,d+1)});return}
if(P===undefined&&(o.price!==undefined||o.lowPrice!==undefined)&&(o.priceCurrency||/Offer/.test(String(o['@type']||'')))){P=o.price!==undefined?o.price:o.lowPrice;C=o.priceCurrency}
for(var k in o)w(o[k],d+1)})(L,0);
P=P||m('product:price:amount')||m('og:price:amount');
C=C||m('product:price:currency');
if(!P){var a=q('.a-price .a-offscreen,#priceblock_ourprice');if(a)P=a.textContent}
var i=m('og:image')||(q('#landingImage')||{}).src||m('twitter:image')||'';
var t=m('og:title')||(q('#productTitle')||{}).textContent||document.title;
window.open(${JSON.stringify(site)}+'#/?add=1&u='+encodeURIComponent(location.href)+'&t='+encodeURIComponent((t||'').trim().slice(0,200))+'&i='+encodeURIComponent(i)+'&p='+encodeURIComponent(P||'')+'&c='+encodeURIComponent(C||''),'_blank');
})()`
  return 'javascript:' + encodeURIComponent(code.replace(/\n/g, ''))
}
