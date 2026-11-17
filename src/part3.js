"use strict";
/* ---------- Small helpers ---------- */
const $ = id => document.getElementById(id);
const D2R = Math.PI/180;
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
const lerp = (a,b,t)=>a+(b-a)*t;
const ease = t => t<.5 ? 2*t*t : 1-Math.pow(-2*t+2,2)/2;
// Heading h is in radians: 0 = north (screen up), positive = clockwise (to the right).
const dirV = h => [Math.sin(h), -Math.cos(h)];
const nrmV = h => [Math.cos(h), Math.sin(h)];          // right-hand normal
let simNow = null;                                        // virtual clock for automated tests
const now = () => simNow ?? performance.now();
const params = new URLSearchParams(location.search);
const DEBUG = params.has("debug");

/* ======================================================================
   PATH: the line of march, made of straight and arc segments. Each
   rank's centre sits at an arc length `s` along it, so every rank turns
   at the same pivot point, as in real drill. Arcs carry a speed factor:
   the OUTSIDE file keeps a full 30-inch step while the pivot file takes
   short (half) steps.
====================================================================== */
class Path {
  constructor(){ this.segs = []; }
  static straight(x,y,h){ const p=new Path(); p.segs.push({t:"L",x,y,h,s0:0,len:Infinity,f:1}); return p; }
  static fromPoints(pts){ // polyline (used for reversed paths and counter-column file paths)
    const p=new Path(); let s=0;
    for(let i=0;i<pts.length-1;i++){
      const a=pts[i], b=pts[i+1], dx=b[0]-a[0], dy=b[1]-a[1], len=Math.hypot(dx,dy);
      if(len<1e-6) continue;
      p.segs.push({t:"L",x:a[0],y:a[1],h:Math.atan2(dx,-dy),s0:s,len,f:1}); s+=len;
    }
    return p;
  }
  get last(){ return this.segs[this.segs.length-1]; }
  segAt(s){
    const g=this.segs; let lo=0, hi=g.length-1;
    while(lo<hi){ const m=(lo+hi+1)>>1; if(g[m].s0<=s) lo=m; else hi=m-1; }
    return g[lo];
  }
  posAt(s){
    const g=this.segAt(s), u=s-g.s0;
    if(g.t==="L" || u<0){ const d=dirV(g.h); return {x:g.x+d[0]*u, y:g.y+d[1]*u, h:g.h}; } // u<0: extrapolate behind start
    if(u>g.len){ const e=this.arcPoint(g,g.len), d=dirV(e.h), v=u-g.len; return {x:e.x+d[0]*v,y:e.y+d[1]*v,h:e.h}; }
    return this.arcPoint(g,u);
  }
  arcPoint(g,u){ const h=g.h+g.d*u/g.r, n=nrmV(h); return {x:g.cx-g.d*n[0]*g.r, y:g.cy-g.d*n[1]*g.r, h}; }
  factorAt(s){ const g=this.segAt(s); return (s-g.s0<=g.len)? g.f : 1; }
  /** Cut the open-ended last line at sCut, then append items
      {t:"A", ang, r, d(+1 right/-1 left), f} or {t:"L", len}. Always ends with an infinite line. */
  append(sCut, items){
    const L=this.last;
    if(L.len===Infinity){ if(sCut<L.s0) sCut=L.s0; L.len=sCut-L.s0; } else sCut=L.s0+L.len;
    let cur=sCut, p=this.posAt(sCut);
    for(const it of items){
      if(it.t==="A"){
        const n=nrmV(p.h), seg={t:"A",x:p.x,y:p.y,h:p.h,r:it.r,d:it.d,s0:cur,len:it.ang*it.r,f:it.f??1,
          cx:p.x+it.d*n[0]*it.r, cy:p.y+it.d*n[1]*it.r};
        this.segs.push(seg); cur+=seg.len; p=this.arcPoint(seg,seg.len);
      } else {
        const seg={t:"L",x:p.x,y:p.y,h:p.h,s0:cur,len:it.len,f:1};
        this.segs.push(seg); if(it.len===Infinity) return;
        cur+=it.len; const d=dirV(p.h); p={x:p.x+d[0]*it.len,y:p.y+d[1]*it.len,h:p.h};
      }
    }
    this.segs.push({t:"L",x:p.x,y:p.y,h:p.h,s0:cur,len:Infinity,f:1});
  }
  translate(dx,dy){ for(const g of this.segs){ g.x+=dx; g.y+=dy; if(g.t==="A"){ g.cx+=dx; g.cy+=dy; } } }
  prune(sMin){ while(this.segs.length>2 && this.segs[1].s0 < sMin) this.segs.shift(); } // keep memory bounded
}

/* ======================================================================
   COMMAND TABLE: one source of truth for parsing, rules, and the
   reference screen.
   exec: class of the command-of-execution word.
   foot: L | R | either | null (not marching)
   when: "march" (marching only) | "halt" (at the halt only) | "any"
====================================================================== */
const UNIT = "(?:squad|squat|squads|platoon|plato|platoons|flight|flights|fight|company|detail|element|team|section|class|formation|unit|troop|troops)";
const COL  = "(?:colum|column|columns|colin|collum|calm|call|colon|kolam|calum|culm|com)";
const RIGHT= "(?:right|write|rite|ride|wright|ryte|rights|rice)";
const LEFT = "(?:left|lift|lef|laughed|lefts)";
const HALF = "(?:half|have|haf|hav|halves)";
const STEP = "(?:step|steps|stop|stepped)";
const CMDS = [
  {id:"counter", name:"Counter column, MARCH", exec:"MARCH", re:"counter|encounter", foot:"either", when:"any",
   desc:"The formation reverses inside its own frontage. 1st squad takes 3 steps and turns column right twice. 2nd squad takes 1 step and turns column right twice. 3rd squad turns column left twice. 4th squad takes 2 steps and turns column left twice. Squads that finish first half-step until all are abreast. Needs 4 files."},
  {id:"colHR", name:"Column half right, MARCH", exec:"MARCH", re:HALF+"\\s*"+RIGHT, foot:"R", when:"any", desc:"One more step, then the front rank pivots 45° right. Every rank wheels at the same point."},
  {id:"colHL", name:"Column half left, MARCH", exec:"MARCH", re:HALF+"\\s*"+LEFT, foot:"L", when:"any", desc:"One more step, then the front rank pivots 45° left. Every rank wheels at the same point."},
  {id:"colR", name:"Column right, MARCH", exec:"MARCH", re:COL+"\\s*"+RIGHT, foot:"R", when:"any", desc:"One more step. The right file pivots 90° right and half-steps while the other files wheel until abreast, then everyone takes full steps. Every rank turns at the same pivot point."},
  {id:"colL", name:"Column left, MARCH", exec:"MARCH", re:COL+"\\s*"+LEFT, foot:"L", when:"any", desc:"Mirror of Column right. The left file pivots and half-steps while the right files wheel up."},
  {id:"rflank", name:"Right flank, MARCH", exec:"MARCH", re:RIGHT+"\\s*(?:flank|flake|flanks|frank|plank|thank)", foot:"R", when:"march", desc:"One more step. Everyone pivots 90° right on the ball of the left foot and steps off. Ranks become files."},
  {id:"lflank", name:"Left flank, MARCH", exec:"MARCH", re:LEFT+"\\s*(?:flank|flake|flanks|frank|plank|thank)", foot:"L", when:"march", desc:"One more step. Everyone pivots 90° left and steps off. Ranks become files."},
  {id:"rstep", name:"Right step, MARCH", exec:"MARCH", re:RIGHT+"\\s*"+STEP, foot:null, when:"halt", desc:"From the halt only. 15-inch steps to the right; the formation keeps its facing. Platoon, HALT stops it."},
  {id:"lstep", name:"Left step, MARCH", exec:"MARCH", re:LEFT+"\\s*"+STEP, foot:null, when:"halt", desc:"From the halt only. 15-inch steps to the left."},
  {id:"back", name:"Backward, MARCH", exec:"MARCH", re:"back\\s*wards?|backward|backwords|back word", foot:null, when:"halt", desc:"From the halt only. 15-inch steps to the rear; facing doesn't change."},
  {id:"rear", name:"Rear, MARCH", exec:"MARCH", re:"(?:^|\\s)(?:rear|rare|rhea|reer|wear|year|ear|rehr|real|rears)$", foot:"R", when:"march", desc:"Called as the right foot strikes. One more step with the left, pivot 180° right on the balls of both feet, step off with the left. The rear rank becomes the front rank."},
  {id:"mark", name:"Mark time, MARCH", exec:"MARCH", re:"(?:mark|marc|marked|market|mart)\\s*(?:time|tim|tom|times)", foot:"either", when:"any", desc:"One more step, then march in place. The cadence continues. Forward, MARCH resumes."},
  {id:"halfstep", name:"Half step, MARCH", exec:"MARCH", re:HALF+"\\s*"+STEP, foot:"either", when:"march", desc:"Shorten to 15-inch steps at the same cadence. Forward, MARCH resumes 30-inch steps."},
  {id:"change", name:"Change step, MARCH", exec:"MARCH", re:"(?:change|chain|changed|chang)\\s*"+STEP, foot:"R", when:"march", desc:"Called as the right foot strikes. One more step with the left, ball of the right foot next to the left heel, then step off with the left (a hitch step)."},
  {id:"double", name:"Double time, MARCH", exec:"MARCH", re:"(?:double|dubble|doubled)\\s*(?:time|tim|times)", foot:"either", when:"any", desc:"One more 30-inch step, then double time: 180 steps per minute, 36-inch steps."},
  {id:"quick", name:"Quick time, MARCH", exec:"MARCH", re:"(?:quick|quik|kwik)\\s*(?:time|tim|times)", foot:"either", when:"march", desc:"Back to quick time (normal cadence, 30-inch steps)."},
  {id:"openranks", name:"Open ranks, MARCH", exec:"MARCH", re:"open\\s*(?:ranks?|rings|rank's)", foot:null, when:"halt", desc:"At the halt. Ranks open to double distance. The 3rd rank stands fast; ranks ahead step forward and ranks behind step back."},
  {id:"closeranks", name:"Close ranks, MARCH", exec:"MARCH", re:"close\\s*(?:ranks?|rings|rank's)", foot:null, when:"halt", desc:"At the halt. Ranks close back to normal distance."},
  {id:"extend", name:"Extend, MARCH", exec:"MARCH", re:"extend|extent|extended", foot:"either", when:"any", desc:"Files extend from close interval back to normal interval."},
  {id:"close", name:"Close, MARCH", exec:"MARCH", re:"(?:^|\\s)(?:close|clothes|closed|clove)$", foot:"either", when:"any", desc:"Files close to close interval (4 inches between soldiers)."},
  {id:"forward", name:"Forward, MARCH", exec:"MARCH", re:"forward|for word|foreword|forwards|four word", foot:"either", when:"any", desc:"From the halt: step off with the left foot. From mark time or half step: resume 30-inch steps."},
  {id:"halt", name:"Platoon / Squad / Flight, HALT", exec:"HALT", re:UNIT, foot:"either", when:"march", desc:"Two counts: one more step, then bring the trailing foot alongside."},
  {id:"attn", name:"Platoon, ATTENTION", exec:"ATTN", re:UNIT, foot:null, when:"halt", desc:"Snap to attention from any rest. Required before moving on Standard and Drill Sergeant."},
  {id:"rface", name:"Right, FACE", exec:"FACE", re:"(?:^|\\s)"+RIGHT+"$", foot:null, when:"halt", desc:"Pivot 90° right on the right heel and left ball, then bring the left foot alongside. Ranks become files."},
  {id:"lface", name:"Left, FACE", exec:"FACE", re:"(?:^|\\s)"+LEFT+"$", foot:null, when:"halt", desc:"Pivot 90° left. Ranks become files."},
  {id:"aface", name:"About, FACE", exec:"FACE", re:"about|a bout|bout|abouts", foot:null, when:"halt", desc:"Right toe half a foot length behind the left heel, then pivot 180° to the right. The formation faces the rear."},
  {id:"parade", name:"Parade, REST", exec:"REST", re:"parade|prade|per aid|parades|para", foot:null, when:"halt", desc:"Left foot 10 inches to the left, hands at the small of the back."},
  {id:"standease", name:"Stand at, EASE", exec:"EASE", re:"stand", foot:null, when:"halt", desc:"Like parade rest, but head and eyes on the commander."},
  {id:"atease", name:"AT EASE", exec:"ATEASE", re:"", single:true, foot:null, when:"halt", desc:"One-part command, so there's no prep and no inflection check. The right foot stays in place."},
  {id:"dress", name:"Dress right, DRESS", exec:"DRESS", re:RIGHT, foot:null, when:"halt", desc:"Heads and eyes right, left arms extended. Soldiers align on the right file."},
  {id:"eyes", name:"Eyes, RIGHT", exec:"RIGHT", re:"(?:^|\\s)(?:eyes|eye|ice|i's|ayes|i)$", foot:"R", when:"any", desc:"Heads and eyes 45° right. While marching, the right file keeps looking to the front. Called as the right foot strikes."},
  {id:"front", name:"Ready, FRONT", exec:"FRONT", re:"ready|reddy|readi", foot:"L", when:"any", desc:"Ends Dress right or Eyes right. Called as the left foot strikes when marching."},
  {id:"fallin", name:"Fall, IN", exec:"IN", re:"fall", foot:null, when:"any", desc:"Forms the platoon in column at attention. Resets position, and restarts after Formation Broke."},
];
const CMD = Object.fromEntries(CMDS.map(c=>[c.id,c]));

/* Execution-word recogniser: token -> class (tolerant of mis-hearings) */
const EXEC_WORDS = {
  MARCH:["march","marsh","marge","much","mars","harch","hutch","hut","ho","hoe","hah","huh","arch","mash","match","marched","marching","martch","mosh","hoch","harsh","mach"],
  HALT:["halt","hold","holt","hall","haul","alt","hault","hult","hoult","halts","holds"],
  FACE:["face","faith","phase","fase","fays","faced","faces","fate"],
  REST:["rest","wrest","rust","ress","rests","rested","wrist"],
  EASE:["ease","ees","easy","eese"],
  DRESS:["dress","dres","drez","dressed","dresses","jess"],
  FRONT:["front","frunt","fronts","fron"],
  RIGHT:["right","rite","write","wright","ride"],
  ATTN:["attention","tension","tenshun","attenshun"],
};
const EXEC_LOOKUP = {};
for(const [k,arr] of Object.entries(EXEC_WORDS)) for(const w of arr) (EXEC_LOOKUP[w]=EXEC_LOOKUP[w]||[]).push(k);

/** Parse a transcript into {cmd, prep} or null, using the LAST execution word heard. */
function parseCommand(text){
  const t = text.toLowerCase().replace(/[^a-z0-9' ]+/g," ").replace(/\b10\b/g,"ten").replace(/\s+/g," ").trim();
  const tok = t.split(" ").filter(Boolean);
  if(!tok.length) return null;
  const tail = tok.slice(-3).join(" ");
  // one-part and special forms
  if(/(?:^|\s)at ease$/.test(tail) && !/stand (?:at|and) ease$/.test(tail)) return {cmd:CMD.atease, prep:""};
  if(/(?:^|\s)(?:ten hut|tenhut|ten hot|atten hut|attenhut)$/.test(tail)) return {cmd:CMD.attn, prep:tok.slice(-6,-2).join(" ")};
  if(/(?:^|\s)(?:fall in|fallin|falling|fallen|fall inn)$/.test(tail)) return {cmd:CMD.fallin, prep:"fall"};
  for(let i=tok.length-1;i>=Math.max(0,tok.length-2);i--){   // allow one trailing noise word
    const classes = EXEC_LOOKUP[tok[i]]; if(!classes) continue;
    const prep = tok.slice(Math.max(0,i-5), i).join(" ");
    for(const cls of classes){
      for(const c of CMDS){
        if(c.exec!==cls || c.single) continue;
        if(c.id==="halt"||c.id==="attn"){ // unit word optional on Easy
          if(new RegExp(UNIT).test(prep) || (settings.sens==="easy" && prep.length===0)) return {cmd:c, prep};
          continue;
        }
        if(c.re && new RegExp(c.re).test(prep)) return {cmd:c, prep};
      }
    }
  }
  return null;
}

/* ======================================================================
   SETTINGS & PERSISTENCE
====================================================================== */
const settings = { sens:"standard", unit:"Platoon", tick:true };
const SENS = { // inflection thresholds per sensitivity
  easy:     {minPeak:-52, loud:1, spike:4,  pitch:1.5, maxDur:1100, attack:400, prepRise:-99, gap:0,  foot:"ignore", needAttn:false},
  standard: {minPeak:-45, loud:3, spike:7,  pitch:2.5, maxDur:750,  attack:220, prepRise:-99, gap:40, foot:"warn",   needAttn:true},
  ds:       {minPeak:-38, loud:6, spike:10, pitch:3.5, maxDur:520,  attack:130, prepRise:0.5, gap:80, foot:"reject", needAttn:true},
};
let hiScore = +localStorage.getItem("formation.hi") || 0;

/* ======================================================================
   AUDIO: step ticks + mic analysis (pitch and loudness)
====================================================================== */
let actx=null, analyser=null, micStream=null, micOK=false, audioBuf=null;
const frames=[];             // ring of {t, db, hz}, ~25 ms apart, last 8 s
let noiseFloor=-60, lastLoudT=0;
function ensureAudio(){
  if(!actx){ const AC=window.AudioContext||window.webkitAudioContext; if(AC) actx=new AC(); }
  if(actx && actx.state==="suspended") actx.resume();
}
function tick(foot){
  if(!actx||!settings.tick) return;
  const t=actx.currentTime, o=actx.createOscillator(), g=actx.createGain();
  o.type="triangle"; o.frequency.setValueAtTime(foot==="L"?140:190,t); o.frequency.exponentialRampToValueAtTime(60,t+.08);
  g.gain.setValueAtTime(.0001,t); g.gain.exponentialRampToValueAtTime(foot==="L"?.35:.2,t+.005); g.gain.exponentialRampToValueAtTime(.0001,t+.1);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t+.12);
}
function chime(ok){
  if(!actx) return; const t=actx.currentTime, o=actx.createOscillator(), g=actx.createGain();
  o.type="sine"; o.frequency.setValueAtTime(ok?880:220,t); if(ok) o.frequency.setValueAtTime(1320,t+.07);
  g.gain.setValueAtTime(.1,t); g.gain.exponentialRampToValueAtTime(.0001,t+.18); o.connect(g).connect(actx.destination); o.start(t); o.stop(t+.2);
}
async function startMic(){
  try{
    // Auto gain control is OFF on purpose: it would flatten the loudness jump we measure.
    micStream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true, noiseSuppression:false, autoGainControl:false}});
    const src=actx.createMediaStreamSource(micStream);
    analyser=actx.createAnalyser(); analyser.fftSize=2048; analyser.smoothingTimeConstant=0;
    src.connect(analyser); audioBuf=new Float32Array(analyser.fftSize); micOK=true;
    setInterval(analyseFrame, 25);
    return true;
  }catch(e){
    micOK=false; const n=$("noMic");
    n.textContent="Microphone unavailable ("+e.name+"), so inflection can't be measured. Allow mic access and open the page over HTTPS."; n.classList.add("on");
    return false;
  }
}
/** One analysis frame: RMS level (dBFS) and autocorrelation pitch (Hz) */
function analyseFrame(){
  analyser.getFloatTimeDomainData(audioBuf);
  let sum=0; for(let i=0;i<audioBuf.length;i++) sum+=audioBuf[i]*audioBuf[i];
  const rms=Math.sqrt(sum/audioBuf.length), db=20*Math.log10(rms+1e-9);
  const t=now()-(analyser.fftSize/actx.sampleRate)*500; // centre of the analysis window
  const hz = db>noiseFloor+8 ? detectPitch(audioBuf, actx.sampleRate) : 0;
  frames.push({t,db,hz}); while(frames.length && frames[0].t<t-8000) frames.shift();
  // adaptive noise floor: falls fast, rises slowly
  noiseFloor = db<noiseFloor ? lerp(noiseFloor,db,.3) : lerp(noiseFloor,db,.004);
  noiseFloor = clamp(noiseFloor,-90,-35);
  if(db>voiceThresh()) lastLoudT=t;
}
const voiceThresh = ()=> Math.max(noiseFloor+10, -58);
/** Normalised autocorrelation on a 2x-decimated buffer, 70–450 Hz. Returns 0 if unvoiced. */
function detectPitch(buf, sr){
  const N=buf.length>>1, x=new Float32Array(N);
  for(let i=0;i<N;i++) x[i]=(buf[2*i]+buf[2*i+1])*.5;
  const fs=sr/2, minLag=Math.floor(fs/450), maxLag=Math.min(Math.floor(fs/70), N>>1), M=N-maxLag;
  let e0=0; for(let i=0;i<M;i++) e0+=x[i]*x[i];
  let best=0, bestLag=0, prev=1, rising=false; const r=[];
  for(let lag=minLag;lag<=maxLag;lag++){
    let c=0, e1=0; for(let i=0;i<M;i++){ c+=x[i]*x[i+lag]; e1+=x[i+lag]*x[i+lag]; }
    const v=c/Math.sqrt(e0*e1+1e-12); r[lag]=v;
    if(v>prev) rising=true;                  // skip the zero-lag lobe
    if(rising && v>best){ best=v; bestLag=lag; }
    prev=v;
  }
  if(best<0.55||!bestLag) return 0;
  const a=r[bestLag-1]??best, b=best, c=r[bestLag+1]??best, den=(a-2*b+c)||1, p=(a-c)/(2*den);
  return fs/(bestLag+clamp(p,-.5,.5));      // parabolic interpolation
}
const semis = (a,b)=> 12*Math.log2(a/b);
const median = arr => { if(!arr.length) return 0; const s=[...arr].sort((a,b)=>a-b); return s[s.length>>1]; };

/** Split recent audio into voiced segments: [{t0,t1,peak,peakT,fr}] */
function segmentsBetween(tA,tB){
  const th=voiceThresh(), segs=[]; let cur=null, quiet=0;
  for(const f of frames){
    if(f.t<tA||f.t>tB) continue;
    if(f.db>th){ if(!cur) cur={t0:f.t,t1:f.t,peak:f.db,peakT:f.t,fr:[]}; cur.t1=f.t; cur.fr.push(f); if(f.db>cur.peak){cur.peak=f.db;cur.peakT=f.t;} quiet=0; }
    else if(cur){ quiet+=25; if(quiet>90){ segs.push(cur); cur=null; quiet=0; } }
  }
  if(cur) segs.push(cur);
  return segs.filter(s=>s.t1-s.t0>=50);
}

/** Inflection check. Command of execution = the last voiced segment; prep = the segments before it.
    Requires a louder execution (peak above the prep's average), a short abrupt delivery, and an
    inflection: a pitch change of N semitones OR a sharp energy spike. */
function analyseInflection(cmd, heardAt){
  const S=SENS[settings.sens];
  if(!micOK) return {ok:true, warn:"Inflection not measured (no mic level)"};
  const from=Math.max(heardAt-5000, ttsQuietSince);
  const segs=segmentsBetween(from, now());
  if(!segs.length){
    // Some Android builds silence getUserMedia while speech recognition runs.
    if(!frames.some(f=>f.t>from && f.db>-85)) return {ok:true, warn:"Mic level blocked during recognition (device limit). Inflection not measured."};
    return {ok:false, reason:"Too soft", detail:"Couldn't pick out your voice over the background noise"};
  }
  const ex=segs[segs.length-1];
  const prepSegs=segs.slice(0,-1).filter(s=>s.t0>ex.t0-3800);
  if(!prepSegs.length) return {ok:false, reason:"No preparatory command", detail:"Give the prep, pause, then the command of execution", ex, prepSegs};
  const prepFr=prepSegs.flatMap(s=>s.fr);
  const prepMean=10*Math.log10(prepFr.reduce((a,f)=>a+Math.pow(10,f.db/10),0)/prepFr.length);
  const loud=ex.peak-prepMean, dur=ex.t1-ex.t0, attack=ex.peakT-ex.t0, gap=ex.t0-prepSegs[prepSegs.length-1].t1;
  const pP=prepFr.filter(f=>f.hz).map(f=>f.hz), eP=ex.fr.filter(f=>f.hz).map(f=>f.hz);
  const third=Math.max(1,Math.floor(pP.length/3));
  const prepStart=median(pP.slice(0,third)), prepEnd=median(pP.slice(-third)), execHz=median(eP);
  const pitchDelta = (prepEnd&&execHz)? semis(execHz,prepEnd) : 0;
  const prepRise = (prepStart&&prepEnd)? semis(prepEnd,prepStart) : 0;
  const fmt=`Exec ${loud>=0?"+":""}${loud.toFixed(1)} dB · pitch ${pitchDelta>=0?"+":""}${pitchDelta.toFixed(1)} st · ${Math.round(dur)} ms`;
  const res=(ok,reason,detail)=>({ok,reason,detail:detail?detail+" · "+fmt:fmt,ex,prepSegs,m:{loud,dur,attack,pitchDelta,prepRise,gap}});
  if(ex.peak<S.minPeak || loud<S.loud) return res(false,"Too soft","The execution must be louder than the prep");
  if(gap<S.gap) return res(false,"No pause","Pause between the prep and the execution");
  if(dur>S.maxDur || attack>S.attack) return res(false,"Drawn out","Snap the execution word: short and sharp");
  if(!(Math.abs(pitchDelta)>=S.pitch || loud>=S.spike)) return res(false,"No inflection","Raise the prep, then a distinct drop or a sharp punch on the execution");
  if(prepRise<S.prepRise && loud<S.spike+3) return res(false,"Flat prep","Raise your pitch through the preparatory command");
  return res(true,"ACCEPTED");
}
