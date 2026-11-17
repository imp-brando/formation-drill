
/* ======================================================================
   BEAT CLOCK: beat k is the moment foot(k) strikes the ground. Even = LEFT.
   clock.k is the index of the NEXT beat to fire; curBeat is the one firing.
====================================================================== */
const clock = { k:0, nextT:0, period:625, lastT:0 };
let curBeat = 0;
const footOf = k => (((k%2)+2)%2===0) ? "L" : "R";
function footAtTime(t){ const k=clock.k-1+Math.round((t-clock.lastT)/clock.period); return {k, foot:footOf(k)}; }

/* ======================================================================
   GAME STATE
====================================================================== */
const SNAKE_W=14, SNAKE_H=21;   // parade field in steps (1 unit = one 30-inch step)
let G=null;      // current game
let F=null;      // formation: {W, rankDist, interval, path, ranks:[{s, sol:[soldier|null per file]}], mode, cc}
let soldierId=0;
function newSoldier(){ return {id:soldierId++, x:0,y:0,face:0, px:null,py:null, spd:0, trans:null, faceAnim:null}; }

/** Column formation: W files, `count` soldiers, front-rank centre (x,y), heading h.
    File index sq: 0 = 1st squad = LEFT file in column (as formed by Right, FACE from line). */
function makeFormation(x,y,h,W,count){
  const back=dirV(h), path=Path.straight(x-back[0]*300, y-back[1]*300, h);
  const f={W, rankDist:1, interval:1, path, ranks:[], mode:"column", cc:null};
  const D=Math.ceil(count/W); let n=0;
  for(let r=0;r<D;r++){ const sol=new Array(W).fill(null); for(let sq=W-1;sq>=0 && n<count;sq--,n++) sol[sq]=newSoldier(); f.ranks.push({s:300-r, sol}); }
  return f;
}
function allSoldiers(){ const out=[]; for(const rk of F.ranks) for(const s of rk.sol) if(s) out.push(s); return out; }

function newGame(mode){
  G = { mode, score:0, recruits:[], over:false, move:"halt", tempo:"quick", posture:"attention",
        dress:false, eyes:false, sched:[], hitch:false, busy:null, prevMove:"forward", bpmBase: mode==="snake"?96:120 };
  soldierId=0;
  if(mode==="snake"){ F=makeFormation(SNAKE_W/2, SNAKE_H-4, 0, 4, 8); }
  else F=makeFormation(0,0,0,4, mode==="drill"?16:4);
  layoutSoldiers(0,true);
  if(mode==="snake") spawnRecruit();
  cam.x=0; cam.y=0;
  $("overlay").classList.remove("on");
  updateHUD(); setStateTag();
}
function bpm(){
  if(G.tempo==="double") return 180;
  return G.mode==="snake" ? Math.min(132, G.bpmBase+2*G.score/10) : G.bpmBase;
}

/* ---------- Scheduling: run fn at beat index k ---------- */
function at(k, fn){ G.sched.push({k,fn}); }
/** Next beat index (>= the next beat to fire) whose foot matches, or the very next beat. */
function nextBeat(foot){ let k=clock.k; if(foot==="L"||foot==="R"){ while(footOf(k)!==foot) k++; } return k; }

/* ======================================================================
   COMMAND EXECUTION: footwork per TC 3-21.5, simplified to whole counts.
   execute() runs ON beat curBeat; curBeat+1 is "one more step".
====================================================================== */
const marching = () => ["forward","mark","half","rstep","lstep","back","pivot","closing"].includes(G.move) || (F && F.mode==="counter");

/** Return why the command can't be executed now, or null. */
function canExecute(c){
  if(G.over && c.id!=="fallin") return "Formation broke. Say Fall, IN";
  if(G.busy && c.id!=="fallin") return "Wait: "+G.busy+" in progress";
  const halted = G.move==="halt";
  if(c.when==="halt" && !halted) return "Must be at the halt";
  if(c.when==="march" && halted) return c.id.includes("flank")? "At the halt, use Right/Left, FACE" : c.id==="rear"? "At the halt, use About, FACE" : "Must be marching";
  if(["rstep","lstep","back"].includes(G.move) && !["halt","fallin"].includes(c.id)) return "Halt the formation first";
  const S=SENS[settings.sens];
  const needsAttn = ["forward","colR","colL","colHR","colHL","counter","mark","double","rstep","lstep","back","rface","lface","aface","dress","openranks","closeranks","extend","close","eyes"];
  if(halted && G.posture!=="attention" && needsAttn.includes(c.id)){
    if(S.needAttn) return "Call "+settings.unit+", ATTENTION first";
    G.posture="attention";
  }
  if(c.id==="counter" && F.W!==4) return "Counter column needs 4 files (column formation)";
  if(c.id==="quick" && G.tempo==="quick") return "Already at quick time";
  if(c.id==="extend" && F.interval===1) return "Already at normal interval";
  return null;
}

function execute(c){
  const k=curBeat, halted=G.move==="halt", stride=strideNow();
  switch(c.id){
    case "forward":
      if(halted){ realignForStepOff(); G.move="forward"; }
      else at(k+1,()=>{ G.move="forward"; });
      break;
    case "halt":
      at(k+1,()=>{ G.move="closing"; });                 // one more step…
      at(k+2,()=>{ G.move="halt"; G.tempo="quick"; });    // …then the trailing foot comes alongside
      break;
    case "mark": if(halted){ realignForStepOff(); G.move="mark"; } else at(k+1,()=>{ G.move="mark"; }); break;
    case "halfstep": at(k+1,()=>{ G.move="half"; }); break;
    case "double":
      if(halted){ realignForStepOff(); G.move="forward"; G.tempo="double"; }
      else at(k+1,()=>{ G.tempo="double"; if(G.move==="half") G.move="forward"; });
      break;
    case "quick": at(k+1,()=>{ G.tempo="quick"; }); break;
    case "change": G.busy="change step"; at(k+1,()=>{ G.hitch=true; }); at(k+2,()=>{ G.hitch=false; G.busy=null; }); break;
    case "colR": case "colL": case "colHR": case "colHL": {
      const d = (c.id==="colR"||c.id==="colHR")? 1 : -1, ang=(c.id.startsWith("colH")?45:90)*D2R;
      const half=(F.W-1)/2*F.interval, inner=0.25, R=half+inner, Rout=R+half;
      const arc={t:"A",ang,r:R,d,f:R/Rout};   // f: outside file keeps a full step, pivot file half-steps
      if(halted||G.move==="mark"){ realignForStepOff(); G.move="forward"; F.path.append(F.ranks[0].s, [arc]); }
      else { if(G.move==="half") G.move="forward"; F.path.append(F.ranks[0].s+stride, [arc]); } // one more step, then pivot
      break; }
    case "rflank": case "lflank":
      G.busy="flank";
      at(k+1,()=>{ flankTransform(c.id==="rflank"?1:-1); G.busy=null; });
      break;
    case "rear":
      G.busy="rear march";
      at(k+1,()=>{ G.prevMove = G.move==="half"?"half":"forward"; G.move="pivot"; rearTransform(); }); // pivot on the balls of both feet
      at(k+2,()=>{ G.move=G.prevMove; G.busy=null; });                                             // step off with the left foot
      break;
    case "counter": if(halted){ realignForStepOff(); G.move="forward"; } else if(G.move!=="forward") G.move="forward"; startCounterColumn(); break;
    case "rstep": case "lstep": case "back": realignForStepOff(); G.move=c.id; break;
    case "rface": case "lface": flankTransform(c.id==="rface"?1:-1); break;
    case "aface": rearTransform(); break;
    case "parade": G.posture="parade"; G.dress=false; break;
    case "standease": G.posture="standease"; G.dress=false; break;
    case "atease": G.posture="atease"; G.dress=false; break;
    case "attn": G.posture="attention"; break;
    case "dress": G.dress=true; break;
    case "eyes": G.eyes=true; break;
    case "front": G.dress=false; G.eyes=false; break;
    case "openranks": animateSpacing("rankDist", 2); break;
    case "closeranks": animateSpacing("rankDist", 1); break;
    case "extend": animateSpacing("interval", 1); break;
    case "close": animateSpacing("interval", 0.6); break;
    case "fallin": fallIn(); break;
  }
  setStateTag();
}
/** Re-index the beat so the first swing is the LEFT foot (step off with the left). */
function realignForStepOff(){ if(footOf(clock.k)!=="L") clock.k++; }

/** Distance (in 30-inch units) the formation covers per beat right now. */
function strideNow(){
  const base = G.tempo==="double" ? 1.2 : 1.0;  // 36-inch vs 30-inch step
  switch(G.move){
    case "forward": return G.hitch? base*0.5 : base;
    case "half": case "back": case "rstep": case "lstep": return 0.5;
    default: return 0;  // halt, mark time, pivot, closing
  }
}

/* ---------- Spacing changes (open/close ranks, extend/close interval) ---------- */
function animateSpacing(key, val){
  const old=allSoldiers().map(s=>[s,s.x,s.y]);
  if(key==="rankDist"){
    const anchor=Math.min(2,F.ranks.length-1), sA=F.ranks[anchor].s;   // 3rd rank stands fast
    F.ranks.forEach((rk,r)=>{ rk.s = sA - (r-anchor)*val; });
  }
  F[key]=val;
  for(const [s,x,y] of old) s.trans={x,y,t0:now(),dur:clock.period*2};
}

/* ---------- Flank / facing: everyone turns 90° in place; ranks become files ---------- */
function flankTransform(d){
  const W=F.W, D=F.ranks.length;
  const p0=F.path.posAt(F.ranks[0].s), h=p0.h, dv=dirV(h), nv=nrmV(h);
  const ideal=(r,sq)=>({x:p0.x-dv[0]*r*F.rankDist+nv[0]*(sq-(W-1)/2)*F.interval, y:p0.y-dv[1]*r*F.rankDist+nv[1]*(sq-(W-1)/2)*F.interval});
  const W2=D, D2=W, h2=h+d*90*D2R;
  const ranks2=[]; for(let r=0;r<D2;r++) ranks2.push({s:0,sol:new Array(W2).fill(null)});
  for(let r=0;r<D;r++) for(let sq=0;sq<W;sq++){
    const s=F.ranks[r].sol[sq]; if(!s) continue;
    const r2 = d>0 ? (W-1-sq) : sq, sq2 = d>0 ? r : (D-1-r);
    ranks2[r2].sol[sq2]=s;
    s.trans={x:s.x,y:s.y,t0:now(),dur:clock.period}; s.faceAnim={off:-d*90*D2R,t0:now(),dur:clock.period*.8};
  }
  let cx=0, cy=0;  // centre of the new front rank (= old right or left file)
  for(let sq2=0;sq2<W2;sq2++){ const r=d>0?sq2:(D-1-sq2), sq=d>0?W-1:0, q=ideal(r,sq); cx+=q.x; cy+=q.y; }
  cx/=W2; cy/=W2;
  const b=dirV(h2); F.path=Path.straight(cx-b[0]*300, cy-b[1]*300, h2);
  const rd=F.interval, iv=F.rankDist; F.rankDist=rd; F.interval=iv;
  ranks2.forEach((rk,r)=>rk.s=300-r*F.rankDist);
  F.W=W2; F.ranks=ranks2.filter(rk=>rk.sol.some(Boolean));
}

/* ---------- Rear march / about face: the rear rank becomes the front rank ---------- */
function rearTransform(){
  const sHead=F.ranks[0].s, sTail=F.ranks[F.ranks.length-1].s;
  const ph=F.path.posAt(sHead), dh=dirV(ph.h);
  const pts=[[ph.x+dh[0], ph.y+dh[1]]];      // 1 unit beyond the old head (behind the new tail)
  for(let s=sHead; s>sTail+0.05; s-=0.1){ const p=F.path.posAt(s); pts.push([p.x,p.y]); }
  const pt=F.path.posAt(sTail); pts.push([pt.x,pt.y]);
  const np=Path.fromPoints(pts); const L=np.last; np.append(L.s0+L.len, [{t:"L",len:Infinity}]);
  const old=F.ranks;
  F.ranks=old.slice().reverse().map(rk=>({s:1+sHead-rk.s, sol:rk.sol.slice().reverse()}));
  F.path=np;
  for(const s of allSoldiers()) s.faceAnim={off:-Math.PI,t0:now(),dur:clock.period*.9};
}

/* ---------- Counter column (4 files), per TC 3-21.5 ---------- */
function startCounterColumn(){
  G.busy="counter column";
  const W=4, iv=F.interval, D=F.ranks.length, sHead=F.ranks[0].s, sTail=F.ranks[D-1].s;
  // sq 0..3 = 1st..4th squad (1st squad = left file). Final lanes interleave the old ones so files pass cleanly.
  const pre=[3,1,0,2], dir=[1,1,-1,-1], lanesTo=[2.0,1.0,0.0,-1.0];
  const paths=[], headS=[], endS=[];
  for(let sq=0;sq<W;sq++){
    const lat=(sq-(W-1)/2)*iv, pts=[];
    for(let s=sTail-1; s<sHead; s+=0.2){ const p=F.path.posAt(s), n=nrmV(p.h); pts.push([p.x+n[0]*lat, p.y+n[1]*lat]); }
    const p=F.path.posAt(sHead), n=nrmV(p.h); pts.push([p.x+n[0]*lat, p.y+n[1]*lat]);
    const fp=Path.fromPoints(pts), L=fp.last, hs=L.s0+L.len;
    const w=Math.abs(lanesTo[sq]*iv - lat), rr=Math.min(0.5*iv, w/2);
    fp.append(hs, [{t:"L",len:pre[sq]}, {t:"A",ang:Math.PI/2,r:rr,d:dir[sq]}, {t:"L",len:Math.max(0,w-2*rr)}, {t:"A",ang:Math.PI/2,r:rr,d:dir[sq]}]);
    const lastFinite=fp.segs[fp.segs.length-2];
    paths.push(fp); headS.push(hs); endS.push(lastFinite.s0+lastFinite.len);
  }
  const depths=F.ranks.map(rk=>sHead-rk.s);
  F.cc={paths, headS, endS, depths};
  F.mode="counter";
}
function advanceCounter(dist){
  const cc=F.cc, done=cc.headS.map((h,sq)=>h-cc.endS[sq]), minD=Math.min(...done);
  for(let sq=0;sq<4;sq++){
    // squads that have completed both turns take half steps until the others are abreast
    const k = (done[sq]>=0 && done[sq]>minD+0.04) ? 0.5 : 1;
    cc.headS[sq]+=dist*k;
  }
  const maxDepth=cc.depths[cc.depths.length-1];
  const allPast=cc.headS.every((h,sq)=>h-maxDepth>=cc.endS[sq]-1e-6);
  if(allPast && Math.max(...done)-minD<0.06) finishCounterColumn();
}
function finishCounterColumn(){
  const cc=F.cc; let cx=0, cy=0, h=0;
  for(let sq=0;sq<4;sq++){ const p=cc.paths[sq].posAt(cc.headS[sq]); cx+=p.x/4; cy+=p.y/4; h=p.h; }
  const b=dirV(h); F.path=Path.straight(cx-b[0]*300, cy-b[1]*300, h);
  F.ranks.forEach((rk,r)=>rk.s=300-cc.depths[r]);
  for(const s of allSoldiers()) s.trans={x:s.x,y:s.y,t0:now(),dur:clock.period*.6};
  F.mode="column"; F.cc=null; G.busy=null; setStateTag();
}

function fallIn(){ newGame(G.mode); flash("FALL IN","ok","Formed in column at attention"); }

/* ======================================================================
   MOVEMENT UPDATE (called every frame with elapsed time in beats)
====================================================================== */
function advance(dtBeats){
  if(G.over) return;
  const dist=strideNow()*dtBeats;
  if(F.mode==="counter"){ advanceCounter(dist); return; }
  if(G.move==="rstep"||G.move==="lstep"||G.move==="back"){
    const h=F.path.posAt(F.ranks[0].s).h;
    const v = G.move==="back"? dirV(h).map(x=>-x) : nrmV(h).map(x=>G.move==="rstep"?x:-x);
    F.path.translate(v[0]*dist, v[1]*dist); return;
  }
  if(dist<=0) return;
  // Front rank: speed factor < 1 on arcs, so the pivot file half-steps while the outside file wheels.
  const r0=F.ranks[0]; r0.s += dist*F.path.factorAt(r0.s);
  for(let r=1;r<F.ranks.length;r++){
    const rk=F.ranks[r], prev=F.ranks[r-1], f=F.path.factorAt(rk.s), gap=prev.s-rk.s;
    let ds=dist*f;
    if(f===1 && gap>F.rankDist+0.01) ds=Math.min(ds*1.15, gap-F.rankDist+ds);   // cover down after a turn
    let target=Math.min(rk.s+ds, prev.s-0.35*F.rankDist);
    // Keep >= 80% distance to the soldier ahead: shorten to a half step, or mark time, if needed.
    if(!rankClear(r,target)){ const half=rk.s+ds*.5; target = rankClear(r,half)? half : rk.s; }
    rk.s=Math.max(rk.s,target);
  }
  F.path.prune(F.ranks[F.ranks.length-1].s-20);
}
function slotPos(sq,s){
  const p=F.path.posAt(s), n=nrmV(p.h), lat=(sq-(F.W-1)/2)*F.interval;
  return {x:p.x+n[0]*lat, y:p.y+n[1]*lat, h:p.h};
}
function rankClear(r,s){
  const a=F.ranks[r], b=F.ranks[r-1], lim=0.8*Math.min(F.rankDist,1);
  for(let sq=0;sq<F.W;sq++){
    if(!a.sol[sq]) continue;
    const pa=slotPos(sq,s);
    for(let q=0;q<F.W;q++){ if(!b.sol[q]) continue; const pb=slotPos(q,b.s); if(Math.hypot(pa.x-pb.x,pa.y-pb.y)<lim) return false; }
  }
  return true;
}

/** Each soldier's displayed position and facing (with transitions), plus measured step speed. */
function layoutSoldiers(dtBeats, snap){
  const t=now();
  F.ranks.forEach((rk,r)=>rk.sol.forEach((s,sq)=>{
    if(!s) return;
    const p = F.mode==="counter" ? F.cc.paths[sq].posAt(F.cc.headS[sq]-F.cc.depths[r]) : slotPos(sq,rk.s);
    let x=p.x, y=p.y, face=p.h;
    if(s.trans){ const u=(t-s.trans.t0)/s.trans.dur; if(u>=1) s.trans=null; else { const e=ease(u); x=lerp(s.trans.x,x,e); y=lerp(s.trans.y,y,e); } }
    if(s.faceAnim){ const u=(t-s.faceAnim.t0)/s.faceAnim.dur; if(u>=1) s.faceAnim=null; else face+=s.faceAnim.off*(1-ease(u)); }
    if(!snap && s.px!==null && dtBeats>0){ const v=Math.hypot(x-s.px,y-s.py)/dtBeats; s.spd=lerp(s.spd, Math.min(v,2), .25); }
    if(snap) s.spd=0;
    s.px=x; s.py=y; s.x=x; s.y=y; s.face=face;
  }));
}

/* ---------- Snake rules ---------- */
function spawnRecruit(){
  const sol=allSoldiers();
  for(let tries=0;tries<300;tries++){
    const x=1+Math.floor(Math.random()*(SNAKE_W-2))+.5, y=1+Math.floor(Math.random()*(SNAKE_H-2))+.5;
    if(sol.every(s=>Math.hypot(s.x-x,s.y-y)>2)){ G.recruits.push({x,y,face:Math.floor(Math.random()*8)*45*D2R,t:now()}); return; }
  }
}
function addRecruitToFormation(){
  const last=F.ranks[F.ranks.length-1], s=newSoldier();
  let empty=-1; for(let sq=F.W-1;sq>=0;sq--) if(!last.sol[sq]){ empty=sq; break; }   // fill from the right file
  if(empty>=0) last.sol[empty]=s;
  else { const sol=new Array(F.W).fill(null); sol[F.W-1]=s; F.ranks.push({s:last.s-F.rankDist, sol}); }
}
function snakeRules(){
  if(G.mode!=="snake"||G.over) return;
  const sol=allSoldiers();
  for(const s of sol) if(s.x<0.25||s.x>SNAKE_W-0.25||s.y<0.25||s.y>SNAKE_H-0.25) return broke("You marched into the wall");
  // own formation: front rank vs every rank from the 3rd back (off during maneuvers)
  if(F.mode==="column" && !G.busy && !sol.some(s=>s.trans) && F.ranks.length>2){
    const front=F.ranks[0].sol.filter(Boolean);
    for(let r=2;r<F.ranks.length;r++) for(const b of F.ranks[r].sol) if(b) for(const a of front)
      if(Math.hypot(a.x-b.x,a.y-b.y)<0.55) return broke("You marched into your own formation");
  }
  for(let i=G.recruits.length-1;i>=0;i--){
    const rc=G.recruits[i];
    if(sol.some(s=>Math.hypot(s.x-rc.x,s.y-rc.y)<0.7)){
      G.recruits.splice(i,1); G.score+=10; addRecruitToFormation(); spawnRecruit(); chime(true); updateHUD();
    }
  }
}
function broke(why){
  G.over=true; G.move="halt"; G.sched=[];
  if(G.score>hiScore){ hiScore=G.score; localStorage.setItem("formation.hi",hiScore); }
  $("ovTitle").textContent="Formation broke"; $("ovText").textContent=why+". Score "+G.score+" · High "+hiScore;
  $("overlay").classList.add("on"); chime(false); updateHUD();
}
