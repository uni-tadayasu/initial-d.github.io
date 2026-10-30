/* 頭文字Dブラウザゲーム : iOS / Android / PC auto-save sync v1.
 * Cloud save requires a self-hosted /save WebSocket endpoint.
 * A TNS-... code is a 128-bit account secret. NEVER include it in a URL.
 * Snapshot writes are compare-and-swap to prevent silent cross-device loss.
 */
(()=>{
'use strict';
const P='tns_cloud_', K={code:P+'code_v1',url:P+'url_v1',rev:P+'rev_v1',dirty:P+'dirty_v1',prior:P+'prior_v1'};
const get=k=>{try{return localStorage.getItem(k)||''}catch(e){return ''}};
const put=(k,v)=>{try{localStorage.setItem(k,String(v))}catch(e){}};
const del=k=>{try{localStorage.removeItem(k)}catch(e){}};
const view=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const state={code:get(K.code),url:get(K.url),rev:get(K.rev)===''?null:Number(get(K.rev)),dirty:get(K.dirty)==='1',busy:false,blocked:false,loading:false,applying:false,serial:0,toast:'',lastSync:0,tempCode:'',tempUrl:'',autoStarted:false,timer:null};
state.tempCode=state.code;state.tempUrl=state.url;
const codeClean=s=>{let x=String(s||'').toUpperCase().replace(/[\s-]/g,'');if(x.startsWith('TNS'))x=x.slice(3);return /^[A-Z2-7]{26}$/.test(x)?x:null};
function niceCode(raw){const x=codeClean(raw);return x?'TNS-'+[x.slice(0,5),x.slice(5,10),x.slice(10,15),x.slice(15,20),x.slice(20)].join('-'):String(raw||'')}
function cloudWs(raw){
 let url=String(raw||'').trim();
 if(!url||url==='auto'){
  const room=String(window.TNS8_RUNTIME_RELAY||window.TNS8_CONFIG?.relayUrl||'').trim();
  if(room && room!=='auto')url=room;
  else if(/^https?:$/.test(location.protocol)&&!(/(?:^|\.)github\.io$/i).test(location.hostname))url=(location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/save';
 }
 if(/^https?:\/\//i.test(url))url=url.replace(/^http/i,'ws');
 if(!/^wss?:\/\/[^\s/]+(?:\/[^\s?#]*)?$/i.test(url))return '';
 try{
  const x=new URL(url);
  if(location.protocol==='https:'&&x.protocol!=='wss:')return '';
  x.pathname='/save';x.search='';x.hash='';
  return x.href;
 }catch(err){return ''}
}
function serverUrl(){return cloudWs(state.url)}
function copyText(txt){
 return navigator.clipboard?.writeText?.(txt).catch(()=>fallback(txt))??Promise.resolve(fallback(txt));
}
function fallback(txt){const e=document.createElement('textarea');e.value=txt;document.body.append(e);e.select();try{document.execCommand('copy')}catch(err){}e.remove()}
function show(msg){state.toast=msg;render();}
function dateStamp(){return new Date().toLocaleString('ja-JP')}
function progressSnapshot(){
 const records={};let num=0;
 for(const [key,value] of Object.entries(bestTimes||{})){
  if(num++>5000)break;
  if(key.length<110&&Number.isFinite(value)&&value>=0&&value<90000)records[key]=value;
 }
 return {schema:1,profile:JSON.parse(JSON.stringify(profile)),bestTimes:records,
  selected:Number.isInteger(selected)?selected:0,savedAt:Date.now()};
}
// Optional metadata is not authoritative: purchases, coins, stats can be changed in the browser.
function applyCloud(data){
 if(!data||data.schema!==1||!data.profile||data.profile.version!==3)throw Error('同期できないセーブ形式です');
 const q=cleanProfile(data.profile);
 state.applying=true;
 try{
  try{put(K.prior,JSON.stringify({schema:1,profile:profile,bestTimes:bestTimes,selected:selected,savedAt:Date.now()}))}catch(e){}
  profile=q;
  const old={};
  if(data.bestTimes&&typeof data.bestTimes==='object')for(const [k,v] of Object.entries(data.bestTimes).slice(0,5000)){
    if(k.length<110&&Number.isFinite(v)&&v>=0&&v<90000)old[k]=v;
  }
  bestTimes=old;
  if(Number.isInteger(data.selected)&&data.selected>=0&&data.selected<CARS.length&&profile.owned.includes(data.selected))selected=data.selected;
  else if(!profile.owned.includes(selected))selected=profile.owned[0]??0;
  try{localStorage.setItem('tns_bests',JSON.stringify(bestTimes));localStorage.setItem('tns_car',String(selected));}catch(e){}
  storeProgress();
  refreshWallet();refreshChosen();
  if(typeof refreshGarageList==='function')refreshGarageList();
  if(typeof refreshGarageDetail==='function')refreshGarageDetail();
  if(typeof renderShop==='function')renderShop();
 }finally{state.applying=false}
}
function localMeaningful(){
 return profile.stats.races>0||profile.stats.wins>0||profile.stats.upgrades>0||profile.owned.length>2||
        profile.coins!==92000||Object.keys(profile.claimedAchievements||{}).length>0||
        Object.keys(profile.achievementTiers||{}).length>0;
}
function statusText(){
 if(!state.code)return '未連携。新しい同期コードを作るか、別端末のコードを入力してください。';
 if(state.blocked)return '⚠ 保存競合：2台で別々に更新されています。下の「クラウド優先」または「この端末優先」を選択してください。';
 if(state.busy)return '☁️ 同期サーバーと通信しています…';
 if(state.dirty)return `● この端末に未送信の変更があります（接続を確認）。同期世代 ${state.rev??'未取得'}`;
 return `✓ 同期有効・世代 ${state.rev??0} ／ 最終確認 ${state.lastSync?new Date(state.lastSync).toLocaleTimeString('ja-JP'):'未確認'}`;
}
function render(){
 const panel=view('tnsCloudSyncPanel'),quick=view('cloudQuickOpen');
 if(quick){quick.textContent=state.code?'☁️ セーブ同期：'+(state.blocked?'競合あり':state.dirty?'送信待ち':'連携中')+' ▶':'☁️ iPhone・Android・PC とセーブを自動同期 ▶'}
 if(!panel)return;
 if(!panel.dataset.ready){
  panel.className='cloudSyncPanel';
  panel.innerHTML=`<h3>端末をまたいで続きからプレイ</h3><p>最初の端末で「新規同期コード発行」→ コードを安全に保管 → 別端末の「コードで連携」。レース・ショップなどでセーブが変わると自動送信し、別端末は起動時・定期的に新しいデータを受け取ります。</p>
   <label>セーブ中継サーバー（空欄なら8人対戦の接続先を利用）<input id="cloudUrl" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="wss://xxxx.trycloudflare.com/save"></label>
   <label>あなた専用の同期コード（他人には教えない）<input id="cloudCode" type="password" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="TNS-XXXXX-XXXXX-XXXXX-XXXXX-XXXXXX"></label>
   <div class="cloudGrid"><button type="button" data-sync="show">👁 コード表示/非表示</button><button type="button" data-sync="copy">📋 同期コードをコピー</button><button class="cloudAccent" type="button" data-sync="create">✨ 新規同期コード発行</button><button class="cloudAccent" type="button" data-sync="connect">🔗 別端末のコードで連携</button><button type="button" data-sync="now">🔄 今すぐ同期</button><button type="button" data-sync="disconnect">🔒 この端末の連携解除</button></div>
   <div class="cloudSyncStatus" id="cloudSyncStatus" role="status"></div>
   <div class="cloudGrid"><button data-sync="pull" type="button">☁️ クラウド優先で復元</button><button data-sync="force" type="button">📱 この端末優先で保存</button><button data-sync="backup" type="button">💾 復元前バックアップ</button><button data-sync="test" type="button">📡 接続テスト</button></div>
   <p class="cloudSyncWarning">⚠ 同期コードはパスワードと同じです。SNSや公開チャットへ送らないでください。自宅PCの中継サーバーが停止中は自動同期できません。データは自宅PCのSQLiteに保存されます。通信には公開環境でWSS（HTTPS）を使用してください。端末を同時に使った場合、コイン・改造を自動合算せず競合を通知します。</p>`;
  const cu=view('cloudUrl'),cc=view('cloudCode');cu.value=state.tempUrl;cc.value=state.tempCode?niceCode(state.tempCode):'';
  cu.addEventListener('input',e=>state.tempUrl=e.target.value);
  cc.addEventListener('input',e=>state.tempCode=e.target.value);
  panel.dataset.ready='1';
 }
 const msg=view('cloudSyncStatus');if(msg)msg.textContent=state.toast||statusText();
 for(const btn of panel.querySelectorAll('button'))btn.disabled=state.busy;
}
function currentUrlFromInputs(){const inp=view('cloudUrl');return cloudWs(inp?inp.value:state.tempUrl)}
function codeFromInput(){const inp=view('cloudCode');return codeClean(inp?inp.value:state.tempCode)}
function saveUrlChoice(){const inp=view('cloudUrl');state.url=(inp?inp.value:state.tempUrl).trim();state.tempUrl=state.url;if(state.url)put(K.url,state.url);else del(K.url)}
function setCode(code){state.code=codeClean(code)||'';state.tempCode=state.code;if(state.code)put(K.code,state.code);else del(K.code);
 const input=view('cloudCode');if(input)input.value=state.code?niceCode(state.code):''}
function markRevision(rev){state.rev=rev;put(K.rev,rev)}
function markDirty(d){state.dirty=d;if(d)put(K.dirty,'1');else del(K.dirty)}
function transact(url,packet){return new Promise((resolve,reject)=>{
 let ws;let complete=false;
 const finish=(err,data)=>{if(complete)return;complete=true;clearTimeout(timer);try{ws?.close()}catch(e){}err?reject(err):resolve(data)};
 const timer=setTimeout(()=>finish(new Error('通信がタイムアウトしました。サーバーの起動とURLを確認してください。')),14000);
 try{ws=new WebSocket(url)}catch(e){finish(e);return}
 ws.onopen=()=>{try{ws.send(JSON.stringify({v:'tns-save-v1',...packet}))}catch(e){finish(e)}};
 ws.onerror=()=>finish(new Error('接続できません。自宅PCサーバーとWSS URLを確認してください。'));
 ws.onclose=()=>{if(!complete)finish(new Error('通信が切断されました。'))};
 ws.onmessage=e=>{let payload;try{payload=JSON.parse(e.data)}catch(err){finish(Error('応答を読み取れません。'));return}
  if(payload.type==='save_error')finish(new Error(payload.message||'同期サーバーのエラー'));
  else finish(null,payload)};
})}
async function fetchCloud(code=state.code){const url=serverUrl();if(!url)throw Error('サーバーURLがありません。GitHubのonline-config.jsか入力欄にWSS URLを設定してください。');return transact(url,{type:'get',code:niceCode(code)})}
async function useCloud(data,force=false){
 if(started&&!force){state.toast='レース終了後にクラウドの変更を反映します。';render();return false}
 if(data?.data){
  if(force||!state.dirty){applyCloud(data.data)}
  else{state.blocked=true;show('⚠ 別端末のセーブとこちらの変更が競合しました。復元するか、現在の端末で上書きするか選んでください。');return false}
 }
 markRevision(data.revision??0);markDirty(false);state.blocked=false;state.lastSync=Date.now();state.toast='✓ クラウドから同期しました（'+dateStamp()+'）';render();return true;
}
async function create(){
 if(!confirm('新しい同期コードを作成します。以前の同期コードがある場合は別アカウントになります。続けますか？'))return;
 saveUrlChoice();const url=serverUrl();if(!url){show('⚠ サーバーURLを設定してください。');return}
 state.busy=true;render();
 try{const r=await transact(url,{type:'create'});if(r.type!=='save_created')throw Error('コード発行に失敗しました。');
  setCode(r.code);markRevision(0);state.blocked=false;markDirty(true);
  await putCloud();
  const i=view('cloudCode');if(i)i.type='text';
  show('✅ 同期コードを発行し、この端末のデータを保存しました。コードを必ず控えてください。');
 }catch(e){show('⚠ '+e.message)}finally{state.busy=false;render()}
}
async function connect(){
 saveUrlChoice();const code=codeFromInput();if(!code){show('⚠ 有効な同期コードを入力してください。');return}
 if(!serverUrl()){show('⚠ サーバーURLがありません。');return}
 state.busy=true;render();
 try{
  const r=await fetchCloud(code);
  if(r.type!=='save_data')throw Error('保存データを取得できません。');
  const switching=code!==state.code;
  if(r.data&&switching&&localMeaningful()&&
     !confirm('この端末の現在の進行状況をクラウド側のセーブで置き換えます。復元前のデータは端末内にバックアップされます。続けますか？'))return;
  if(r.data&&started){show('レース終了後に再度接続してください。');return}
  setCode(code);state.blocked=false;
  if(r.data){state.applying=true;try{applyCloud(r.data)}finally{state.applying=false};markRevision(r.revision);markDirty(false);state.lastSync=Date.now();show('✅ 共通セーブに接続しました。クラウドのデータを取り込みました。')}
  else{markRevision(r.revision??0);markDirty(true);await putCloud();show('✅ 空のクラウドにこの端末のセーブをアップロードしました。')}
 }catch(e){show('⚠ '+e.message)}finally{state.busy=false;render()}
}
async function putCloud(){
 if(!state.code)throw Error('同期コードが未登録です');
 if(state.rev===null){const info=await fetchCloud();markRevision(info.revision);if(info.data){state.blocked=true;throw Error('他端末のデータがあります。まずクラウドから復元してください。')}}
 const payload=progressSnapshot(),encoded=JSON.stringify(payload),generation=state.serial;
 if(encoded.length>220000)throw Error('セーブデータが大きすぎます（最大240KB）。');
 const response=await transact(serverUrl(),{type:'put',code:niceCode(state.code),expectedRevision:state.rev,data:payload});
 if(response.type==='save_conflict'){
  const latest=await fetchCloud();
  if(JSON.stringify({profile:latest.data?.profile,bestTimes:latest.data?.bestTimes,selected:latest.data?.selected})===JSON.stringify({profile:payload.profile,bestTimes:payload.bestTimes,selected:payload.selected})){markRevision(response.revision);markDirty(generation!==state.serial);state.blocked=false;return true}
  state.blocked=true;state.toast='⚠ 別端末の更新が検出されました。クラウド優先／この端末優先を選んでください。';render();return false;
 }
 if(response.type!=='save_saved')throw Error('保存の確認ができませんでした');
 markRevision(response.revision);state.lastSync=Date.now();state.blocked=false;markDirty(generation!==state.serial);state.toast='✅ 保存完了：'+dateStamp();render();if(state.dirty)setTimeout(()=>void now(true),450);return true;
}
async function now(silent=false){
 if(state.busy||!state.code||state.blocked)return;
 const url=serverUrl();if(!url){if(!silent)show('⚠ サーバーURLが未設定です。');return}
 state.busy=true;render();
 try{
  if(state.dirty){await putCloud()}
  else{
   const r=await fetchCloud();if(r.type!=='save_data')throw Error('取得に失敗しました');
   if(state.rev===null){if(r.data){if(!started)await useCloud(r,true)}else{markRevision(r.revision);markDirty(true);await putCloud()}}
   else if(r.revision>state.rev){if(!started)await useCloud(r,true);else{state.toast='別端末に新しいセーブがあります。レース後に同期します。';render()}}
   else{state.lastSync=Date.now();if(!silent)show('✅ 最新の状態です（'+dateStamp()+'）')}
  }
 }catch(e){if(!silent)show('⚠ '+e.message);else{state.toast='☁️ 同期待機中（サーバー接続不可）';render()}}
 finally{state.busy=false;render()}
}
async function restoreCloud(){if(!state.code){show('同期コードを登録してください');return}
 if(!confirm('この端末の未同期データを破棄し、クラウドのセーブで復元しますか？ 復元前のデータはバックアップとして端末内に残ります。'))return;
 state.busy=true;render();try{const r=await fetchCloud();if(!r.data)throw Error('クラウドにデータがありません。');
 if(started)throw Error('レースを終了してから復元してください。');
 state.blocked=false;markDirty(false);await useCloud(r,true);show('✅ クラウドのデータを復元しました。');}
 catch(e){show('⚠ '+e.message)}finally{state.busy=false;render()}}
async function forceUpload(){if(!state.code){show('同期コードを登録してください');return}
 if(!confirm('クラウドにある進行状況を現在の端末で上書きします。別端末の未同期データが失われる可能性があります。本当に続けますか？'))return;
 state.busy=true;render();try{const r=await fetchCloud();markRevision(r.revision);state.blocked=false;markDirty(true);if(await putCloud())show('✅ この端末のデータでクラウドを更新しました。')}
 catch(e){state.blocked=true;show('⚠ '+e.message)}finally{state.busy=false;render()}}
function makeBackup(){const raw=get(K.prior);if(!raw){show('まだ復元前のバックアップはありません。');return}
 const u=URL.createObjectURL(new Blob([raw],{type:'application/json'}));let a=document.createElement('a');a.href=u;a.download='TOUGE_cloud_before_restore_'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);show('復元前のバックアップを保存しました。')}
function disconnect(){if(!state.code)return;if(!confirm('この端末の同期だけ解除しますか？ セーブデータは端末とサーバーに残ります。コードを控えてから解除してください。'))return;
 setCode('');state.rev=null;del(K.rev);markDirty(false);state.blocked=false;show('この端末の同期を解除しました。ローカルセーブはそのままです。')}
async function test(){saveUrlChoice();const url=serverUrl();if(!url){show('⚠ 有効なWSS URLを入力してください。');return}
 state.busy=true;render();try{const r=await transact(url,{type:'ping'});if(r.type!=='save_pong')throw Error('同期機能のないサーバーです。新しいサーバーZIPを使ってください。');show('✅ 中継サーバーのセーブ機能に接続成功しました。')}
 catch(e){show('⚠ '+e.message)}finally{state.busy=false;render()}}
function changed(){if(state.applying||!state.code)return;state.serial++;markDirty(true);render();clearTimeout(state.timer);state.timer=setTimeout(()=>void now(true),1700)}
function boot(){const button=view('cloudQuickOpen');if(button)button.addEventListener('click',()=>openShop('profile'));
 document.addEventListener('click',async e=>{
  const btn=e.target.closest('[data-sync]');if(!btn)return;
  const a=btn.dataset.sync;
  if(a==='show'){const c=view('cloudCode');if(c)c.type=c.type==='password'?'text':'password';return}
  if(a==='copy'){const c=codeFromInput();if(c){await copyText(niceCode(c));show('同期コードをコピーしました。第三者に公開しないでください。')}else show('先に同期コードを発行してください。');return}
  if(a==='create')await create();else if(a==='connect')await connect();else if(a==='now')await now();else if(a==='pull')await restoreCloud();else if(a==='force')await forceUpload();else if(a==='backup')makeBackup();else if(a==='disconnect')disconnect();else if(a==='test')await test();
 });
 if(state.code){
  // Never overwrite locally edited offline progress. Server revision persists across restarts.
  state.autoStarted=true;
  setTimeout(()=>void now(true),900);
 }
 setInterval(()=>{if(state.code&&!state.busy&&!document.hidden&&!started)void now(true)},30000);
 window.addEventListener('online',()=>{if(state.code)setTimeout(()=>void now(true),1100)});
 window.addEventListener('focus',()=>{if(state.code&&!started)setTimeout(()=>void now(true),500)});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&state.code&&!started)void now(true)});
 render();
}
window.TNS_SAVE={render,changed,now,cloudWs,get state(){return {codeLinked:!!state.code,revision:state.rev,dirty:state.dirty,blocked:state.blocked,url:serverUrl()}},
 // Test hooks, do not include secret in diagnostic output.
 get localData(){return progressSnapshot()}};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
