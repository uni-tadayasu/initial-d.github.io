/* 頭文字Dブラウザゲーム — 8人オンライン・ロビー / 同時レース v12
 * GitHub Pagesでは online-config.js と同じディレクトリに配置。
 * 自宅サーバーでゲームを直接配信するときは同一ホストの /ws を自動利用。
 */
(()=>{
'use strict';
const PROTOCOL='tns-room-8-v1',MAX=8, $id=id=>document.getElementById(id);
const room={ws:null,code:'',id:'',token:'',owner:'',members:[],phase:'offline',run:null,
 active:false,joined:false,action:null,autoReconnect:true,retries:0,timer:null,ping:null,
 url:'',clockOffset:0,lastState:0,lastSelect:'',racers:new Map(),sessionRacers:[],lastError:'',gen:0};
function limit(n,min,max){n=Number(n);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):min}
function codeText(v){return String(v||'').toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,'').slice(0,8)}
function hasWs(){return room.ws&&room.ws.readyState===WebSocket.OPEN}
function wsUrl(){
 let x=String(window.TNS8_RUNTIME_RELAY||window.TNS8_CONFIG?.relayUrl||'').trim();
 if(x==='auto'&&/^https?:$/.test(location.protocol))x=(location.protocol==='https:'?'wss:':'ws:')+'//'+location.host+'/ws';
 if(!x)return '';
 if(/^https:\/\//.test(x))x='wss://'+x.substring(8);
 if(/^http:\/\//.test(x))x='ws://'+x.substring(7);
 if(!/^wss?:\/\/[^/\s]+(?:\/[^\s]*)?$/i.test(x))return '';
 if(/^ws:\/\//i.test(x)&&location.protocol==='https:')return '';
 return x;
}
function say(t,warning=false){room.lastError=warning?String(t):'';const el=$id('easyRoomStatus');if(el)el.textContent=t;
 const stat=$id('rtcStatus');if(stat)stat.textContent=t;
 renderLobby();}
function send(type,fields={}){if(!hasWs())return false;try{room.ws.send(JSON.stringify({v:PROTOCOL,type,...fields}));return true}catch(e){return false}}
function visibleMembers(){return room.members.filter(m=>m.connected)}
function mine(){return room.members.find(m=>m.id===room.id)}
function isHost(){return room.id&&room.owner===room.id}
function safeText(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function renderLobby(){
 const n=visibleMembers().length,connected=room.joined&&hasWs();
 const label=$id('roomLinkState');if(label)label.textContent=room.joined?`● ${room.code} ／ ${n} / ${MAX}人 ／ ${room.phase==='running'?'レース中':'ロビー'}`:room.active?'● 接続中 / 再接続中':'● 未接続';
 const cap=$id('tns8Count');if(cap)cap.textContent=`参加者 ${n} / 8人`;
 const lst=$id('tns8List');if(lst){
  lst.innerHTML=room.members.map((m,i)=>`<div class="tns8Driver ${m.id===room.id?'self':''}"><b>${i+1}. ${safeText(m.name)} ${m.id===room.owner?'👑':''}${m.id===room.id?'（自分）':''}</b><small>${m.connected?'● 接続中':'○ 再接続待ち'}　${m.car>=0?'CAR '+(m.car+1):''}${m.finished?' 🏁':''}</small></div>`).join('')||'<div class="tns8Empty">部屋作成または参加で、ここにプレイヤーが表示されます。</div>';
 }
 const st=$id('roomStartRace');if(st){st.disabled=!(connected&&isHost()&&n>=2&&room.phase==='lobby');st.textContent=room.phase==='running'?'🏁 レース進行中':!connected?'▶ 接続してください':!isHost()?'▶ ホストの開始を待機':n<2?'▶ 2人以上で開始できます':`▶ ${n}人で一斉レース開始`;}
 const reset=$id('tns8Again');if(reset){reset.disabled=!(connected&&isHost()&&room.phase==='running');reset.hidden=room.phase!=='running'}
 const create=$id('roomCreate'),join=$id('roomJoin'),leave=$id('roomLeave'),copy=$id('roomCopy'),share=$id('roomShare');
 if(create)create.disabled=room.active;if(join)join.disabled=room.active;
 if(leave)leave.disabled=!room.active;
 if(copy)copy.disabled=!room.code;
 if(share)share.disabled=!room.code||!/^https?:$/.test(location.protocol);
 const pill=$id('connectionPill');if(pill)pill.innerHTML=connected?`● <span>ONLINE ${n}/8</span>`:'● <span>OFFLINE READY</span>';
 if(typeof online!=='undefined'){
  online.connected=connected&&n>=2;online.role=isHost()?'host':'guest';
 }
}
async function copyText(t){try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(t);return}}catch(e){}fallbackCopy(t)}
function fallbackCopy(t){const a=document.createElement('textarea');a.value=t;document.body.append(a);a.select();try{document.execCommand('copy')}catch(e){}a.remove()}
function relayIssue(){return '中継URLが未設定です。GitHubの online-config.js の relayUrl に、ご自身の WSS サーバーURLを設定してください。'}
function connect(action){
 if(room.active)return;
 const url=wsUrl();if(!url){say(relayIssue(),true);return}
 let roomCode=codeText($id('easyRoomCode')?.value||'');
 if(action==='join'&&roomCode.length!==8){say('8文字の部屋コードを入力してください。',true);return}
 let nick=String($id('tns8Name')?.value||'DRIVER').trim().slice(0,18)||'DRIVER';
 try{localStorage.setItem('tns8_nickname',nick)}catch(e){}
 room.active=true;room.joined=false;room.url=url;room.code=action==='join'?roomCode:'';
 room.action=action;room.id='';room.token='';room.owner='';room.members=[];room.phase='connecting';room.retries=0;room.gen++;
 renderLobby();openSocket(false);
}
function openSocket(reconnect){
 if(!room.active)return;const gen=room.gen;
 let ws;
 try{ws=new WebSocket(room.url)}catch(err){say('中継サーバーに接続できません：'+err.message,true);retry();return}
 room.ws=ws;const timeout=setTimeout(()=>{if(ws.readyState!==1)ws.close()},11000);
 say(reconnect?'通信を再接続しています…':'部屋サーバーに接続しています…');
 ws.onopen=()=>{clearTimeout(timeout);if(gen!==room.gen){ws.close();return}
  room.retries=0;
  if(reconnect&&room.id&&room.token)send('resume',{room:room.code,you:room.id,token:room.token});
  else if(room.action==='create')send('create',{name:name(),car:carIndex()});
  else send('join',{room:room.code,name:name(),car:carIndex()});
  clearInterval(room.ping);room.ping=setInterval(()=>{send('ping');updateSelection()},10000);
 };
 ws.onmessage=event=>{if(gen!==room.gen)return;let d;try{d=JSON.parse(event.data)}catch(e){return}onPacket(d)};
 ws.onerror=()=>{if(gen===room.gen&&ws.readyState!==1)say('中継接続エラー：通信サーバーURLと起動状況を確認してください。',true)};
 ws.onclose=()=>{clearTimeout(timeout);if(gen!==room.gen||room.ws!==ws)return;
  room.ws=null;room.joined=false;clearInterval(room.ping);room.ping=null;
  if(!room.active)return;renderLobby();retry();};
}
function name(){return String($id('tns8Name')?.value||'DRIVER').trim().slice(0,18)||'DRIVER'}
function carIndex(){return typeof selected==='number'?selected:0}
function updateSelection(){if(!room.joined)return;
 const value=name()+'|'+carIndex();if(room.lastSelect===value)return;
 room.lastSelect=value;send('select',{name:name(),car:carIndex()});}
function retry(){if(!room.active)return;
 if(room.retries>=12){say('接続に失敗しました。サーバー起動と online-config.js のURLを確認し、「再接続」を押してください。',true);return}
 let wait=Math.min(15000,700*Math.pow(1.65,room.retries++));
 clearTimeout(room.timer);room.timer=setTimeout(()=>openSocket(true),wait);
 say(`通信が切断されました。${(wait/1000).toFixed(1)}秒後に自動再接続します（${room.retries}回目）。`,true);
}
function manualRetry(){if(!room.active){say('先に部屋を作成・参加してください。');return}
 clearTimeout(room.timer);room.timer=null;room.retries=0;
 if(room.ws){try{room.ws.close()}catch(e){}}
 room.ws=null;openSocket(true);
}
function leave(){
 room.gen++;room.active=false;clearTimeout(room.timer);clearInterval(room.ping);
 const ws=room.ws;if(ws?.readyState===1){send('leave');try{ws.close(1000,'Leaving room')}catch(e){}}
 else if(ws){try{ws.close()}catch(e){}}
 room.ws=null;room.joined=false;room.id='';room.token='';room.code='';room.owner='';room.members=[];room.racers.clear();room.sessionRacers=[];room.phase='offline';room.lastSelect='';
 if(typeof online!=='undefined')online.connected=false;
 renderLobby();say('部屋から退出しました。');
}
function onPacket(d){if(!d||typeof d!=='object')return;
 if(d.type==='error'){
  say('⚠ '+(d.message||d.code||'エラー'),true);
  if(['room_full','room_not_found','invalid_code','race_running','resume_denied','already_joined'].includes(d.code)){
   if(d.code==='resume_denied'){
    room.id='';room.token='';room.joined=false;
    room.action='join';send('join',{room:room.code,name:name(),car:carIndex()});
   }else if(d.code!=='already_joined'){
    room.gen++;room.active=false;room.joined=false;
    try{room.ws?.close()}catch(e){}room.ws=null;clearTimeout(room.timer);clearInterval(room.ping);renderLobby();
   }
  }
  return;
 }
 if(d.type==='welcome'){
  room.code=codeText(d.room);room.id=String(d.you||'');room.token=String(d.token||'');
  room.owner=String(d.owner||'');room.phase=d.phase||'lobby';room.run=d.run||null;
  room.joined=true;room.clockOffset=Number(d.serverTime||Date.now())-Date.now();
  $id('easyRoomCode').value=room.code;room.lastSelect=name()+'|'+carIndex();
  say(`✅ ${room.code} に接続しました。友達を招待してください。`);
  return;
 }
 if(d.type==='lobby'){
  if(d.room!==room.code)return;
  room.members=Array.isArray(d.members)?d.members.slice(0,8):[];
  room.owner=String(d.owner||'');room.phase=d.phase||room.phase;
  room.run=d.run||room.run;room.joined=true;
  renderLobby();
  if(!room.members.find(x=>x.id===room.id)){say('部屋への参加情報が失われました。再参加してください。',true);return}
  if(room.phase==='lobby'){
   say(`✅ ${room.code}　${visibleMembers().length}/8人。${isHost()?'ホストとして開始できます。':'ホストがレースを開始するまでお待ちください。'}`);
  }else if(room.phase==='running')say(`🏁 ${room.code}　${visibleMembers().length}/8人でレース中。`);
  return;
 }
 if(d.type==='pong'){if(Number.isFinite(d.serverTime))room.clockOffset=d.serverTime-Date.now();return}
 if(d.type==='race_start'){
  if(!room.joined||room.run?.runId===d.runId&&room.phase==='running'&&typeof started!=='undefined'&&started)return;
  room.run=d;room.phase='running';
  room.racers.clear();room.sessionRacers=room.members.map(x=>({...x}));
  if(typeof quickPickMode==='function')quickPickMode('online');
  try{
   startRace(true,{course:d.course,weather:d.weather});
   // Two-column starting grid prevents overlapping vehicles at the starting line.
   // Grid position is assigned by server-reported lobby order.
   const slot=Math.max(0,room.members.findIndex(m=>m.id===room.id));
   const row=Math.floor(slot/2);
   if(typeof player!=='undefined'&&typeof course!=='undefined'){
     player.lane=(slot%2?1:-1)*Math.min(1.3,course.roadWidth*.22);
     player.s=Math.max(0,(Math.ceil(room.members.length/2)-1-row)*5.5);
   }
   if(typeof countdown!=='undefined')countdown=limit((Number(d.startsAt)-(Date.now()+room.clockOffset))/1000,1.4,10);
   const el=$id('hudMode');if(el)el.textContent=`ONLINE 8P / ${room.members.length} RACERS`;
  }catch(e){say('レース画面の開始エラー：'+e.message,true)}
  renderLobby();return;
 }
 if(d.type==='state'){
  if(d.id===room.id)return;
  const m=room.members.find(x=>x.id===d.id);if(!m)return;
  room.racers.set(d.id,{id:d.id,name:m.name,car:limit(d.car,0,1000),s:limit(d.s,0,100000),lane:limit(d.lane,-30,30),speed:limit(d.speed,0,170),stamp:performance.now(),finished:false,time:null});
  return;
 }
 if(d.type==='finished'){
  const p=room.racers.get(d.id);if(p){p.finished=true;p.time=limit(d.time,0,86400)}
  if(d.id!==room.id&&typeof notify==='function')notify('ほかのプレイヤーがゴールしました！',1200);
  return;
 }
 if(d.type==='lobby_reset'){
  room.phase='lobby';room.run=null;room.racers.clear();room.sessionRacers=[];
  if(typeof started!=='undefined'&&started&&typeof quitRace==='function')quitRace();
  say('次のレースを準備できます。ホストが再スタートしてください。');renderLobby();
 }
}
function requestStart(){if(!room.joined||!isHost()){say('レースは部屋のホストが開始してください。',true);return}
 if(room.phase!=='lobby'){say('レース中です。次のレースはロビーに戻して開始してください。');return}
 if(visibleMembers().length<2){say('2人以上が参加するとレースを始められます。');return}
 if(typeof course!=='undefined'&&course.imported){say('オンラインでは標準コースを選択してください。',true);return}
 send('start',{course:typeof courseIndex==='number'?courseIndex:0,weather:typeof weather==='string'?weather:'dusk'});
 say('全プレイヤーのレース開始を準備しています…');
}
function rivals(){if(!room.joined||room.phase!=='running')return [];
 const now=performance.now();return Array.from(room.racers.values())
  .filter(x=>x.id!==room.id&&x.stamp&&now-x.stamp<7000)
  .map(x=>({...x,car:Math.floor(limit(x.car,0,typeof CARS==='undefined'?200:CARS.length-1))}));
}
function standings(){if(!room.joined||room.phase!=='running')return [];
 const now=performance.now();return room.sessionRacers.filter(x=>x.id!==room.id).map(x=>{
  const live=room.racers.get(x.id);
  return {id:x.id,name:x.name||'RIVAL',car:live?.car??x.car,
   s:live&&now-live.stamp<7000?live.s:0,
   finished:!!live?.finished,time:live?.time??Infinity};
 });
}
function submitGame(o){if(!room.joined||!hasWs())return false;
 if(o.type==='state'){
  if(room.phase!=='running')return false;
  const now=performance.now();if(now-room.lastState<95)return false;
  room.lastState=now;return send('state',{data:{s:o.s,lane:o.lane,speed:o.speed}});
 }
 if(o.type==='finish')return send('finish',{time:o.time});
 if(o.type==='start'){requestStart();return true}
 return false;
}
function setupUI(){
 const box=$id('roomEasyBox');if(!box)return;
 const instructions=box.querySelector('p');if(instructions)instructions.textContent='① 部屋を作る → ② コードか招待リンクを友達へ送る → ③ 2〜8人が集まったらホストが開始。追加の手動WebRTC設定は不要です。';
 const row=box.querySelector('.roomEasyRow');
 const nameRow=document.createElement('label');nameRow.className='tns8NameRow';nameRow.innerHTML='<span>ドライバー名</span><input id="tns8Name" maxlength="18" placeholder="DRIVER" autocomplete="nickname" aria-label="ドライバー名">';
 if(row)box.insertBefore(nameRow,row);
 try{$id('tns8Name').value=localStorage.getItem('tns8_nickname')||'DRIVER'}catch(e){$id('tns8Name').value='DRIVER'}
 const extra=document.createElement('section');extra.className='tns8Lobby';
 extra.innerHTML='<div class="tns8Header"><b>🏁 最大8人オンライン対戦</b><strong id="tns8Count">参加者 0 / 8人</strong></div><div id="tns8List" class="tns8List"></div><div class="tns8Actions"><button type="button" id="tns8Retry">🔄 再接続</button><button type="button" id="tns8Again" hidden>↶ 次のレース（ホスト）</button></div><small>GitHub Pagesの画面は無料公開できますが、8人用の通信サーバーは自宅PCまたは外部WSSサーバーが必要です。</small>';
 const start=$id('roomStartRace');if(start)box.insertBefore(extra,start);else box.append(extra);
 const style=document.createElement('style');style.textContent=`
.tns8NameRow{display:flex;gap:9px;align-items:center;color:#c5d2dd;font-size:11px;margin:10px 0}.tns8NameRow input{background:#0a1526;border:1px solid #ffffff50;border-radius:8px;padding:10px;color:white;flex:1;min-width:0}
.tns8Lobby{border:1px solid #80d8e04a;background:#0a1927bd;border-radius:12px;padding:12px;margin:11px 0}.tns8Header{display:flex;justify-content:space-between;gap:5px;flex-wrap:wrap;color:#fff;font-size:12px}.tns8Header strong{color:#8cead8}.tns8List{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;margin:11px 0}.tns8Driver{border:1px solid #ffffff22;border-radius:8px;padding:8px;background:#ffffff0b;min-width:0}.tns8Driver.self{border-color:#83ecd18a}.tns8Driver b{display:block;font-size:10px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.tns8Driver small{display:block;color:#a6b5c6;font-size:9px;margin-top:4px}.tns8Empty{grid-column:1/-1;font-size:11px;color:#9cabb9;padding:9px}.tns8Actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}.tns8Actions button{border:1px solid #ffffff35;border-radius:6px;background:#233a4e;color:#e5f0fa;padding:8px;font-size:11px;cursor:pointer}.tns8Actions button:disabled{opacity:.4}.tns8Lobby>small{font-size:10px;color:#9fb0bf;line-height:1.7;display:block}
@media(max-width:500px){.tns8Lobby{padding:8px}.tns8List{gap:4px}.tns8Driver{padding:7px}.tns8Driver b{font-size:9px}}
 `;document.head.append(style);
 $id('roomCreate').onclick=()=>connect('create');$id('roomJoin').onclick=()=>connect('join');
 $id('roomLeave').onclick=leave;$id('roomStartRace').onclick=requestStart;
 $id('tns8Retry').onclick=manualRetry;
 $id('tns8Again').onclick=()=>{if(isHost()&&room.phase==='running')send('back_to_lobby')};
 $id('roomCopy').onclick=async()=>{const c=room.code||codeText($id('easyRoomCode').value);if(!c)return say('先に部屋を作成してください');await copyText(c);say('部屋コードをコピーしました：'+c)};
 $id('roomShare').onclick=async()=>{if(!room.code)return say('先に部屋を作成してください');const u=new URL(location.href);u.searchParams.set('room',room.code);if(room.url)u.searchParams.set('relay',room.url);await copyText(u.toString());say('招待リンクをコピーしました。友達が開くと中継URL・部屋コードが自動設定されます。')};
 $id('easyRoomCode').addEventListener('input',e=>e.target.value=codeText(e.target.value));
 // Runtime URL override: host pastes the temporary WSS URL once, share link then
 // includes it. Friends need no GitHub update and need not paste any relay URL.
 let qRelay='';try{qRelay=new URLSearchParams(location.search).get('relay')||''}catch(e){}
 let saved='';try{saved=localStorage.getItem('tns8_relay_override')||''}catch(e){}
 const configUrl=String(window.TNS8_CONFIG?.relayUrl||'').trim();
 window.TNS8_RUNTIME_RELAY=qRelay||((configUrl&&configUrl!=='auto')?configUrl:saved)||'';
 if(configUrl==='auto'&&!qRelay)window.TNS8_RUNTIME_RELAY='auto';
 const legacy=$id('easyRoomRelay');if(legacy){
  legacy.value=wsUrl()||'';legacy.readOnly=false;
  legacy.placeholder='wss://xxxx.trycloudflare.com/ws';
  legacy.setAttribute('aria-label','中継サーバーのWSS URL（ホストだけ設定）');
  legacy.addEventListener('change',()=>{
    const raw=legacy.value.trim();window.TNS8_RUNTIME_RELAY=raw;
    const valid=wsUrl();
    if(!valid){say('WSS URLを入力してください（例：wss://xxxx.trycloudflare.com/ws）。',true);return}
    legacy.value=valid;try{localStorage.setItem('tns8_relay_override',valid)}catch(e){}
    say('中継URLを保存しました。部屋を作成してください。');
  });
 }
 const settings=box.querySelector('.roomServerOpts');if(settings){
  settings.querySelector('summary').textContent='通信サーバーURLを設定（最初のホストのみ）';
  const info=document.createElement('p');info.textContent='自宅PCのBATに表示される wss://.../ws を上の欄に貼ってください。共有リンクにはURLが自動で入り、友達の設定は不要です。';settings.append(info);
 }
 const manual=box.parentElement?.querySelector('.roomManualLabel');
 if(manual){const legacyWrap=document.createElement('details');legacyWrap.className='tns8Legacy';
  const summary=document.createElement('summary');summary.textContent='旧方式：2人手動WebRTC接続（予備）';legacyWrap.append(summary);
  manual.parentNode.insertBefore(legacyWrap,manual);
  let node=manual;
  while(node&&!(node.matches&&node.matches('button[data-close="onlineModal"]'))){const next=node.nextElementSibling;legacyWrap.append(node);node=next}
 }
 renderLobby();
 let invited='';try{invited=codeText(new URLSearchParams(location.search).get('room'))}catch(e){}
 if(invited.length===8){$id('easyRoomCode').value=invited;
  if(wsUrl())setTimeout(()=>{if(!room.active)connect('join')},700);
  else say('招待コードを読み込みました。GitHubの online-config.js にサーバーURLを設定してください。',true);
 }
}
// Hook the legacy game's sendRTC; online 8 mode uses relay-only multi-peer transport.
if(typeof sendRTC==='function'){
 const originalSend=sendRTC;
 sendRTC=function(message){if(room.active)return submitGame(message);return originalSend(message)};
}
// A host initiating a race from the title screen must request the server start,
// never launch locally before other 7 clients receive the same race_start packet.
if(typeof startRace==='function'){
 const originalStart=startRace;
 startRace=function(fromHost=false,data=null){
  if(room.active&&!fromHost){requestStart();return}
  return originalStart(fromHost,data);
 };
}
window.TNS8={active:()=>room.active,joined:()=>room.joined,requestStart,send:submitGame,rivals,standings,
 room,connect,leave,retry:manualRetry,getRemoteCount:()=>visibleMembers().length};
setupUI();
})();
