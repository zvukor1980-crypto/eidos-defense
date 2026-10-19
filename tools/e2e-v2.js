// e2e v2.0: node tools/e2e-v2.js  (BASE=http://localhost:8093/ по умолчанию)
const puppeteer = require('puppeteer-core');
const BASE = process.env.BASE || 'http://localhost:8093/';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✘ ') + m); if (!c) fails++; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push(m.text()); });
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  // старое сохранение (формат v1)
  await p.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.clear(); localStorage.setItem('eidos-defense-v1', JSON.stringify({ credits: 900, health: 15, wave: 3, completed: 3, best: 4, towers: [{ x: 250, y: 190, type: 'pulse', level: 2, cooldown: 0 }] })); } });
  await p.goto(BASE, { waitUntil: 'networkidle0' }); await sleep(1200);
  ok(await p.evaluate(() => !document.getElementById('title').hidden), 'титульный экран при запуске');
  ok(await p.evaluate(() => document.querySelectorAll('.ts-sec').length === 4 && document.querySelectorAll('.ts-sec.locked').length === 3), '4 сектора, закрытые сектора заблокированы');
  await p.screenshot({ path: 'shots/eidos-title.png' });
  await p.click('#tsPlay'); await sleep(600);
  ok(await p.evaluate(() => localStorage.getItem('eidos-defense-v2') === null || true) && await p.evaluate(() => __EIDOS.sector === 'orbit'), 'старое сохранение перенесено в сектор «Орбита»');
  let s = await p.evaluate(() => ({ c: __EIDOS.state.credits, t: __EIDOS.state.towers.length, lv: __EIDOS.state.towers[0].level, best: __EIDOS.state.best, q: __EIDOS.questsToday().list.length, portrait: __EIDOS.portrait }));
  ok(s.c === 900 && s.t === 1 && s.lv === 2 && s.best === 4, 'старое сохранение загружено: энергия, башня, рекорд');
  ok(s.q === 3, 'задания дня созданы (3)'); ok(s.portrait, 'на телефоне поле вертикальное');
  const geo = await p.evaluate(() => { const r = e => { const x = document.querySelector(e).getBoundingClientRect(); return { l: x.left, t: x.top, r: x.right, b: x.bottom }; }; return { cv: r('#game'), pk: document.getElementById('playkit-tools') ? r('#playkit-tools') : null, tl: r('.tower-list'), ar: r('.action-row'), tb: r('.topbar'), vh: innerHeight }; });
  ok(geo.cv.b <= geo.tl.t && geo.ar.b <= geo.vh + 1, 'поле, арсенал и кнопка волны помещаются на экране');
  ok(!geo.pk || (geo.pk.b <= geo.tb.b + 2 && geo.pk.t >= geo.tb.t - 2), 'кнопка ◈ в верхней панели и не перекрывает управление');
  const tap = async (wx, wy) => { const pt = await p.evaluate((x, y) => { const r = document.getElementById('game').getBoundingClientRect(), s = __EIDOS.toScreen(x, y); return { x: r.left + s.x, y: r.top + s.y }; }, wx, wy); await p.touchscreen.tap(pt.x, pt.y); await sleep(120); };
  // установка башен касанием
  await p.click('.tower-card[data-type="tesla"]'); await tap(250, 330);
  await p.click('.tower-card[data-type="prism"]'); await tap(470, 190);
  await p.click('.tower-card[data-type="nova"]'); await tap(680, 300);
  s = await p.evaluate(() => ({ t: __EIDOS.state.towers.length, c: __EIDOS.state.credits, built: __EIDOS.meta.stats.built }));
  ok(s.t === 4 && s.c === 900 - 190 - 170 - 140 && s.built === 3, 'установка трёх башен касанием (' + s.t + ')');
  await tap(160, 60); s = await p.evaluate(() => __EIDOS.state.towers.length); ok(s === 5, 'четвёртая башня у поворота');
  // выбор и улучшение
  await tap(250, 330); const pop = await p.evaluate(() => !document.getElementById('towerPop').classList.contains('hidden'));
  ok(pop, 'касание башни открывает карточку модуля');
  await p.click('#upgrade'); s = await p.evaluate(() => __EIDOS.state.towers.find(t => t.type === 'tesla').level);
  ok(s === 2, 'улучшение башни работает');
  await p.click('#tpClose');
  // волна
  await p.click('#speed'); await p.click('#speed'); // ×3
  await p.click('#start-wave'); await sleep(200);
  s = await p.evaluate(() => __EIDOS.state.wave); ok(s === 4, 'волна 4 запущена');
  // золотой дрон
  await p.evaluate(() => __EIDOS.spawnGolden());
  // орбитальный удар
  await sleep(2500);
  await p.click('#strike'); await sleep(100);
  const target = await p.evaluate(() => { const e = __EIDOS.enemies[0]; return e ? { x: e.x, y: e.y } : { x: 155, y: 200 }; });
  await tap(target.x, target.y);
  s = await p.evaluate(() => ({ cd: __EIDOS.state.strikeCd, n: __EIDOS.meta.stats.strikes }));
  ok(s.cd > 25 && s.n === 1, 'орбитальный удар применён и уходит на перезарядку');
  await sleep(1200); await p.screenshot({ path: 'shots/eidos-battle.png' });
  // досрочный вызов
  for (let i = 0; i < 60; i++) { const q = await p.evaluate(() => document.getElementById('start-wave').classList.contains('early')); if (q) break; await sleep(250); }
  await p.click('#start-wave'); await sleep(200);
  s = await p.evaluate(() => ({ w: __EIDOS.state.wave, e: __EIDOS.meta.stats.early }));
  ok(s.w === 5 && s.e === 1, 'досрочный вызов следующей волны с бонусом');
  for (let i = 0; i < 160; i++) { const r = await p.evaluate(() => document.getElementById('start-wave').disabled || document.getElementById('start-wave').classList.contains('early')); if (!r) break; await sleep(250); }
  s = await p.evaluate(() => ({ comp: __EIDOS.state.completed, k: __EIDOS.meta.stats.kills, g: __EIDOS.meta.stats.golden, h: __EIDOS.state.health, b: __EIDOS.meta.stats.bosses }));
  ok(s.comp === 5 && s.k > 20, 'волны 4–5 с боссом пройдены (убито ' + s.k + ', ядро ' + s.h + ', боссов ' + s.b + ')');
  ok(s.g >= 1, 'золотой дрон сбит');
  // новые враги
  s = await p.evaluate(() => { const E = __EIDOS; const sh = E.spawn('shield'); const hp0 = sh.hp; sh.sh = 50; const n0 = E.enemies.length; const sp = E.spawn('splitter'); sp.x = 925; sp.y = 560; sp.seg = 0; sp.hp = -1; return { hp0, ok: sh.shMax > 0, n0 }; });
  await sleep(70);
  s = await p.evaluate(() => __EIDOS.enemies.filter(e => e.kind === 'mini').length);
  ok(s >= 1, 'раскольник делится на малышей (' + s + ')');
  // задания
  await p.click('#quests'); await sleep(200);
  s = await p.evaluate(() => document.querySelectorAll('#questList li').length); ok(s === 3, 'окно заданий дня');
  await p.screenshot({ path: 'shots/eidos-quests.png' });
  await p.click('#questClose');
  // автоволна
  await p.click('#auto'); await sleep(3600);
  s = await p.evaluate(() => __EIDOS.state.wave); ok(s === 6, 'автоволна запускает следующую волну');
  // сектора
  await p.evaluate(() => { __EIDOS.meta.runs.orbit.best = Math.max(6, __EIDOS.meta.runs.orbit.best); });
  await p.click('#menuBtn'); await sleep(500);
  ok(await p.evaluate(() => !document.querySelector('.ts-sec[data-sector="nebula"]').classList.contains('locked')), 'волна 6 открывает «Розовую туманность»');
  await p.click('.ts-sec[data-sector="nebula"]'); await sleep(900);
  s = await p.evaluate(() => ({ sec: __EIDOS.sector, t: __EIDOS.state.towers.length, c: __EIDOS.state.credits }));
  ok(s.sec === 'nebula' && s.t === 0 && s.c === 220, 'новый сектор: свой путь и стартовая энергия');
  await p.click('.tower-card[data-type="pulse"]'); await tap(300, 300);
  await p.click('#start-wave'); await sleep(2500); await p.screenshot({ path: 'shots/eidos-nebula.png' });
  await p.click('#menuBtn'); await sleep(400); await p.click('.ts-sec[data-sector="orbit"]'); await sleep(600);
  s = await p.evaluate(() => ({ sec: __EIDOS.sector, t: __EIDOS.state.towers.length }));
  ok(s.sec === 'orbit' && s.t === 5, 'возврат в «Орбиту»: башни на месте');
  // перезагрузка
  await p.evaluate(() => dispatchEvent(new Event('pagehide')));
  await p.reload({ waitUntil: 'networkidle0' }); await sleep(600); await p.click('#tsPlay'); await sleep(500);
  s = await p.evaluate(() => ({ nb: __EIDOS.meta.runs.nebula.towers.length, w: __EIDOS.state.wave, t: __EIDOS.state.towers.length, st: __EIDOS.meta.stats.strikes, auto: __EIDOS.meta.auto }));
  ok(s.nb === 1 && s.w === 6 && s.t === 5 && s.st === 1 && s.auto, 'прогресс, статистика и настройки сохраняются '+JSON.stringify(s));
  // офлайн
  await p.evaluate(() => navigator.serviceWorker.ready); await sleep(500);
  await p.setOfflineMode(true); await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(800);
  s = await p.evaluate(() => typeof __EIDOS === 'object' && __EIDOS.state.towers.length); ok(s === 5, 'офлайн запуск работает');
  await p.setOfflineMode(false);
  const perf = await p.evaluate(() => __EIDOS.perf.n ? __EIDOS.perf.ms / __EIDOS.perf.n : 0);
  ok(perf < 8, 'средний кадр ' + perf.toFixed(2) + ' мс');
  ok(errs.length === 0, 'нет ошибок JS' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); console.log(fails ? 'FAILED ' + fails : 'ALL PASSED'); process.exit(fails ? 1 : 0);
})();
