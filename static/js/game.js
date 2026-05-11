/* ════════════════════════════════════════════════════════════════════════════
   SkateRun · game.js  v3 — Full Featured
   ════════════════════════════════════════════════════════════════════════════ */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  const w = document.getElementById('gameWrapper').clientWidth;
  canvas.width = w;
  canvas.height = Math.round(w * (210 / 700));
}
resizeCanvas();
window.addEventListener('resize', () => { resizeCanvas(); initPlayer(); if (state !== 'running') draw(); });

const S = () => ({
  W: canvas.width, H: canvas.height,
  GY: Math.round(canvas.height * 0.76),
  sc: canvas.width / 700
});

/* ── Level config ─────────────────────────────────────────────────────────── */
const LEVEL_CONFIG = {
  1:  { baseSpeed:3,   goalScore:1200, maxObs:2, obsGap:180, doubleJump:true,  weather:'clear', label:'Tutorial',  story:'Dein erster Tag auf dem Board. Die Stadt liegt vor dir — zeig was du kannst.' },
  2:  { baseSpeed:3.5, goalScore:1600, maxObs:2, obsGap:160, doubleJump:true,  weather:'clear', label:'Downtown',   story:'Die Straßen füllen sich. Leute schauen zu. Zeig ihnen wer du bist.' },
  3:  { baseSpeed:4,   goalScore:2000, maxObs:3, obsGap:150, doubleJump:true,  weather:'rain',  label:'Im Regen',   story:'Es fängt an zu regnen. Der Asphalt glänzt. Du fährst trotzdem.' },
  4:  { baseSpeed:4.5, goalScore:2500, maxObs:3, obsGap:140, doubleJump:true,  weather:'clear', label:'Nacht',      story:'Mitternacht. Neonlichter überall. Die Stadt gehört nur dir.' },
  5:  { baseSpeed:5,   goalScore:3000, maxObs:3, obsGap:130, doubleJump:false, weather:'clear', label:'Speed Zone', story:'Kein Doppelsprung mehr. Ab jetzt zählt nur noch Reflex.' },
  6:  { baseSpeed:5.5, goalScore:3600, maxObs:4, obsGap:120, doubleJump:false, weather:'storm', label:'Gewitter',   story:'Blitz und Donner. Die Hindernisse kommen immer schneller.' },
  7:  { baseSpeed:6,   goalScore:4200, maxObs:4, obsGap:110, doubleJump:false, weather:'rain',  label:'Storm Run',  story:'Der Regen peitscht. Du siehst kaum noch was. Vertraue deinem Instinkt.' },
  8:  { baseSpeed:6.5, goalScore:5000, maxObs:4, obsGap:100, doubleJump:false, weather:'storm', label:'Neon Hell',  story:'Die Stadt dreht völlig durch. Alles bewegt sich. Halt durch.' },
  9:  { baseSpeed:7,   goalScore:6000, maxObs:5, obsGap:90,  doubleJump:false, weather:'storm', label:'Overdrive',  story:'Du bist zur Legende geworden. Nur noch eine letzte Fahrt.' },
  10: { baseSpeed:8,   goalScore:7500, maxObs:5, obsGap:80,  doubleJump:false, weather:'storm', label:'FINAL',      story:'Das ist es. Das Ende der Linie. Alles oder nichts. Jetzt oder nie.' },
};

const LVL = window.GAME_LEVEL || 1;
const cfg = LEVEL_CONFIG[LVL];

/* ── Audio (Web Audio API) ────────────────────────────────────────────────── */
let audioCtx = null;
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playTone(freq, type='square', dur=0.08, vol=0.12, delay=0) {
  try {
    const ac = getAudio();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ac.currentTime + delay);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + delay + dur);
    o.start(ac.currentTime + delay);
    o.stop(ac.currentTime + delay + dur + 0.01);
  } catch(e) {}
}
function sfxJump()    { playTone(300,'square',0.1,0.1); playTone(500,'square',0.08,0.06,0.05); }
function sfxCoin()    { playTone(880,'sine',0.07,0.15); playTone(1320,'sine',0.07,0.1,0.05); }
function sfxPowerup() { [523,659,784,1047].forEach((f,i)=>playTone(f,'sine',0.1,0.15,i*0.07)); }
function sfxHit()     { playTone(120,'sawtooth',0.2,0.2); playTone(80,'sawtooth',0.15,0.15,0.1); }
function sfxCombo(n)  { playTone(440+n*60,'sine',0.06,0.15); }
function sfxWin()     { [523,659,784,1047,1319].forEach((f,i)=>playTone(f,'sine',0.15,0.2,i*0.1)); }

/* ── State ────────────────────────────────────────────────────────────────── */
let state = 'intro';
let touchHintAlpha = 1.5; // fades out at game start
let airTime = 0;          // frames in air
let saltoAngle = 0;       // current rotation during salto
let saltoSpeed = 0;       // rotation speed
let saltoCount = 0;       // full rotations done this jump
let saltoScored = false;  // already gave combo this salto
let score = 0, coins = 0, lives = 3, frameCount = 0;
let speed = cfg.baseSpeed, bestScore = null, rafId = null;
let combo = 0, comboTimer = 0, comboMax = 0;
const stats = { jumps:0, obstacles:0, hits:0, coinsCollected:0 };

/* ── Player ───────────────────────────────────────────────────────────────── */
const player = {
  x:0, y:0, w:0, h:0,
  vy:0, vx:0,
  onGround:true, jumpCount:0,
  trail:[], invincible:0,
  onRamp:false, currentRamp:null,
  shield:0, slowMo:0, magnet:0,
};

function initPlayer() {
  const { W, GY } = S();
  player.w = W*0.04; player.h = W*0.052;
  player.x = W*0.11; player.y = GY - player.h;
  player.vy = 0; player.vx = 0;
  player.onGround = true; player.jumpCount = 0;
  player.trail = []; player.invincible = 0;
  player.onRamp = false; player.currentRamp = null;
  player.shield = 0; player.slowMo = 0; player.magnet = 0;
  player.onRamp = false; player.currentRamp = null;
}

/* ── Obstacles ────────────────────────────────────────────────────────────── */
let obstacles = [], nextObstacle = 90;

function spawnObstacle() {
  const { W, GY, sc } = S();
  const typePool = LVL<3 ? ['cone','box','rail'] :
                   LVL<6 ? ['cone','box','rail','wall'] :
                            ['cone','box','rail','wall','boss'];
  const tKey = typePool[Math.floor(Math.random()*typePool.length)];
  const configs = {
    cone: { w:W*0.026, h:W*0.043, color:'#ff6b35' },
    box:  { w:W*0.037, h:W*0.031, color:'#8855ff' },
    rail: { w:W*0.069, h:W*0.014, color:'#00f5ff' },
    wall: { w:W*0.014, h:W*0.086, color:'#ff2255' },
    boss: { w:W*0.05,  h:W*0.057, color:'#ffdd00', moves:true },
  };
  const c = configs[tKey];
  obstacles.push({
    x: W+20, y: GY-c.h,
    w: c.w, h: c.h,
    type: tKey, color: c.color,
    vy: c.moves ? (Math.random()>0.5?2:-2)*sc : 0,
    baseY: GY-c.h,
  });
  stats.obstacles++;
}

/* ── Coins ────────────────────────────────────────────────────────────────── */
let coinsList = [], nextCoin = 60;
function spawnCoin() {
  const { W, GY } = S();
  const hs = [GY-W*0.03, GY-W*0.09, GY-W*0.17];
  coinsList.push({ x:W+10, y:hs[Math.floor(Math.random()*hs.length)], r:W*0.018, collected:false, anim:0 });
}

/* ── Power-ups ────────────────────────────────────────────────────────────── */
let powerups = [], nextPowerup = 350;
const PU_DEFS = [
  { key:'shield', color:'#00aaff', icon:'🛡', label:'SCHILD',  dur:300 },
  { key:'slowMo', color:'#aa00ff', icon:'🌀', label:'SLOW-MO', dur:200 },
  { key:'magnet', color:'#ffaa00', icon:'🧲', label:'MAGNET',  dur:400 },
];
function spawnPowerup() {
  const { W, GY } = S();
  const t = PU_DEFS[Math.floor(Math.random()*PU_DEFS.length)];
  powerups.push({ x:W+10, y:GY-W*0.12, r:W*0.022, ...t, anim:0, collected:false });
}

/* ── Ramps ────────────────────────────────────────────────────────────────── */
// A ramp = upslope + flat top (with coins) + downslope
let ramps = [], nextRamp = 500;
function spawnRamp() {
  const { W, GY } = S();
  // Randomise size a bit each spawn
  const rampW  = W * (0.28 + Math.random() * 0.14);  // wider
  const rampH  = GY * (0.30 + Math.random() * 0.14); // varied height
  const slopeW = rampW * 0.22;                        // gentle slope
  const topW   = rampW * 0.56;                        // long flat top
  const topY   = GY - rampH;
  const numCoins = 5 + Math.floor(Math.random() * 4);
  const rampCoins = [];
  for (let i = 0; i < numCoins; i++) {
    rampCoins.push({
      rx: slopeW + (topW / (numCoins + 1)) * (i + 1),
      y: topY - W * 0.038,
      collected: false,
      anim: Math.random() * Math.PI * 2,
    });
  }
  ramps.push({ x: W + 20, topY, topW, slopeW, rampW, rampH, GY, coins: rampCoins });
}

function getRampSurfaceY(r, px) {
  // Returns surface Y at player's x, or null if not on ramp
  const rel = px - r.x;
  if (rel < 0 || rel > r.rampW) return null;
  if (rel < r.slopeW) {
    // Up-slope
    return r.GY - (rel / r.slopeW) * r.rampH;
  } else if (rel < r.slopeW + r.topW) {
    // Flat top
    return r.topY;
  } else {
    // Down-slope
    const downRel = rel - r.slopeW - r.topW;
    return r.topY + (downRel / r.slopeW) * r.rampH;
  }
}

/* ── Weather ──────────────────────────────────────────────────────────────── */
let weatherP = [];
function initWeather() {
  weatherP = [];
  const { W, H } = S();
  if (cfg.weather==='rain'||cfg.weather==='storm') {
    for (let i=0;i<80;i++) {
      weatherP.push({ x:Math.random()*W, y:Math.random()*H, len:8+Math.random()*10, spd:8+Math.random()*6, a:0.3+Math.random()*0.4 });
    }
  }
}

/* ── Particles & floating texts ───────────────────────────────────────────── */
const particles = [];
let floatingTexts = [], comboMsgs = [];

function spawnParticles(x, y, color, n=8, burst=false) {
  for (let i=0;i<n;i++) {
    const angle = burst ? (Math.PI*2*i/n) : 0;
    particles.push({
      x, y,
      vx: burst ? Math.cos(angle)*4 : (Math.random()-0.5)*6,
      vy: burst ? Math.sin(angle)*4 : -Math.random()*6,
      life:1, color, r:1.5+Math.random()*3
    });
  }
}

function showFloat(text, x, y, color='#ffdd00') {
  floatingTexts.push({ text, x, y, color, life:1 });
}

/* ── Lightning ────────────────────────────────────────────────────────────── */
let lightningTimer = 0, lightningFlash = 0;

/* ── Background ───────────────────────────────────────────────────────────── */
const bgLayers = generateBuildings();
let groundOffset = 0;
const stars = Array.from({length:50},()=>({ x:Math.random(), y:Math.random()*0.55, r:Math.random()*1.4+0.3, t:Math.random()*Math.PI*2 }));

function generateBuildings() {
  return [0,1].map(li => {
    const bldgs = []; let cx=0;
    while(cx<2400) {
      const w=35+Math.random()*80;
      const hR = li===0 ? 0.1+Math.random()*0.1 : 0.18+Math.random()*0.14;
      const wins=[];
      for(let wy=0;wy<6;wy++) for(let wx=0;wx<Math.floor(w/12);wx++)
        if(Math.random()>0.45) wins.push({col:wx,row:wy,lit:Math.random()>0.4});
      bldgs.push({ox:cx,w,hR,wins});
      cx+=w+4+Math.random()*28;
    }
    return {bldgs, speed:li===0?0.28:0.6, scrollX:0};
  });
}

/* ── Palette ──────────────────────────────────────────────────────────────── */
const PAL = {
  1:{sky1:'#1a1a40',sky2:'#2a2060',g1:'#2e2e5a',g2:'#181830',neon:'#00f5ff'},
  2:{sky1:'#1a1a40',sky2:'#2a2060',g1:'#2e2e5a',g2:'#181830',neon:'#00f5ff'},
  3:{sky1:'#0e1828',sky2:'#162535',g1:'#1e2838',g2:'#0e1820',neon:'#4488ff'},
  4:{sky1:'#0e0e2e',sky2:'#181048',g1:'#1c1c40',g2:'#0e0e22',neon:'#cc44ff'},
  5:{sky1:'#251008',sky2:'#3a1808',g1:'#38200e',g2:'#201010',neon:'#ff6b35'},
  6:{sky1:'#1a1228',sky2:'#120820',g1:'#1e1430',g2:'#0e0a1a',neon:'#cc00ff'},
  7:{sky1:'#0e1020',sky2:'#0a0e1a',g1:'#141828',g2:'#080c12',neon:'#4488ff'},
  8:{sky1:'#0a0a30',sky2:'#0a1040',g1:'#101030',g2:'#080818',neon:'#ff0066'},
  9:{sky1:'#200808',sky2:'#300808',g1:'#301010',g2:'#180808',neon:'#ff2200'},
 10:{sky1:'#100010',sky2:'#180828',g1:'#181828',g2:'#0a0a18',neon:'#ffffff'},
};
const pal = PAL[LVL]||PAL[1];

/* ── Goal ─────────────────────────────────────────────────────────────────── */
let goal=null, goalSpawned=false;
function spawnGoal() { goal={x:S().W+20,passed:false}; goalSpawned=true; }

/* ── Combo ────────────────────────────────────────────────────────────────── */
function addCombo(label) {
  combo++;
  comboTimer=130;
  if(combo>comboMax) comboMax=combo;
  sfxCombo(Math.min(combo,12));
  if(label) comboMsgs.push({text:combo>1?`x${combo} ${label}`:label, life:1, x:player.x+player.w/2, y:player.y-8});
}

/* ── Braking ──────────────────────────────────────────────────────────────── */
let braking = false;

/* ── Input ────────────────────────────────────────────────────────────────── */
function jump() {
  if(state==='intro') { startGame(); return; }
  if(state==='dead'||state==='win') return;
  // No wall-kick needed anymore — ramp system handles it naturally
  const maxJ=cfg.doubleJump?2:1;
  if(player.jumpCount<maxJ) {
    const {H}=S();
    player.vy = -(S().W * 0.036);
    player.onGround=false; player.jumpCount++;
    stats.jumps++; sfxJump();
    addCombo(player.jumpCount>1?'DOUBLE!':'JUMP!');
    spawnParticles(player.x+player.w/2,player.y+player.h,pal.neon,5);
  }
}

document.addEventListener('keydown',e=>{
  if(e.code==='Space'||e.code==='ArrowUp'){e.preventDefault();jump();}
  if(e.code==='ArrowDown'||e.code==='ShiftLeft'||e.code==='ShiftRight') braking=true;
});
document.addEventListener('keyup',e=>{
  if(e.code==='ArrowDown'||e.code==='ShiftLeft'||e.code==='ShiftRight') braking=false;
  touchHintAlpha=1.5;
});
// Left half = brake, right half = jump — for both touch and click
canvas.addEventListener('click', e => {
  const rect = canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  if (x >= canvas.offsetWidth / 2) jump();
  // left side click does nothing — braking is hold-only
});

canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  for (const t of e.changedTouches) {
    const rect = canvas.getBoundingClientRect();
    const x = t.clientX - rect.left;
    if (x < canvas.offsetWidth / 2) braking = true;
    else jump();
  }
}, {passive:false});

canvas.addEventListener('touchend', e => {
  e.preventDefault();
  // Stop braking if no left-side touches remain
  let leftTouch = false;
  for (const t of e.touches) {
    const rect = canvas.getBoundingClientRect();
    if (t.clientX - rect.left < canvas.offsetWidth / 2) leftTouch = true;
  }
  if (!leftTouch) braking = false;
}, {passive:false});

// Overlay buttons (shown below canvas on mobile)
const tapBtn = document.getElementById('tapBtn');
if (tapBtn) {
  tapBtn.addEventListener('touchstart', e => { e.preventDefault(); jump(); }, {passive:false});
}
const brakeBtn = document.getElementById('brakeBtn');
if (brakeBtn) {
  brakeBtn.addEventListener('touchstart', e => { e.preventDefault(); braking = true; }, {passive:false});
  brakeBtn.addEventListener('touchend',   e => { e.preventDefault(); braking = false; });
  brakeBtn.addEventListener('mousedown', () => braking = true);
  brakeBtn.addEventListener('mouseup',   () => braking = false);
}

/* ── Game lifecycle ───────────────────────────────────────────────────────── */
function startGame() {
  state='running';
  score=0; coins=0; lives=3; frameCount=0; speed=cfg.baseSpeed;
  combo=0; comboTimer=0; comboMax=0;
  obstacles=[]; coinsList=[]; powerups=[]; ramps=[];
  goal=null; goalSpawned=false; particles.length=0;
  floatingTexts=[]; comboMsgs=[];
  nextObstacle=cfg.obsGap+80; nextCoin=60; nextPowerup=350; nextRamp=220;
  lightningTimer=0; lightningFlash=0;
  stats.jumps=0; stats.obstacles=0; stats.hits=0; stats.coinsCollected=0;
  braking=false;
  touchHintAlpha=1.5;
  airTime=0; saltoAngle=0; saltoSpeed=0; saltoCount=0; saltoScored=false;
  initPlayer(); initWeather();
  document.getElementById('resultOverlay').classList.add('hidden');
  document.getElementById('uiLives').textContent='❤❤❤';
  document.getElementById('uiCoins').textContent='0';
  if(rafId) cancelAnimationFrame(rafId);
  loop();
}

function loseLife() {
  if(player.shield>0) {
    player.shield=0; player.invincible=60;
    spawnParticles(player.x+player.w/2,player.y+player.h/2,'#00aaff',16,true);
    showFloat('🛡 SCHILD!',player.x+player.w/2,player.y,'#00aaff');
    combo=0; comboTimer=0; return;
  }
  lives--; stats.hits++; combo=0; comboTimer=0; sfxHit();
  spawnParticles(player.x+player.w/2,player.y+player.h/2,'#ff6b35',18,true);
  player.invincible=100; updateLivesUI();
  if(lives<=0){state='dead'; saveScore(false); showResult(false);}
}

function winGame() {
  state='win'; sfxWin();
  spawnParticles(player.x+player.w/2,player.y,'#ffdd00',40,true);
  saveScore(true); showResult(true);
}

function updateLivesUI() {
  const h=['','❤','❤❤','❤❤❤'];
  document.getElementById('uiLives').textContent=h[Math.max(0,lives)]||'';
}

async function saveScore(completed) {
  try {
    const res=await fetch('/api/save_score',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({level:LVL,score:score+coins*5,completed})
    });
    const data=await res.json();
    bestScore=data.best;
    document.getElementById('uiBest').textContent=bestScore;
  } catch(e){}
}

function showResult(won) {
  const final=score+coins*5;
  document.getElementById('resultTitle').textContent=won?'🏆 ZIEL ERREICHT!':'💥 CRASH!';
  document.getElementById('resultTitle').style.color=won?'#ffdd00':'#ff6b35';
  document.getElementById('resultScore').textContent=`Score: ${final}`;
  document.getElementById('resultCoins').textContent=`🪙 ${coins} Coins · 🔥 Combo: x${comboMax}`;
  document.getElementById('resultBest').textContent=bestScore?`Dein Best: ${bestScore}`:'';
  document.getElementById('resultOverlay').classList.remove('hidden');
  const retry=document.getElementById('btnRetry');
  retry.textContent='Nochmal'; retry.onclick=startGame;
  const old=document.getElementById('nextLvlBtn'); if(old) old.remove();
  if(won&&LVL<10){
    const a=document.createElement('a');
    a.id='nextLvlBtn'; a.href=`/play/${LVL+1}`;
    a.className='btn-primary'; a.textContent=`Level ${LVL+1} →`; a.style.width='auto';
    retry.parentNode.insertBefore(a,retry.nextSibling);
  }
}

/* ── Main loop ────────────────────────────────────────────────────────────── */
function loop() {
  update(); draw();
  const fin=score+coins*5;
  document.getElementById('uiScore').textContent=fin;
  document.getElementById('uiCoins').textContent=coins;
  const comboEl=document.getElementById('uiCombo');
  comboEl.textContent=combo>1?`🔥x${combo}`:'';
  comboEl.style.color=combo>4?'#ff6b35':combo>2?'#ffdd00':pal.neon;
  if(state==='running') rafId=requestAnimationFrame(loop);
  else draw();
}

/* ── Update ───────────────────────────────────────────────────────────────── */
function update() {
  const {W,H,GY,sc}=S();
  frameCount++; score++;
  const slow=player.slowMo>0?0.45:1;

  if(frameCount%300===0) speed=Math.min(speed+0.35,cfg.baseSpeed+4);
  const spd=speed*slow;

  if(player.shield>0) player.shield--;
  if(player.slowMo>0) player.slowMo--;
  if(player.magnet>0) player.magnet--;
  if(player.invincible>0) player.invincible--;
  if(comboTimer>0){comboTimer--;if(comboTimer===0)combo=0;}

  groundOffset=(groundOffset+spd)%40;
  bgLayers.forEach(l=>{l.scrollX=(l.scrollX+spd*l.speed)%2400;});
  stars.forEach(s=>s.t+=0.02);

  // Weather
  weatherP.forEach(p=>{
    p.y+=p.spd*slow; p.x-=spd*0.4;
    if(p.y>H){p.y=-10;p.x=Math.random()*W;}
    if(p.x<0)p.x=W;
  });

  // Lightning
  if(cfg.weather==='storm'){
    lightningTimer--;
    if(lightningTimer<=0){
      lightningTimer=120+Math.floor(Math.random()*200);
      lightningFlash=8;
      playTone(60,'sawtooth',0.3,0.07);
    }
    if(lightningFlash>0) lightningFlash--;
  }

  // Player physics
  if(!player.wallRiding){
    player.vy += S().W * 0.0022;
    player.y+=player.vy*slow;
    if(player.vx!==0){
      player.x+=player.vx*slow; player.vx*=0.92;
      if(Math.abs(player.vx)<0.2)player.vx=0;
    }
    if(player.x<W*0.04){player.x=W*0.04;player.vx=0;}
  } else {
    player.vy=1.5*slow; player.y+=player.vy;
  }

  if(player.y>=GY-player.h){
    player.y=GY-player.h; player.vy=0;
    player.onGround=true; player.jumpCount=0;
    player.onRamp=false; player.currentRamp=null;
  } else if(!player.onRamp){ player.onGround=false; }

  player.trail.push({x:player.x+player.w/2,y:player.y+player.h/2});
  if(player.trail.length>16) player.trail.shift();

  // Salto — spin when high in the air
  if(!player.onGround){
    airTime++;
    // Start spinning if launched from ramp (fast enough + high up)
    const { GY } = S();
    const heightAboveGround = GY - (player.y + player.h);
    if(airTime > 8 && heightAboveGround > GY * 0.18 && saltoSpeed === 0){
      saltoSpeed = 0.18; // start rotating
    }
    if(saltoSpeed > 0){
      saltoAngle += saltoSpeed * slow;
      // Count full rotations
      const prevCount = saltoCount;
      saltoCount = Math.floor(saltoAngle / (Math.PI * 2));
      if(saltoCount > prevCount && !saltoScored){
        addCombo(saltoCount > 1 ? saltoCount + 'x SALTO!!' : 'SALTO!');
        saltoScored = false; // allow next rotation combo
        spawnParticles(player.x+player.w/2, player.y, '#ffdd00', 10, true);
      }
    }
  } else {
    // Landed
    if(saltoCount > 0){
      showFloat(saltoCount > 1 ? '🔥 ' + saltoCount + 'x SALTO!' : '🛹 SALTO!',
                player.x + player.w/2, player.y - 10, '#ffdd00');
      sfxWin();
    }
    airTime = 0; saltoAngle = 0; saltoSpeed = 0; saltoCount = 0; saltoScored = false;
  }

  // Obstacles
  nextObstacle--;
  if(nextObstacle<=0&&obstacles.length<cfg.maxObs){
    spawnObstacle();
    const gap = cfg.obsGap + Math.floor(Math.random() * 60);
    nextObstacle = gap;
  }
  obstacles.forEach(o=>{
    o.x-=spd;
    if(o.vy!==0){
      o.y+=o.vy;
      if(o.y<GY-o.h*3){o.vy=Math.abs(o.vy);}
      if(o.y>GY-o.h){o.y=GY-o.h;o.vy=-Math.abs(o.vy);}
    }
  });
  obstacles=obstacles.filter(o=>o.x>-150);

  if(player.invincible===0){
    for(const o of obstacles){
      if(rectsOverlap(player,o)){
        o.x=-500; loseLife();
        if(state!=='running')return;
        break;
      }
    }
  }

  // Ramps
  nextRamp--;
  if(nextRamp<=0){spawnRamp();nextRamp=280+Math.floor(Math.random()*180);}
  ramps.forEach(r=>{
    r.x-=spd;
    // Update coin x positions (they move with ramp)
    r.coins.forEach(c=>{c.anim+=0.08;});
  });
  ramps=ramps.filter(r=>r.x>-r.rampW-50);

  // Ramp surface collision
  player.onRamp=false; player.currentRamp=null;
  for(const r of ramps){
    const px=player.x+player.w*0.5; // center of player
    const surfY=getRampSurfaceY(r,px);
    if(surfY!==null){
      const playerFeet=player.y+player.h;
      if(playerFeet>=surfY-4&&player.vy>=0&&playerFeet<surfY+18){
        player.y=surfY-player.h;
        player.vy=0; player.onGround=true; player.jumpCount=0;
        player.onRamp=true; player.currentRamp=r;
      }
    }
    // Collect ramp coins
    r.coins.forEach(c=>{
      if(c.collected)return;
      const cx=r.x+c.rx, cy=c.y;
      const cr=S().W*0.018;
      // Magnet pull
      if(player.magnet>0){
        const dx=(player.x+player.w/2)-cx, dy=(player.y+player.h/2)-cy;
        const dist=Math.sqrt(dx*dx+dy*dy);
        if(dist<S().W*0.22){c.rx+=dx*0.12/spd||0;c.y+=dy*0.12;}
      }
      if(circleRect(cx,cy,cr,player)){
        c.collected=true; coins++; stats.coinsCollected++;
        sfxCoin(); spawnParticles(cx,cy,'#ffdd00',6);
        addCombo('COIN!'); showFloat('+🪙',cx,cy,'#ffdd00');
      }
    });
  }

  // Coins
  nextCoin--;
  if(nextCoin<=0){spawnCoin();nextCoin=28+Math.floor(Math.random()*22);}
  coinsList.forEach(c=>{
    c.x-=spd; c.anim+=0.08;
    if(player.magnet>0){
      const dx=(player.x+player.w/2)-c.x, dy=(player.y+player.h/2)-c.y;
      const dist=Math.sqrt(dx*dx+dy*dy);
      if(dist<W*0.22){c.x+=dx*0.12;c.y+=dy*0.12;}
    }
    if(!c.collected&&circleRect(c.x,c.y,c.r,player)){
      c.collected=true; coins++; stats.coinsCollected++;
      sfxCoin(); spawnParticles(c.x,c.y,'#ffdd00',6);
      addCombo('COIN!'); showFloat('+🪙',c.x,c.y,'#ffdd00');
    }
  });
  coinsList=coinsList.filter(c=>c.x>-50&&!c.collected);

  // Power-ups
  nextPowerup--;
  if(nextPowerup<=0){spawnPowerup();nextPowerup=320+Math.floor(Math.random()*200);}
  powerups.forEach(p=>{
    p.x-=spd; p.anim+=0.06;
    if(!p.collected&&circleRect(p.x,p.y,p.r,player)){
      player[p.key]=p.dur; p.collected=true;
      sfxPowerup(); spawnParticles(p.x,p.y,p.color,16,true);
      showFloat(p.label+'!',p.x,p.y,p.color);
    }
  });
  powerups=powerups.filter(p=>p.x>-60&&!p.collected);

  // Goal
  if(!goalSpawned&&score>=cfg.goalScore)spawnGoal();
  if(goal){
    goal.x-=spd;
    if(!goal.passed&&goal.x<player.x+player.w){goal.passed=true;winGame();return;}
  }

  // Particles
  particles.forEach(p=>{p.x+=p.vx*slow;p.y+=p.vy*slow;p.vy+=0.25*slow;p.life-=0.033;});
  while(particles.length&&particles[0].life<=0)particles.shift();
  floatingTexts.forEach(t=>{t.y-=1.2;t.life-=0.03;});
  floatingTexts=floatingTexts.filter(t=>t.life>0);
  comboMsgs.forEach(m=>{m.y-=1.5;m.life-=0.025;});
  comboMsgs=comboMsgs.filter(m=>m.life>0);
}

function rectsOverlap(a,b){
  const p=a.w*0.18;
  return a.x+p<b.x+b.w-p&&a.x+a.w-p>b.x+p&&a.y+p<b.y+b.h&&a.y+a.h>b.y+p;
}
function circleRect(cx,cy,r,rect){
  const nx=Math.max(rect.x,Math.min(cx,rect.x+rect.w));
  const ny=Math.max(rect.y,Math.min(cy,rect.y+rect.h));
  return (cx-nx)**2+(cy-ny)**2<r*r;
}

/* ── Draw ─────────────────────────────────────────────────────────────────── */
function draw() {
  const {W,H,GY,sc}=S();

  if(lightningFlash>0){ctx.fillStyle=`rgba(200,200,255,${lightningFlash*0.04})`;ctx.fillRect(0,0,W,H);}

  const sky=ctx.createLinearGradient(0,0,0,GY);
  sky.addColorStop(0,pal.sky1);sky.addColorStop(1,pal.sky2);
  ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);

  if(cfg.weather==='clear'){
    stars.forEach(s=>{
      ctx.beginPath();ctx.arc(s.x*W,s.y*H,s.r,0,Math.PI*2);
      ctx.fillStyle=`rgba(200,220,255,${0.3+0.3*Math.sin(s.t)})`;ctx.fill();
    });
  }

  // Buildings
  bgLayers.forEach((layer,li)=>{
    const dark=li===0?'#0e0e22':'#181835';
    layer.bldgs.forEach(b=>{
      const bx=((b.ox-layer.scrollX%2400)+2400)%2400-50;
      if(bx>W+100)return;
      const bh=H*b.hR,by=GY-bh;
      ctx.fillStyle=dark;ctx.fillRect(bx,by,b.w,bh);
      b.wins.forEach(win=>{
        if(!win.lit)return;
        ctx.fillStyle='rgba(255,220,100,0.35)';
        ctx.fillRect(bx+5+win.col*11,by+6+win.row*12,5,7);
      });
    });
  });

  // Ground
  const gG=ctx.createLinearGradient(0,GY,0,H);
  gG.addColorStop(0,pal.g1);gG.addColorStop(1,pal.g2);
  ctx.fillStyle=gG;ctx.fillRect(0,GY,W,H-GY);
  ctx.strokeStyle=pal.neon+'20';ctx.lineWidth=1;
  for(let x=-(groundOffset%40);x<W;x+=40){ctx.beginPath();ctx.moveTo(x,GY);ctx.lineTo(x,H);ctx.stroke();}
  ctx.strokeStyle=pal.neon;ctx.shadowColor=pal.neon;ctx.shadowBlur=8;ctx.lineWidth=1.5;
  ctx.beginPath();ctx.moveTo(0,GY);ctx.lineTo(W,GY);ctx.stroke();ctx.shadowBlur=0;

  // Ramps
  ramps.forEach(r=>{
    const rx=r.x;
    // Draw ramp surface as filled path
    ctx.fillStyle='#334488';
    ctx.shadowColor=pal.neon; ctx.shadowBlur=8;
    ctx.beginPath();
    ctx.moveTo(rx, r.GY);                              // bottom-left
    ctx.lineTo(rx+r.slopeW, r.topY);                   // top of upslope
    ctx.lineTo(rx+r.slopeW+r.topW, r.topY);            // end of flat top
    ctx.lineTo(rx+r.rampW, r.GY);                      // bottom-right
    ctx.closePath(); ctx.fill();
    // Neon edge line
    ctx.strokeStyle=pal.neon; ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(rx, r.GY);
    ctx.lineTo(rx+r.slopeW, r.topY);
    ctx.lineTo(rx+r.slopeW+r.topW, r.topY);
    ctx.lineTo(rx+r.rampW, r.GY);
    ctx.stroke(); ctx.shadowBlur=0;
    // Ramp coins
    r.coins.forEach(c=>{
      if(c.collected)return;
      const cx=rx+c.rx, bob=Math.sin(c.anim)*3*sc;
      ctx.shadowColor='#ffdd00'; ctx.shadowBlur=10;
      ctx.fillStyle='#ffdd00';
      ctx.beginPath(); ctx.arc(cx,c.y+bob,S().W*0.018,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#cc8800';
      ctx.beginPath(); ctx.arc(cx-S().W*0.004,c.y+bob-S().W*0.004,S().W*0.007,0,Math.PI*2); ctx.fill();
      ctx.shadowBlur=0;
    });
  });

  // Goal flag
  if(goal&&!goal.passed){
    const gx=goal.x,pH=H*0.32;
    ctx.strokeStyle='#ffdd00';ctx.shadowColor='#ffdd00';ctx.shadowBlur=12;ctx.lineWidth=2;
    ctx.beginPath();ctx.moveTo(gx,GY);ctx.lineTo(gx,GY-pH);ctx.stroke();
    ctx.fillStyle='#ff6b35';
    ctx.beginPath();ctx.moveTo(gx,GY-pH);ctx.lineTo(gx+22,GY-pH+11);ctx.lineTo(gx,GY-pH+22);ctx.fill();
    ctx.shadowBlur=0;ctx.fillStyle='#ffdd00';
    ctx.font=`bold ${W*0.016}px Space Mono,monospace`;ctx.textAlign='center';
    ctx.fillText('ZIEL',gx,GY-pH-7);ctx.textAlign='left';
  }

  // Obstacles
  obstacles.forEach(o=>{
    ctx.shadowColor=o.color;ctx.shadowBlur=12;ctx.fillStyle=o.color;
    if(o.type==='cone'){
      ctx.beginPath();ctx.moveTo(o.x+o.w/2,o.y);ctx.lineTo(o.x+o.w,o.y+o.h);ctx.lineTo(o.x,o.y+o.h);
      ctx.closePath();ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.3)';
      ctx.fillRect(o.x+o.w*0.2,o.y+o.h*0.4,o.w*0.6,o.h*0.07);
    } else if(o.type==='boss'){
      const pulse=0.9+0.1*Math.sin(frameCount*0.15);
      ctx.save();ctx.translate(o.x+o.w/2,o.y+o.h/2);ctx.scale(pulse,pulse);
      ctx.fillRect(-o.w/2,-o.h/2,o.w,o.h);ctx.restore();
      ctx.fillStyle='rgba(0,0,0,0.5)';
      ctx.fillRect(o.x+o.w*0.15,o.y+o.h*0.2,o.w*0.2,o.h*0.2);
      ctx.fillRect(o.x+o.w*0.6,o.y+o.h*0.2,o.w*0.2,o.h*0.2);
      ctx.font=`${o.h*0.55}px sans-serif`;ctx.textAlign='center';
      ctx.fillText('👾',o.x+o.w/2,o.y+o.h*0.78);ctx.textAlign='left';
    } else {
      ctx.fillRect(o.x,o.y,o.w,o.h);
      ctx.fillStyle='rgba(255,255,255,0.15)';
      ctx.fillRect(o.x,o.y,o.w,o.h*0.15);
    }
    ctx.shadowBlur=0;
  });

  // Coins
  coinsList.forEach(c=>{
    const bob=Math.sin(c.anim)*3*sc;
    ctx.shadowColor='#ffdd00';ctx.shadowBlur=10;
    ctx.fillStyle='#ffdd00';
    ctx.beginPath();ctx.arc(c.x,c.y+bob,c.r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#cc8800';
    ctx.beginPath();ctx.arc(c.x-c.r*0.2,c.y+bob-c.r*0.2,c.r*0.4,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
  });

  // Power-ups
  powerups.forEach(p=>{
    const bob=Math.sin(p.anim)*4*sc;
    const pulse=0.85+0.15*Math.sin(p.anim*2);
    ctx.shadowColor=p.color;ctx.shadowBlur=16;
    ctx.fillStyle=p.color+'44';
    ctx.beginPath();ctx.arc(p.x,p.y+bob,p.r*pulse*1.4,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=p.color;
    ctx.beginPath();ctx.arc(p.x,p.y+bob,p.r*pulse,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;
    ctx.font=`${p.r*1.5}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(p.icon,p.x,p.y+bob);ctx.textBaseline='alphabetic';ctx.textAlign='left';
  });

  // Trail
  player.trail.forEach((pt,i)=>{
    const a=(i/player.trail.length)*0.35;
    const tc=player.slowMo>0?'#aa00ff':player.shield>0?'#00aaff':pal.neon;
    ctx.beginPath();ctx.arc(pt.x,pt.y,3,0,Math.PI*2);
    ctx.fillStyle=`rgba(${hexRgb(tc)},${a})`;ctx.fill();
  });

  // Shield aura
  if(player.shield>0){
    ctx.strokeStyle='#00aaff';ctx.shadowColor='#00aaff';ctx.shadowBlur=20;ctx.lineWidth=2;
    ctx.beginPath();ctx.arc(player.x+player.w/2,player.y+player.h/2,player.w,0,Math.PI*2);
    ctx.stroke();ctx.shadowBlur=0;
  }

  if(player.slowMo>0){ctx.fillStyle='rgba(120,0,200,0.06)';ctx.fillRect(0,0,W,H);}

  // Player
  if(state!=='dead'||lives>0){
    if(player.invincible===0||Math.floor(player.invincible/6)%2===0){
      if(saltoSpeed > 0){
        // Draw spinning player
        ctx.save();
        ctx.translate(player.x+player.w/2, player.y+player.h/2);
        ctx.rotate(saltoAngle);
        ctx.translate(-(player.x+player.w/2), -(player.y+player.h/2));
        drawSkater();
        ctx.restore();
      } else {
        drawSkater();
      }
    }
  }

  // Particles
  particles.forEach(p=>{
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
    ctx.fillStyle=p.color;ctx.fill();
  });
  ctx.globalAlpha=1;

  // Weather
  if(cfg.weather==='rain'||cfg.weather==='storm'){
    ctx.strokeStyle=cfg.weather==='storm'?'rgba(180,200,255,0.55)':'rgba(150,180,255,0.4)';
    ctx.lineWidth=1;
    weatherP.forEach(p=>{
      ctx.globalAlpha=p.a;
      ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(p.x-2,p.y+p.len);ctx.stroke();
    });
    ctx.globalAlpha=1;
  }

  // Floating texts
  [...floatingTexts,...comboMsgs].forEach(t=>{
    ctx.globalAlpha=t.life;
    ctx.fillStyle=t.color||'#ffdd00';
    ctx.font=`bold ${11*sc}px Bungee,cursive`;
    ctx.textAlign='center';ctx.fillText(t.text,t.x,t.y);ctx.textAlign='left';
  });
  ctx.globalAlpha=1;

  // Progress bar
  if(state==='running'){
    const prog=Math.min(score/cfg.goalScore,1);
    const bw=W*0.5,bx=(W-bw)/2,by=8;
    ctx.fillStyle='rgba(255,255,255,0.08)';ctx.fillRect(bx,by,bw,4);
    ctx.fillStyle=pal.neon;ctx.shadowColor=pal.neon;ctx.shadowBlur=6;
    ctx.fillRect(bx,by,bw*prog,4);ctx.shadowBlur=0;
    ctx.font=`${9*sc}px sans-serif`;ctx.textAlign='center';
    ctx.fillText('🏁',bx+bw,by+7);ctx.textAlign='left';
  }

  // Power-up HUD
  let hx=6*sc;
  if(player.shield>0){drawPUHud('🛡','#00aaff',player.shield,300,hx,H*0.06);hx+=30*sc;}
  if(player.slowMo>0){drawPUHud('🌀','#aa00ff',player.slowMo,200,hx,H*0.06);hx+=30*sc;}
  if(player.magnet>0){drawPUHud('🧲','#ffaa00',player.magnet,400,hx,H*0.06);hx+=30*sc;}

  // Touch zone hints (mobile only, fades after 3 sec)
  if(touchHintAlpha > 0 && state === 'running') {
    const mid = W/2;
    ctx.globalAlpha = touchHintAlpha * 0.18;
    ctx.fillStyle = '#ff6b35';
    ctx.fillRect(0, 0, mid, H);
    ctx.fillStyle = '#00f5ff';
    ctx.fillRect(mid, 0, mid, H);
    ctx.globalAlpha = touchHintAlpha * 0.55;
    ctx.font = `bold ${9*sc}px Space Mono,monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6b35';
    ctx.fillText('◀◀ BREMSEN', mid*0.5, H*0.5);
    ctx.fillStyle = '#00f5ff';
    ctx.fillText('SPRINGEN ▲', mid*1.5, H*0.5);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
    touchHintAlpha -= 0.008;
  }

  if(state==='intro') drawIntro();
}

function drawPUHud(icon,color,timer,maxDur,x,y) {
  const {sc}=S();
  ctx.fillStyle=color+'33';ctx.fillRect(x,y,24*sc,5*sc);
  ctx.fillStyle=color;ctx.fillRect(x,y,24*sc*(timer/maxDur),5*sc);
  ctx.font=`${12*sc}px sans-serif`;ctx.fillText(icon,x,y+18*sc);
}

function drawSkater() {
  const {sc,GY}=S();
  ctx.save();
  const cx=player.x+player.w/2;
  const boardColor=player.magnet>0?'#ffaa00':player.shield>0?'#00aaff':pal.neon;

  // Ground shadow
  if(player.onGround){
    ctx.fillStyle='rgba(0,0,0,0.25)';
    ctx.beginPath();ctx.ellipse(cx,GY-1,player.w*0.7,3*sc,0,0,Math.PI*2);ctx.fill();
  }

  ctx.shadowColor=boardColor;ctx.shadowBlur=player.onGround?8:18;

  // Board
  ctx.fillStyle=boardColor;
  ctx.beginPath();
  if(ctx.roundRect)ctx.roundRect(player.x-4*sc,player.y+player.h-2,player.w+8*sc,5*sc,2);
  else ctx.rect(player.x-4*sc,player.y+player.h-2,player.w+8*sc,5*sc);
  ctx.fill();
  // Wheels
  ctx.fillStyle='#fff';ctx.shadowBlur=0;
  ctx.beginPath();ctx.arc(player.x+2*sc,player.y+player.h+5*sc,3.5*sc,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(player.x+player.w-2*sc,player.y+player.h+5*sc,3.5*sc,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0;

  // Body
  ctx.fillStyle='#d8d8f0';ctx.fillRect(cx-4*sc,player.y+9*sc,8*sc,14*sc);
  ctx.fillStyle=boardColor+'aa';ctx.fillRect(cx-4*sc,player.y+11*sc,8*sc,3*sc);
  // Head
  ctx.fillStyle='#f5c090';ctx.beginPath();ctx.arc(cx,player.y+5*sc,6*sc,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#2a1a08';ctx.beginPath();ctx.arc(cx,player.y+2*sc,6*sc,Math.PI,Math.PI*2);ctx.fill();

  // Arms
  const arm=player.onGround?Math.sin(frameCount*0.18)*0.35:-0.7;
  ctx.strokeStyle='#d8d8f0';ctx.lineWidth=2.5*sc;ctx.lineCap='round';
  ctx.save();ctx.translate(cx-4*sc,player.y+12*sc);ctx.rotate(-0.3+arm);
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(-7*sc,9*sc);ctx.stroke();ctx.restore();
  ctx.save();ctx.translate(cx+4*sc,player.y+12*sc);ctx.rotate(0.3-arm);
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(7*sc,9*sc);ctx.stroke();ctx.restore();

  // Legs
  ctx.strokeStyle='#33446a';ctx.lineWidth=3*sc;
  ctx.beginPath();ctx.moveTo(cx-2*sc,player.y+23*sc);ctx.lineTo(cx-4*sc,player.y+27*sc);ctx.stroke();
  ctx.beginPath();ctx.moveTo(cx+2*sc,player.y+23*sc);ctx.lineTo(cx+4*sc,player.y+27*sc);ctx.stroke();

  ctx.restore();
}

function drawIntro() {
  const {W,H,sc}=S();
  ctx.fillStyle='rgba(0,0,0,0.65)';ctx.fillRect(0,0,W,H);
  const bw=W*0.78,bh=H*0.75,bx=(W-bw)/2,by=(H-bh)/2;
  ctx.fillStyle=pal.neon+'18';
  ctx.strokeStyle=pal.neon;ctx.shadowColor=pal.neon;ctx.shadowBlur=20;ctx.lineWidth=1.5;
  ctx.beginPath();
  if(ctx.roundRect)ctx.roundRect(bx,by,bw,bh,8);else ctx.rect(bx,by,bw,bh);
  ctx.fill();ctx.stroke();ctx.shadowBlur=0;

  ctx.fillStyle='rgba(255,255,255,0.35)';
  ctx.font=`${9*sc}px Space Mono,monospace`;ctx.textAlign='center';
  ctx.fillText(`LEVEL ${LVL}`,W/2,by+20*sc);

  ctx.fillStyle=pal.neon;ctx.font=`bold ${19*sc}px Bungee,cursive`;
  ctx.fillText(cfg.label.toUpperCase(),W/2,by+40*sc);

  ctx.fillStyle='rgba(232,232,255,0.72)';ctx.font=`${7.5*sc}px Space Mono,monospace`;
  wrapText(ctx,cfg.story,W/2,by+56*sc,bw*0.82,13*sc);

  // Tips
  const tips=cfg.doubleJump?['🛹 Doppelsprung möglich','🪙 Coins geben +5 Punkte','🌀 Power-ups sammeln']:
                             ['⚠ Kein Doppelsprung!','🧱 Wände: dran fahren + springen','👾 Boss-Hindernisse bewegen sich'];
  ctx.fillStyle=pal.neon+'aa';ctx.font=`${7*sc}px Space Mono,monospace`;
  tips.forEach((tip,i)=>ctx.fillText(tip,W/2,by+bh*0.62+i*13*sc));

  ctx.globalAlpha=0.5+0.5*Math.sin(Date.now()*0.005);
  ctx.fillStyle=pal.neon;ctx.font=`${8*sc}px Space Mono,monospace`;
  ctx.fillText('▶ TIPPEN / LEERTASTE ZUM STARTEN',W/2,by+bh-16*sc);
  ctx.globalAlpha=1;ctx.textAlign='left';
  requestAnimationFrame(()=>{if(state==='intro')draw();});
}

function wrapText(ctx,text,x,y,maxW,lineH){
  const words=text.split(' ');let line='';
  for(const word of words){
    const test=line+word+' ';
    if(ctx.measureText(test).width>maxW&&line!==''){ctx.fillText(line.trim(),x,y);line=word+' ';y+=lineH;}
    else line=test;
  }
  ctx.fillText(line.trim(),x,y);
}

function hexRgb(hex){
  return `${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)}`;
}

/* ── Claude tips ──────────────────────────────────────────────────────────── */
document.getElementById('btnAI').addEventListener('click',async()=>{
  const aiBox=document.getElementById('aiBox');
  const aiText=document.getElementById('aiText');
  const btn=document.getElementById('btnAI');
  aiBox.classList.remove('hidden');aiText.textContent='';
  document.querySelector('.ai-title').textContent='◆ Claude analysiert…';
  btn.disabled=true;
  const prompt=`Du bist ein Game-Design-Experte. Gib 4 konkrete Verbesserungsideen auf Deutsch für dieses Skateboard-Browser-Spiel (Level ${LVL}/10 — "${cfg.label}").
Statistiken: Score ${score+coins*5} | Coins ${coins} | Combo-Max x${comboMax} | Sprünge ${stats.jumps} | Treffer ${stats.hits} | ${state==='win'?'Gewonnen':'Verloren'} | Wetter: ${cfg.weather}
Features vorhanden: Schild/SlowMo/Magnet Power-ups, Wall-Ride, Boss-Hindernisse, Combo-System. Gib kurze kreative Ideen mit Emojis.`;
  try{
    const res=await fetch('/api/claude_tips',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt})});
    const data=await res.json();
    document.querySelector('.ai-title').textContent='◆ Claude Analyse';
    aiText.textContent=data.text||'Keine Antwort.';
  }catch(e){aiText.textContent='⚠ Verbindungsfehler.';}
  btn.disabled=false;
});

/* ── Init ─────────────────────────────────────────────────────────────────── */
initPlayer();initWeather();draw();
