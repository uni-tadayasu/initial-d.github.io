/* 尾文字Z V45 - Two separately limited, operator-approved collector vehicles.
 * GitHub Pages is read-only. Requests are not sales; the operator confirms one owner
 * per SKU through a GitHub SHA-checked inventory commit and ECDSA-signed receipt.
 */
(()=>{'use strict';
const REPO={owner:'uni-tadayasu',repo:'initial-d.github.io',branch:'main'};
const PRODUCTS={
 bm:{sku:'BM-NOIR-ONE-001',inv:'limited/black-maria.json',name:'ブラック・マリア',english:'BLACK MARIA · NOIR',theme:'violet',price:12000,storage:'limitedBlackMaria',model:()=>window.OMZ_BM_MODELS,carId:()=>BLACK_MARIA_ID,folder:'bm-metal',dresses:{heritage:{ja:'クラシック・クローム',name:'HERITAGE',cost:0},aero:{ja:'ナイトエアロ',name:'NIGHT AERO',cost:2600},royal:{ja:'ロイヤル・アメジスト',name:'ROYAL',cost:3400},rally:{ja:'ミッドナイト・ラリー',name:'RALLY',cost:2200}}},
 yb:{sku:'YB-SUNBURST-ONE-001',inv:'limited/yellow-beetle.json',name:'イエロービートル',english:'YELLOW BEETLE · SUNBURST',theme:'gold',price:12000,storage:'limitedYellowBeetle',model:()=>window.OMZ_YB_MODELS,carId:()=>CHORO_HERO_ID,folder:'yb-metal',dresses:{sunshine:{ja:'サンシャイン・クラシック',name:'SUNSHINE',cost:0},rally:{ja:'サンバースト・ラリー',name:'RALLY',cost:2200},midnight:{ja:'ミッドナイト・ツートーン',name:'MIDNIGHT',cost:2600},royal:{ja:'ロイヤル・ゴールド',name:'ROYAL',cost:3400}}}
};
const $=id=>document.getElementById(id),fmt=n=>Number(n||0).toLocaleString('ja-JP');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const encode=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function decode(s){const raw=atob(String(s).replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-s.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
const bytes=s=>new TextEncoder().encode(s);
const ui=Object.fromEntries(Object.keys(PRODUCTS).map(k=>[k,{stock:null,source:'',error:'',verified:false,loading:false,preview:Object.keys(PRODUCTS[k].dresses)[0]}]));
let current='bm',opened=false,drawAngle=-.72,refreshing=false;
function getLocal(k){const p=PRODUCTS[k];if(!profile[p.storage]||typeof profile[p.storage]!=='object'){profile[p.storage]={request:null,owned:false,token:'',saleId:'',equipped:Object.keys(p.dresses)[0],dresses:{[Object.keys(p.dresses)[0]]:true}};}return profile[p.storage];}
function ensureId(){let id=profile.premiumCustomerId;if(!/^USER_[a-f0-9]{40,44}$/.test(id||'')){
 // Preserve IDs created by the existing COD/payment flow (they can have other valid formats).
 if(/^USER_[A-Za-z0-9_-]{12,60}$/.test(id||''))return id;
 const a=crypto.getRandomValues(new Uint8Array(20));id='USER_'+[...a].map(x=>x.toString(16).padStart(2,'0')).join('');profile.premiumCustomerId=id;storeProgress();}return id;}
function price(k){return ui[k].stock?.priceMetal||PRODUCTS[k].price;}
function ready(k){const s=ui[k].stock,p=PRODUCTS[k];return s?.sku===p.sku&&s.status==='available'&&s.total===1&&Number.isSafeInteger(s.priceMetal)&&s.priceMetal>0&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.salesEmail||'')&&s.publicKey?.kty==='EC';}
async function readAPI(k){const p=PRODUCTS[k];const url=`https://api.github.com/repos/${REPO.owner}/${REPO.repo}/contents/${p.inv}?ref=${REPO.branch}`;
 const r=await fetch(url,{headers:{Accept:'application/vnd.github+json'},cache:'no-store'});if(!r.ok)throw Error('GitHub API HTTP '+r.status);
 const j=await r.json();if(j.encoding!=='base64')throw Error('GitHub encoding');return JSON.parse(new TextDecoder().decode(decode(j.content.replace(/\s+/g,''))));}
async function readPublic(k){const r=await fetch(PRODUCTS[k].inv+'?rev='+Date.now(),{cache:'no-store'});if(!r.ok)throw Error('公開在庫HTTP '+r.status);return r.json();}
async function refresh(k,quiet=false){const u=ui[k],p=PRODUCTS[k];if(u.loading)return;u.loading=true;try{
 let s,source;try{s=await readAPI(k);source='GitHubリポジトリ';}catch(e){s=await readPublic(k);source='GitHub Pages（反映遅延あり）';}
 if(s.sku!==p.sku||s.total!==1||!['available','paused','sold'].includes(s.status))throw Error('在庫の形式が不正です');
 u.stock=s;u.source=source;u.error='';await verifyStored(k);
 }catch(e){u.error=String(e?.message||e);if(!quiet&&current===k&&opened)setMessage('在庫情報を確認できません。購入申請は停止中です。 '+u.error);}finally{u.loading=false;if(opened&&current===k)render();}}
async function hashOwner(customer,sale){return encode(await crypto.subtle.digest('SHA-256',bytes(customer+':'+sale)));}
async function verifyCode(k,code,quiet=false){const p=PRODUCTS[k],u=ui[k];try{
 const stock=u.stock;if(!stock||stock.status!=='sold'||!stock.publicKey)throw Error('販売済みの公開在庫記録が見つかりません');
 const parts=String(code||'').trim().split('.');if(parts.length!==3||parts[0]!=='OMZONE1')throw Error('認証コードが正しくありません');
 const raw=decode(parts[1]),sig=decode(parts[2]);if(raw.length>2000||sig.length!==64)throw Error('コードの長さが不正です');
 const j=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
 if(j.v!==1||j.sku!==p.sku||j.saleId!==stock.saleId||j.price!==stock.priceMetal||j.customer!==ensureId()||typeof j.issuedAt!=='string')throw Error('このゲームデータの所有者に発行されたものではありません');
 if(await hashOwner(j.customer,j.saleId)!==stock.ownerHash)throw Error('在庫に登録された所有者と異なります');
 const publicKey=await crypto.subtle.importKey('jwk',stock.publicKey,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,sig,raw))throw Error('運営者署名が一致しません');
 const loc=getLocal(k);if(!loc.owned||loc.saleId!==j.saleId){const m=window.OMZ_METAL?.metal?.();if(!m||!Number.isFinite(m.balance)||m.balance<j.price)throw Error(`メタルが不足しています（必要：${fmt(j.price)}M）`);
 m.balance-=j.price;m.spent=(Number(m.spent)||0)+j.price;m.history??=[];m.history.unshift({label:`世界限定1台 ${p.name}`,delta:-j.price,kind:'limited',date:new Date().toLocaleString('ja-JP')});m.history=m.history.slice(0,75);
 loc.owned=true;loc.saleId=j.saleId;loc.dresses={[Object.keys(p.dresses)[0]]:true};loc.equipped=Object.keys(p.dresses)[0];const id=p.carId();if(id>=0&&!profile.owned.includes(id))profile.owned.push(id);if(id>=0)profile.carStars[id]??=1;
 }
 loc.token=String(code).trim();u.verified=true;storeProgress();window.OMZ_METAL?.render?.();if(typeof refreshChosen==='function')refreshChosen();return true;
 }catch(e){u.verified=false;if(!quiet)setMessage('認証失敗：'+e.message);return false;}}
async function verifyStored(k){ui[k].verified=false;const loc=getLocal(k);if(loc.token&&ui[k].stock?.status==='sold')await verifyCode(k,loc.token,true);}
function shopBanner(){return `<div class="omzLimitedBanners">${Object.entries(PRODUCTS).map(([k,p])=>{
 const s=ui[k].stock,tag=s?.status==='sold'?'完売':s?.status==='paused'?'受付停止':ready(k)?'申請受付中':'準備中';
 return `<article class="omzLimitedBanner ${p.theme}"><div><small>WORLD LIMITED ONE OF ONE · ${k.toUpperCase()}</small><b>${k==='bm'?'👑':'🌞'} ${p.name} — 世界限定1台</b><span>${fmt(price(k))} メタル · 3Dモデル＆専用ドレス4種</span></div><div class="omzLimitedAction"><strong>${tag}</strong><button data-limited-open="${k}" type="button">限定モデルを見る</button></div></article>`}).join('')}</div>`}
function modalMarkup(){return `<div id="omzLimitedCover" role="dialog" aria-modal="true" aria-label="世界限定車両"><div id="omzLimitedShell"><header class="omzLimitedHead"><div><small>尾文字Z // WORLD LIMITED COLLECTION</small><h2 id="omzLimitedTitle">限定モデル</h2></div><button id="omzLimitedClose" type="button" aria-label="閉じる">×</button></header><nav id="omzLimitedTabs" aria-label="限定車両を選択"><button type="button" data-limited-switch="bm">BLACK MARIA</button><button type="button" data-limited-switch="yb">YELLOW BEETLE</button></nav><div class="omzLimitedCols"><section><div class="omzLimitedStage"><canvas id="omzLimitedCanvas" width="840" height="475"></canvas><small>専用OBJをもとにした3Dプレビュー。左右にドラッグして回転できます。</small></div><div id="omzLimitedDressCards" class="omzLimitedDresses"></div><p class="omzLimitedImportant">購入申請は購入確定ではありません。運営者が最初の有効な申請を選び、GitHubの在庫を販売済みに変更した後、所有者だけに署名付き認証コードを発行します。<strong>GitHub Pages単体では自動先着確定や残高不正を完全防止できません。</strong></p></section><section class="omzLimitedCheckout"><div class="omzLimitedMeta"><strong id="omzLimitedStock">在庫確認中</strong><strong id="omzLimitedPrice">— M</strong></div><p id="omzLimitedSource"></p><button type="button" id="omzLimitedRefresh">最新の在庫を照会</button><h3>購入申請</h3><p>お客様ID：<code id="omzLimitedCustomer"></code><br>所持メタル：<b id="omzLimitedBalance"></b> M</p><div class="omzLimitedRow"><button id="omzLimitedApply" class="omzLimitedGold" type="button">購入申請メールを作成</button><button id="omzLimitedExport" type="button">申請JSONを保存</button></div><div id="omzLimitedMailHint"></div><h3>所有者コードの入力</h3><label for="omzLimitedToken">運営者から届いた署名付き認証コード</label><textarea id="omzLimitedToken" spellcheck="false" placeholder="OMZONE1. から始まるコード"></textarea><button id="omzLimitedRedeem" class="omzLimitedGold" type="button">認証してメタルで購入確定</button><div id="omzLimitedOwner"></div><p class="omzLimitedStatus" id="omzLimitedStatus" role="status"></p></section></div></div></div>`;}
function setMessage(s){const el=$('omzLimitedStatus');if(el)el.textContent=s;}
function dressMarkup(k){const p=PRODUCTS[k],l=getLocal(k);return Object.entries(p.dresses).map(([d,v])=>`<button type="button" data-limited-preview="${d}" class="${ui[k].preview===d?'selected':''}" aria-pressed="${ui[k].preview===d}"><img loading="lazy" alt="${esc(v.ja)}" src="assets/${p.folder}/preview_${d}.png"><b>${esc(v.name)}</b><small>${l.dresses?.[d]?'所持':v.cost?fmt(v.cost)+' M':'標準装備'}</small></button>`).join('')}
function ownerMarkup(k){const p=PRODUCTS[k],u=ui[k],l=getLocal(k);if(!u.verified)return '<p>認証された所有者は、この画面で専用ボディとドレスを購入・装着できます。</p>';
 return `<div class="omzLimitedOwner"><h3>👑 ${esc(p.name)} 限定所有者</h3><p>装着中：${esc(p.dresses[l.equipped]?.ja||'標準')}</p><div class="omzLimitedRow">${Object.entries(p.dresses).map(([name,d])=>`<button type="button" data-limited-equip="${name}" ${l.equipped===name?'disabled':''}>${l.dresses?.[name]?'装着':'購入 '+fmt(d.cost)+' M'} · ${esc(d.ja)}</button>`).join('')}</div><p>購入コードを控え、セーブデータをバックアップしてください。端末のセーブを失うと所有権を自動復元できません。</p></div>`;}
function render(){if(!opened||!$('omzLimitedShell'))return;const k=current,p=PRODUCTS[k],u=ui[k],s=u.stock,l=getLocal(k),bal=window.OMZ_METAL?.metal?.()?.balance||0;
 $('omzLimitedTitle').textContent=p.english;$('omzLimitedShell').dataset.theme=p.theme;
 document.querySelectorAll('[data-limited-switch]').forEach(b=>{b.classList.toggle('selected',b.dataset.limitedSwitch===k);b.setAttribute('aria-pressed',String(b.dataset.limitedSwitch===k))});
 $('omzLimitedStock').textContent=!s?'在庫照会中':s.status==='sold'?'SOLD OUT / 世界限定1台完売':s.status==='paused'?'申請受付停止':ready(k)?'残り1台 · 申請受付中':'初期設定待ち';
 $('omzLimitedPrice').textContent=fmt(price(k))+' M';$('omzLimitedSource').textContent=`在庫参照：${u.source||'未取得'} ／ 更新：${s?.updatedAt||'未設定'}`;
 $('omzLimitedCustomer').textContent=ensureId();$('omzLimitedBalance').textContent=fmt(bal);
 $('omzLimitedApply').disabled=!ready(k)||bal<price(k)||u.verified;
 $('omzLimitedApply').textContent=u.verified?'購入済み':s?.status==='sold'?'SOLD OUT':!ready(k)?'販売準備中':bal<price(k)?'メタル不足':'✉ 購入申請メールを作成';
 $('omzLimitedExport').disabled=!l.request;
 $('omzLimitedMailHint').textContent=ready(k)?'受付メール：'+s.salesEmail:'申請には運営者による受付メール・公開署名鍵の設定が必要です';
 $('omzLimitedDressCards').innerHTML=dressMarkup(k);$('omzLimitedOwner').innerHTML=ownerMarkup(k);
 if(!u.error)setMessage(u.verified?'あなたがこの世界限定モデルの正規所有者です。専用3Dモデルがガレージ・レースに反映されます。':s?.status==='sold'?'完売しました。認証コードを持つ所有者だけが利用可能です。':ready(k)?'先着確約ではありません。申請メールを送ってから、運営者からの連絡を確認してください。':'販売開始前です。');else setMessage('在庫情報取得に失敗しました：'+u.error);
 drawModel(k,u.preview);
}
function exportJson(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200)}
function apply(){const k=current,p=PRODUCTS[k],u=ui[k],l=getLocal(k),m=window.OMZ_METAL?.metal?.();if(!ready(k)||!m||m.balance<price(k)||u.verified)return setMessage('在庫とメタル残高を再確認してください');
 let req=l.request;if(req?.sku!==p.sku||req.customer!==ensureId()||req.price!==price(k)){
 const a=crypto.getRandomValues(new Uint8Array(12));req={v:1,kind:'oneofone_request',sku:p.sku,requestId:'REQ-'+[...a].map(x=>x.toString(16).padStart(2,'0')).join('').toUpperCase(),customer:ensureId(),price:price(k),metalBalanceClaim:Math.max(0,Math.floor(m.balance)),clientTime:new Date().toISOString()};l.request=req;storeProgress();}
 const txt=`尾文字Z 世界限定1台 ${p.name} 購入申請\n\n申請番号：${req.requestId}\n購入者ID：${req.customer}\n希望商品：${p.english}\n価格：${req.price} メタル\n申請時の自己申告メタル：${req.metalBalanceClaim} M\n\n申請JSON：\n${JSON.stringify(req,null,2)}\n\n※申請＝購入確定ではありません。運営者が受付順等を確認して1名だけ確定します。`;
 const a=document.createElement('a');a.href='mailto:'+encodeURIComponent(u.stock.salesEmail).replace(/%40/g,'@')+'?subject='+encodeURIComponent('【尾文字Z 世界限定1台】'+p.name+' '+req.requestId)+'&body='+encodeURIComponent(txt);a.style.display='none';document.body.append(a);a.click();a.remove();
 setMessage('メールを開いたら必ず「送信」してください。送信せず閉じた場合は申請されません。メールが起動しない場合は申請JSONを保存して運営へ送ってください。');render();}
function equip(name){const k=current,p=PRODUCTS[k],l=getLocal(k),d=p.dresses[name],u=ui[k];if(!u.verified||!d)return setMessage('正規所有者のみ利用できます');
 if(!l.dresses?.[name]){const m=window.OMZ_METAL?.metal?.();if(!m||m.balance<d.cost)return setMessage('メタル不足：'+fmt(d.cost)+' M必要です');
 if(!confirm(`${p.name}の「${d.ja}」を${fmt(d.cost)}Mで購入しますか？`))return;
 m.balance-=d.cost;m.spent=(Number(m.spent)||0)+d.cost;m.history??=[];m.history.unshift({label:p.name+' 専用ドレス '+d.ja,delta:-d.cost,kind:'limited',date:new Date().toLocaleString('ja-JP')});m.history=m.history.slice(0,75);l.dresses[name]=true;
 }l.equipped=name;u.preview=name;storeProgress();window.OMZ_METAL?.render?.();if(typeof refreshChosen==='function')refreshChosen();render();setMessage(`「${d.ja}」を装着しました。ガレージ・レース中にも反映されます。`);}
function drawModel(k,dress){const cv=$('omzLimitedCanvas'),ctx=cv?.getContext('2d'),api=PRODUCTS[k].model();if(!ctx||!api)return;
 const tri=[];for(const part of ['body',dress]){const model=api.decode(part);if(!model)continue;for(let i=0;i<model.data.length;i+=36){const v=model.data;const pts=[],col=[];for(let t=0;t<3;t++){const q=i+t*12;pts.push([v[q],v[q+1],v[q+2]]);}for(let n=6;n<9;n++)col.push(v[i+n]);tri.push({pts,col,norm:[v[i+3],v[i+4],v[i+5]]});}}
 const W=cv.width,H=cv.height,c=Math.cos(drawAngle),s=Math.sin(drawAngle),ce=Math.cos(.24),se=Math.sin(.24),scale=Math.min(W/3.55,H/2.30);
 const arr=tri.map(t=>{const v=t.pts.map(([x,y,z])=>{const xx=x*c+z*s,zz=z*c-x*s;return [W*.50+xx*scale,H*.72-((y-.76)*ce-zz*se)*scale,zz]});const light=Math.max(.33,Math.min(1.13,.66+.26*(t.norm[0]*s+t.norm[2]*c)+t.norm[1]*.16));return {v,depth:v.reduce((n,q)=>n+q[2],0)/3,col:t.col.map(x=>Math.round(Math.min(255,x*light*255)))};});arr.sort((a,b)=>a.depth-b.depth);
 const bg=ctx.createLinearGradient(0,0,0,H);bg.addColorStop(0,k==='bm'?'#35384c':'#293b54');bg.addColorStop(1,'#0a1220');ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);ctx.fillStyle='#03070b77';ctx.beginPath();ctx.ellipse(W*.5,H*.88,W*.30,H*.042,0,0,7);ctx.fill();for(const t of arr){ctx.beginPath();ctx.moveTo(t.v[0][0],t.v[0][1]);ctx.lineTo(t.v[1][0],t.v[1][1]);ctx.lineTo(t.v[2][0],t.v[2][1]);ctx.closePath();ctx.fillStyle=`rgb(${t.col.join(',')})`;ctx.fill();}
}
// Patch both showroom and live race meshes; cache key includes selected exclusive dress.
const build0=CAR3D.build.bind(CAR3D),cos0=CAR3D.cosmeticKey.bind(CAR3D);
const productForCar=c=>c&&c.id===BLACK_MARIA_ID?'bm':c&&c.id===CHORO_HERO_ID?'yb':null;
CAR3D.cosmeticKey=function(c){const k=productForCar(c);return cos0(c)+(k&&ui[k].verified?'|WORLD-EXCLUSIVE:'+k+':'+getLocal(k).equipped:'');};
CAR3D.build=function(c){const k=productForCar(c);if(k&&ui[k].verified){const p=PRODUCTS[k],api=p.model(),d=getLocal(k).equipped;const body=api?.decode('body'),dress=api?.decode(d);
 if(body&&dress){const buffer=new Float32Array(body.data.length+dress.data.length);buffer.set(body.data);buffer.set(dress.data,body.data.length);return {data:buffer,count:buffer.length/12,triangles:buffer.length/36,length:body.length,width:body.width,height:body.height};}}
 return build0(c);};
function open(k){current=PRODUCTS[k]?k:'bm';opened=true;$('omzLimitedCover')?.classList.add('open');document.body.classList.add('omzLimitedOpen');drawAngle=-.72;render();void refresh(current);}
function close(){opened=false;$('omzLimitedCover')?.classList.remove('open');document.body.classList.remove('omzLimitedOpen');}
function mount(){if($('omzLimitedCover'))return;document.body.insertAdjacentHTML('beforeend',modalMarkup());
 $('omzLimitedClose').onclick=close;$('omzLimitedCover').onclick=e=>{if(e.target===$('omzLimitedCover'))close();};
 $('omzLimitedRefresh').onclick=()=>void refresh(current);$('omzLimitedApply').onclick=apply;
 $('omzLimitedExport').onclick=()=>{const r=getLocal(current).request;if(r)exportJson(r,'尾文字Z_'+PRODUCTS[current].sku+'_'+r.requestId+'.json');};
 $('omzLimitedRedeem').onclick=async()=>{if(await verifyCode(current,$('omzLimitedToken').value)){render();setMessage('所有権を確認しました。限定車体・専用ドレスがゲームに反映されます。');}};
 document.addEventListener('click',e=>{const b=e.target.closest('[data-limited-open]');if(b){e.preventDefault();open(b.dataset.limitedOpen);}});
 $('omzLimitedTabs').onclick=e=>{const b=e.target.closest('[data-limited-switch]');if(b){current=b.dataset.limitedSwitch;drawAngle=-.72;render();void refresh(current);}};
 $('omzLimitedDressCards').onclick=e=>{const b=e.target.closest('[data-limited-preview]');if(b){ui[current].preview=b.dataset.limitedPreview;render();}};
 $('omzLimitedOwner').onclick=e=>{const b=e.target.closest('[data-limited-equip]');if(b)equip(b.dataset.limitedEquip);};
 let x=null;$('omzLimitedCanvas').addEventListener('pointerdown',e=>{x=e.clientX;e.currentTarget.setPointerCapture?.(e.pointerId)});
 $('omzLimitedCanvas').addEventListener('pointermove',e=>{if(x!==null){drawAngle+=(e.clientX-x)*.008;x=e.clientX;drawModel(current,ui[current].preview);}});
 for(const type of ['pointerup','pointercancel'])$('omzLimitedCanvas').addEventListener(type,()=>{x=null});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&opened)close();});
 if(typeof refreshGarageDetail==='function'){const old=refreshGarageDetail;refreshGarageDetail=function(){old();const c=CARS[selected],k=productForCar(c),d=$('garageDetail');if(d&&k){const p=PRODUCTS[k],s=ui[k].stock;const badge=document.createElement('div');badge.className='omzLimitedGarageBadge';badge.innerHTML=`<b>${k==='bm'?'👑':'🌞'} ${esc(p.name)} · 世界限定1台 ${ui[k].verified?'【所有中】':s?.status==='sold'?'【完売】':''}</b><button type="button" data-limited-open="${k}">専用ボディ・ドレスを見る</button>`;d.prepend(badge);}};}
 // Fetch at startup and on focus, but only on user interaction after loading.
 void Promise.all(Object.keys(PRODUCTS).map(k=>refresh(k,true)));
 window.addEventListener('focus',()=>{if(opened)void refresh(current,true)});
}
const publicApi={open,refresh,shopBanner,products:PRODUCTS,getStock:k=>ui[k]?.stock,get verifiedBlackMaria(){return ui.bm.verified},get verifiedYellowBeetle(){return ui.yb.verified}};
window.OMZ_LIMITED=publicApi;window.OMZ_ONEOFONE=publicApi; // compatibility for V43 metal menu
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
})();
