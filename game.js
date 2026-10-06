(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const path = [{x:-25,y:115},{x:155,y:115},{x:155,y:265},{x:360,y:265},{x:360,y:105},{x:585,y:105},{x:585,y:385},{x:760,y:385},{x:760,y:215},{x:925,y:215}];
  const types = {
    pulse:{name:'Импульс',cost:70,range:120,damage:12,rate:.42,color:'#53f4dc'},
    cryo:{name:'Криоузел',cost:100,range:105,damage:7,rate:.72,color:'#57a6ff',slow:.58},
    nova:{name:'Нова',cost:140,range:138,damage:25,rate:1.35,color:'#aa78ff',splash:54},
    prism:{name:'Призма',cost:170,range:205,damage:55,rate:1.85,color:'#ff79d1'},
    tesla:{name:'Тесла',cost:190,range:128,damage:18,rate:.88,color:'#ffd35a',splash:42}
  };
  let state, enemies=[],shots=[],particles=[],selectedType='pulse',selectedTower=null,last=performance.now(),waveRunning=false,spawnQueue=[],spawnTimer=0,paused=false,speed=1,audioOn=false,frameId=0,lastSave=0;
  const $=id=>document.getElementById(id);
  function fresh(){return {credits:180,health:20,wave:0,towers:[],best:0,completed:0};}
  function load(){
    try {
      const stored=JSON.parse(localStorage.getItem('eidos-defense-v1'));
      if(!stored || !Array.isArray(stored.towers)) return fresh();
      const result={...fresh(),...stored};
      result.credits=Number.isFinite(result.credits)?Math.max(0,result.credits):180;
      result.health=Number.isFinite(result.health)?Math.max(0,Math.min(20,result.health)):20;
      result.wave=Number.isInteger(result.wave)?Math.max(0,result.wave):0;
      result.completed=Object.prototype.hasOwnProperty.call(stored,'completed') && Number.isInteger(result.completed)?Math.max(0,Math.min(result.wave,result.completed)):Math.max(0,result.wave-1);
      result.best=Number.isInteger(result.best)?Math.max(result.completed,result.best):result.completed;
      result.towers=result.towers.filter(t=>types[t.type] && Number.isFinite(t.x) && Number.isFinite(t.y)).map(t=>({...t,level:Math.max(1,Math.min(4,Math.floor(t.level)||1)),cooldown:Number.isFinite(t.cooldown)?t.cooldown:0}));
      const run=stored.run;
      if(run && Array.isArray(run.enemies) && Array.isArray(run.queue) && result.health>0){
        enemies=run.enemies.filter(e=>['drone','swift','tank','boss'].includes(e.kind) && ['x','y','hp','max','speed','seg'].every(k=>Number.isFinite(e[k])) && e.hp>0 && e.seg>=0 && e.seg<path.length-1);
        spawnQueue=run.queue.filter(e=>['drone','swift','tank','boss'].includes(e.kind));
        spawnTimer=Number.isFinite(run.timer)?Math.max(0,run.timer):.2;
        waveRunning=Boolean(run.active);
        paused=waveRunning;
      }
      delete result.run;
      return result;
    } catch {return fresh();}
  }
  function save(){
    state.best=Math.max(state.best,state.completed);
    try{localStorage.setItem('eidos-defense-v1',JSON.stringify({...state,run:{active:waveRunning,enemies,queue:spawnQueue,timer:spawnTimer}}));}
    catch{toast('Не удалось сохранить игру: проверьте свободную память браузера');}
  }
  function reset(keepRecord=true){const best=keepRecord?state.best:0;state=fresh();state.best=best;paused=false;enemies=[];shots=[];particles=[];selectedTower=null;waveRunning=false;spawnQueue=[];spawnTimer=0;save();updateUI();$('gameover').classList.add('hidden');}
  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  function pathDistance(p){let best=Infinity;for(let i=0;i<path.length-1;i++){const a=path[i],b=path[i+1],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2));best=Math.min(best,dist(p,{x:a.x+t*dx,y:a.y+t*dy}));}return best;}
  function canPlace(p){return p.x>28&&p.x<W-28&&p.y>28&&p.y<H-28&&pathDistance(p)>42&&state.towers.every(t=>dist(t,p)>55);}
  function place(p){if(state.health<=0)return;const def=types[selectedType];if(state.credits<def.cost)return toast('Недостаточно энергии');if(!canPlace(p))return toast('Зона установки недоступна');state.credits-=def.cost;state.towers.push({x:p.x,y:p.y,type:selectedType,level:1,cooldown:0});save();updateUI();burst(p.x,p.y,def.color,18);}
  function startWave(){paused=false;if(waveRunning||state.health<=0)return;state.wave++;waveRunning=true;beep(240,.15);const count=7+state.wave*2;spawnQueue=Array.from({length:count},(_,i)=>({kind:state.wave>2&&i%7===6?'tank':state.wave>4&&i%5===3?'swift':'drone'}));if(state.wave%5===0)spawnQueue.push({kind:'boss'});spawnTimer=.2;toast(state.wave%5===0?'⚠ Босс вошёл в сектор':'Волна '+state.wave+' началась');updateUI();save();}
  function spawn(kind){const scale=1+state.wave*.13;const specs={drone:[44,54,8],swift:[29,82,10],tank:[120,34,14],boss:[460,24,95]}[kind];enemies.push({x:path[0].x,y:path[0].y,seg:0,hp:specs[0]*scale,max:specs[0]*scale,speed:specs[1],reward:specs[2],kind,slow:0,progress:0});}
  function update(dt){if(waveRunning&&spawnQueue.length){spawnTimer-=dt;if(spawnTimer<=0){spawn(spawnQueue.shift().kind);spawnTimer=Math.max(.28,.76-state.wave*.018);}}
    enemies.forEach(e=>{e.slow=Math.max(0,e.slow-dt);let move=e.speed*(e.slow?0.52:1)*dt;while(move>0&&e.seg<path.length-1){const target=path[e.seg+1],d=dist(e,target);if(move>=d){e.x=target.x;e.y=target.y;e.seg++;e.progress=e.seg;move-=d}else{e.x+=(target.x-e.x)/d*move;e.y+=(target.y-e.y)/d*move;e.progress=e.seg+(1-d/dist(path[e.seg],target));move=0;}}if(e.seg>=path.length-1)e.escaped=true;});
    const escaped=enemies.filter(e=>e.escaped);if(escaped.length){state.health=Math.max(0,state.health-escaped.reduce((n,e)=>n+(e.kind==='boss'?7:e.kind==='tank'?3:1),0));enemies=enemies.filter(e=>!e.escaped);updateUI();save();if(state.health<=0){state.health=0;waveRunning=false;spawnQueue=[];enemies=[];$('summary').textContent=`Вы удержали ${state.completed} волн. Лучший результат: ${Math.max(state.best,state.completed)}.`;$('gameover').classList.remove('hidden');}}
    state.towers.forEach(t=>{t.cooldown-=dt;const d=types[t.type],target=enemies.filter(e=>e.hp>0&&dist(t,e)<=d.range*(1+(t.level-1)*.09)).sort((a,b)=>b.progress-a.progress)[0];if(target&&t.cooldown<=0){const damage=d.damage*(1+(t.level-1)*.48);shots.push({x:t.x,y:t.y,tx:target.x,ty:target.y,color:d.color,life:.13});if(d.splash){enemies.filter(e=>dist(e,target)<d.splash).forEach(e=>e.hp-=damage);}else target.hp-=damage;if(d.slow)target.slow=1.2;burst(target.x,target.y,d.color,3);t.cooldown=d.rate/(1+(t.level-1)*.16);}});
    const dead=enemies.filter(e=>e.hp<=0);dead.forEach(e=>{state.credits+=e.reward;beep(480,.05);burst(e.x,e.y,'#d7fff7',9)});if(dead.length){enemies=enemies.filter(e=>e.hp>0);updateUI();}
    shots.forEach(s=>s.life-=dt);shots=shots.filter(s=>s.life>0);particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.life-=dt});particles=particles.filter(p=>p.life>0);
    if(waveRunning&&!spawnQueue.length&&!enemies.length){waveRunning=false;state.completed=state.wave;state.best=Math.max(state.best,state.completed);state.credits+=35+state.wave*4;save();updateUI();toast('Сектор очищен — бонус энергии получен');}}
  function burst(x,y,color,n){schedule();for(let i=0;i<n;i++)particles.push({x,y,vx:(Math.random()-.5)*90,vy:(Math.random()-.5)*90,life:.3+Math.random()*.35,color});}
  function draw(){ctx.fillStyle='#07131d';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#0d2738';ctx.lineWidth=1;for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
    ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#102d42';ctx.lineWidth=50;line(path);ctx.strokeStyle='#1c5266';ctx.lineWidth=3;line(path);ctx.setLineDash([9,16]);ctx.strokeStyle='#42b4b255';ctx.lineWidth=2;line(path);ctx.setLineDash([]);
    for(let i=1;i<path.length-1;i++){ctx.fillStyle='#17384a';ctx.fillRect(path[i].x-5,path[i].y-5,10,10)}
    state.towers.forEach((t,i)=>drawTower(t,i===selectedTower));enemies.forEach(drawEnemy);shots.forEach(s=>{ctx.globalAlpha=Math.max(0,s.life*8);ctx.strokeStyle=s.color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.tx,s.ty);ctx.stroke();ctx.globalAlpha=1});particles.forEach(p=>{ctx.globalAlpha=p.life*2;ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,2,2);ctx.globalAlpha=1});
    const core=path[path.length-1];ctx.strokeStyle=state.health<7?'#ff5f75':'#53f4dc';ctx.lineWidth=3;ctx.strokeRect(core.x-22,core.y-22,44,44);ctx.fillStyle='#dffff9';ctx.fillRect(core.x-6,core.y-6,12,12);
  }
  function line(points){ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);points.slice(1).forEach(p=>ctx.lineTo(p.x,p.y));ctx.stroke();}
  function drawTower(t,sel){const d=types[t.type];if(sel){ctx.fillStyle=d.color+'12';ctx.strokeStyle=d.color+'55';ctx.lineWidth=1;ctx.beginPath();ctx.arc(t.x,t.y,d.range*(1+(t.level-1)*.09),0,Math.PI*2);ctx.fill();ctx.stroke()}ctx.save();ctx.translate(t.x,t.y);ctx.rotate(Math.PI/4);ctx.fillStyle='#08131c';ctx.strokeStyle=d.color;ctx.lineWidth=2;ctx.fillRect(-16,-16,32,32);ctx.strokeRect(-16,-16,32,32);ctx.rotate(-Math.PI/4);ctx.fillStyle=d.color;ctx.beginPath();ctx.arc(0,0,6+t.level,0,Math.PI*2);ctx.fill();ctx.fillStyle='#07131d';ctx.font='9px monospace';ctx.fillText(t.level,-3,3);ctx.restore();}
  function drawEnemy(e){const color=e.kind==='boss'?'#ff3bd4':e.kind==='tank'?'#ff9d5c':e.kind==='swift'?'#f4e36a':'#ff5f75';ctx.save();ctx.translate(e.x,e.y);ctx.fillStyle='#0b1720';ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();const r=e.kind==='boss'?17:11;ctx.moveTo(0,-r);ctx.lineTo(r,0);ctx.lineTo(0,r);ctx.lineTo(-r,0);ctx.closePath();ctx.fill();ctx.stroke();if(e.slow){ctx.strokeStyle='#57a6ff';ctx.strokeRect(-14,-14,28,28)}ctx.restore();ctx.fillStyle='#13202b';ctx.fillRect(e.x-14,e.y-20,28,3);ctx.fillStyle=color;ctx.fillRect(e.x-14,e.y-20,28*Math.max(0,e.hp/e.max),3);}
  function updateUI(){$('credits').textContent=Math.floor(state.credits);$('health').textContent=state.health;$('wave').textContent=state.wave;$('best-wave').textContent='Рекорд '+state.best;$('status').textContent=waveRunning?'ВОЛНА АКТИВНА':'ГОТОВ';$('start-wave').disabled=waveRunning||state.health<=0;$('pause').textContent=paused?'Продолжить':'Пауза';$('pause').disabled=!waveRunning;$('speed').textContent='Скорость ×'+speed;$('sell').disabled=selectedTower===null;$('sound').textContent=audioOn?'Звук: вкл':'Звук: выкл';$('start-wave').firstChild.textContent=waveRunning?'Волна в секторе ':'Запустить волну ';if(selectedTower!==null){const t=state.towers[selectedTower],d=types[t.type],cost=55*t.level;$('selection-name').textContent=`${d.name} · уровень ${t.level}`;$('selection-info').textContent=`Урон ${Math.round(d.damage*(1+(t.level-1)*.48))} · радиус ${Math.round(d.range*(1+(t.level-1)*.09))}`;$('upgrade').textContent=t.level>=4?'Максимальный уровень':`Улучшить · ${cost}`;$('upgrade').disabled=t.level>=4||state.credits<cost;}else{$('selection-name').textContent='Нет активного модуля';$('selection-info').textContent='Нажмите на установленную башню, чтобы усилить её.';$('upgrade').textContent='Улучшить';$('upgrade').disabled=true;}schedule();}
  function toast(text){$('message').textContent=text;clearTimeout(toast.t);toast.t=setTimeout(()=>$('message').textContent='Выберите модуль и установите его вне энергоканала',2400);}
  function point(ev){const r=canvas.getBoundingClientRect();return{x:(ev.clientX-r.left)*W/r.width,y:(ev.clientY-r.top)*H/r.height};}
  canvas.addEventListener('pointerdown',ev=>{const p=point(ev),idx=state.towers.findIndex(t=>dist(t,p)<25);if(idx>=0){selectedTower=idx;updateUI();return}selectedTower=null;place(p);});
  document.querySelectorAll('.tower-card').forEach(b=>b.addEventListener('click',()=>{selectedType=b.dataset.type;selectedTower=null;document.querySelectorAll('.tower-card').forEach(x=>x.classList.toggle('selected',x===b));updateUI()}));
  $('start-wave').addEventListener('click',startWave);$('restart').addEventListener('click',()=>reset());$('reset').addEventListener('click',()=>{if(confirm('Сбросить весь локальный прогресс?'))reset(false)});$('upgrade').addEventListener('click',()=>{if(selectedTower===null)return;const t=state.towers[selectedTower],cost=55*t.level;if(t.level<4&&state.credits>=cost){state.credits-=cost;t.level++;save();updateUI();burst(t.x,t.y,types[t.type].color,20)}});
  addEventListener('keydown',e=>{if(['1','2','3','4','5'].includes(e.key))document.querySelectorAll('.tower-card')[+e.key-1].click();if(e.key==='Escape'){selectedTower=null;updateUI()}});
  let audioContext=null;
  function beep(frequency,duration){
    if(!audioOn||document.hidden)return;
    try {audioContext ||= new (window.AudioContext||window.webkitAudioContext)();
      if(audioContext.state==='suspended')audioContext.resume().catch(()=>{});
      const osc=audioContext.createOscillator(),gain=audioContext.createGain(),t=audioContext.currentTime;
      osc.type='triangle';osc.frequency.value=frequency;gain.gain.setValueAtTime(.035,t);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
      osc.connect(gain);gain.connect(audioContext.destination);osc.start(t);osc.stop(t+duration);
    }catch{}
  }
  $('pause').addEventListener('click',()=>{paused=!paused;save();updateUI();});
  $('speed').addEventListener('click',()=>{speed=speed===1?2:1;updateUI();});
  $('sound').addEventListener('click',()=>{audioOn=!audioOn;beep(660,.1);updateUI();});
  $('sell').addEventListener('click',()=>{
    if(selectedTower===null)return;
    const tower=state.towers[selectedTower],refund=Math.floor((types[tower.type].cost+55*tower.level*(tower.level-1)/2)*.65);
    state.credits+=refund;state.towers.splice(selectedTower,1);selectedTower=null;save();updateUI();toast('Модуль продан: +'+refund+' энергии');
  });
  document.addEventListener('visibilitychange',()=>{last=performance.now();if(document.hidden){save();if(audioContext)audioContext.suspend().catch(()=>{});}else schedule();});
  addEventListener('pagehide',save);
  function schedule(){if(!frameId&&!document.hidden)frameId=requestAnimationFrame(frame);}
  function frame(now){
    frameId=0;const dt=Math.min(.04,(now-last)/1000);last=now;
    if(!paused)update(dt*speed);else{shots=[];particles=[];}draw();
    if(waveRunning&&now-lastSave>2000){lastSave=now;save();}
    if((waveRunning&&!paused)||particles.length||shots.length)schedule();
  }
  state=load();updateUI();
  if(state.health<=0){$('summary').textContent='Завершено волн: '+state.completed+'. Рекорд: '+state.best;$('gameover').classList.remove('hidden');}
  if(paused)toast('Незаконченная волна восстановлена. Нажмите «Продолжить».');
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
