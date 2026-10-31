/* TOUGE RIVAL AI — solo + host-authoritative online CPU, no external libraries */
(()=>{
'use strict';
const DIFF={rookie:{label:'入門・強化',pace:.94,brake:.77,react:.80,line:.66},normal:{label:'標準・強化',pace:1.04,brake:.91,react:1.0,line:.86},pro:{label:'上級・極速',pace:1.14,brake:1.03,react:1.20,line:1.02},legend:{label:'伝説・超攻撃',pace:1.23,brake:1.13,react:1.38,line:1.12},ultimate:{label:'鬼神・最高峰',pace:1.32,brake:1.26,react:1.53,line:1.21}};
const cap=(x,a,b)=>Math.min(b,Math.max(a,x));
const mix=(a,b,t)=>a+(b-a)*cap(t,0,1);
const stableHash=s=>{let h=2166136261;for(const c of String(s)){h=Math.imul(h^c.charCodeAt(0),16777619)}return h>>>0};
const CANON=[0,3,7,12,13,18,21,23,33,49,59,63,76,85,94,105,117,136];
function makeBots(number,settings={}){
 const count=cap(Number(number)||0,0,7)|0;
 const key=settings.runId||`solo-${typeof courseIndex!=='undefined'?courseIndex:0}`;
 const nonce=stableHash(key);
 const width=(typeof course!=='undefined'?course.roadWidth:7.8);
 return Array.from({length:count},(_,i)=>{
  const h=stableHash(`${nonce}:${i}`);
  const car=CANON[(h+i*3)%CANON.length]%CARS.length;
  const row=Math.floor((i+1)/2),dir=(i%2)?1:-1;
  return {botId:`CPU-${i+1}`,name:`CPU ${String(i+1).padStart(2,'0')}`,
    car,s:Math.max(0,(count-i-1)*2.6+(i%2)*.6),lane:cap(dir*(.70+(row%2)*.49),-width*.33,width*.33),
    speed:0,seed:(h%1000)*.013,i,finish:0,boost:0,stamina:.9+((h>>>8)%20)/100,
    aiTarget:0,aiYaw:0,aiBrake:0,aiThrottle:1,aiRaceLine:0};
 });
}
function difficulty(){
 if(typeof mode!=='undefined' && mode==='online' && window.TNS8?.joined())return window.TNS8.getBotDifficulty?.()||'legend';
 return typeof aiDifficulty==='string'?aiDifficulty:'normal';
}
function onlineGuest(){return typeof mode!=='undefined'&&mode==='online'&&window.TNS8?.joined()&&!window.TNS8.isHost();}
function runBot(b,dt,skill,bIndex){
 if(b.finish||b.s>=course.length)return;
 const st=tune(CARS[b.car]),kph=st.roadMax,now=b.s;
 const wet=weather==='rain'?.73:weather==='dusk'?.96:1;
 const width=Math.max(2.25,course.roadWidth*.5-1.25);
 // Preview both acute hairpins and changing radius; braking begins before an apex.
 let severity=0,at=now;const sampleDist=[0,18,36,55,75,95,120,150,190];
 for(const d of sampleDist){const c=Math.abs(roadCurve(Math.min(course.length,now+d)));
  const weight=1/(1+d*.0065);
  if(c*weight>severity){severity=c*weight;at=now+d}
 }
 const k=roadCurve(Math.min(course.length,now+40));
 const vmaxTrack=Math.min(kph/3.6*1.02,Math.sqrt((st.grip*9.81*wet*skill.pace*.94)/Math.max(.00055,severity)));
 const grade=(sample(Math.min(course.length,now+6)).e-sample(Math.max(0,now-6)).e)/12;
 const raceTarget=cap(vmaxTrack*skill.pace,14,kph/3.6*1.035);
 // Variable grip and awareness. Human driver can defend but cannot pass through CPU.
 const look=Math.max(24,b.speed*1.6);
 const apex=roadCurve(Math.min(course.length,now+look));
 const phase=cap((at-now)/110,0,1);
 const line=cap((-Math.sign(apex)*.80*(phase>.48?1:-1)+Math.sin(now/135+b.seed)*.22)*skill.line,-width,width);
 let targetLane=line;
 const nearby=[...bots.filter(x=>x!==b&&!x.finish).map(x=>({s:x.s,lane:x.lane})),{s:player.s,lane:player.lane}];
 if(mode==='online'&&window.TNS8?.joined())for(const p of window.TNS8.rivals()){if(Number.isFinite(p.s))nearby.push({s:p.s,lane:p.lane})}
 const blocker=nearby.filter(x=>x.s>now-1&&x.s<now+Math.max(14,b.speed*.8)&&Math.abs(x.lane-b.lane)<1.7).sort((a,c)=>a.s-c.s)[0];
 if(blocker){const gap=blocker.s-now;const prefer=b.lane<=0?1:-1;
  const passLane=cap(blocker.lane+prefer*2.2,-width,width);
  // Aggressive AI seeks clear space early rather than ramming.
  const clear=nearby.every(x=>x===blocker||Math.abs(x.s-now)>11||Math.abs(x.lane-passLane)>1.35);
  if(clear)targetLane=passLane;
  else if(gap<7)b.speed=Math.min(b.speed,Math.max(10,(blocker.speed||b.speed)*.94));
 }
 b.aiTarget=mix(b.aiTarget||b.lane,targetLane,dt*(1.9+skill.react));
 const laneDelta=cap(b.aiTarget-b.lane,-dt*(1.6+skill.react*1.8),dt*(1.6+skill.react*1.8));
 b.lane=cap(b.lane+laneDelta,-width,width);
 const braking=b.speed>raceTarget;
 let engine=Math.max(2.1,st.accel*.43)*(.70+.29*skill.pace)*(1-b.speed/(kph/3.6*1.24));
 engine=Math.max(.3,engine);
 let brake=braking?-Math.min(11.5,st.brake*.52*skill.brake):engine;
 const accel=brake-.2-b.speed*b.speed*.0012-grade*9.81;
 b.speed=cap(b.speed+accel*dt,0,kph/3.6*1.04);
 b.aiBrake=braking?Math.min(1,(b.speed-raceTarget)/7):0;
 b.aiThrottle=braking?0:1;
 b.aiYaw=mix(b.aiYaw||0,cap((b.aiTarget-b.lane)*.04,-.15,.15),dt*2.2);
 b.s=Math.min(course.length,b.s+b.speed*dt);
 if(b.s>=course.length)b.finish=raceTime;
}
let time=0;
function updateBots(dt){
 if(!Array.isArray(bots)||!bots.length)return;
 if(onlineGuest()){
  const snapshot=window.TNS8?.botSnapshots?.()||[];
  // Dead-reckon between network packets, then smooth back to authoritative host positions.
  if(snapshot.length){for(const b of bots){const s=snapshot.find(x=>x.botId===b.botId);if(!s)continue;
    b.speed=mix(b.speed,s.speed,dt*6.5);
    const drift=cap(b.s+b.speed*dt,s.s-3,s.s+3);
    b.s=mix(drift,s.s,dt*8.0);b.lane=mix(b.lane,s.lane,dt*9);
    b.finish=s.finish||0;b.car=s.car;b.name=s.name||b.name;
   }}
  return;
 }
 const skill=DIFF[difficulty()]||DIFF.normal;
 bots.forEach((b,i)=>runBot(b,Math.min(dt,.075),skill,i));
 if(mode==='online'&&window.TNS8?.joined()&&window.TNS8?.isHost()){
  time+=dt;if(time>.11){time=0;window.TNS8.sendBotStates?.(bots)}
 }
}
window.TNS_AI={DIFF,makeBots,updateBots,difficulty,stableHash};
})();
