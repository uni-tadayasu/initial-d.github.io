/* TOUGE Friends — mutual approvals, presence and room invitations.
   Authentication uses a private token per browser; friend codes are public. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const KEY='tns_friends_identity_v1',ESC=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let identity=null,ws=null,server='',state={friends:[],incoming:[],invites:[]},retries=0,timer=0,active=true;
try{identity=JSON.parse(localStorage.getItem(KEY)||'null')}catch{}
const base=()=>window.TNS8?.serverUrl?.()||window.TNS8?.room?.url||'';
function source(){const url=base();if(!url)return '';return url.replace(/\/ws(?:\?.*)?$/,'/friends').replace(/\/$/,'/friends')}
function status(s){const e=$('tfState');if(e)e.textContent=s}
function send(type,payload={}){if(ws?.readyState===WebSocket.OPEN){ws.send(JSON.stringify({type,...payload}));return true}return false}
function draw(){if(!$('tfFriendCode'))return;
 $('tfFriendCode').textContent=identity?.id||'未登録';
 $('tfFriends').innerHTML=state.friends.map(f=>`<div class="tfRow"><div><b>${ESC(f.name)}</b><small>${ESC(f.id)} · ${f.online?'🟢 オンライン':'⚪ オフライン'}</small></div><div><button data-action="invite" data-id="${ESC(f.id)}">招待</button><button data-action="remove" data-id="${ESC(f.id)}" class="tfMinor">削除</button></div></div>`).join('')||'<small>フレンド未登録です。コードで申請できます。</small>';
 $('tfRequests').innerHTML=state.incoming.map(f=>`<div class="tfRow"><span>${ESC(f.name)} <small>(${ESC(f.id)})</small></span><div><button data-action="accept" data-id="${ESC(f.id)}">承認</button><button data-action="decline" data-id="${ESC(f.id)}" class="tfMinor">拒否</button></div></div>`).join('')||'<small>保留中の申請はありません。</small>';
 $('tfInvites').innerHTML=state.invites.map(f=>`<div class="tfRow"><span>${ESC(f.name)} から部屋 <b>${ESC(f.room)}</b></span><div><button data-action="join" data-room="${ESC(f.room)}">参加</button><button data-action="dismiss" data-id="${ESC(f.id)}" class="tfMinor">閉じる</button></div></div>`).join('')||'<small>招待はありません。</small>';
}
function connect(){const dest=source();if(!dest){status('サーバーのWSS URLが必要です。オンライン設定を確認してください。');return}
 if(ws&&ws.readyState<=1&&server===dest)return;
 if(ws){try{ws.close()}catch{}}server=dest;
 const current=new WebSocket(dest);ws=current;status('フレンド通信に接続しています…');
 current.onopen=()=>{if(ws!==current)return;retries=0;status('サーバー接続中');
  const n=($('tns8Name')?.value||'DRIVER').trim().slice(0,18);
  send('friend_hello',{id:identity?.id,token:identity?.token,name:n});};
 current.onmessage=e=>{if(ws!==current)return;let d;try{d=JSON.parse(e.data)}catch{return}
  if(d.type==='friend_identity'){
   identity={id:d.id,token:d.token};try{localStorage.setItem(KEY,JSON.stringify(identity))}catch{}
   status('フレンドオンライン接続完了');draw();
  }else if(d.type==='friends_snapshot'){
   state={friends:d.friends||[],incoming:d.incoming||[],invites:d.invites||[]};draw();
  }else if(d.type==='friends_error')status('⚠ '+d.message);
  else if(d.type==='friends_notice')status(d.message)
 };
 current.onerror=()=>status('フレンド通信に接続できません。URL/サーバー起動状況を確認してください。');
 current.onclose=()=>{if(ws!==current)return;ws=null;status('フレンド通信切断（再接続中）');retries++;clearTimeout(timer);if(active)timer=setTimeout(connect,Math.min(20000,900*Math.pow(1.6,retries)))};
}
async function copy(str){try{await navigator.clipboard.writeText(str);status('コピーしました')}catch{const ta=document.createElement('textarea');ta.value=str;document.body.append(ta);ta.select();document.execCommand('copy');ta.remove();status('コピーしました')}}
function doJoin(room){if(!window.TNS8)return;
 const m=window.TNS8.room;if(m.active)window.TNS8.leave();
 $('easyRoomCode').value=room;
 if(typeof quickPickMode==='function')quickPickMode('online');
 if(typeof openModal==='function')openModal('onlineModal');
 window.TNS8.connect('join');status(`部屋 ${room} に参加しています…`);
}
function init(){const wrap=$('roomEasyBox');if(!wrap)return;
 const box=document.createElement('section');box.className='tfPanel';box.innerHTML=`<details id="tfDetails"><summary>👥 フレンド / 招待 <small>フレンドコードで登録・オンライン確認</small></summary>
 <div class="tfBody"><div class="tfInfo">あなたのフレンドコード <b id="tfFriendCode">接続待ち</b> <button id="tfCopy">コピー</button></div>
 <div class="tfInput"><input id="tfTarget" aria-label="フレンドコード" placeholder="例：F-XXXXXXXXXX" maxlength="12"><button id="tfRequest">フレンド申請</button></div>
 <p class="tfState" id="tfState">接続先を確認しています…</p><h4>フレンド一覧</h4><div id="tfFriends"></div>
 <h4>承認待ち</h4><div id="tfRequests"></div><h4>部屋への招待</h4><div id="tfInvites"></div>
 <details><summary>端末変更・引き継ぎ</summary><p>秘密の引き継ぎキーは第三者に送らないでください。iPhoneとPCで同じフレンドを利用する場合だけ使います。</p>
 <button id="tfExport">秘密の引き継ぎキーをコピー</button><div class="tfInput"><input id="tfImport" placeholder="F-...|秘密キー" aria-label="フレンド引き継ぎキー"><button id="tfApply">引き継ぐ</button></div></details>
 </div></details>`;
 const start=$('roomStartRace');if(start)wrap.insertBefore(box,start);else wrap.append(box);
 const style=document.createElement('style');style.textContent=`.tfPanel{color:#dfecf4;border-radius:12px;padding:12px;background:rgba(18,36,52,.9);border:1px solid #95cbdf55;margin:12px 0}.tfPanel summary{cursor:pointer;font-size:13px;font-weight:900;user-select:none}.tfPanel summary small{display:block;color:#9db5c4;font-size:10px;font-weight:400}.tfBody{padding:12px 0 0}.tfBody h4{margin:12px 0 6px;font-size:12px;color:#e0b77b}.tfInfo{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:12px}.tfInfo b{user-select:text;font-family:monospace;color:#a6f6d7}.tfInput{display:flex;gap:6px;margin-top:9px}.tfInput input{flex:1;min-width:0;color:white;border-radius:6px;padding:10px;background:#0b1c2a;border:1px solid #ffffff4d}.tfPanel button{background:#36596a;color:#fff;border:1px solid #b2cadc45;padding:7px 9px;border-radius:6px;font-size:11px;cursor:pointer;touch-action:manipulation}.tfPanel button:active{background:#54819b}.tfPanel .tfMinor{background:#2b3441}.tfState{font-size:11px;color:#a9cdda;margin:9px 0}.tfRow{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 3px;border-bottom:1px solid #ffffff18;font-size:11px}.tfRow small{display:block;color:#a3b6c7;font-size:10px}.tfRow>div:last-child{display:flex;gap:5px}.tfBody>div>small{color:#9baab8;font-size:11px}.tfBody details p{font-size:11px;color:#f5d19c;line-height:1.6}`;document.head.append(style);
 $('tfCopy').onclick=()=>identity?.id?copy(identity.id):status('接続後にコードが発行されます');
 $('tfRequest').onclick=()=>{const target=$('tfTarget').value.toUpperCase().trim();if(!/^F-[A-HJ-NP-Z2-9]{10}$/.test(target))return status('F-で始まるフレンドコードを入力してください');send('friend_request',{target})||connect()};
 $('tfExport').onclick=()=>{if(identity?.token)copy(identity.id+'|'+identity.token)};
 $('tfApply').onclick=()=>{const raw=$('tfImport').value.trim(),parts=raw.split('|');if(parts.length!==2||!/^F-[A-HJ-NP-Z2-9]{10}$/.test(parts[0]))return status('引き継ぎキーの形式が違います');
  if(!confirm('現在のフレンドIDが置き換わります。よろしいですか？'))return;
  identity={id:parts[0],token:parts[1]};localStorage.setItem(KEY,JSON.stringify(identity));if(ws)ws.close();ws=null;connect()};
 box.addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!b)return;const a=b.dataset.action,t=b.dataset.id;
  if(a==='accept'||a==='decline')send(a==='accept'?'friend_accept':'friend_decline',{target:t});
  if(a==='remove'&&confirm('このフレンドを削除しますか？'))send('friend_remove',{target:t});
  if(a==='dismiss')send('friend_dismiss_invite',{target:t});
  if(a==='join')doJoin(b.dataset.room);
  if(a==='invite'){
   const room=window.TNS8?.room;
   if(!room?.joined||room.phase!=='lobby')return status('ロビーに入室してから招待してください');
   send('friend_invite',{target:t,room:room.code});status('フレンドへ招待しました');
  }
 });
 $('tfDetails').addEventListener('toggle',()=>{if($('tfDetails').open)connect()});
 // Proactively connect, so friends can see presence even while in title screen.
 setTimeout(connect,350);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(!ws||ws.readyState!==1))connect()});
 draw();
}
window.TNS_FRIENDS={connect,identity:()=>identity,invite:(friendId)=>send('friend_invite',{target:friendId,room:window.TNS8?.room?.code||''})};
init();
})();
