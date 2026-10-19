/* Эйдос: Контур Обороны · v2.0 «Звёздный витраж».
   Мир 960×600; на узком экране поле поворачивается вертикально (сохранения башен не меняются). */
(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const W = 960, H = 600;
  const path = [{x:-25,y:115},{x:155,y:115},{x:155,y:265},{x:360,y:265},{x:360,y:105},{x:585,y:105},{x:585,y:385},{x:760,y:385},{x:760,y:215},{x:925,y:215}];
  const types = {
    pulse:{name:'Импульс',cost:70,range:120,damage:12,rate:.42,color:'#53f4dc'},
    cryo:{name:'Криоузел',cost:100,range:105,damage:7,rate:.72,color:'#6fb6ff',slow:.58},
    nova:{name:'Нова',cost:140,range:138,damage:25,rate:1.35,color:'#b98aff',splash:54},
    prism:{name:'Призма',cost:170,range:205,damage:55,rate:1.85,color:'#ff79d1',pierce:true},
    tesla:{name:'Тесла',cost:190,range:128,damage:18,rate:.88,color:'#ffd35a',chain:true}
  };
  const KINDS = ['drone','swift','tank','boss'];
  const COLORS = {drone:['#ff8aa5','#e2345f'],swift:['#fff3a0','#f2b419'],tank:['#ffc48f','#e0682a'],boss:['#f0a8ff','#8c3cf0'],gold:['#fff6c2','#f0a90f']};
  const STRIKE_CD = 30;
  const QUESTS = [
    {id:'kill',stat:'kills',n:60,text:'Уничтожьте 60 врагов'},
    {id:'kill2',stat:'kills',n:120,text:'Уничтожьте 120 врагов'},
    {id:'waves',stat:'waves',n:3,text:'Очистите 3 волны'},
    {id:'waves2',stat:'waves',n:6,text:'Очистите 6 волн'},
    {id:'strike',stat:'strikes',n:2,text:'Примените орбитальный удар 2 раза'},
    {id:'build',stat:'built',n:4,text:'Установите 4 модуля'},
    {id:'ups',stat:'upgrades',n:3,text:'Улучшите модули 3 раза'},
    {id:'gold',stat:'golden',n:2,text:'Сбейте 2 золотых дрона'},
    {id:'early',stat:'early',n:2,text:'Вызовите волну досрочно 2 раза'},
    {id:'boss',stat:'bosses',n:1,text:'Победите босса'}
  ];
  let state, enemies=[],shots=[],particles=[],floats=[],rings=[],bolts=[],selectedType='pulse',selectedTower=null,last=performance.now(),waveRunning=false,spawnQueue=[],spawnTimer=0,paused=false,speed=1,audioOn=false,lastSave=0;
  let strikeArmed=false, autoT=0, shake=0, hurt=0, banner=null, clock=0, lastDraw=0, ghost=null;
  const $=id=>document.getElementById(id);
  const eco=()=>!!(window.PlayKit&&window.PlayKit.eco);
  function freshStats(){return {kills:0,waves:0,strikes:0,built:0,upgrades:0,golden:0,early:0,bosses:0};}
  function fresh(){return {credits:180,health:20,wave:0,towers:[],best:0,completed:0,strikeCd:0,auto:false,stats:freshStats(),quests:null};}
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
      result.strikeCd=Number.isFinite(result.strikeCd)?Math.max(0,Math.min(STRIKE_CD,result.strikeCd)):0;
      result.auto=!!result.auto;
      const st=freshStats();for(const k in st){const v=result.stats&&result.stats[k];st[k]=Number.isFinite(v)?Math.max(0,v):0;}result.stats=st;
      if(!result.quests||typeof result.quests!=='object'||typeof result.quests.day!=='string')result.quests=null;
      const run=stored.run;
      if(run && Array.isArray(run.enemies) && Array.isArray(run.queue) && result.health>0){
        enemies=run.enemies.filter(e=>KINDS.includes(e.kind) && ['x','y','hp','max','speed','seg'].every(k=>Number.isFinite(e[k])) && e.hp>0 && e.seg>=0 && e.seg<path.length-1);
        spawnQueue=run.queue.filter(e=>KINDS.includes(e.kind));
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
    const lean=enemies.map(e=>({x:e.x,y:e.y,seg:e.seg,hp:e.hp,max:e.max,speed:e.speed,reward:e.reward,kind:e.kind,slow:e.slow,progress:e.progress,golden:!!e.golden}));
    try{localStorage.setItem('eidos-defense-v1',JSON.stringify({...state,run:{active:waveRunning,enemies:lean,queue:spawnQueue,timer:spawnTimer}}));}
    catch{toast('Не удалось сохранить игру: проверьте свободную память браузера');}
  }
  function reset(keepRecord=true){const best=keepRecord?state.best:0,stats=state.stats,quests=state.quests,auto=state.auto;state=fresh();state.best=best;state.stats=stats;state.quests=quests;state.auto=auto;paused=false;enemies=[];shots=[];particles=[];floats=[];rings=[];bolts=[];selectedTower=null;strikeArmed=false;waveRunning=false;spawnQueue=[];spawnTimer=0;save();updateUI();$('gameover').classList.add('hidden');}

  /* ---------- Задания дня ---------- */
  function dayKey(){const d=new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();}
  function hash(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function questsToday(){
    const day=dayKey();
    if(!state.quests||state.quests.day!==day){
      let h=hash('eidos'+day);const pool=QUESTS.slice(),pick=[];const used=new Set();
      while(pick.length<3&&pool.length){h=Math.imul(h^(h>>>15),2246822507)>>>0;const q=pool.splice(h%pool.length,1)[0];if(used.has(q.stat))continue;used.add(q.stat);pick.push(q.id);}
      state.quests={day,list:pick.map(id=>({id,base:state.stats[QUESTS.find(q=>q.id===id).stat]||0,done:false})),bonus:false};
    }
    return state.quests;
  }
  function questProgress(q){const def=QUESTS.find(d=>d.id===q.id);return {def,have:Math.min(def.n,(state.stats[def.stat]||0)-q.base)};}
  function checkQuests(){
    const qs=questsToday();let changed=false;
    qs.list.forEach(q=>{if(q.done)return;const {def,have}=questProgress(q);if(have>=def.n){q.done=true;changed=true;const r=80+state.wave*10;state.credits+=r;toast('📜 Задание выполнено: +'+r+' энергии');beep(880,.18);}});
    if(!qs.bonus&&qs.list.every(q=>q.done)){qs.bonus=true;state.credits+=150;state.strikeCd=0;toast('🌟 Все задания дня! +150 энергии и заряд удара');}
    if(changed){save();renderQuests();}
    const badge=$('questBadge');if(badge){const left=qs.list.filter(q=>!q.done).length;badge.textContent=left;badge.hidden=!left;}
  }
  function renderQuests(){
    const qs=questsToday(),ul=$('questList');if(!ul)return;
    ul.innerHTML='';
    qs.list.forEach(q=>{const {def,have}=questProgress(q);const li=document.createElement('li');li.className=q.done?'done':'';
      li.innerHTML=`<span class="qt"></span><span class="qbar"><i style="width:${Math.round(have/def.n*100)}%"></i></span><b>${q.done?'✔':have+'/'+def.n}</b>`;li.querySelector('.qt').textContent=def.text;ul.appendChild(li);});
  }
  function stat(k,n=1){state.stats[k]=(state.stats[k]||0)+n;}

  /* ---------- Логика ---------- */
  function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y);}
  function pathDistance(p){let best=Infinity;for(let i=0;i<path.length-1;i++){const a=path[i],b=path[i+1],dx=b.x-a.x,dy=b.y-a.y,l2=dx*dx+dy*dy,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l2));best=Math.min(best,dist(p,{x:a.x+t*dx,y:a.y+t*dy}));}return best;}
  function canPlace(p){return p.x>28&&p.x<W-28&&p.y>28&&p.y<H-28&&pathDistance(p)>42&&state.towers.every(t=>dist(t,p)>55);}
  function place(p){if(state.health<=0)return;const def=types[selectedType];if(state.credits<def.cost){ghost={x:p.x,y:p.y,t:.6,ok:false};return toast('Недостаточно энергии');}if(!canPlace(p)){ghost={x:p.x,y:p.y,t:.6,ok:false};return toast('Зона установки недоступна');}state.credits-=def.cost;state.towers.push({x:p.x,y:p.y,type:selectedType,level:1,cooldown:0,ang:-Math.PI/2});stat('built');save();updateUI();burst(p.x,p.y,def.color,22);ring(p.x,p.y,def.color,60);beep(520,.08);checkQuests();}
  function waveQueue(n){const count=7+n*2;const q=Array.from({length:count},(_,i)=>({kind:n>2&&i%7===6?'tank':n>4&&i%5===3?'swift':'drone'}));if(n%5===0)q.push({kind:'boss'});return q;}
  function startWave(){
    if(state.health<=0)return;
    if(waveRunning){
      if(spawnQueue.length)return;
      // досрочный вызов следующей волны
      const bonus=20+state.wave*3;state.wave++;spawnQueue=waveQueue(state.wave);spawnTimer=.4;state.credits+=bonus;stat('early');
      paused=false;showBanner(state.wave%5===0?'⚠ БОСС':'ВОЛНА '+state.wave,'досрочно · +'+bonus+' энергии');toast('Досрочный вызов: +'+bonus+' энергии');beep(300,.15);updateUI();save();checkQuests();return;
    }
    paused=false;state.wave++;waveRunning=true;beep(240,.15);spawnQueue=waveQueue(state.wave);spawnTimer=.2;
    showBanner(state.wave%5===0?'⚠ БОСС':'ВОЛНА '+state.wave,state.wave%5===0?'Флагман вошёл в сектор':'Удержите энергоканал');
    toast(state.wave%5===0?'⚠ Босс вошёл в сектор':'Волна '+state.wave+' началась');updateUI();save();
  }
  function spawn(kind){const scale=1+state.wave*.13;const specs={drone:[44,54,8],swift:[29,82,10],tank:[120,34,14],boss:[460,24,95]}[kind];const golden=kind!=='boss'&&Math.random()<.07;const hp=specs[0]*scale*(golden?1.5:1);enemies.push({x:path[0].x,y:path[0].y,seg:0,hp,max:hp,speed:specs[1],reward:specs[2]*(golden?5:1),kind,slow:0,progress:0,golden,ph:Math.random()*6});}
  function hit(e,dmg){if(e.hp<=0)return;e.hp-=dmg;e.flash=.09;}
  function fire(t,d,target){
    const lv=1+(t.level-1)*.48,damage=d.damage*lv,range=d.range*(1+(t.level-1)*.09);
    t.ang=Math.atan2(target.y-t.y,target.x-t.x);t.kick=.12;
    if(d.chain){
      const hitList=[target];let cur=target,dm=damage;hit(target,dm);
      const jumps=2+t.level;const pts=[{x:t.x+Math.cos(t.ang)*16,y:t.y+Math.sin(t.ang)*16},{x:target.x,y:target.y}];
      for(let j=0;j<jumps;j++){const nx=enemies.filter(e=>e.hp>0&&!hitList.includes(e)&&dist(e,cur)<95).sort((a,b)=>dist(a,cur)-dist(b,cur))[0];if(!nx)break;dm*=.78;hit(nx,dm);hitList.push(nx);pts.push({x:nx.x,y:nx.y});cur=nx;}
      bolts.push({pts,life:.16,color:d.color});hitList.forEach(e=>burst(e.x,e.y,d.color,3));beep(1100,.03);
    } else if(d.pierce){
      const ex=t.x+Math.cos(t.ang)*range,ey=t.y+Math.sin(t.ang)*range;
      enemies.forEach(e=>{if(e.hp<=0)return;const dx=ex-t.x,dy=ey-t.y,l2=dx*dx+dy*dy,u=Math.max(0,Math.min(1,((e.x-t.x)*dx+(e.y-t.y)*dy)/l2));if(Math.hypot(t.x+u*dx-e.x,t.y+u*dy-e.y)<16){hit(e,damage);burst(e.x,e.y,d.color,4);}});
      shots.push({x:t.x,y:t.y,tx:ex,ty:ey,color:d.color,life:.22,max:.22,w:7});beep(700,.05);
    } else if(d.splash){
      enemies.filter(e=>dist(e,target)<d.splash).forEach(e=>hit(e,damage));
      shots.push({x:t.x,y:t.y,tx:target.x,ty:target.y,color:d.color,life:.13,max:.13,w:4});ring(target.x,target.y,d.color,d.splash);burst(target.x,target.y,d.color,8);
    } else {
      hit(target,damage);if(d.slow){target.slow=1.2;for(let i=0;i<3;i++)particles.push({x:target.x,y:target.y,vx:(Math.random()-.5)*50,vy:(Math.random()-.5)*50,life:.6,max:.6,color:'#dff4ff',size:3,flake:true});}
      shots.push({x:t.x,y:t.y,tx:target.x,ty:target.y,color:d.color,life:.13,max:.13,w:d.slow?4:3});burst(target.x,target.y,d.color,3);
    }
  }
  function strike(p){
    if(state.strikeCd>0||state.health<=0)return;
    strikeArmed=false;state.strikeCd=STRIKE_CD;stat('strikes');
    const dmg=110+state.wave*26;let n=0;
    enemies.forEach(e=>{if(e.hp>0&&dist(e,p)<88){hit(e,dmg*(e.kind==='boss'?.6:1));n++;}});
    rings.push({x:p.x,y:p.y,r:6,max:120,life:.6,color:'#fff1b8',w:10});ring(p.x,p.y,'#ff9de9',90);
    shots.push({sky:true,x:p.x,y:p.y,life:.35,max:.35,color:'#fff4c0'});
    burst(p.x,p.y,'#ffe08a',eco()?20:42,180);burst(p.x,p.y,'#ff8ee8',eco()?8:18,140);
    shake=Math.max(shake,.35);beep(140,.35);
    floats.push({x:p.x,y:p.y-30,text:n?('☄ ×'+n):'☄',color:'#fff1b8',life:1.1,max:1.1,big:true});
    updateUI();save();checkQuests();
  }
  function update(dt){
    clock+=dt;
    if(state.strikeCd>0)state.strikeCd=Math.max(0,state.strikeCd-dt);
    if(waveRunning&&spawnQueue.length){spawnTimer-=dt;if(spawnTimer<=0){spawn(spawnQueue.shift().kind);spawnTimer=Math.max(.28,.76-state.wave*.018);}}
    enemies.forEach(e=>{e.slow=Math.max(0,e.slow-dt);e.flash=Math.max(0,(e.flash||0)-dt);let move=e.speed*(e.slow?0.52:1)*dt;e.walk=(e.walk||0)+move;while(move>0&&e.seg<path.length-1){const target=path[e.seg+1],d=dist(e,target);if(move>=d){e.x=target.x;e.y=target.y;e.seg++;e.progress=e.seg;move-=d}else{e.dir=Math.atan2(target.y-e.y,target.x-e.x);e.x+=(target.x-e.x)/d*move;e.y+=(target.y-e.y)/d*move;e.progress=e.seg+(1-d/dist(path[e.seg],target));move=0;}}if(e.seg>=path.length-1)e.escaped=true;});
    const escaped=enemies.filter(e=>e.escaped);
    if(escaped.length){
      const loss=escaped.reduce((n,e)=>n+(e.kind==='boss'?7:e.kind==='tank'?3:1),0);
      state.health=Math.max(0,state.health-loss);enemies=enemies.filter(e=>!e.escaped);hurt=.6;shake=Math.max(shake,.25);const c=path[path.length-1];ring(c.x,c.y,'#ff5f75',70);floats.push({x:c.x-40,y:c.y-30,text:'−'+loss,color:'#ff7d92',life:1,max:1});beep(120,.2);
      updateUI();save();
      if(state.health<=0){state.health=0;waveRunning=false;spawnQueue=[];enemies=[];strikeArmed=false;$('summary').textContent=`Вы удержали ${state.completed} волн. Лучший результат: ${Math.max(state.best,state.completed)}.`;$('gameover').classList.remove('hidden');save();}
    }
    state.towers.forEach(t=>{t.cooldown-=dt;t.kick=Math.max(0,(t.kick||0)-dt);const d=types[t.type],range=d.range*(1+(t.level-1)*.09),target=enemies.filter(e=>e.hp>0&&dist(t,e)<=range).sort((a,b)=>b.progress-a.progress)[0];
      if(target){const want=Math.atan2(target.y-t.y,target.x-t.x);let da=want-(t.ang||0);da=Math.atan2(Math.sin(da),Math.cos(da));t.ang=(t.ang||0)+da*Math.min(1,dt*14);}
      if(target&&t.cooldown<=0){fire(t,d,target);t.cooldown=d.rate/(1+(t.level-1)*.16);}});
    const dead=enemies.filter(e=>e.hp<=0);
    dead.forEach(e=>{state.credits+=e.reward;stat('kills');if(e.golden)stat('golden');if(e.kind==='boss'){stat('bosses');shake=Math.max(shake,.5);ring(e.x,e.y,'#f0a8ff',140);}
      beep(e.golden?990:480,.05);const col=e.golden?COLORS.gold[1]:COLORS[e.kind][1];burst(e.x,e.y,col,e.kind==='boss'?40:e.golden?24:12,e.kind==='boss'?200:120);burst(e.x,e.y,'#ffffff',4);ring(e.x,e.y,col,e.kind==='boss'?90:34);
      floats.push({x:e.x,y:e.y-14,text:'+'+e.reward,color:e.golden?'#ffe27a':'#bfffee',life:.9,max:.9,big:e.golden||e.kind==='boss'});});
    if(dead.length){enemies=enemies.filter(e=>e.hp>0);updateUI();checkQuests();}
    if(waveRunning&&!spawnQueue.length&&!enemies.length){
      waveRunning=false;state.completed=state.wave;state.best=Math.max(state.best,state.completed);const bonus=35+state.wave*4;state.credits+=bonus;stat('waves');
      const c=path[path.length-1];burst(c.x,c.y,'#ffe08a',eco()?16:36,200);burst(c.x,c.y,'#9ff7ff',eco()?10:24,170);ring(c.x,c.y,'#ffe08a',120);
      showBanner('СЕКТОР ОЧИЩЕН','+'+bonus+' энергии');save();updateUI();toast('Сектор очищен — бонус энергии получен');checkQuests();
      if(state.auto)autoT=3;
    }
    if(autoT>0&&!waveRunning){autoT-=dt;if(autoT<=0&&state.auto&&state.health>0)startWave();}
  }
  function updateFx(dt){
    shots.forEach(s=>s.life-=dt);shots=shots.filter(s=>s.life>0);
    bolts.forEach(b=>b.life-=dt);bolts=bolts.filter(b=>b.life>0);
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.96;p.vy*=.96;p.life-=dt});particles=particles.filter(p=>p.life>0);
    rings.forEach(r=>{r.life-=dt;r.r+=(r.max-r.r)*Math.min(1,dt*9)});rings=rings.filter(r=>r.life>0);
    floats.forEach(f=>{f.life-=dt;f.y-=dt*34});floats=floats.filter(f=>f.life>0);
    if(banner){banner.t-=dt;if(banner.t<=0)banner=null;}
    if(ghost){ghost.t-=dt;if(ghost.t<=0)ghost=null;}
    shake=Math.max(0,shake-dt);hurt=Math.max(0,hurt-dt);
  }
  function burst(x,y,color,n,sp=90){if(eco())n=Math.ceil(n*.55);if(particles.length>500)return;for(let i=0;i<n;i++){const a=Math.random()*6.283,v=sp*(.3+Math.random()*.7);particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:.3+Math.random()*.45,max:.75,color,size:2+Math.random()*3});}}
  function ring(x,y,color,max){rings.push({x,y,r:4,max,life:.45,color,w:3});}
  function showBanner(title,sub){banner={title,sub,t:1.8,max:1.8};}

  /* ---------- Экран и поворот ---------- */
  let portrait=false,cssW=W,cssH=H,dpr=1,scale=1,bgCache=null;
  function layout(){
    const wrap=$('arena');const narrow=innerWidth<=700;
    portrait=narrow;
    dpr=Math.min(window.devicePixelRatio||1,eco()?1.5:2);
    const avail=wrap.clientWidth||W;
    if(portrait){
      const top=wrap.getBoundingClientRect().top+scrollY;const dock=document.querySelector('.action-row');const towers=document.querySelector('.tower-list');
      const reserve=(dock?dock.offsetHeight:110)+(towers?towers.offsetHeight:70)+34;
      const maxH=Math.max(340,innerHeight-Math.max(0,top)-reserve);
      cssW=Math.min(avail,Math.floor(maxH*H/W));cssH=Math.round(cssW*W/H);
    } else {cssW=avail;cssH=Math.round(avail*H/W);}
    canvas.style.width=cssW+'px';canvas.style.height=cssH+'px';
    canvas.width=Math.round(cssW*dpr);canvas.height=Math.round(cssH*dpr);
    scale=cssW*dpr/(portrait?H:W);
    document.body.classList.toggle('portrait',portrait);
    bgCache=null;
  }
  function worldTf(c){if(portrait)c.setTransform(0,scale,-scale,0,H*scale,0);else c.setTransform(scale,0,0,scale,0,0);}
  function screenTf(c){c.setTransform(dpr,0,0,dpr,0,0);}
  function toScreen(x,y){const k=cssW/(portrait?H:W);return portrait?{x:(H-y)*k,y:x*k}:{x:x*k,y:y*k};}
  function point(ev){const r=canvas.getBoundingClientRect();const sx=(ev.clientX-r.left)/r.width,sy=(ev.clientY-r.top)/r.height;return portrait?{x:sy*W,y:H-sx*H}:{x:sx*W,y:sy*H};}

  /* ---------- Свечение ---------- */
  const glowCache={};
  function glowSprite(color){if(glowCache[color])return glowCache[color];const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d'),gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,color);gr.addColorStop(.25,color+'aa');gr.addColorStop(1,color+'00');g.fillStyle=gr;g.fillRect(0,0,64,64);return glowCache[color]=c;}
  function glow(c,x,y,r,color,a=1){c.globalAlpha=a;c.drawImage(glowSprite(color),x-r,y-r,r*2,r*2);c.globalAlpha=1;}

  function buildBg(){
    const cv=document.createElement('canvas');cv.width=canvas.width;cv.height=canvas.height;const c=cv.getContext('2d');
    const cw=cv.width,ch=cv.height;
    // туманность (в экранных координатах)
    const base=c.createLinearGradient(0,0,cw,ch);base.addColorStop(0,'#1a0b4a');base.addColorStop(.5,'#0c1450');base.addColorStop(1,'#2a0b45');c.fillStyle=base;c.fillRect(0,0,cw,ch);
    const blobs=[[.2,.25,.55,'#8a3cff'],[.85,.2,.45,'#ff4fc8'],[.7,.8,.6,'#20c9ff'],[.15,.85,.45,'#ffb347'],[.5,.5,.5,'#5b5cff']];
    blobs.forEach(([x,y,r,col])=>{const g=c.createRadialGradient(x*cw,y*ch,0,x*cw,y*ch,r*Math.max(cw,ch));g.addColorStop(0,col+'66');g.addColorStop(1,col+'00');c.fillStyle=g;c.fillRect(0,0,cw,ch);});
    let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
    for(let i=0;i<180;i++){const x=rnd()*cw,y=rnd()*ch,r=(rnd()*1.3+.3)*dpr;c.fillStyle=rnd()<.15?'#ffe9a8':'#ffffff';c.globalAlpha=.35+rnd()*.6;c.beginPath();c.arc(x,y,r,0,7);c.fill();}
    c.globalAlpha=1;
    worldTf(c);
    // кристаллическая платформа из шестиугольников
    for(let row=-1;row<H/42+1;row++)for(let col=-1;col<W/48+1;col++){const x=col*48+(row%2)*24,y=row*42;const d=Math.hypot(x-W/2,y-H/2)/(W*.6);c.beginPath();for(let i=0;i<6;i++){const a=Math.PI/3*i-Math.PI/2;c.lineTo(x+Math.cos(a)*25,y+Math.sin(a)*25)}c.closePath();
      const hue=(row*3+col*5)%7;c.fillStyle=['#2b2a7a','#28307e','#33287a','#2a3a88','#302c80','#26357a','#3a2c86'][hue];c.globalAlpha=.62-d*.25;c.fill();c.globalAlpha=1;c.strokeStyle='#9fb8ff2a';c.lineWidth=1.2;c.stroke();
      const g=c.createLinearGradient(x,y-25,x,y+25);g.addColorStop(0,'#ffffff14');g.addColorStop(.5,'#ffffff00');c.fillStyle=g;c.fill();
      if((row*7+col*3)%11===0){c.fillStyle='#9ff7ff';c.globalAlpha=.7;c.beginPath();c.arc(x,y,2.2,0,7);c.fill();c.globalAlpha=1;}}
    // золотая рамка
    c.strokeStyle='#f6c35b';c.lineWidth=3;c.globalAlpha=.75;rr(c,12,12,W-24,H-24,18);c.stroke();c.globalAlpha=.3;c.lineWidth=1;rr(c,20,20,W-40,H-40,14);c.stroke();c.globalAlpha=1;
    for(const x of [28,W-28])for(const y of [28,H-28]){c.fillStyle='#ffe08a';c.beginPath();c.arc(x,y,5,0,7);c.fill();c.strokeStyle='#fff6d0';c.lineWidth=1.5;c.beginPath();c.arc(x,y,9,0,7);c.stroke();}
    // энергоканал
    c.lineCap='round';c.lineJoin='round';
    c.shadowColor='#7a5cff';c.shadowBlur=26*scale;c.strokeStyle='#120a36';c.lineWidth=62;line(c,path);c.shadowBlur=0;
    c.strokeStyle='#f6c35b';c.lineWidth=54;line(c,path);
    c.strokeStyle='#7a4a12';c.lineWidth=50;line(c,path);
    const rg=c.createLinearGradient(0,0,W,H);rg.addColorStop(0,'#3b1f8f');rg.addColorStop(.5,'#1e3fa8');rg.addColorStop(1,'#6a1f96');c.strokeStyle=rg;c.lineWidth=46;line(c,path);
    c.strokeStyle='#ffffff18';c.lineWidth=30;line(c,path);
    c.strokeStyle='#8ff4ff55';c.lineWidth=10;line(c,path);
    for(let i=1;i<path.length-1;i++){glow(c,path[i].x,path[i].y,30,'#b58cff',.5);c.fillStyle='#ffe08a';c.beginPath();c.arc(path[i].x,path[i].y,4,0,7);c.fill();}
    c.setTransform(1,0,0,1,0,0);
    // виньетка
    const v=c.createRadialGradient(cw/2,ch/2,Math.min(cw,ch)*.35,cw/2,ch/2,Math.max(cw,ch)*.75);v.addColorStop(0,'#00000000');v.addColorStop(1,'#0a0322aa');c.fillStyle=v;c.fillRect(0,0,cw,ch);
    return cv;
  }
  function rr(c,x,y,w,h,r){c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();}
  function line(c,points){c.beginPath();c.moveTo(points[0].x,points[0].y);points.slice(1).forEach(p=>c.lineTo(p.x,p.y));c.stroke();}

  function draw(){
    if(!bgCache)bgCache=buildBg();
    ctx.setTransform(1,0,0,1,0,0);ctx.globalCompositeOperation='source-over';
    let sx=0,sy=0;if(shake>0){const m=shake*14*dpr;sx=(Math.random()-.5)*m;sy=(Math.random()-.5)*m;}
    ctx.drawImage(bgCache,sx,sy);
    worldTf(ctx);if(sx||sy){const m=ctx.getTransform();m.e+=sx;m.f+=sy;ctx.setTransform(m);}
    // текущий поток энергии
    ctx.lineCap='round';ctx.lineJoin='round';ctx.globalCompositeOperation='lighter';
    ctx.setLineDash([2,26]);ctx.lineDashOffset=-frameT*70;ctx.strokeStyle='#c9fbff';ctx.lineWidth=5;ctx.globalAlpha=.8;line(ctx,path);
    ctx.setLineDash([14,40]);ctx.lineDashOffset=-frameT*45;ctx.strokeStyle='#b78cff';ctx.lineWidth=3;ctx.globalAlpha=.5;line(ctx,path);
    ctx.setLineDash([]);ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    drawPortal(frameT);drawCore(frameT);
    state.towers.forEach((tw,i)=>drawTower(tw,i===selectedTower,frameT));
    enemies.forEach(e=>drawEnemy(e,frameT));
    // выстрелы
    ctx.globalCompositeOperation='lighter';
    shots.forEach(s=>{const a=Math.max(0,s.life/s.max);
      if(s.sky){glow(ctx,s.x,s.y,130,'#fff1b8',a);glow(ctx,s.x,s.y,60,'#ffffff',a);ctx.globalAlpha=1;return;}
      ctx.globalAlpha=a*.5;ctx.strokeStyle=s.color;ctx.lineWidth=(s.w||3)*2.6;ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(s.tx,s.ty);ctx.stroke();
      ctx.globalAlpha=a;ctx.strokeStyle='#ffffff';ctx.lineWidth=(s.w||3)*.6;ctx.stroke();glow(ctx,s.tx,s.ty,16+(s.w||3)*2,s.color,a);ctx.globalAlpha=1;});
    bolts.forEach(b=>{const a=b.life/.16;ctx.strokeStyle=b.color;ctx.globalAlpha=a;for(let k=0;k<2;k++){ctx.lineWidth=k?1.5:5;ctx.strokeStyle=k?'#ffffff':b.color;ctx.beginPath();ctx.moveTo(b.pts[0].x,b.pts[0].y);for(let i=1;i<b.pts.length;i++){const p0=b.pts[i-1],p1=b.pts[i];for(let s=1;s<=4;s++){const u=s/4;ctx.lineTo(p0.x+(p1.x-p0.x)*u+(s<4?(Math.random()-.5)*16:0),p0.y+(p1.y-p0.y)*u+(s<4?(Math.random()-.5)*16:0));}}ctx.stroke();}
      b.pts.forEach(p=>glow(ctx,p.x,p.y,20,b.color,a));ctx.globalAlpha=1;});
    rings.forEach(r=>{const a=r.life/.45;ctx.globalAlpha=Math.min(1,a);ctx.strokeStyle=r.color;ctx.lineWidth=r.w*a+1;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,7);ctx.stroke();});ctx.globalAlpha=1;
    particles.forEach(p=>{const a=Math.max(0,p.life/(p.max||.75));if(p.flake){ctx.globalAlpha=a;ctx.fillStyle=p.color;ctx.fillRect(p.x-1,p.y-1,2.5,2.5);return;}ctx.globalAlpha=a;glow(ctx,p.x,p.y,p.size*2.6,p.color,a);});
    ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    if(ghost){ctx.globalAlpha=ghost.t/.6;ctx.strokeStyle=ghost.ok?'#9fffe0':'#ff6b86';ctx.lineWidth=3;ctx.beginPath();ctx.arc(ghost.x,ghost.y,22,0,7);ctx.stroke();ctx.beginPath();ctx.moveTo(ghost.x-10,ghost.y-10);ctx.lineTo(ghost.x+10,ghost.y+10);ctx.moveTo(ghost.x+10,ghost.y-10);ctx.lineTo(ghost.x-10,ghost.y+10);ctx.stroke();ctx.globalAlpha=1;}
    // экранный слой
    screenTf(ctx);
    enemies.forEach(e=>{const r=e.kind==='boss'?24:13,s=toScreen(e.x,e.y),k=cssW/(portrait?H:W),bw=(e.kind==='boss'?54:30)*k*1.25,y=s.y-(r+10)*k*1.2;const f=Math.max(0,e.hp/e.max);ctx.fillStyle='#120a30cc';rr(ctx,s.x-bw/2-1,y-1,bw+2,6,3);ctx.fill();ctx.fillStyle=f>.5?'#6dffb0':f>.25?'#ffd35a':'#ff5f75';rr(ctx,s.x-bw/2,y,bw*f,4,2);ctx.fill();});
    ctx.textAlign='center';ctx.textBaseline='middle';
    floats.forEach(f=>{const s=toScreen(f.x,f.y),a=Math.min(1,f.life/f.max*1.6);ctx.globalAlpha=a;ctx.font=`900 ${f.big?17:12}px system-ui,sans-serif`;ctx.lineWidth=3;ctx.strokeStyle='#1a0838';ctx.strokeText(f.text,s.x,s.y);ctx.fillStyle=f.color;ctx.fillText(f.text,s.x,s.y);});ctx.globalAlpha=1;
    if(strikeArmed){ctx.fillStyle='#ffe08a';ctx.globalAlpha=.12+Math.sin(frameT*6)*.05;ctx.fillRect(0,0,cssW,cssH);ctx.globalAlpha=1;ctx.font='800 13px system-ui';ctx.lineWidth=3;ctx.strokeStyle='#1a0838';const tx='☄ Коснитесь поля — куда ударить';ctx.strokeText(tx,cssW/2,22);ctx.fillStyle='#fff1b8';ctx.fillText(tx,cssW/2,22);}
    if(hurt>0){const g=ctx.createRadialGradient(cssW/2,cssH/2,Math.min(cssW,cssH)*.3,cssW/2,cssH/2,Math.max(cssW,cssH)*.7);g.addColorStop(0,'#ff000000');g.addColorStop(1,`rgba(255,40,80,${hurt*.7})`);ctx.fillStyle=g;ctx.fillRect(0,0,cssW,cssH);}
    if(banner){const p=1-banner.t/banner.max,a=p<.15?p/.15:banner.t<.4?banner.t/.4:1,sc=p<.15?.7+p*2:1;ctx.save();ctx.globalAlpha=a;ctx.translate(cssW/2,cssH*.42);ctx.scale(sc,sc);
      const g=ctx.createLinearGradient(-120,0,120,0);g.addColorStop(0,'#3a1580dd');g.addColorStop(.5,'#5a1fa8ee');g.addColorStop(1,'#3a1580dd');ctx.fillStyle=g;rr(ctx,-Math.min(170,cssW*.44),-34,Math.min(340,cssW*.88),68,20);ctx.fill();ctx.strokeStyle='#f6c35b';ctx.lineWidth=2;ctx.stroke();
      ctx.font='900 26px system-ui,sans-serif';const tg=ctx.createLinearGradient(0,-16,0,10);tg.addColorStop(0,'#fff8d8');tg.addColorStop(1,'#ffc23f');ctx.fillStyle=tg;ctx.shadowColor='#ff9de9';ctx.shadowBlur=14;ctx.fillText(banner.title,0,-8);ctx.shadowBlur=0;ctx.font='700 12px system-ui,sans-serif';ctx.fillStyle='#e6dcff';ctx.fillText(banner.sub,0,18);ctx.restore();}
  }
  let frameT=0;
  function drawPortal(t){const p={x:22,y:115};glow(ctx,p.x,p.y,70,'#ff4fd8',.55);ctx.save();ctx.translate(p.x,p.y);for(let i=0;i<3;i++){ctx.rotate(t*(1.2+i*.5)*(i%2?-1:1));ctx.strokeStyle=['#ff9de9','#b78cff','#7ff6ff'][i];ctx.lineWidth=4-i;ctx.beginPath();ctx.arc(0,0,30-i*8,0,4.2);ctx.stroke();}ctx.restore();ctx.fillStyle='#fff';ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(p.x,p.y,5,0,7);ctx.fill();ctx.globalAlpha=1;}
  function drawCore(t){const c=path[path.length-1];const low=state.health<7,col=low?'#ff5f75':'#7ff6ff';const pulse=1+Math.sin(t*(low?8:3))*.08;
    ctx.globalCompositeOperation='lighter';glow(ctx,c.x,c.y,80*pulse,col,.7);glow(ctx,c.x,c.y,40,'#ffffff',.35);ctx.globalCompositeOperation='source-over';
    ctx.save();ctx.translate(c.x,c.y);
    ctx.strokeStyle='#f6c35b';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,34,0,7);ctx.stroke();
    ctx.rotate(t*.8);ctx.strokeStyle=col;ctx.lineWidth=2;ctx.setLineDash([8,8]);ctx.beginPath();ctx.arc(0,0,42,0,7);ctx.stroke();ctx.setLineDash([]);ctx.rotate(-t*.8);
    ctx.scale(pulse,pulse);const g=ctx.createLinearGradient(-14,-24,14,24);g.addColorStop(0,'#ffffff');g.addColorStop(.4,col);g.addColorStop(1,low?'#7a1030':'#2a55d8');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(0,-26);ctx.lineTo(16,0);ctx.lineTo(0,26);ctx.lineTo(-16,0);ctx.closePath();ctx.fill();ctx.strokeStyle='#ffffffcc';ctx.lineWidth=1.5;ctx.stroke();ctx.fillStyle='#ffffff99';ctx.beginPath();ctx.moveTo(0,-26);ctx.lineTo(6,-4);ctx.lineTo(-5,-2);ctx.closePath();ctx.fill();
    ctx.restore();
    const hpF=state.health/20;ctx.strokeStyle='#ffffff22';ctx.lineWidth=5;ctx.beginPath();ctx.arc(c.x,c.y,52,0,7);ctx.stroke();ctx.strokeStyle=low?'#ff5f75':'#6dffb0';ctx.beginPath();ctx.arc(c.x,c.y,52,-Math.PI/2,-Math.PI/2+6.283*hpF);ctx.stroke();}
  function drawTower(t,sel,time){const d=types[t.type],r=19,range=d.range*(1+(t.level-1)*.09);
    if(sel){ctx.fillStyle=d.color+'1c';ctx.strokeStyle=d.color+'aa';ctx.lineWidth=2;ctx.setLineDash([10,8]);ctx.lineDashOffset=-time*20;ctx.beginPath();ctx.arc(t.x,t.y,range,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.setLineDash([]);}
    ctx.globalCompositeOperation='lighter';glow(ctx,t.x,t.y,42+t.level*4,d.color,.45+Math.sin(time*3+t.x)*.08);ctx.globalCompositeOperation='source-over';
    ctx.save();ctx.translate(t.x,t.y);
    ctx.fillStyle='#08031a88';ctx.beginPath();ctx.arc(0,0,r+6,0,7);ctx.fill();
    const metal=ctx.createRadialGradient(-6,-6,2,0,0,r+4);metal.addColorStop(0,'#e7dcff');metal.addColorStop(.45,'#6c5cc8');metal.addColorStop(1,'#231a5c');ctx.fillStyle=metal;ctx.beginPath();for(let i=0;i<8;i++){const a=i*Math.PI/4+Math.PI/8;ctx.lineTo(Math.cos(a)*(r+2),Math.sin(a)*(r+2))}ctx.closePath();ctx.fill();ctx.strokeStyle='#f6c35b';ctx.lineWidth=2.4;ctx.stroke();
    for(let i=0;i<t.level;i++){const a=-Math.PI/2+(i-(t.level-1)/2)*.42;ctx.fillStyle='#fff1a8';star(ctx,Math.cos(a)*(r+1),Math.sin(a)*(r+1),3.6);}
    const kick=(t.kick||0)*30;ctx.rotate(t.ang==null?-Math.PI/2:t.ang);ctx.translate(-kick,0);
    const head=ctx.createLinearGradient(-10,-10,10,10);head.addColorStop(0,'#ffffff');head.addColorStop(.35,d.color);head.addColorStop(1,'#2a1a66');ctx.fillStyle=head;ctx.strokeStyle='#ffffffcc';ctx.lineWidth=1.4;
    if(t.type==='cryo'){for(let i=0;i<6;i++){ctx.save();ctx.rotate(i*Math.PI/3+time*.6);ctx.fillRect(2,-2,13,4);ctx.restore();}ctx.beginPath();ctx.arc(0,0,8,0,7);ctx.fill();ctx.stroke();}
    else if(t.type==='nova'){ctx.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5+time*.8,rr2=i%2?6:14;ctx.lineTo(Math.cos(a)*rr2,Math.sin(a)*rr2)}ctx.closePath();ctx.fill();ctx.stroke();}
    else if(t.type==='prism'){ctx.fillRect(4,-3.5,20,7);ctx.beginPath();ctx.moveTo(14,0);ctx.lineTo(-8,-12);ctx.lineTo(-8,12);ctx.closePath();ctx.fill();ctx.stroke();}
    else if(t.type==='tesla'){ctx.beginPath();ctx.arc(0,0,10,0,7);ctx.fill();ctx.stroke();ctx.strokeStyle='#fff6c0';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(0,0,13+Math.sin(time*9+i*2)*1.5,i*2.1+time*3,i*2.1+time*3+1);ctx.stroke();}}
    else {ctx.fillRect(4,-4,19,8);ctx.beginPath();ctx.arc(0,0,10,0,7);ctx.fill();ctx.stroke();ctx.fillStyle='#ffffff';ctx.fillRect(10,-1.2,12,2.4);}
    ctx.fillStyle='#ffffffaa';ctx.beginPath();ctx.arc(-3,-3,2.6,0,7);ctx.fill();
    ctx.restore();}
  function star(c,x,y,r){c.beginPath();for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,rr2=i%2?r*.45:r;c.lineTo(x+Math.cos(a)*rr2,y+Math.sin(a)*rr2)}c.closePath();c.fill();}
  function drawEnemy(e,time){const pal=e.golden?COLORS.gold:COLORS[e.kind],r=(e.kind==='boss'?24:e.kind==='tank'?15:e.kind==='swift'?10:12)*(portrait?1.2:1);const bob=Math.sin((e.walk||0)*.25+(e.ph||0))*1.6;
    ctx.globalCompositeOperation='lighter';glow(ctx,e.x,e.y,r*2.6,pal[1],e.golden?.9:.45);ctx.globalCompositeOperation='source-over';
    if(e.golden&&Math.random()<.25)particles.push({x:e.x+(Math.random()-.5)*r*2,y:e.y+(Math.random()-.5)*r*2,vx:0,vy:-20,life:.5,max:.5,color:'#ffe27a',size:2});
    ctx.save();ctx.translate(e.x,e.y+bob);
    ctx.fillStyle='#0a031d66';ctx.beginPath();ctx.ellipse(0,r*.9-bob,r*.9,r*.35,0,0,7);ctx.fill();
    const g=ctx.createRadialGradient(-r*.35,-r*.4,1,0,0,r*1.1);g.addColorStop(0,'#ffffff');g.addColorStop(.3,pal[0]);g.addColorStop(1,pal[1]);ctx.fillStyle=e.flash>0?'#ffffff':g;
    ctx.strokeStyle='#2a0b3d';ctx.lineWidth=2;
    if(e.kind==='swift'){const a=e.dir||0;ctx.rotate(a);ctx.beginPath();ctx.moveTo(r*1.4,0);ctx.lineTo(-r,-r);ctx.lineTo(-r*.5,0);ctx.lineTo(-r,r);ctx.closePath();ctx.fill();ctx.stroke();ctx.rotate(-a);}
    else if(e.kind==='tank'){ctx.beginPath();for(let i=0;i<6;i++){const a=i*Math.PI/3+Math.PI/6;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r)}ctx.closePath();ctx.fill();ctx.stroke();}
    else {ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fill();ctx.stroke();
      if(e.kind==='drone'){ctx.strokeStyle=pal[0];ctx.lineWidth=2;const s=Math.sin(time*30)*3;ctx.beginPath();ctx.ellipse(-r*.9,-r*.6,6,2+s*.3,-.5,0,7);ctx.ellipse(r*.9,-r*.6,6,2-s*.3,.5,0,7);ctx.stroke();}}
    if(e.kind==='boss'){ctx.fillStyle='#ffd35a';ctx.strokeStyle='#7a4a12';ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-12,-r+2);ctx.lineTo(-12,-r-10);ctx.lineTo(-6,-r-4);ctx.lineTo(0,-r-13);ctx.lineTo(6,-r-4);ctx.lineTo(12,-r-10);ctx.lineTo(12,-r+2);ctx.closePath();ctx.fill();ctx.stroke();}
    if(e.golden){ctx.fillStyle='#fff6c2';star(ctx,r*.7,-r*.8,4);}
    // глаза
    const look=e.dir||0,lx=Math.cos(look)*1.8,ly=Math.sin(look)*1.8,eyes=e.kind==='tank'||e.kind==='boss'?[-r*.33,r*.33]:[0],er=e.kind==='boss'?6:e.kind==='swift'?3.4:4.4;
    eyes.forEach(ox=>{ctx.fillStyle='#ffffff';ctx.beginPath();ctx.arc(ox,-r*.1,er,0,7);ctx.fill();ctx.fillStyle='#1a0838';ctx.beginPath();ctx.arc(ox+lx,-r*.1+ly,er*.52,0,7);ctx.fill();ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(ox+lx-er*.2,-r*.1+ly-er*.25,er*.18,0,7);ctx.fill();});
    if(e.slow){ctx.strokeStyle='#bfe6ff';ctx.lineWidth=2;ctx.globalAlpha=.8;ctx.beginPath();ctx.arc(0,0,r+4,0,7);ctx.stroke();ctx.globalAlpha=1;}
    ctx.restore();}

  /* ---------- Интерфейс ---------- */
  function sellValue(t){return Math.floor((types[t.type].cost+55*t.level*(t.level-1)/2)*.65);}
  function updateUI(){
    $('credits').textContent=Math.floor(state.credits);$('health').textContent=state.health;$('wave').textContent=state.wave;$('best-wave').textContent='Рекорд '+state.best;
    $('status').textContent=waveRunning?'ВОЛНА АКТИВНА':state.health<=0?'КОНТУР РАЗРУШЕН':'ГОТОВ';
    const early=waveRunning&&!spawnQueue.length;
    $('start-wave').disabled=(waveRunning&&!early)||state.health<=0;
    $('start-wave').firstChild.textContent=early?'Досрочно +'+(20+state.wave*3)+' ':waveRunning?'Волна в секторе ':'Запустить волну ';
    $('start-wave').classList.toggle('early',early);
    $('pause').textContent=paused?'▶ Дальше':'⏸ Пауза';$('pause').disabled=!waveRunning;
    $('speed').textContent='Скорость ×'+speed;
    $('sound').textContent=audioOn?'🔊 Звук: вкл':'🔈 Звук: выкл';$('auto').textContent=state.auto?'⟳ Автоволна: вкл':'⟳ Автоволна: выкл';$('auto').classList.toggle('on',state.auto);
    document.querySelectorAll('.tower-card').forEach(b=>b.classList.toggle('poor',state.credits<types[b.dataset.type].cost));
    const pop=$('towerPop');
    if(selectedTower!==null&&state.towers[selectedTower]){const t=state.towers[selectedTower],d=types[t.type],cost=55*t.level;pop.classList.remove('hidden');pop.style.setProperty('--tc',d.color);
      $('selection-name').textContent=`${d.name} · ${'★'.repeat(t.level)}`;$('selection-info').textContent=`Урон ${Math.round(d.damage*(1+(t.level-1)*.48))} · радиус ${Math.round(d.range*(1+(t.level-1)*.09))}`+(d.chain?` · прыжков ${2+t.level}`:d.pierce?' · пробивает насквозь':d.slow?' · замедляет':d.splash?' · по области':'');
      $('upgrade').textContent=t.level>=4?'Максимум ★★★★':`Улучшить · ${cost}`;$('upgrade').disabled=t.level>=4||state.credits<cost;$('sell').disabled=false;$('sell').textContent='Продать +'+sellValue(t);}
    else{selectedTower=null;pop.classList.add('hidden');$('upgrade').disabled=true;$('sell').disabled=true;}
    updateStrike();
  }
  function updateStrike(){const b=$('strike');const ready=state.strikeCd<=0&&state.health>0;b.classList.toggle('ready',ready);b.classList.toggle('armed',strikeArmed);$('strikeFill').style.transform=`scaleX(${1-state.strikeCd/STRIKE_CD})`;b.querySelector('.lbl').textContent=strikeArmed?'Цель?':ready?'Удар':Math.ceil(state.strikeCd)+'с';}
  const DEFAULT_MSG='Выберите модуль и установите его вне энергоканала';
  function toast(text){const m=$('message');m.textContent=text;m.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>{m.textContent=DEFAULT_MSG;m.classList.remove('show');},2400);}
  canvas.addEventListener('pointerdown',ev=>{const p=point(ev);
    if(strikeArmed){strike(p);return;}
    const idx=state.towers.findIndex(t=>dist(t,p)<30);
    if(idx>=0){selectedTower=idx===selectedTower?null:idx;updateUI();beep(600,.04);return}
    if(selectedTower!==null){selectedTower=null;updateUI();return;}
    place(p);});
  document.querySelectorAll('.tower-card').forEach(b=>b.addEventListener('click',()=>{selectedType=b.dataset.type;selectedTower=null;strikeArmed=false;document.querySelectorAll('.tower-card').forEach(x=>x.classList.toggle('selected',x===b));updateUI();toast(types[selectedType].name+': коснитесь поля, чтобы установить');}));
  $('start-wave').addEventListener('click',startWave);$('restart').addEventListener('click',()=>reset());$('reset').addEventListener('click',()=>{if(confirm('Сбросить весь локальный прогресс?'))reset(false)});
  $('upgrade').addEventListener('click',()=>{if(selectedTower===null)return;const t=state.towers[selectedTower],cost=55*t.level;if(t.level<4&&state.credits>=cost){state.credits-=cost;t.level++;stat('upgrades');save();updateUI();burst(t.x,t.y,types[t.type].color,26);burst(t.x,t.y,'#fff1a8',12);ring(t.x,t.y,'#f6c35b',50);beep(760,.1);checkQuests();}});
  $('tpClose').addEventListener('click',()=>{selectedTower=null;updateUI();});
  $('strike').addEventListener('click',()=>{if(state.strikeCd>0){toast('Орбитальный удар заряжается: '+Math.ceil(state.strikeCd)+' с');return;}strikeArmed=!strikeArmed;selectedTower=null;updateUI();if(strikeArmed)toast('☄ Коснитесь поля — куда ударить');});
  $('auto').addEventListener('click',()=>{state.auto=!state.auto;autoT=state.auto&&!waveRunning?3:0;save();updateUI();toast(state.auto?'Автоволна: следующая волна начнётся сама через 3 с':'Автоволна выключена');});
  $('quests').addEventListener('click',()=>{renderQuests();$('questModal').classList.remove('hidden');});
  $('questClose').addEventListener('click',()=>$('questModal').classList.add('hidden'));
  $('questModal').addEventListener('click',e=>{if(e.target===$('questModal'))$('questModal').classList.add('hidden');});
  addEventListener('keydown',e=>{if(['1','2','3','4','5'].includes(e.key))document.querySelectorAll('.tower-card')[+e.key-1].click();if(e.key==='Escape'){selectedTower=null;strikeArmed=false;updateUI()}if(e.key===' '&&e.target===document.body){e.preventDefault();startWave();}if(e.key==='q'||e.key==='й')$('strike').click();});
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
  $('speed').addEventListener('click',()=>{speed=speed===1?2:speed===2?3:1;updateUI();});
  $('sound').addEventListener('click',()=>{audioOn=!audioOn;beep(660,.1);updateUI();});
  $('sell').addEventListener('click',()=>{
    if(selectedTower===null)return;
    const tower=state.towers[selectedTower],refund=sellValue(tower);
    state.credits+=refund;burst(tower.x,tower.y,'#ffe08a',16);floats.push({x:tower.x,y:tower.y-16,text:'+'+refund,color:'#ffe27a',life:.9,max:.9});state.towers.splice(selectedTower,1);selectedTower=null;save();updateUI();toast('Модуль продан: +'+refund+' энергии');
  });
  let rafId=0;
  document.addEventListener('visibilitychange',()=>{last=performance.now();if(document.hidden){save();if(audioContext)audioContext.suspend().catch(()=>{});cancelAnimationFrame(rafId);rafId=0;}else loop();});
  addEventListener('pagehide',save);
  let resizeT=0;addEventListener('resize',()=>{clearTimeout(resizeT);resizeT=setTimeout(()=>{layout();draw();},120);});
  let uiT=0,perf={n:0,ms:0};
  function frame(now){
    rafId=requestAnimationFrame(frame);
    const busy=(waveRunning&&!paused)||particles.length||shots.length||rings.length||floats.length||banner||strikeArmed;
    const minGap=eco()||!busy?1000/30-2:0;
    if(now-lastDraw<minGap)return;
    const dt=Math.min(.05,(now-last)/1000);last=now;lastDraw=now;
    const t0=performance.now();
    if(!paused)update(dt*speed);
    updateFx(dt);frameT+=dt;
    draw();
    perf.n++;perf.ms+=performance.now()-t0;
    if(waveRunning&&now-lastSave>2000){lastSave=now;save();}
    if(now-uiT>250){uiT=now;updateStrike();if(waveRunning)updateUI();}
  }
  function loop(){if(!rafId&&!document.hidden){last=performance.now();rafId=requestAnimationFrame(frame);}}
  state=load();
  questsToday();
  layout();updateUI();renderQuests();checkQuests();loop();
  if(state.health<=0){$('summary').textContent='Завершено волн: '+state.completed+'. Рекорд: '+state.best;$('gameover').classList.remove('hidden');}
  if(paused)toast('Незаконченная волна восстановлена. Нажмите «Дальше».');
  const movePK=()=>{const h=document.getElementById('playkit-tools'),tb=document.querySelector('.topbar');if(h&&tb&&h.parentElement!==tb){tb.appendChild(h);layout();}return !!h;};
  if(!movePK()){const mo2=new MutationObserver(()=>{if(movePK())mo2.disconnect();});mo2.observe(document.body,{childList:true});setTimeout(()=>mo2.disconnect(),8000);}
  setTimeout(()=>{layout();},300);
  window.__EIDOS={get state(){return state},get enemies(){return enemies},startWave,strike,questsToday,checkQuests,perf,toWorld:point,toScreen,get portrait(){return portrait},armStrike(){strikeArmed=true;updateUI();},spawnGolden(){spawn('drone');enemies[enemies.length-1].golden=true;}};
})();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(reg=>{
    const up=()=>reg.update().catch(()=>{});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)up();});
    setInterval(up,15*60*1000);
  }).catch(() => {});
  let reloaded=false;
  if(navigator.serviceWorker.controller)navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloaded)return;reloaded=true;location.reload();});
}

/* Раздел «Образы и оформление» удалён: убираем его старые настройки. */
try{for(const k of Object.keys(localStorage))if(k.startsWith('aleksei-studio:'))localStorage.removeItem(k);}catch{}
