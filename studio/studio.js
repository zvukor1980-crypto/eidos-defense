/* Local appearance studio. No network requests, advertising or continuous animations. */
(() => {
  'use strict';
  const config = window.ALEKSEI_STUDIO;
  if (!config || document.getElementById('as-launch')) return;
  const ownScript = document.currentScript;
  const base = new URL('./', ownScript.src);
  const prefKey = 'aleksei-studio:' + config.id;
  const allowed = new Set(config.keys || []);
  const defaults = {theme:'gloss',favorite:null,large:false,quiet:matchMedia('(prefers-reduced-motion: reduce)').matches};
  let prefs;
  try { prefs = {...defaults, ...JSON.parse(localStorage.getItem(prefKey) || '{}')}; } catch { prefs = {...defaults}; }
  const themes = [['original','Исходная'],['gloss','Цветной лак'],['leather','Тёмная кожа'],['pearl','Жемчуг']];
  if (!themes.some(([id]) => id === prefs.theme)) prefs.theme = 'gloss';
  if (!Number.isInteger(prefs.favorite) || prefs.favorite < 1 || prefs.favorite > 10) prefs.favorite = null;
  const imgUrl = i => new URL('looks/look-' + String(i).padStart(2,'0') + '.webp',base).href;
  const launcher = document.createElement('button');
  launcher.id = 'as-launch'; launcher.type = 'button'; launcher.className = 'as-launch'; launcher.textContent = '✦ Образы и оформление';
  launcher.setAttribute('aria-haspopup','dialog');
  const dialog = document.createElement('dialog'); dialog.id = 'as-dialog'; dialog.className = 'as-dialog';
  dialog.setAttribute('aria-labelledby','as-title');
  dialog.innerHTML = `<header class="as-head"><div><small>Личная коллекция</small><h2 id="as-title">Образы и оформление</h2></div><button type="button" class="as-close" aria-label="Закрыть">×</button></header>
    <p class="as-lead"></p><section class="as-section"><h3>Материал интерфейса</h3><div class="as-themes"></div></section>
    <section class="as-section"><h3>Коллекция образов</h3><p>Выбери любимый образ. Нажми на картинку, чтобы рассмотреть её целиком.</p><div class="as-looks"></div><button type="button" class="as-reset-look">Убрать любимый образ</button></section>
    <section class="as-section as-memory"><h3>Найди пары образов</h3><p>Открой две карточки. Найди одинаковые фотографии. Можно играть спокойно, без таймера.</p><label>Размер поля <select id="as-memory-level"><option value="4">Легко · 4 пары</option><option value="6">Средне · 6 пар</option><option value="10">Сложно · 10 пар</option></select></label><div class="as-actions"><button type="button" id="as-memory-start">Новая игра</button><button type="button" id="as-memory-daily">Задание дня</button></div><p id="as-memory-status" role="status" aria-live="polite">Нажми «Новая игра», чтобы начать.</p><div id="as-memory-board" class="as-memory-board" aria-label="Карточки для поиска пар"></div></section>
    <section class="as-section"><h3>Удобство</h3><label><input type="checkbox" id="as-large"> Крупные кнопки и текст</label><label><input type="checkbox" id="as-quiet"> Меньше декоративных анимаций</label><button type="button" id="as-install">Как добавить на главный экран</button><p id="as-install-help" hidden>На iPhone открой приложение в Safari, нажми «Поделиться» и выбери «На экран Домой». Сохранённый прогресс остаётся в этом браузере.</p></section>
    <section class="as-section as-backups"><h3>Копия прогресса</h3><p>Сохрани копию в «Файлы» перед переустановкой или переносом на другой телефон.</p><div class="as-actions"><button type="button" id="as-export">Сохранить копию</button><button type="button" id="as-import">Восстановить копию</button></div><input type="file" id="as-file" accept="application/json,.json" hidden></section>
    <p id="as-notice" role="status" aria-live="polite"></p>`;
  document.body.appendChild(dialog);
  dialog.querySelector('.as-lead').textContent = config.caption || config.title;
  const notice = text => {dialog.querySelector('#as-notice').textContent=text;};
  function persist(){try{localStorage.setItem(prefKey,JSON.stringify(prefs));return true;}catch{notice('Не удалось сохранить настройки. Проверь свободную память браузера.');return false;}}
  function apply(){
    document.documentElement.dataset.studioTheme=prefs.theme;
    document.documentElement.dataset.studioLarge=String(!!prefs.large);
    document.documentElement.dataset.studioQuiet=String(!!prefs.quiet);
    document.documentElement.style.setProperty('--as-accent',config.accent || '#7c3aed');
    launcher.textContent=prefs.favorite?'✦ Любимый образ №'+prefs.favorite:'✦ Образы и оформление';
    if(prefs.favorite)launcher.style.setProperty('--as-look',`url("${imgUrl(prefs.favorite)}")`);else launcher.style.removeProperty('--as-look');
    dialog.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===prefs.theme)));
    dialog.querySelectorAll('[data-favorite]').forEach(b=>{const chosen=Number(b.dataset.favorite)===prefs.favorite;b.setAttribute('aria-pressed',String(chosen));b.textContent=chosen?'♥ Выбран':'♡ Выбрать';});
    dialog.querySelector('#as-large').checked=!!prefs.large;dialog.querySelector('#as-quiet').checked=!!prefs.quiet;
  }
  for(const [id,title] of themes){const b=document.createElement('button');b.type='button';b.dataset.theme=id;b.textContent=title;b.onclick=()=>{prefs.theme=id;apply();persist();};dialog.querySelector('.as-themes').appendChild(b);}
  for(let i=1;i<=10;i++){
    const card=document.createElement('article');card.className='as-look';
    const view=document.createElement('button');view.type='button';view.className='as-look-view';view.setAttribute('aria-label','Рассмотреть образ '+i);
    const image=document.createElement('img');image.src=imgUrl(i);image.alt='Образ '+i+' из твоей коллекции';image.loading='lazy';image.decoding='async';image.width=480;image.height=1037;view.appendChild(image);
    const label=document.createElement('strong');label.textContent='Образ '+String(i).padStart(2,'0');
    const choose=document.createElement('button');choose.type='button';choose.dataset.favorite=String(i);choose.onclick=()=>{prefs.favorite=i;apply();persist();};
    view.onclick=()=>{
      const full=document.createElement('div');full.className='as-full';const photo=image.cloneNode();photo.loading='eager';
      const close=document.createElement('button');close.type='button';close.textContent='Закрыть изображение';close.onclick=()=>{full.remove();view.focus();};
      full.append(photo,close);dialog.appendChild(full);close.focus();
    };card.append(view,label,choose);dialog.querySelector('.as-looks').appendChild(card);
  }
  // Photo pairs: turn-based, no rendering loop or repeating timer.
  const memoryKey = prefKey + ':pairs';
  const board = dialog.querySelector('#as-memory-board');
  const memoryStatus = dialog.querySelector('#as-memory-status');
  let pairCards=[], opened=[], matched=0, moves=0, locked=false, hideTimer=null, round=0, dailyLabel='';
  let records={};
  try { const value=JSON.parse(localStorage.getItem(memoryKey)||'{}'); if(value&&typeof value==='object'&&!Array.isArray(value))records=value; } catch {}
  function stopFlipTimer(){if(hideTimer!==null){clearTimeout(hideTimer);hideTimer=null;}if(locked){for(const i of opened)revealCard(i,false);opened=[];locked=false;}}
  function revealCard(i,shown){
    const b=board.children[i];if(!b)return;b.classList.toggle('as-revealed',shown);b.querySelector('img').hidden=!shown;b.querySelector('span').hidden=shown;
    b.setAttribute('aria-label',shown?'Образ '+pairCards[i]:'Закрытая карточка '+(i+1));
    b.setAttribute('aria-pressed',String(shown));
  }
  function memorySummary(){
    const count=pairCards.length/2,key=String(count),best=Number.isInteger(records[key])&&records[key]>=count?records[key]:null;
    memoryStatus.textContent=(dailyLabel?dailyLabel+' · ':'')+'Пары: '+matched+' / '+count+' · Ходы: '+moves+(best?' · Рекорд: '+best:'');
  }
  function randomSource(seed){
    if(seed===undefined)return Math.random;
    let state=2166136261;for(const c of seed)state=Math.imul(state^c.charCodeAt(0),16777619)>>>0;
    return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  }
  function shuffle(values,rng){for(let i=values.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[values[i],values[j]]=[values[j],values[i]];}return values;}
  function startPairs(daily){
    stopFlipTimer();round++;opened=[];matched=0;moves=0;locked=false;board.replaceChildren();
    const count=Number(dialog.querySelector('#as-memory-level').value);
    const now=new Date(),date=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0')+'-'+String(now.getDate()).padStart(2,'0');
    dailyLabel=daily?'Задание '+date:'';
    const rng=randomSource(daily?date+':'+count:undefined),photos=shuffle(Array.from({length:10},(_,i)=>i+1),rng).slice(0,count);
    pairCards=shuffle([...photos,...photos],rng);
    board.dataset.pairs=String(count);
    pairCards.forEach((photo,i)=>{
      const b=document.createElement('button');b.type='button';b.className='as-memory-card';
      const img=document.createElement('img');img.src=imgUrl(photo);img.alt='Образ '+photo;img.width=480;img.height=1037;img.hidden=true;img.decoding='async';
      const back=document.createElement('span');back.textContent='✦';back.setAttribute('aria-hidden','true');b.append(img,back);board.append(b);revealCard(i,false);
      b.onclick=()=>{
        if(locked||b.disabled||opened.includes(i))return;
        revealCard(i,true);opened.push(i);if(opened.length<2)return;
        moves++;const [a,z]=opened;
        if(pairCards[a]===pairCards[z]){
          board.children[a].disabled=true;board.children[z].disabled=true;board.children[a].classList.add('as-matched');board.children[z].classList.add('as-matched');opened=[];matched++;memorySummary();
          if(matched===count){
            const old=Number.isInteger(records[String(count)])&&records[String(count)]>=count?records[String(count)]:Infinity;
            records[String(count)]=Math.min(old,moves);
            let saved=true;try{localStorage.setItem(memoryKey,JSON.stringify(records));}catch{saved=false;}
            memorySummary();memoryStatus.textContent+=' · Готово! Все пары найдены.'+(saved?'':' Рекорд не удалось сохранить.');
          }
        }else{
          locked=true;memorySummary();const currentRound=round;
          hideTimer=setTimeout(()=>{hideTimer=null;if(currentRound!==round)return;revealCard(a,false);revealCard(z,false);opened=[];locked=false;},850);
        }
      };
    });memorySummary();
  }
  dialog.querySelector('#as-memory-start').onclick=()=>startPairs(false);
  dialog.querySelector('#as-memory-daily').onclick=()=>startPairs(true);
  dialog.querySelector('#as-memory-level').onchange=()=>startPairs(false);
  dialog.addEventListener('close',stopFlipTimer);
  dialog.addEventListener('cancel',stopFlipTimer);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopFlipTimer();});
  const close=()=>{stopFlipTimer();if(dialog.close)dialog.close();else dialog.removeAttribute('open');launcher.focus();};
  dialog.querySelector('.as-close').onclick=close;
  dialog.addEventListener('click',e=>{if(e.target===dialog)close();});
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'&&dialog.querySelector('.as-full')){e.preventDefault();dialog.querySelector('.as-full button').click();}});
  launcher.onclick=()=>{notice('');if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');dialog.querySelector('.as-close').focus();};
  dialog.querySelector('.as-reset-look').onclick=()=>{prefs.favorite=null;apply();persist();};
  for(const [id,key] of [['as-large','large'],['as-quiet','quiet']])dialog.querySelector('#'+id).onchange=e=>{prefs[key]=e.target.checked;apply();persist();};
  dialog.querySelector('#as-install').onclick=()=>{const help=dialog.querySelector('#as-install-help');help.hidden=!help.hidden;};
  const hasSaves=allowed.size>0;dialog.querySelector('.as-backups').hidden=!hasSaves;
  const safeParse=text=>JSON.parse(text,(key,value)=>{if(['__proto__','prototype','constructor'].includes(key))throw Error('Неподходящие данные в файле');return value;});
  function snapshot(){const values={};for(const key of allowed){const value=localStorage.getItem(key);if(value!==null)values[key]=value;}return values;}
  dialog.querySelector('#as-export').onclick=()=>{
    try{
      const data={format:'aleksei-save',version:1,app:config.id,created:new Date().toISOString(),values:snapshot()};
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
      a.href=url;a.download=config.id+'-progress-'+new Date().toISOString().slice(0,10)+'.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);notice('Копия готова. Сохрани загруженный файл в «Файлы».');
    }catch{notice('Не удалось создать копию прогресса.');}
  };
  dialog.querySelector('#as-import').onclick=()=>dialog.querySelector('#as-file').click();
  dialog.querySelector('#as-file').onchange=async e=>{
    const file=e.target.files[0];if(!file)return;
    try{
      if(file.size>5*1024*1024)throw Error('Файл слишком большой');
      const data=safeParse(await file.text());
      if(data.format!=='aleksei-save'||data.version!==1||data.app!==config.id||!data.values||Array.isArray(data.values)||typeof data.values!=='object')throw Error('Это копия другого приложения или неподходящий файл');
      const entries=Object.entries(data.values);if(!entries.length)throw Error('В копии нет сохранённого прогресса');
      for(const [key,value] of entries){if(!allowed.has(key)||typeof value!=='string')throw Error('Неподходящие данные в файле');const parsed=safeParse(value);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw Error('Повреждённое сохранение');}
      if(!confirm('Заменить текущий прогресс этой копией?'))return;
      const before=snapshot();
      try{localStorage.setItem(prefKey+':before-import',JSON.stringify(before));for(const [key,value] of entries)localStorage.setItem(key,value);}
      catch(error){for(const key of allowed){if(key in before)localStorage.setItem(key,before[key]);else localStorage.removeItem(key);}throw error;}
      location.reload();
    }catch(error){notice(error.message || 'Не удалось восстановить копию');}
    finally{e.target.value='';}
  };
  function placeLauncher(){
    if(document.contains(launcher))return;
    const logo=document.querySelector('#logo');
    const header=document.querySelector('#view .head, #view header, .topbar, main header, header, #menu .menu-actions, #home');
    if(logo&&logo.parentElement)logo.insertAdjacentElement('afterend',launcher);
    else if(header)header.appendChild(launcher);
    else{launcher.classList.add('as-floating');document.body.appendChild(launcher);}
  }
  apply();placeLauncher();
  // App pages replace their headers on navigation, so restore the entry there.
  const observer=new MutationObserver(placeLauncher);observer.observe(document.body,{childList:true,subtree:true});
})();
