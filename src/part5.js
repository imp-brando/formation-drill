
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
  const sc=Math.min(W,H)/(G.mode==="practice"? 7 : 16);   // zoomed out: about 16 steps across a phone
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
  if(G.sgt && G.mode!=="practice") drawSergeant(G.sgt);
}
/** The drill sergeant: larger, darker blouse, campaign hat (wide brim, Montana peak). Legs swing whenever he walks. */
function drawSergeant(S){
  const full=G.tempo==="double"?1.2:1.0, amp=clamp(S.spd/full,0,1.25);
  const ph=S.phase||0, walking=amp>0.08, mark=!walking && marching() && G.move==="mark";
  const k=(G.mode==="snake"?1.3:1.15)*1.25;
  ctx.save(); ctx.translate(S.x,S.y); ctx.scale(k,k);
  drawBody(0,0,S.face, walking?amp:0, (walking||mark)?ph:0, "#2c3514","#0b0d03", {posture:"attention", lift: mark?1:0});
  const d=dirV(S.face);
  ctx.fillStyle="#b08a4f"; ctx.strokeStyle="#4a3416"; ctx.lineWidth=0.035;
  ctx.beginPath(); ctx.arc(0,0,0.27,0,Math.PI*2); ctx.fill(); ctx.stroke();          // brim
  ctx.fillStyle="#8a6a37"; ctx.beginPath(); ctx.arc(0,0,0.14,0,Math.PI*2); ctx.fill(); ctx.stroke();  // crown
  ctx.strokeStyle="#4a3416"; ctx.lineWidth=0.03; ctx.beginPath();                    // Montana-peak pinches
  for(const a of [45,135,225,315]){ const v=dirV(S.face+a*D2R); ctx.moveTo(v[0]*.04,v[1]*.04); ctx.lineTo(v[0]*.12,v[1]*.12); } ctx.stroke();
  ctx.fillStyle="#e6dcc3"; ctx.beginPath(); ctx.arc(d[0]*.21,d[1]*.21,0.05,0,Math.PI*2); ctx.fill();   // facing marker on the brim
  ctx.restore();
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
  const k = G.mode==="snake" ? 1.3 : 1.15;                   // sprites scaled up within the step so legs stay readable
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
    ctx.strokeStyle="#1f1608"; ctx.lineWidth=0.14;
    ctx.beginPath(); ctx.moveTo(hx,hy); ctx.lineTo(fx,fy); ctx.stroke();
    ctx.fillStyle= lf>0.3? "#8a6a3a" : "#120c05";       // a raised boot shows lighter (knee up)
    ctx.beginPath(); ctx.ellipse(fx+d[0]*.03,fy+d[1]*.03,0.085+lf*.03,0.125+lf*.03,h,0,Math.PI*2); ctx.fill();
  }
  if(opt.dress){ ctx.strokeStyle=fill; ctx.lineWidth=0.09; ctx.beginPath(); ctx.moveTo(x-n[0]*.15,y-n[1]*.15); ctx.lineTo(x-n[0]*.62,y-n[1]*.62); ctx.stroke(); }
  ctx.fillStyle=fill; ctx.strokeStyle=stroke; ctx.lineWidth=0.05;
  ctx.beginPath(); ctx.arc(x,y,0.165,0,Math.PI*2); ctx.fill(); ctx.stroke();
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
  if(!micOK){ mctx.fillStyle="#ffd27a"; mctx.font="12px system-ui"; mctx.fillText(meterOffReason||"Voice meter off", 4, H/2); mctx.font="10px system-ui"; mctx.fillText("Commands still work. Inflection isn't checked.", 4, H/2+15); }
  // measured vs needed for the last command (transparency)
  if(lastAnalysis && lastAnalysis.checks && lastAnalysis.checks.length){
    mctx.fillStyle="rgba(12,14,5,.88)"; mctx.fillRect(0,H-32,W,32);   // readable backdrop for the values
    mctx.font="bold 11px system-ui"; let x=4, y=H-19;
    const lbl=SENS[settings.sens].label+(settings.sens==="ds"?" (all):":" ("+lastAnalysis.need+" of 3):")+" ";
    mctx.fillStyle="rgba(230,220,195,.9)"; mctx.fillText(lbl, x, y); x+=mctx.measureText(lbl).width;
    for(const c of lastAnalysis.checks){
      const g=c.got===null||c.got===undefined? "n/a" : c.unit==="ms"? Math.round(c.got)+"ms" : (c.key==="pitch"?Math.abs(c.got):c.got).toFixed(1)+c.unit;
      const s=`${c.pass?"✓":"✗"} ${c.name} ${g} / ${c.max?"≤":"≥"}${c.need}   `, w=mctx.measureText(s).width;
      if(x+w>W && y<H-10){ x=4; y=H-5; }                     // wrap onto a second row
      mctx.fillStyle=c.pass?"#9be37f":"#ff9d8a"; mctx.fillText(s, x, y); x+=w;
    }
  } else { mctx.fillStyle="rgba(230,220,195,.6)"; mctx.font="10px system-ui"; mctx.fillText("Level: "+SENS[settings.sens].label, W-110, 11); }
}

/* ======================================================================
   SPEECH RECOGNITION + MIC SHARING
   Android Chrome often starves SpeechRecognition when a getUserMedia stream
   (our voice meter) is open at the same time. Mic modes:
     auto: desktop/iOS run both. On Android, speech starts ALONE; the meter is
           only tried after speech is proven to work, and is dropped if it
           stops recognition from delivering results. The outcome is saved.
     rec:  speech recognition only (no voice meter; commands always accepted)
     both: force both (for phones that can share the mic)
====================================================================== */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const IS_ANDROID = /Android/i.test(navigator.userAgent);
let rec=null, recOn=false, recRunning=false, session=0, lastCmdT=-Infinity, ttsBusy=false, ttsQuietSince=-Infinity;
let sessionText="", lastRecStart=0, lastResultT=0, ptt=false, restartTimer=null, watchdogTimer=null, lastRecError="";
let micMode = ["auto","rec","both"].includes(localStorage.getItem("formation.micMode")) ? localStorage.getItem("formation.micMode") : "auto";
let coexist = localStorage.getItem("formation.coexist");   // "yes" | "no" | null (untested)
let meterOffReason = "", pendingProbe=false, probe=null;
const normText = t => t.toLowerCase().replace(/[^a-z0-9' ]+/g," ").replace(/\s+/g," ").trim();
let statusHoldUntil=0;   // keep "Heard … → understood as …" readable across Android's constant session restarts
function setStatus(txt, cls, hold){ const el=$("srStatus"); if(!el) return; if(!hold && now()<statusHoldUntil && cls==="ok") return; el.textContent=txt; el.className=cls||""; statusHoldUntil = hold ? now()+hold : 0; }

/* Grammar hint: Chrome mostly ignores it, but it's harmless and helps engines that use it. */
const GRAMMAR_PHRASES=["column right march","column left march","column half right march","column half left march","counter column march","rear march","right flank march","left flank march","forward march","mark time march","half step march","change step march","double time march","quick time march","right step march","left step march","backward march","open ranks march","close ranks march","extend march","close march","platoon halt","platoon attention","right face","left face","about face","parade rest","stand at ease","at ease","dress right dress","eyes right","ready front","fall in"];
function addGrammar(r){
  try{
    const GL=window.SpeechGrammarList||window.webkitSpeechGrammarList; if(!GL) return;
    const g=new GL(); g.addFromString("#JSGF V1.0; grammar drill; public <cmd> = "+GRAMMAR_PHRASES.join(" | ")+" ;", 1);
    r.grammars=g;
  }catch(_){}
}
function makeRec(){
  const r=new SR();
  r.lang="en-US"; r.interimResults=true; r.maxAlternatives=8;
  // Android: short sessions restarted immediately are the most reliable. Hold-to-talk stays open
  // until release, so a pause before the execution word can't end it.
  r.continuous = ptt || !IS_ANDROID;
  addGrammar(r);
  r.onstart=()=>{ session++; sessionText=""; recRunning=true; lastRecStart=now(); lastRecError="";
    setStatus(ptt? "🎙 Listening (hold)…" : "🎙 Listening"+(micOK?" · voice meter on":" · speech only"), "ok"); };
  r.onresult=handleResult;
  r.onerror=e=>{
    lastRecError=e.error;
    if(e.error==="not-allowed"||e.error==="service-not-allowed"){ recOn=false; setStatus("Speech recognition blocked ("+e.error+"). Allow the microphone for this site in Chrome settings, then reload.","bad"); flash("SPEECH RECOGNITION BLOCKED","bad","Allow microphone access for this site, then reload."); return; }
    if(e.error==="audio-capture" && micOK && IS_ANDROID && micMode!=="both"){ disableMeter("Voice meter off: this phone can't share the mic with speech recognition"); return; }
    if(e.error==="network") setStatus("Speech recognition needs an internet connection (network error). Retrying…","bad");
    // "no-speech" and "aborted" are routine; onend restarts
  };
  r.onend=()=>{ recRunning=false; if(recOn && !ptt) scheduleRestart(lastRecError==="network"?1500:0); };   // no gap
  return r;
}
function startRecognition(){
  if(!SR){ setStatus("Speech recognition isn't supported in this browser. Use Chrome on Android.","bad"); return false; }
  recOn=true; restartRec();
  clearInterval(watchdogTimer); watchdogTimer=setInterval(()=>{ if(recOn && !recRunning && !ptt && !burstHold && now()-lastRecStart>2500) restartRec(); }, 1500);
  return true;
}
function restartRec(){
  try{ if(rec){ rec.onend=null; rec.abort(); } }catch(_){}
  recRunning=false; rec=makeRec();
  try{ rec.start(); lastRecStart=now(); }catch(_){ scheduleRestart(250); }
}
function scheduleRestart(ms){ clearTimeout(restartTimer); restartTimer=setTimeout(()=>{ if(recOn && !recRunning && !ptt && !burstHold) restartRec(); }, ms); }

let pendingPrep=null;                 // {text, t}: a prep heard without its execution word yet
const consumedText=new Map();          // result key -> transcript already turned into a command
const PREP_WAIT_MS=3500;
function freshPart(key, n){
  const prev=consumedText.get(key);
  if(prev!==undefined){
    if(n.startsWith(prev)) return n.slice(prev.length).trim();
    const pw=prev.split(" "), nw=n.split(" ");
    if(pw[0]!==nw[0]) return n;          // a different utterance reusing the slot: parse all of it
    // the recogniser revised words it already gave us: only take words beyond what we used
    return nw.length>pw.length+1 ? nw.slice(pw.length).join(" ") : "";
  }
  // Android Chrome repeats earlier words of the session in later results
  // (only when the new result is longer; saying the same command again is a new command)
  return sessionText && n.length>sessionText.length && n.startsWith(sessionText+" ") ? n.slice(sessionText.length).trim() : n;
}
function hasExecWord(t){ return normalizeSpeech(t).split(" ").slice(-3).some(w=>execClassesOf(w)); }
function handleResult(e){
  if(!recOn) return;                    // game over / menu: ignore anything still in flight
  lastResultT=now();
  if(probe) probe.results++;
  let triggerProbe=false;
  for(let i=e.resultIndex;i<e.results.length;i++){
    const res=e.results[i], key=session+":"+i, top=res[0].transcript.trim();
    $("heardTxt").textContent=top; $("heard").className="";
    if(ttsBusy || now()<ttsQuietSince){ $("heardTxt").textContent="(ignored: cadence voice) "+top; continue; } // never obey our own TTS
    let hit=null, firstFresh=null;
    const pend = pendingPrep && now()-pendingPrep.t<PREP_WAIT_MS ? pendingPrep.text : null;
    // score every alternative Chrome offers (alone, then joined to a prep heard just before); keep the best
    for(let pass=0; pass<2 && !hit; pass++){
      if(pass===1 && !pend) break;
      for(let a=0;a<res.length;a++){
        const n=normText(res[a].transcript), fresh=freshPart(key,n);
        if(firstFresh===null) firstFresh=fresh;
        if(!fresh) continue;
        const p=parseCommand(pass===0? fresh : pend+" "+fresh);
        if(p && (!hit || p.score>hit.p.score+1e-9)) hit={p, raw:(pass===0?"":pend+" … ")+res[a].transcript.trim(), n};
      }
    }
    if(burstTranscript(hit&&hit.p.cmd, hit? hit.raw : firstFresh, res.isFinal)){ consumedText.set(key, normText(res[0].transcript)); sessionText=normText(res[0].transcript); continue; }
    if(hit){
      consumedText.set(key, hit.n); sessionText=hit.n; pendingPrep=null; if(armed) disarm("command");
      $("heardTxt").textContent=hit.raw; $("heard").className="";
      const how = hit.p.via==="sound-alike" ? " (sound-alike)" : hit.p.via==="your voice" ? " (your voice)" : "";
      setStatus(`Heard "${hit.raw}" → understood as ${hit.p.cmd.name.toUpperCase()}${how}`, "ok", 4000);
      onCommandHeard(hit.p, hit.raw); triggerProbe=true;
    } else if(!res.isFinal && firstFresh && sharedMic()){
      const prep=parsePrepOnly(firstFresh) || (settings.clarity!=="exact" && fuzzyPrepOnly(firstFresh));
      if(prep && armBurst(prep, top, false)) picaaPrep();
    } else if(res.isFinal && firstFresh){
      triggerProbe=true;
      const prep=parsePrepOnly(firstFresh) || (settings.clarity!=="exact" && fuzzyPrepOnly(firstFresh));
      if(prep){
        pendingPrep={text:firstFresh, t:now()}; picaaPrep(); armBurst(prep, top, true);
        setStatus(`Heard "${top}" → understood as ${prep.name.split(",")[0].toUpperCase()}… waiting for ${prep.exec}`, "ok", 3500);
      } else {
        // not a drill command: discard quietly (no flash, no penalty)
        $("heard").className="faint"; $("heardTxt").textContent=top+" (ignored)";
      }
      consumedText.set(key, normText(res[0].transcript));
    }
  }
  // Speech is proven to work: now try adding the voice meter (after this utterance is handled)
  if(pendingProbe && triggerProbe) setTimeout(startProbeAfterSpeech, 300);
}

/* ---------- Game over: stop listening completely (mic indicator off) until the user taps ---------- */
function stopListening(why){
  armed=null; burstHold=false;
  recOn=false; ptt=false; pendingPrep=null; pendingProbe=false; probe=null;
  clearTimeout(restartTimer); clearInterval(watchdogTimer);
  try{ if(rec){ rec.onend=null; rec.onresult=null; rec.abort(); } }catch(_){}
  rec=null; recRunning=false;
  const hadMeter=micOK; stopMic();
  if(hadMeter && IS_ANDROID && coexist!=="yes") pendingProbe=false;
  meterOffReason="Mic off";
  setStatus(why||"🎙 Mic off. Tap FALL IN to resume.", "warn");
}
async function resumeListening(){
  if(micMode!=="rec" && navigator.mediaDevices && navigator.mediaDevices.getUserMedia) await setupMeter();
  startRecognition();
}

/* ---------- Voice meter (getUserMedia) setup and the Android coexistence probe ---------- */
async function setupMeter(){
  if(micOK) return;
  if(micMode==="rec"){ meterOffReason="Voice meter off (speech-only mode)"; return; }
  if(micMode==="both" || !IS_ANDROID || coexist==="yes"){ await startMic(); return; }
  if(coexist==="no"){ meterOffReason="Voice meter off: this phone can't share the mic with speech recognition"; return; }
  meterOffReason="Voice meter starts after your first command is heard";   // Android, untested: speech first
  pendingProbe=true;
}
async function startProbeAfterSpeech(){
  pendingProbe=false;
  const ok=await startMic();
  if(!ok){ meterOffReason="Voice meter unavailable"; return; }
  meterOffReason="";
  probe={t0:now(), results:0, firstVoice:0};
  setStatus("Checking whether the voice meter and speech recognition can share the mic… say a command","warn");
  setTimeout(checkProbe, 500);
}
function checkProbe(){
  if(!probe || !micOK) return;
  const t=now(), voiced=frames.filter(f=>f.t>probe.t0 && f.rel>VOICE_REL);
  if(voiced.length && !probe.firstVoice) probe.firstVoice=voiced[0].t;
  if(probe.results>0 && voiced.length>=4){          // both delivered: they coexist
    coexist="yes"; localStorage.setItem("formation.coexist","yes"); probe=null;
    setStatus("🎙 Listening · voice meter on (shares the mic fine)","ok"); return;
  }
  if(probe.firstVoice && voiced.length>=20 && t-probe.firstVoice>4000 && probe.results===0)
    return disableMeter("Voice meter off: it was blocking speech recognition on this phone");
  if(probe.results>=2 && voiced.length===0 && t-probe.t0>6000)
    return disableMeter("Voice meter off: this phone mutes it while recognising speech");
  if(t-probe.t0>30000 && probe.results===0 && !probe.firstVoice){ probe.t0=t; }   // nobody spoke yet, keep waiting
  setTimeout(checkProbe, 500);
}
function disableMeter(reason){
  stopMic(); probe=null; pendingProbe=false; meterOffReason=reason;
  coexist="no"; localStorage.setItem("formation.coexist","no");
  restartRec();
  setStatus("🎙 Listening · speech only. "+reason+". Commands are accepted without the voice check.","warn");
}

/* ---------- Hold-to-talk backup: forces a fresh recognition session while held ---------- */
function pttDown(e){
  if(e) e.preventDefault();
  if(!SR || !G || G.over) return;      // mic stays off after Formation broke until FALL IN is tapped
  ptt=true; recOn=true; clearTimeout(restartTimer);
  try{ if(rec){ rec.onend=null; rec.abort(); } }catch(_){}
  rec=makeRec(); rec.onend=()=>{ recRunning=false; if(!ptt) scheduleRestart(40); };
  try{ rec.start(); }catch(_){}
  $("pttBtn").classList.add("held");
}
function pttUp(){
  if(!ptt) return;
  ptt=false; $("pttBtn").classList.remove("held");
  try{ if(rec) rec.stop(); }catch(_){}           // stop() delivers the final result, then onend resumes auto-listening
  scheduleRestart(1200);
}

/** A command was parsed: wait for the voice to stop, then judge inflection, foot, and state. */
function onCommandHeard(p, raw){
  const heardAt=now();
  if(heardAt-lastCmdT<600) return; lastCmdT=heardAt;
  const poll=()=>{
    if(micOK && now()-lastLoudT<120 && now()-heardAt<250) return setTimeout(poll,30); // let the execution word finish (max 250 ms)
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
  // PICAA: anchor the command of execution to the foot strike it was called on, then one additional
  // step, then the action step. If it wasn't on the correct foot, use the next correct-foot strike.
  const kE=anchorBeat(c, a, heardAt, p);
  const tag = p.tag || null;
  const run=()=>{ if(tag&&tag.cancelled) return; schedTag=tag; try{ if(!canExecute(c) || c.id==="fallin") execute(c, kE); } finally{ schedTag=null; } if(tag) tag.ran=true; };
  if(kE<clock.k) run(); else at(kE, run, tag);
  reportVerdict(c, a, fc);
}
/* When was the command of execution actually spoken? From the voice meter if it's on, otherwise
   the recognition time minus Chrome's typical interim-result delay. */
const EST_REC_LAT=250;
function anchorBeat(c, a, heardAt, p){
  if(!marching() || G.move==="mark") return clock.k;                 // from the halt / mark time: next strike
  const spokenT = (p && p.onsetT!==undefined) ? p.onsetT : (a && a.ex && a.ex.peakT) ? a.ex.peakT : heardAt-EST_REC_LAT;
  const kS = footAtTime(spokenT).k;
  if(c.foot==="L"||c.foot==="R"){
    if(footOf(kS)===c.foot && kS>=clock.k-1) return kS;              // called on the correct foot
    return nextBeat(c.foot);                                          // otherwise: next correct-foot strike
  }
  return Math.max(kS, clock.k-1);                                     // either foot: the strike it was called on
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
    $("detail").textContent = (a.hint? a.hint+" " : "") + (a.detail||""); chime(false);
  }
}
/* ======================================================================
   OPTION A: VOICE-BURST EXECUTION TIMING
   Chrome recognises the preparatory command ("Column left…") during the natural pause. The game
   then ARMS and the command of execution is the first sharp loudness burst on the local voice meter:
   no waiting for Chrome to turn "MARCH" into text. PICAA is anchored to the burst onset.
   Guards: a prep first; a quiet gap (>=150 ms) after it; a rise >=12 dB above the noise floor;
   >=50 ms sustained (a click doesn't count); inside the 3.5 s window. Chrome's later transcript only
   confirms (no double execution) or cancels ("as you were", or no execution word) if the action
   step hasn't happened yet.
   Mic: if the meter and recognition can share the mic (desktop, or an Android phone that passed the
   sharing check) both run. Otherwise on Android the game SWITCHES: Android ends the recognition
   session at the pause after the prep, so the meter takes the mic for the execution word, then hands
   it back. If the meter never hears anything twice in a row, the game falls back to words only.
====================================================================== */
const laterQ=[]; function later(ms,fn){ laterQ.push({t:now()+ms,fn}); }
function runLater(t){ for(let i=0;i<laterQ.length;i++) if(laterQ[i].t<=t){ const f=laterQ.splice(i--,1)[0]; f.fn(); } }
let execMode = ["burst","words"].includes(localStorage.getItem("formation.execMode")) ? localStorage.getItem("formation.execMode") : "burst";
const BURST={gapMs:150, riseDb:12, confirmMs:50, windowMs:PREP_WAIT_MS, confirmWindowMs:2500};
let armed=null, lastBurst=null, burstHold=false, switchMisses=0, schedTag=null;
function burstAvailable(){ return execMode==="burst" && micMode!=="rec" && !!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia) && !G.over && G.mode!=="practice"; }
function sharedMic(){ return micOK && (!IS_ANDROID || coexist==="yes" || micMode==="both"); }
/** A prep was recognised: arm for the voice burst. isFinal: Chrome finished the result (the session has paused). */
async function armBurst(cmd, prepText, isFinal){
  if(window.__armLog) window.__armLog.push({t:Math.round(now()), id:cmd.id, avail:burstAvailable(), shared:sharedMic(), isFinal, micOK, armed:!!armed, hold:burstHold});
  if(!burstAvailable() || cmd.single) return false;
  if(armed && armed.cmd===cmd) return true;
  const t=now();
  if(sharedMic()){
    armed={cmd, prepText, t, src:"shared", quietSince: now()-lastLoudT>=BURST.gapMs ? lastLoudT : null, on:null};
  } else if(IS_ANDROID && isFinal){
    // switch the mic over to the meter for the execution word
    burstHold=true; clearTimeout(restartTimer);
    try{ if(rec){ rec.onend=null; rec.abort(); } }catch(_){}
    recRunning=false;
    armed={cmd, prepText, t, src:"switch", quietSince:t-BURST.gapMs, on:null, heard:0};   // Chrome only ends the session after silence
    const ok = micOK || await startMic();
    if(!ok || !armed){ endSwitch(); armed=null; return false; }
    armed.meterT=now();
  } else return false;
  const a=armed; later(BURST.windowMs, ()=>{ if(armed===a){ disarm("window"); } });
  setStatus(`Heard "${prepText}" → understood as ${cmd.name.split(",")[0].toUpperCase()}… call ${cmd.exec} (voice burst${armed.src==="switch"?", mic switched":""})`, "ok", BURST.windowMs);
  return true;
}
function disarm(why){
  if(window.__armLog) window.__armLog.push({disarm:why, had:!!armed, t:Math.round(now())});
  const a=armed; armed=null; if(!a) return;
  if(a.src==="switch"){
    if(why==="window" && !a.heard){ if(++switchMisses>=2){ execMode="words"; setStatus("Voice burst off: this phone gives the meter no sound while switching. Using words only.","warn",4000); } }
    endSwitch();
  }
}
function endSwitch(){ if(!burstHold) return; burstHold=false; if(!(coexist==="yes")) stopMic(); if(recOn) restartRec(); }
/** Called for every meter frame (~25 ms). */
function burstCheck(f){
  const a=armed; if(!a || f.t<a.t-400) return;
  const loud = f.rel>VOICE_REL;
  if(a.src==="switch" && f.rel>3) a.heard++;
  if(!loud){
    if(a.on){ a.on=null; }                                    // a blip, not a word
    if(a.quietSince===null) a.quietSince=f.t;
    return;
  }
  if(a.quietSince===null || f.t-a.quietSince<BURST.gapMs){ a.quietSince=null; return; }   // still talking: no gap yet
  if(!a.on) a.on={t0:f.t, peak:f.rel};
  a.on.peak=Math.max(a.on.peak, f.rel);
  if(f.t-a.on.t0>=BURST.confirmMs && a.on.peak>=BURST.riseDb) fireBurst(a, a.on.t0);
}
function fireBurst(a, t0){
  if(window.__armLog) window.__armLog.push({fire:a.cmd.id, t:Math.round(now())});
  armed=null; switchMisses=0;
  const tag={cancelled:false, ran:false};
  const p={cmd:a.cmd, prep:a.prepText, onsetT:t0, via:"voice burst", tag, score:1};
  lastBurst={id:a.cmd.id, t:now(), onsetT:t0, tag, prepText:a.prepText, src:a.src};
  lastCmdT=now(); pendingPrep = pendingPrep || {text:a.prepText, t:now()};   // so "march" alone can confirm
  if(window.__burstLog) window.__burstLog.push({id:a.cmd.id, onsetT:t0, firedT:now()});
  // judge on the opening of the execution word (inflection needs a little of it), anchored to the onset
  later(Math.max(0, t0+160-now()), ()=>{ if(!tag.cancelled) judge(p, a.prepText+" … (voice burst)", now(), false); });
  setStatus(`Heard "${a.prepText}" + voice burst → ${a.cmd.name.toUpperCase()}`, "ok", 4000);
  if(a.src==="switch") watchSwitchEnd();
}
function watchSwitchEnd(){ const t0=now(); const chk=()=>{ if(now()-lastLoudT>200 || now()-t0>1200) endSwitch(); else later(50,chk); }; later(120,chk); }
/** Cancel a burst-triggered command if its action step hasn't happened yet. */
function cancelBurst(reason){
  const b=lastBurst; if(!b || b.tag.cancelled) return false;
  const pa=G.pendingAction;
  if(b.tag.ran && pa && pa.actT) return false;              // too late: the action step already happened
  b.tag.cancelled=true; G.sched=G.sched.filter(x=>x.tag!==b.tag);
  if(b.tag.ran){
    if(b.tag.pathLen!==undefined && F.path.segs.length>b.tag.pathLen){ F.path.segs.length=b.tag.pathLen; F._fi=null; }
    G.busy=null; G.pendingAction=null;
  }
  picaaSet(["","","","",""]); lastBurst=null;
  flash("AS YOU WERE","warn",reason); setStatus("Cancelled: "+reason, "warn", 3000);
  return true;
}
/** Chrome's transcript after a burst: confirm, or cancel. Returns true if the result was handled. */
function burstTranscript(hitCmd, fresh, isFinal){
  const b=lastBurst; if(!b || now()-b.t>BURST.confirmWindowMs) return false;
  const n=normalizeSpeech(fresh||"");
  if(/\bas you were\b/.test(n)) return cancelBurst('Heard "as you were"'), true;
  if(hitCmd){ if(hitCmd.id===b.id){ setStatus(`Confirmed by Chrome: "${fresh}" → ${hitCmd.name.toUpperCase()}`, "ok", 3000); lastBurst=null; pendingPrep=null; return true; } return false; }
  if(!isFinal || !n) return false;
  const prepEcho = parsePrepOnly(n) || fuzzyPrepOnly(n);
  if(prepEcho && prepEcho.id===b.id) return true;            // Chrome caught up on the prep: nothing new
  if(!hasExecWord(n)){ cancelBurst(`Chrome heard "${fresh}", not ${b.id==="halt"?"HALT":"an execution word"}`); return true; }
  return false;
}
/* ---------- PICAA beat indicator: Prep · Interval · Command · Additional step · Action step ---------- */
function picaaSet(st){ const el=$("picaa"); if(!el) return; [...el.querySelectorAll("b")].forEach((sp,i)=>sp.className=st[i]||""); el.classList.toggle("show", st.some(Boolean)); }
function picaaPrep(){ picaaSet(["on","wait","","",""]); }
function picaaExec(c,kE,addl){
  if(c.single) return;
  const st=["on","on","on", addl?"":"skip", ""]; picaaSet(st);
  const light=(i,kk)=>{ const f=()=>{ st[i]="on"; picaaSet(st); }; if(kk<clock.k) f(); else at(kk,f); };
  if(addl){ light(3,kE); light(4,kE+1); } else light(4,kE);
  at((addl?kE+1:kE)+2, ()=>picaaSet(["","","","",""]));
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
  runLater(t);
  const dtBeats=dt/clock.period;
  if(G.mode!=="practice") advance(dtBeats);
  layoutSoldiers(dtBeats,false);
  if(G.mode!=="practice") sgtUpdate(dt);
  snakeRules();
  const frac=clamp((t-clock.lastT)/clock.period,0,1);
  const phase=(footOf(clock.k-1)==="L"?0:1)+frac;           // beats since the last LEFT strike
  if(G.sgt) G.sgt.phase=phase;
  draw(marching()||G.mode==="practice"?phase:0);
  drawMeter();
}
function frame(){ if(!running) return; step(now()); requestAnimationFrame(frame); }
async function begin(mode){
  settings.sens=$("sens").value; saveSens(settings.sens); settings.unit=$("unitWord").value; settings.tick=$("tickOn").checked;
  ensureAudio();
  micMode=$("micMode").value; localStorage.setItem("formation.micMode",micMode);
  if(micMode==="both" && !micOK) coexist=null;
  if(micMode==="rec" && micOK) stopMic();
  if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) await setupMeter();
  else meterOffReason="Voice meter unavailable in this browser";
  if(!recOn) startRecognition(); else restartRec();
  show("game"); resize();      // size the canvas first: the Snake field is fitted to it
  newGame(mode);
  if(mode==="practice"){ G.move="mark"; flash("INFLECTION PRACTICE","ok",'Say any command, e.g. "Column right… MARCH!" Watch the meter.'); }
  else flash(mode==="snake"?"SNAKE: FALL IN":"DRILL FIELD","ok",`Say "Forward… MARCH!" to step off.`);
  if(!SR) $("detail").textContent="Speech recognition isn't supported in this browser. Only the inflection meter works.";
  clock.lastT=now(); clock.nextT=now()+clock.period; lastFrame=now();
  if(!running){ running=true; requestAnimationFrame(frame); }
}

/* ---------- Wire up the UI ---------- */
document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>begin(b.dataset.mode)));
$("btnRef").onclick=()=>show("ref"); $("refBack").onclick=()=>show("start");
$("execMode").value=execMode;
$("execMode").addEventListener("change",()=>{ execMode=$("execMode").value; localStorage.setItem("formation.execMode",execMode); switchMisses=0; });
$("clarity").value=settings.clarity;
$("clarity").addEventListener("change",()=>{ settings.clarity=$("clarity").value; localStorage.setItem("formation.clarity",settings.clarity); });

/* ---------- Train my voice: say each core command twice; keep what Chrome hears as personal aliases ---------- */
const TRAIN_IDS=["forward","halt","colL","colR","colHL","colHR","lflank","rflank","rear","counter","mark","halfstep","change","double","quick"];
const trainPhrase=id=> id==="halt" ? settings.unit.toUpperCase()+", HALT" : CMD[id].name.toUpperCase();
let trainI=0, trainTake=0, trainRecObj=null;
function trainRender(){
  $("trainStep").textContent=`Command ${trainI+1} of ${TRAIN_IDS.length} · take ${trainTake+1} of 2`;
  $("trainCmd").textContent=trainPhrase(TRAIN_IDS[trainI]);
  const all=Object.entries(userAliases).flatMap(([id,l])=>(l||[]).map(ph=>[id,ph]));
  $("trainCount").textContent=all.length;
  $("trainList").innerHTML=all.map(([id,ph])=>`"${esc(ph)}" → ${esc(CMD[id].name)}`).join("<br>")||"<i>Nothing yet.</i>";
}
function trainStopRec(){ try{ if(trainRecObj){ trainRecObj.onresult=null; trainRecObj.onend=null; trainRecObj.abort(); } }catch(_){} trainRecObj=null; $("trainRec").classList.remove("held"); }
/** Store what Chrome heard for this command. Skips guesses that are already another command. Returns notes for display. */
function trainLearn(id, transcripts){
  const notes=[]; const list=userAliases[id]||(userAliases[id]=[]);
  for(const raw of transcripts){
    const n=normText(raw); if(!n || n.split(" ").length<2) continue;
    const ex=parseExact(n), fz=ex?null:fuzzyParse(n);
    const got=(ex||fz)&&(ex||fz).cmd.id;
    if(got===id){ notes.push(`"${raw}" ✓ already understood`); continue; }
    if(got && got!==id){ notes.push(`"${raw}" skipped (sounds like ${CMD[got].name})`); continue; }
    if(!list.includes(n)){ list.push(n); notes.push(`"${raw}" → saved`); }
  }
  if(list.length>12) list.splice(0,list.length-12);
  if(!list.length) delete userAliases[id];
  saveAliases(); return notes;
}
function trainNext(){ trainTake++; if(trainTake>=2){ trainTake=0; trainI=Math.min(TRAIN_IDS.length-1,trainI+1); if(trainI===TRAIN_IDS.length-1 && trainTake===0){} } trainRender(); }
$("btnTrain").onclick=()=>{ if(recOn) stopListening(); trainI=0; trainTake=0; $("trainHeard").textContent=""; trainRender(); show("train"); };
$("trainBack").onclick=()=>{ trainStopRec(); show("start"); };
$("trainSkip").onclick=()=>{ trainStopRec(); trainTake=0; trainI=(trainI+1)%TRAIN_IDS.length; $("trainHeard").textContent=""; trainRender(); };
$("trainPrev").onclick=()=>{ trainStopRec(); trainTake=0; trainI=(trainI+TRAIN_IDS.length-1)%TRAIN_IDS.length; $("trainHeard").textContent=""; trainRender(); };
$("trainReset").onclick=()=>{ if(!confirm("Forget everything learned from your voice?")) return; userAliases={}; saveAliases(); $("trainHeard").textContent="Reset. The game uses the built-in sound-alikes only."; trainRender(); };
$("trainRec").onclick=()=>{
  if(!SR){ $("trainHeard").textContent="Speech recognition isn't available in this browser."; return; }
  trainStopRec();
  const r=new SR(); r.lang="en-US"; r.interimResults=false; r.maxAlternatives=8; r.continuous=false; addGrammar(r);
  const id=TRAIN_IDS[trainI]; let got=false;
  r.onresult=e=>{
    const res=e.results[e.results.length-1]; if(!res || !res.isFinal) return; got=true;
    const alts=[...res].map(a=>a.transcript.trim()).filter(Boolean);
    const notes=trainLearn(id, alts);
    $("trainHeard").innerHTML=notes.map(esc).join("<br>")||"Heard nothing usable. Try again.";
    trainStopRec(); trainNext();
  };
  r.onerror=e=>{ $("trainHeard").textContent="Mic error: "+e.error+". Tap to try again."; };
  r.onend=()=>{ $("trainRec").classList.remove("held"); if(!got && !$("trainHeard").textContent) $("trainHeard").textContent="Didn't catch that. Tap and try again."; };
  trainRecObj=r; $("trainHeard").textContent="🎙 Listening… say: "+trainPhrase(id);
  $("trainRec").classList.add("held");
  try{ r.start(); }catch(_){ $("trainHeard").textContent="Couldn't start the mic. Tap again."; }
};
$("btnQuit").onclick=()=>{ running=false; cadStop(); stopListening("🎙 Mic off"); show("start"); $("hiStart").textContent=hiScore; };
$("ovBtn").onclick=async()=>{ fallIn(); await resumeListening(); };   // a tap (user gesture) turns the mic back on
$("cadToggle").onclick=()=>$("cadBar").classList.toggle("collapsed");
$("cadPlay").onclick=()=>cad.on?cadStop():cadStart();
$("cadSel").onchange=()=>{ if(cad.on) cadStart(); else { cad.item=FormationCadences.all().find(c=>c.id===$("cadSel").value); cad.line=0; renderCad(); } };
if(!SR) $("noSR").classList.add("on");
if(DEBUG) $("debug").classList.add("on");
const dbgSend=()=>{ const v=$("dbgIn").value, p=parseCommand(v); $("heardTxt").textContent=v; if(!p){ $("heardTxt").textContent=v+" (ignored)"; return; } judge(p,v,now(),true); $("dbgIn").value=""; };
$("dbgGo").onclick=dbgSend; $("dbgIn").addEventListener("keydown",e=>{ if(e.key==="Enter") dbgSend(); });
$("hiStart").textContent=hiScore;
$("micMode").value=micMode;
$("micMode").addEventListener("change",()=>{ micMode=$("micMode").value; localStorage.setItem("formation.micMode",micMode); if(micMode==="auto") { coexist=null; localStorage.removeItem("formation.coexist"); } });
const pb=$("pttBtn");
pb.addEventListener("pointerdown",pttDown); ["pointerup","pointercancel","pointerleave"].forEach(ev=>pb.addEventListener(ev,pttUp));
pb.addEventListener("contextmenu",e=>e.preventDefault());
$("sens").value=settings.sens;                                   // restore saved difficulty (default Recruit)
$("sens").addEventListener("change",()=>{ settings.sens=$("sens").value; saveSens(settings.sens); });
fillCadences(); buildReference();

/* ---------- Test hook (automated tests only; not used in normal play) ---------- */
window.FG = {
  parse:t=>{ const p=parseCommand(t); return p? p.cmd.id : null; },
  fuzzy:(t,c)=>fuzzyParse(t,{debug:true,clarity:c}), phonKey:w=>phonKey(w), trainLearn:(id,a)=>trainLearn(id,a), aliases:()=>userAliases,
  cmd(text){ const p=parseCommand(text); if(!p) return "invalid"; judge(p,text,now(),true); return p.cmd.id; },
  /** Start a mode without mic/speech (headless): */
  startHeadless(mode){ show("game"); resize(); newGame(mode); clock.lastT=now(); clock.nextT=now()+clock.period; lastFrame=now(); },
  /** Advance the simulation by ms in 16 ms steps (virtual time), then render. */
  sim(ms){ let t=lastFrame; const end=t+ms; while(t<end){ t+=16; simNow=t; step(t); } },
  state:()=>({move:G.move, tempo:G.tempo, fmode:F.mode, W:F.W, ranks:F.ranks.length, busy:G.busy, over:G.over, score:G.score, posture:G.posture,
             heading:Math.round(((F.mode==="column"?F.path.posAt(F.ranks[0].s).h:0)/D2R%360+360)%360),
             soldiers:allSoldiers().map(s=>[+s.x.toFixed(2),+s.y.toFixed(2),Math.round(((s.face/D2R)%360+360)%360)])}),
  setRecOn(v){ recOn=v; },
  now(){ return now(); },
  addRecruit(){ addRecruitToFormation(); },
  sgt(){ const S=G.sgt; if(!S) return null; const fr=sgtFrame(); const u=(S.x-fr.cx)*fr.d[0]+(S.y-fr.cy)*fr.d[1], v=(S.x-fr.cx)*fr.n[0]+(S.y-fr.cy)*fr.n[1];
    const [tx,ty]=sgtTarget(fr); let md=1e9; for(const s of fr.sol) md=Math.min(md,Math.hypot(s.x-S.x,s.y-S.y));
    return {x:+S.x.toFixed(2), y:+S.y.toFixed(2), h:Math.round((fr.h/D2R%360+360)%360), out:+(v-fr.vmax).toFixed(2), depthOff:+(u-(fr.umin+fr.umax)/2).toFixed(2),
            toTarget:+Math.hypot(tx-S.x,ty-S.y).toFixed(2), minDist:+md.toFixed(2), route:S.route}; },
  frame(db,hz){ pushFrame(now(), db, hz||0); },                  // feed the voice meter (tests)
  meter(on){ micOK=on; if(on) noiseFloor=-60; },
  burst:()=>({armed: armed && {id:armed.cmd.id, src:armed.src}, last: lastBurst && {id:lastBurst.id, onsetT:lastBurst.onsetT}, execMode}),
  setExecMode(m){ execMode=m; },
  get G(){return G;}, get F(){return F;}, clock, settings, frames, handleResult, get rec(){return rec;}, get sessionText(){return sessionText;},
  analyse:(id,t)=>{ micOK=true; return analyseInflection(CMD[id], t); }, pushFrame, setFloor:v=>{noiseFloor=v;},
  showAnalysis:a=>{ lastAnalysis=a; },
};
