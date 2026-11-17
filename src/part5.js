
/* ======================================================================
   RENDERING
====================================================================== */
const cv=$("field"), ctx=cv.getContext("2d");
let view={scale:16, ox:0, oy:0};
const cam={x:0,y:0};
function resize(){
  const r=cv.getBoundingClientRect(), dpr=Math.min(2,window.devicePixelRatio||1);
  cv.width=Math.max(1,Math.round(r.width*dpr)); cv.height=Math.max(1,Math.round(r.height*dpr));
}
window.addEventListener("resize",resize);
function computeView(){
  const W=cv.width, H=cv.height;
  if(G.mode==="snake"){ const sc=Math.min(W/SNAKE_W, H/SNAKE_H); view={scale:sc, ox:(W-SNAKE_W*sc)/2, oy:(H-SNAKE_H*sc)/2}; return; }
  const sol=allSoldiers(); let cx=0,cy=0; sol.forEach(s=>{cx+=s.x;cy+=s.y;}); cx/=sol.length||1; cy/=sol.length||1;
  cam.x=lerp(cam.x,cx,.08); cam.y=lerp(cam.y,cy,.08);
  const sc=Math.min(W,H)/(G.mode==="practice"? 6 : 10);
  view={scale:sc, ox:W/2-cam.x*sc, oy:H/2-cam.y*sc};
}
function draw(phase){
  computeView();
  const W=cv.width, H=cv.height, sc=view.scale;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.fillStyle=G.mode==="snake"?"#3b4220":"#9aa063"; ctx.fillRect(0,0,W,H);
  ctx.setTransform(sc,0,0,sc,view.ox,view.oy);
  ctx.lineWidth=1/sc;
  if(G.mode==="snake"){
    ctx.fillStyle="#9aa063"; ctx.fillRect(0,0,SNAKE_W,SNAKE_H);
    ctx.strokeStyle="rgba(0,0,0,.08)";
    for(let x=0;x<=SNAKE_W;x++){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,SNAKE_H); ctx.stroke(); }
    for(let y=0;y<=SNAKE_H;y++){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(SNAKE_W,y); ctx.stroke(); }
    ctx.strokeStyle="#c3b091"; ctx.lineWidth=0.18; ctx.strokeRect(0.09,0.09,SNAKE_W-.18,SNAKE_H-.18);
    for(const rc of G.recruits) drawRecruit(rc);
  } else {
    // open drill field: grid scrolls with the camera, every 5th line brighter
    const x0=-view.ox/sc, y0=-view.oy/sc, x1=x0+W/sc, y1=y0+H/sc;
    for(let x=Math.floor(x0);x<=x1;x++){ ctx.strokeStyle= x%5===0?"rgba(230,220,195,.22)":"rgba(0,0,0,.07)"; ctx.beginPath(); ctx.moveTo(x,y0); ctx.lineTo(x,y1); ctx.stroke(); }
    for(let y=Math.floor(y0);y<=y1;y++){ ctx.strokeStyle= y%5===0?"rgba(230,220,195,.22)":"rgba(0,0,0,.07)"; ctx.beginPath(); ctx.moveTo(x0,y); ctx.lineTo(x1,y); ctx.stroke(); }
  }
  for(let r=F.ranks.length-1;r>=0;r--) F.ranks[r].sol.forEach((s,sq)=>{ if(s) drawSoldier(s, phase, sq); });
}
function drawRecruit(rc){
  const pulse=.5+.5*Math.sin((now()-rc.t)/250);
  ctx.fillStyle=`rgba(255,215,90,${.2+.25*pulse})`; ctx.beginPath(); ctx.arc(rc.x,rc.y,.5,0,Math.PI*2); ctx.fill();
  drawBody(rc.x,rc.y,rc.face,0,0,"#d9b04a","#6b4f12",{posture:"attention"});
}
/** A soldier: a helmet dot with two clearly visible legs and boots, swinging on the beat.
    Stride length = the soldier's real displacement, so pivot-file half steps are visibly short. */
function drawSoldier(s, phase, sq){
  const full = G.tempo==="double"?1.2:1.0;
  const amp = clamp(s.spd/full, 0, 1.25);
  const halted = G.move==="halt" && F.mode!=="counter";
  const inPlace = !halted && marching() && amp<0.2;            // mark time, pivot, closing, waiting rank
  const rightFile = sq===F.W-1;
  const k = G.mode==="snake" ? 1.2 : 1;                      // slightly larger sprites on the small snake field
  ctx.save(); ctx.translate(s.x,s.y); ctx.scale(k,k);
  drawBody(0,0,s.face, halted?0:amp, phase, "#3e4a1c","#151905", {
    posture:halted?G.posture:"attention", dress:G.dress && !rightFile, eyes:(G.eyes||G.dress) && !(marching() && rightFile && G.eyes) && !(G.dress && rightFile),
    lift: inPlace? 1-amp/0.2 : 0 });
  ctx.restore();
}
function drawBody(x,y,h,amp,phase,fill,stroke,opt){
  const d=dirV(h), n=nrmV(h);
  // phase = beats since the last LEFT strike (0..2): left boot forward at 0, right boot forward at 1
  const swing=Math.cos(Math.PI*phase), L=0.42*amp*swing;
  const lift=opt.lift||0, liftL=lift*Math.max(0,Math.sin(Math.PI*phase)), liftR=lift*Math.max(0,-Math.sin(Math.PI*phase));
  const spread=(opt.posture==="parade"||opt.posture==="standease"||opt.posture==="atease")? 0.21 : 0.12;
  const rest=amp<0.05? 0.22 : 0.04;   // boots peek out in front of the helmet even at the halt
  const legs=[[-spread, L+rest, liftL], [spread, -L+rest, liftR]];
  ctx.lineCap="round";
  for(const [lat,fwd,lf] of legs){
    const hx=x+n[0]*lat*.5, hy=y+n[1]*lat*.5;
    const fx=x+n[0]*lat+d[0]*(fwd+lf*.14), fy=y+n[1]*lat+d[1]*(fwd+lf*.14);
    ctx.strokeStyle="#1f1608"; ctx.lineWidth=0.12;
    ctx.beginPath(); ctx.moveTo(hx,hy); ctx.lineTo(fx,fy); ctx.stroke();
    ctx.fillStyle= lf>0.3? "#8a6a3a" : "#120c05";       // a raised boot shows lighter (knee up)
    ctx.beginPath(); ctx.ellipse(fx+d[0]*.03,fy+d[1]*.03,0.085+lf*.03,0.125+lf*.03,h,0,Math.PI*2); ctx.fill();
  }
  if(opt.dress){ ctx.strokeStyle=fill; ctx.lineWidth=0.09; ctx.beginPath(); ctx.moveTo(x-n[0]*.15,y-n[1]*.15); ctx.lineTo(x-n[0]*.62,y-n[1]*.62); ctx.stroke(); }
  ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=0.05;
  ctx.beginPath(); ctx.arc(x,y,0.19,0,Math.PI*2); ctx.fill(); ctx.stroke();
  const fd=dirV(h + (opt.eyes? 45*D2R : 0));               // face marker: eyes right turns it 45°
  ctx.fillStyle="#e6dcc3"; ctx.beginPath(); ctx.arc(x+fd[0]*.11,y+fd[1]*.11,0.05,0,Math.PI*2); ctx.fill();
  if(opt.posture && opt.posture!=="attention"){ ctx.fillStyle="#120c05"; ctx.beginPath(); ctx.arc(x-d[0]*.21,y-d[1]*.21,0.05,0,Math.PI*2); ctx.fill(); } // hands behind back
}

/* ---------- Meter: pitch dots + loudness bars; last command's prep (blue) and execution (green/red) ---------- */
const mv=$("meter"), mctx=mv.getContext("2d");
let lastAnalysis=null;
function drawMeter(){
  const W=mv.width, H=mv.height, t1=now(), span=4000, X=t=>W-(t1-t)/span*W;
  mctx.fillStyle="#1d2010"; mctx.fillRect(0,0,W,H);
  if(lastAnalysis && lastAnalysis.ex){
    for(const s of (lastAnalysis.prepSegs||[])){ mctx.fillStyle="rgba(120,160,220,.25)"; mctx.fillRect(X(s.t0),0,X(s.t1)-X(s.t0),H); }
    const e=lastAnalysis.ex; mctx.fillStyle=lastAnalysis.ok?"rgba(120,220,100,.32)":"rgba(240,110,90,.32)"; mctx.fillRect(X(e.t0),0,Math.max(2,X(e.t1)-X(e.t0)),H);
  }
  const th=voiceThresh(), dbY=db=>H-clamp((db+70)/60,0,1)*H;
  mctx.strokeStyle="rgba(230,220,195,.35)"; mctx.setLineDash([3,3]); mctx.beginPath(); mctx.moveTo(0,dbY(th)); mctx.lineTo(W,dbY(th)); mctx.stroke(); mctx.setLineDash([]);
  for(const f of frames){ if(f.t<t1-span) continue; mctx.fillStyle=f.db>th?"#c3b091":"#4a5230"; mctx.fillRect(X(f.t),dbY(f.db),W/160,H-dbY(f.db)); }
  for(const f of frames){ if(f.t<t1-span||!f.hz) continue; const y=H-clamp(Math.log2(f.hz/70)/Math.log2(450/70),0,1)*H; mctx.fillStyle="#ff9d3a"; mctx.fillRect(X(f.t)-1.5,y-1.5,3,3); }
  mctx.fillStyle="rgba(230,220,195,.75)"; mctx.font="10px system-ui"; mctx.fillText("pitch ●   volume ▮   prep ▭ blue · exec ▭ green/red", 4, 11);
  if(!micOK){ mctx.fillStyle="#ff9d8a"; mctx.fillText("mic off: inflection not measured", 4, H-5); }
}

/* ======================================================================
   SPEECH RECOGNITION (continuous, interim results)
====================================================================== */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec=null, recOn=false, session=0, lastCmdT=0, ttsBusy=false, ttsQuietSince=-Infinity;
const consumed=new Set();
function startRecognition(){
  if(!SR) return false;
  rec=new SR(); rec.continuous=true; rec.interimResults=true; rec.lang="en-US"; rec.maxAlternatives=3;
  rec.onstart=()=>{ session++; };
  rec.onresult=e=>{
    for(let i=e.resultIndex;i<e.results.length;i++){
      const res=e.results[i], key=session+":"+i;
      $("heardTxt").textContent=res[0].transcript;
      if(consumed.has(key)) continue;
      if(ttsBusy || now()<ttsQuietSince){ $("heardTxt").textContent="(ignored: cadence voice) "+res[0].transcript; continue; } // never obey our own TTS
      let hit=null;
      for(let a=0;a<res.length && !hit;a++){ const p=parseCommand(res[a].transcript); if(p) hit=[p,res[a].transcript]; }
      if(hit){ consumed.add(key); onCommandHeard(hit[0], hit[1]); }
      else if(res.isFinal && /\b(march|halt|face|rest|ease|dress|front)\b/i.test(res[0].transcript)) flash("NOT A VALID COMMAND","bad","Heard: "+res[0].transcript);
    }
  };
  rec.onerror=e=>{ if(e.error==="not-allowed"||e.error==="service-not-allowed"){ recOn=false; flash("SPEECH RECOGNITION BLOCKED","bad","Allow microphone and speech access, then reload. ("+e.error+")"); } };
  rec.onend=()=>{ if(recOn) setTimeout(()=>{ try{ rec.start(); }catch(_){} }, 150); };  // mobile sessions end often
  recOn=true; try{ rec.start(); }catch(_){}
  return true;
}

/** A command was parsed: wait for the voice to stop, then judge inflection, foot, and state. */
function onCommandHeard(p, raw){
  const heardAt=now();
  if(heardAt-lastCmdT<600) return; lastCmdT=heardAt;
  const poll=()=>{
    if(micOK && now()-lastLoudT<150 && now()-heardAt<900) return setTimeout(poll,40); // execution word still sounding
    judge(p, raw, heardAt, false);
  };
  poll();
}
function judge(p, raw, heardAt, typed){
  const c=p.cmd, S=SENS[settings.sens];
  const a = c.single? {ok:true, detail:"One-part command (no inflection needed)"} : typed? {ok:true, detail:"Typed (debug): inflection skipped"} : analyseInflection(c, heardAt);
  lastAnalysis=a;
  if(G.mode==="practice"){ reportVerdict(c,a,footCheck(c,a)); return; }
  if(!a.ok) return reportVerdict(c,a);
  const why=canExecute(c);
  if(why) return reportVerdict(c,{ok:false,reason:"Can't execute",detail:why});
  const fc=footCheck(c,a);
  if(fc && fc.wrong && S.foot==="reject") return reportVerdict(c,{ok:false,reason:"Wrong foot",detail:`Call it as the ${fc.want==="L"?"left":"right"} foot strikes`,ex:a.ex,prepSegs:a.prepSegs}, fc);
  // Executed on the next beat; foot-specific commands wait for the correct foot while marching.
  const k=(marching() && (c.foot==="L"||c.foot==="R")) ? nextBeat(c.foot) : clock.k;
  at(k, ()=>{ if(!canExecute(c) || c.id==="fallin") execute(c); });
  reportVerdict(c, a, fc);
}
function footCheck(c,a){
  if(!(c.foot==="L"||c.foot==="R") || !(marching()||G.mode==="practice") || !a || !a.ex) return null;
  const f=footAtTime(a.ex.peakT);
  return {want:c.foot, got:f.foot, wrong:f.foot!==c.foot};
}
function reportVerdict(c,a,fc){
  const el=$("verdict");
  if(a.ok){
    const wrong = fc && fc.wrong && SENS[settings.sens].foot!=="ignore";
    el.className = (wrong||a.warn) ? "warn" : "ok";
    el.textContent = (wrong? "WRONG FOOT (accepted): " : "ACCEPTED: ") + c.name;
    $("detail").textContent = (wrong?`Call it as the ${fc.want==="L"?"left":"right"} foot strikes. `:"") + (a.warn||a.detail||"");
    chime(true);
  } else {
    el.className="bad"; el.textContent = a.reason.toUpperCase()+": "+c.name;
    $("detail").textContent = a.detail||""; chime(false);
  }
}
function flash(msg,cls,detail){ const el=$("verdict"); el.className=cls; el.textContent=msg; $("detail").textContent=detail||""; }

/* ======================================================================
   CADENCE TOOLBAR: call and response, every call starting on the LEFT foot
====================================================================== */
const cad = { on:false, item:null, line:0, half:0, beat:-1 };
function fillCadences(){
  const sel=$("cadSel"); sel.innerHTML="";
  for(const c of FormationCadences.all()){ const o=document.createElement("option"); o.value=c.id; o.textContent=c.title+(c.tempo==="double"?" (double time)":""); sel.appendChild(o); }
  cad.item=FormationCadences.all()[0]; renderCad();
}
document.addEventListener("cadencepacks", fillCadences);
function cadStart(){ cad.item=FormationCadences.all().find(c=>c.id===$("cadSel").value); cad.on=true; cad.line=0; cad.half=0; cad.beat=-1; $("cadPlay").textContent="Stop"; renderCad(); }
function cadStop(){ cad.on=false; $("cadPlay").textContent="Start"; if(window.speechSynthesis) speechSynthesis.cancel(); ttsBusy=false; renderCad(); }
function cadOnBeat(k){
  if(!cad.on||!cad.item) return;
  if(!marching() && G.mode!=="practice") return;            // the cadence pauses at the halt
  if(cad.beat<0){ if(footOf(k)!=="L") return; cad.beat=0; } // start on the LEFT foot
  else if(++cad.beat>=4){ cad.beat=0; cad.half^=1; if(cad.half===0) cad.line=(cad.line+1)%cad.item.lines.length; }
  if(cad.beat===0){
    const ln=cad.item.lines[cad.line], mode=$("cadVoice").value;
    if(mode==="both" || (mode==="calls" && cad.half===0)) speak(cad.half===0?ln.c:ln.r);
  }
  renderCad();
}
const esc=s=>String(s).replace(/[&<>"]/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
function renderCad(){
  const box=$("cadLines");
  if(!cad.item){ box.innerHTML=""; return; }
  const ln=cad.item.lines[cad.line], nx=cad.item.lines[(cad.line+1)%cad.item.lines.length];
  const dots=cad.on&&cad.beat>=0 ? "●".repeat(cad.beat+1)+"○".repeat(3-cad.beat) : "";
  box.innerHTML=`<div class="call"><span class="${cad.on&&cad.half===0?"now":""}">${esc(ln.c)}</span></div>
    <div class="resp"><span class="${cad.on&&cad.half===1?"now":""}">↳ ${esc(ln.r)}</span> <small>${dots}</small></div>
    <div class="lic">Next: ${esc(nx.c)}<br>${esc(cad.item.license)} Source: ${esc(cad.item.source)}</div>`;
}
function speak(text){
  if(!window.speechSynthesis) return;
  const u=new SpeechSynthesisUtterance(text.replace(/…/g,","));
  const words=text.split(/\s+/).length, secs=4*clock.period/1000;
  u.rate=clamp(words/(secs*2.6),0.8,1.8); u.pitch=0.8;
  ttsBusy=true;
  u.onend=u.onerror=()=>{ ttsBusy=false; ttsQuietSince=now()+500; };  // also ignore the mic for 0.5 s after
  speechSynthesis.speak(u);
}

/* ======================================================================
   HUD / UI
====================================================================== */
function updateHUD(){
  $("score").textContent=G.score; $("hi").textContent=hiScore; $("hiStart").textContent=hiScore;
  $("strength").textContent=allSoldiers().length; $("bpm").textContent=Math.round(bpm());
  $("hudScore").style.visibility=G.mode==="snake"?"visible":"hidden";
}
function setStateTag(){
  if(!G) return;
  const m={halt:"AT THE HALT",forward:"FORWARD",mark:"MARK TIME",half:"HALF STEP",rstep:"RIGHT STEP",lstep:"LEFT STEP",back:"BACKWARD",pivot:"REAR MARCH",closing:"HALTING"}[G.move]||G.move;
  const post = G.move==="halt" ? ({attention:"ATTENTION",parade:"PARADE REST",standease:"STAND AT EASE",atease:"AT EASE"}[G.posture]) : (G.tempo==="double"?"DOUBLE TIME":"QUICK TIME");
  $("stateTag").innerHTML=(F&&F.mode==="counter"?"COUNTER COLUMN":m)+"<br>"+post+(G.dress?" · DRESS RIGHT":"")+(G.eyes?" · EYES RIGHT":"")+(F&&F.interval<1?" · CLOSE INT":"")+(F&&F.rankDist>1?" · OPEN RANKS":"");
}
function show(id){ document.querySelectorAll(".screen").forEach(s=>s.classList.toggle("on",s.id===id)); }
function buildReference(){
  document.querySelector("#refTable tbody").innerHTML=CMDS.map(c=>`<tr><td class="cmd">${esc(c.name)}</td><td>${c.foot==="L"?"Left":c.foot==="R"?"Right":c.foot==="either"?"Either":"—"}</td>
    <td><span class="tag">${c.when==="halt"?"at halt":c.when==="march"?"marching":"any"}</span>${esc(c.desc)}</td></tr>`).join("");
}

/* ======================================================================
   MAIN LOOP
====================================================================== */
let running=false, lastFrame=0;
function onBeat(k){
  curBeat=k;
  const due=G.sched.filter(a=>a.k<=k); G.sched=G.sched.filter(a=>a.k>k);
  for(const a of due) a.fn();
  const foot=footOf(k), active=marching()||G.mode==="practice";
  if(active) tick(foot);
  $("fL").classList.toggle("hit", active && foot==="L");
  $("fR").classList.toggle("hit", active && foot==="R");
  cadOnBeat(k);
  updateHUD(); setStateTag();
}
function step(t){
  const dt=Math.min(100, t-lastFrame); lastFrame=t;
  clock.period=60000/bpm();
  if(t-clock.nextT>1000) clock.nextT=t;                     // resync after the tab was hidden
  while(t>=clock.nextT){ clock.lastT=clock.nextT; const k=clock.k++; clock.nextT+=clock.period; onBeat(k); }
  const dtBeats=dt/clock.period;
  if(G.mode!=="practice") advance(dtBeats);
  layoutSoldiers(dtBeats,false);
  snakeRules();
  const frac=clamp((t-clock.lastT)/clock.period,0,1);
  const phase=(footOf(clock.k-1)==="L"?0:1)+frac;           // beats since the last LEFT strike
  draw(marching()||G.mode==="practice"?phase:0);
  drawMeter();
}
function frame(){ if(!running) return; step(now()); requestAnimationFrame(frame); }
async function begin(mode){
  settings.sens=$("sens").value; settings.unit=$("unitWord").value; settings.tick=$("tickOn").checked;
  ensureAudio();
  if(!micOK && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) await startMic();
  if(!recOn) startRecognition();
  newGame(mode);
  show("game"); resize();
  if(mode==="practice"){ G.move="mark"; flash("INFLECTION PRACTICE","ok",'Say any command, e.g. "Column right… MARCH!" Watch the meter.'); }
  else flash(mode==="snake"?"SNAKE: FALL IN":"DRILL FIELD","ok",`Say "Forward… MARCH!" to step off.`);
  if(!SR) $("detail").textContent="Speech recognition isn't supported in this browser. Only the inflection meter works.";
  clock.lastT=now(); clock.nextT=now()+clock.period; lastFrame=now();
  if(!running){ running=true; requestAnimationFrame(frame); }
}

/* ---------- Wire up the UI ---------- */
document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>begin(b.dataset.mode)));
$("btnRef").onclick=()=>show("ref"); $("refBack").onclick=()=>show("start");
$("btnQuit").onclick=()=>{ running=false; cadStop(); show("start"); $("hiStart").textContent=hiScore; };
$("ovBtn").onclick=()=>fallIn();
$("cadToggle").onclick=()=>$("cadBar").classList.toggle("collapsed");
$("cadPlay").onclick=()=>cad.on?cadStop():cadStart();
$("cadSel").onchange=()=>{ if(cad.on) cadStart(); else { cad.item=FormationCadences.all().find(c=>c.id===$("cadSel").value); cad.line=0; renderCad(); } };
if(!SR) $("noSR").classList.add("on");
if(DEBUG) $("debug").classList.add("on");
const dbgSend=()=>{ const v=$("dbgIn").value, p=parseCommand(v); $("heardTxt").textContent=v; if(!p) return flash("NOT A VALID COMMAND","bad",v); judge(p,v,now(),true); $("dbgIn").value=""; };
$("dbgGo").onclick=dbgSend; $("dbgIn").addEventListener("keydown",e=>{ if(e.key==="Enter") dbgSend(); });
$("hiStart").textContent=hiScore;
fillCadences(); buildReference();

/* ---------- Test hook (automated tests only; not used in normal play) ---------- */
window.FG = {
  parse:t=>{ const p=parseCommand(t); return p? p.cmd.id : null; },
  cmd(text){ const p=parseCommand(text); if(!p) return "invalid"; judge(p,text,now(),true); return p.cmd.id; },
  /** Start a mode without mic/speech (headless): */
  startHeadless(mode){ newGame(mode); show("game"); resize(); clock.lastT=now(); clock.nextT=now()+clock.period; lastFrame=now(); },
  /** Advance the simulation by ms in 16 ms steps (virtual time), then render. */
  sim(ms){ let t=lastFrame; const end=t+ms; while(t<end){ t+=16; simNow=t; step(t); } },
  state:()=>({move:G.move, tempo:G.tempo, fmode:F.mode, W:F.W, ranks:F.ranks.length, busy:G.busy, over:G.over, score:G.score, posture:G.posture,
             heading:Math.round(((F.mode==="column"?F.path.posAt(F.ranks[0].s).h:0)/D2R%360+360)%360),
             soldiers:allSoldiers().map(s=>[+s.x.toFixed(2),+s.y.toFixed(2),Math.round(((s.face/D2R)%360+360)%360)])}),
  get G(){return G;}, get F(){return F;}, clock, settings, frames,
  analyse:(id,t)=>{ micOK=true; return analyseInflection(CMD[id], t); },
};
