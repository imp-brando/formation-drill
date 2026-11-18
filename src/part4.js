
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
let SNAKE_W=28, SNAKE_H=42;     // parade field in steps (1 unit = one 30-inch step); sized to the screen in newGame
const MIN_CELL_PX=12.5;         // smallest on-screen step (CSS px) at which legs still read clearly
/** Fit as many steps as the field area allows (about 28 x 42 on a phone), keeping soldiers recognisable. */
function pickSnakeField(){
  const r=cv.getBoundingClientRect(); let w=r.width, h=r.height;
  if(w<50||h<50){ w=390; h=590; }
  const cell=Math.max(MIN_CELL_PX, Math.min(w, h*2/3)/28);
  SNAKE_W=clamp(Math.floor(w/cell),20,44); SNAKE_H=clamp(Math.floor(h/cell),30,66);
}
let G=null;      // current game
let F=null;      // formation: {W, rankDist, interval, path, ranks:[{s, sol:[soldier|null per file]}], mode, cc}
let soldierId=0;
function newSoldier(){ return {id:soldierId++, x:0,y:0,face:0, px:null,py:null, spd:0, trans:null, faceAnim:null}; }

/** Column formation: W files, `count` soldiers, front-rank centre (x,y), heading h.
    File index sq: 0 = 1st squad = LEFT file in column (as formed by Right, FACE from line). */
function makeFormation(x,y,h,W,count){
  const back=dirV(h), path=Path.straight(x-back[0]*300, y-back[1]*300, h);
  const f={W, rankDist:1, interval:1, path, ranks:[], mode:"column", cc:null, cShift:0, inLine:false, lineTail:0};
  const D=Math.ceil(count/W); let n=0;
  for(let r=0;r<D;r++){ const sol=new Array(W).fill(null); for(let sq=W-1;sq>=0 && n<count;sq--,n++) sol[sq]=newSoldier(); f.ranks.push({s:300-r, sol}); }
  const g=path.segs[0]; for(const rk of f.ranks){ rk.fs=[]; for(let q=0;q<W;q++) rk.fs.push({seg:g, s:rk.s}); }
  return f;
}
function allSoldiers(){ const out=[]; for(const rk of F.ranks) for(const s of rk.sol) if(s) out.push(s); return out; }

function newGame(mode){
  G = { mode, score:0, recruits:[], over:false, move:"halt", tempo:"quick", posture:"attention",
        dress:false, eyes:false, sched:[], hitch:false, busy:null, prevMove:"forward", bpmBase: mode==="snake"?112:120 };
  soldierId=0;
  if(mode==="snake"){ pickSnakeField(); F=makeFormation(SNAKE_W/2, SNAKE_H-5, 0, 4, 8); }
  else F=makeFormation(0,0,0,4, mode==="drill"?16:4);
  layoutSoldiers(0,true);
  if(mode==="snake"){ spawnRecruit(); spawnRecruit(); }   // two recruits out at once on the big field
  cam.x=0; cam.y=0;
  $("overlay").classList.remove("on");
  updateHUD(); setStateTag();
}
function bpm(){
  if(G.tempo==="double") return 180;
  return G.mode==="snake" ? Math.min(144, G.bpmBase+2*G.score/10) : G.bpmBase;
}

/* ---------- Scheduling: run fn at beat index k ---------- */
function at(k, fn, tag){ G.sched.push({k,fn,tag: tag || (typeof schedTag!=="undefined" ? schedTag : null)}); }
/** Next beat index (>= the next beat to fire) whose foot matches, or the very next beat. */
function nextBeat(foot){ let k=clock.k; if(foot==="L"||foot==="R"){ while(footOf(k)!==foot) k++; } return k; }

/* ======================================================================
   COMMAND EXECUTION: footwork per TC 3-21.5, simplified to whole counts.
   execute() runs ON beat curBeat; curBeat+1 is "one more step".
====================================================================== */
const marching = () => ["forward","mark","half","rstep","lstep","back","pivot","closing"].includes(G.move) || (F && F.mode==="counter");

/** Return why the command can't be executed now, or null. */
function canExecute(c){
  if(G.over && c.id!=="fallin") return "Formation broke. Tap FALL IN";
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

/** PICAA: the command of execution counts on beat kE (on the correct foot); troops take ONE
    additional step (kE -> kE+1) and execute on the action step at beat kE+1. Movements from the
    halt have no additional step: the action happens on kE. kE may be the strike that just
    passed (the command was called on it), in which case the additional step is already underway. */
function execute(c, kE){
  const k = kE===undefined ? curBeat : kE, halted=G.move==="halt", stride=strideNow();
  const beatsNow = clock.k-1+clamp((now()-clock.lastT)/clock.period,0,1);
  if(window.__execLog) window.__execLog.push({id:c.id, t:now(), k, beatsNow});   // test hook
  const addl = !halted && ["halt","mark","halfstep","double","quick","change","colR","colL","colHR","colHL","rflank","lflank","rear","counter","forward"].includes(c.id);
  G.pendingAction={id:c.id, kE:k, actK: addl? k+1 : k, actT:null, actBeat:null};
  if(typeof picaaExec==="function") picaaExec(c, k, addl);
  const act=(kk,fn)=>{ if(kk<clock.k) fn(); else at(kk,fn); };   // run on beat kk (now if it has passed)
  const actionDone=()=>{ const pa=G.pendingAction; if(pa && !pa.actT){ pa.actT=now(); pa.actBeat=clock.k-1+clamp((now()-clock.lastT)/clock.period,0,1); } };
  switch(c.id){
    case "forward":
      if(halted){ realignForStepOff(); G.move="forward"; actionDone(); }
      else act(k+1,()=>{ G.move="forward"; actionDone(); });     // from mark time / half step
      break;
    case "halt":
      act(k+1,()=>{ G.move="closing"; actionDone(); });           // additional step, then…
      act(k+2,()=>{ G.move="halt"; G.tempo="quick"; });          // …the trailing foot comes alongside
      break;
    case "mark": if(halted){ realignForStepOff(); G.move="mark"; } else act(k+1,()=>{ G.move="mark"; actionDone(); }); break;
    case "halfstep": act(k+1,()=>{ G.move="half"; actionDone(); }); break;
    case "double":
      if(halted){ realignForStepOff(); G.move="forward"; G.tempo="double"; }
      else act(k+1,()=>{ G.tempo="double"; if(G.move==="half") G.move="forward"; actionDone(); });
      break;
    case "quick": act(k+1,()=>{ G.tempo="quick"; actionDone(); }); break;
    case "change": G.busy="change step"; act(k+1,()=>{ G.hitch=true; actionDone(); }); act(k+2,()=>{ G.hitch=false; G.busy=null; }); break;
    case "colR": case "colL": case "colHR": case "colHL": {
      const d = (c.id==="colR"||c.id==="colHR")? 1 : -1, ang=(c.id.startsWith("colH")?45:90)*D2R;
      // Square pivot: the corner is placed so the pivot (inside) file reaches ITS pivot point on the
      // action step; every other file marches on to its own pivot point and pivots there.
      const half = d>0 ? laneOf(F.W-1) : -laneOf(0), eIn=half*Math.tan(ang/2);   // distance from the centre line to the pivot file
      if(schedTag) schedTag.pathLen=F.path.segs.length;
      if(halted||G.move==="mark"){ realignForStepOff(); G.move="forward"; F.path.append(F.ranks[0].s+eIn, [{t:"T",ang,d}]); }
      else { if(G.move==="half") G.move="forward";
        const sAct=F.ranks[0].s + stride*Math.max(0,(k+1)-beatsNow);          // where the front is at the action step
        F.path.append(sAct+eIn, [{t:"T",ang,d}]); }
      F._fi=null;
      break; }
    case "rflank": case "lflank":
      G.busy="flank";
      act(k+1,()=>{ flankTransform(c.id==="rflank"?1:-1); G.busy=null; actionDone(); });
      break;
    case "rear":
      G.busy="rear march";
      act(k+1,()=>{ G.prevMove = G.move==="half"?"half":"forward"; G.move="pivot"; rearTransform(); actionDone(); }); // pivot on the balls of both feet
      act(k+2,()=>{ G.move=G.prevMove; G.busy=null; });                                                              // step off with the left foot                                             // step off with the left foot
      break;
    case "counter":
      if(halted){ realignForStepOff(); G.move="forward"; startCounterColumn(); actionDone(); }
      else { G.busy="counter column"; act(k+1,()=>{ if(G.move!=="forward") G.move="forward"; startCounterColumn(); actionDone(); }); }
      break;
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
  F[key]=val; F._fi=null;
  if(key==="rankDist"){
    const anchor=Math.min(2,F.ranks.length-1), A=F.ranks[anchor];   // 3rd rank stands fast
    F.ranks.forEach((rk,r)=>{ if(r===anchor) return; rk.fs=A.fs.map((fs,q)=>{ const w=fileWalk(q,fs,(anchor-r)*val); return {seg:w.seg,s:w.s}; }); rk.s=rankS(rk); });
  }
  for(const [s,x,y] of old) s.trans={x,y,t0:now(),dur:clock.period*2};
}

/* ---------- Flank / facing: everyone turns 90° in place; ranks become files ---------- */
function flankTransform(d){
  const W=F.W, D=F.ranks.length;
  const p0=F.path.posAt(F.ranks[0].s), h=p0.h, dv=dirV(h), nv=nrmV(h);
  const ideal=(r,sq)=>({x:p0.x-dv[0]*r*F.rankDist+nv[0]*laneOf(sq), y:p0.y-dv[1]*r*F.rankDist+nv[1]*laneOf(sq)});
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
  F.W=W2; F.ranks=ranks2.filter(rk=>rk.sol.some(Boolean)); F.cShift=0;
  // squads were files, now they're ranks (or back again). The squads' tail end is where the old rear rank went.
  F.inLine=!F.inLine; F.lineTail = F.inLine ? (d>0 ? 1 : -1) : 0;
  F._fi=null; fsAll();
}

/* ---------- Rear march / about face: the rear rank becomes the front rank ---------- */
function rearTransform(){
  const fi=fileInfo(), segs=F.path.segs;
  let iMax=0, iMin=segs.length-1, sTop=-Infinity;
  for(const rk of F.ranks) for(const fs of rk.fs){ const i=segIndex(fi,fs); iMax=Math.max(iMax,i); iMin=Math.min(iMin,i); sTop=Math.max(sTop,fs.s); }
  sTop+=1;
  // new path = old centre polyline walked backwards; new s = sTop - old s on the matching segment
  const np=new Path(), map=new Map();
  for(let i=iMax;i>=iMin;i--){
    const g=segs[i], d=dirV(g.h), sEnd = i===iMax ? sTop : segs[i+1].s0;
    const ex=g.x+d[0]*(sEnd-g.s0), ey=g.y+d[1]*(sEnd-g.s0);
    const ng={t:"L", x:ex, y:ey, h:g.h+Math.PI, s0:sTop-sEnd, len: i===iMin ? Infinity : sEnd-g.s0, f:1};
    np.segs.push(ng); map.set(g,ng);
  }
  const old=F.ranks, W=F.W;
  F.ranks=old.slice().reverse().map(rk=>{
    const sol=rk.sol.slice().reverse(), fs=[];
    for(let q=0;q<W;q++){ const o=rk.fs[W-1-q]; fs.push({seg:map.get(o.seg)||np.segs[np.segs.length-1], s:sTop-o.s}); }
    return {sol, fs, s:0};
  });
  F.path=np; F._fi=null;
  F.cShift=-(F.cShift||0); F.lineTail=-(F.lineTail||0);    // files reversed: the line's tail end swaps sides
  for(const rk of F.ranks) rk.s=rankS(rk);
  for(const s of allSoldiers()) s.faceAnim={off:-Math.PI,t0:now(),dur:clock.period*.9};
}

/* ---------- Counter column (4 files), per TC 3-21.5 ---------- */
function startCounterColumn(){
  G.busy="counter column";
  const W=4, iv=F.interval, D=F.ranks.length;
  // sq 0..3 = 1st..4th squad (1st squad = left file). Final lanes interleave the old ones so files pass cleanly.
  const pre=[3,1,0,2], dir=[1,1,-1,-1], lanesTo=[2.0,1.0,0.0,-1.0];
  const paths=[], headS=[], endS=[];
  for(let sq=0;sq<W;sq++){
    const lat=laneOf(sq), pts=[];
    const uHead=fileU(sq,F.ranks[0].fs[sq]), uTail=fileU(sq,F.ranks[D-1].fs[sq])-1;
    let st=fileWalk(sq,F.ranks[0].fs[sq],uTail-uHead);
    for(let u=uTail; u<uHead; u+=0.2){ const p=filePos(sq,st); pts.push([p.x,p.y]); st=fileWalk(sq,st,0.2); }
    const ph=filePos(sq,F.ranks[0].fs[sq]); pts.push([ph.x,ph.y]);
    const fp=Path.fromPoints(pts), L=fp.last, hs=L.s0+L.len;
    const w=Math.abs(lanesTo[sq]*iv - lat), rr=Math.min(0.5*iv, w/2);
    fp.append(hs, [{t:"L",len:pre[sq]}, {t:"A",ang:Math.PI/2,r:rr,d:dir[sq]}, {t:"L",len:Math.max(0,w-2*rr)}, {t:"A",ang:Math.PI/2,r:rr,d:dir[sq]}]);
    const lastFinite=fp.segs[fp.segs.length-2];
    paths.push(fp); headS.push(hs); endS.push(lastFinite.s0+lastFinite.len);
  }
  // depth of each soldier behind its file's head, measured along that file's own lane
  const depthQ=[]; for(let sq=0;sq<W;sq++){ const uh=fileU(sq,F.ranks[0].fs[sq]); depthQ.push(F.ranks.map(rk=>uh-fileU(sq,rk.fs[sq]))); }
  F.cc={paths, headS, endS, depthQ};
  F.mode="counter";
}
const CATCHUP_WHEEL=1.2, CATCHUP_MAX=1.25;   // longest catch-up stride, in 30-inch steps (same cadence)
function advanceCounter(dist){
  const cc=F.cc, done=cc.headS.map((h,sq)=>h-cc.endS[sq]), minD=Math.min(...done), maxD=Math.max(...done);
  for(let sq=0;sq<4;sq++){
    // squads that have completed both turns take half steps until the others are abreast;
    // squads that are behind lengthen their stride (up to 1.25 steps, same cadence) to catch up
    const lag=maxD-done[sq];
    const k = (done[sq]>=0 && done[sq]>minD+0.04) ? 0.5 : lag>0.04 ? Math.min(CATCHUP_MAX, 1+lag) : 1;
    cc.headS[sq]+=dist*k;
  }
  const allPast=cc.headS.every((h,sq)=>h-cc.depthQ[sq][cc.depthQ[sq].length-1]>=cc.endS[sq]-1e-6);
  if(allPast && Math.max(...done)-minD<0.06) finishCounterColumn();
}
function finishCounterColumn(){
  const cc=F.cc; let cx=0, cy=0, h=0;
  for(let sq=0;sq<4;sq++){ const p=cc.paths[sq].posAt(cc.headS[sq]); cx+=p.x/4; cy+=p.y/4; h=p.h; }
  const b=dirV(h); F.path=Path.straight(cx-b[0]*300, cy-b[1]*300, h);
  F.ranks.forEach((rk,r)=>{ let d=0; for(let q=0;q<4;q++) d+=cc.depthQ[q][r]/4; rk.s=300-d; });
  F.cShift=0; F._fi=null; fsAll();
  for(const s of allSoldiers()) s.trans={x:s.x,y:s.y,t0:now(),dur:clock.period*.6};
  F.mode="column"; F.cc=null; G.busy=null; setStateTag();
}

function fallIn(){ newGame(G.mode); flash("FALL IN","ok","Formed in column at attention"); }

/* ======================================================================
   FILES AND SQUARE PIVOTS
   The column's centre path is a polyline with sharp corners. Each file walks its own
   lane (the centre line offset sideways by its interval), and the lanes meet at mitred
   corners: every file has its OWN pivot point where its lane turns. A file's state is
   {seg, s}: the centre-path segment whose lane it is on, and its position measured in
   centre-path units ("abreast" files have equal s). At its pivot point the file moves onto
   the next segment; its s jumps (inside files gain, outside files lose) while its body
   doesn't move, which is exactly a pivot in place.
====================================================================== */
const angWrap=a=>{ while(a>Math.PI) a-=2*Math.PI; while(a<=-Math.PI) a+=2*Math.PI; return a; };
function laneOf(q){ return (q-(F.W-1)/2+(F.cShift||0))*F.interval; }   // cShift: lanes off-centre after a file is added to a line
/** Per-file corner thresholds for the current path (cached until the path changes). */
function fileInfo(){
  const P=F.path, segs=P.segs, key=segs.length+":"+segs[0].s0+":"+F.W+":"+F.interval+":"+(segs[segs.length-1].s0);
  if(F._fi && F._fi.P===P && F._fi.key===key) return F._fi;
  const n=segs.length, idx=new Map(); segs.forEach((g,i)=>idx.set(g,i));
  const files=[];
  for(let q=0;q<F.W;q++){
    const L=laneOf(q), st=[], en=[], U=[]; let u=0;
    for(let i=0;i<n;i++){
      const dIn = i>0 ? clamp(angWrap(segs[i].h-segs[i-1].h),-2.9,2.9) : 0;
      const dOut= i<n-1 ? clamp(angWrap(segs[i+1].h-segs[i].h),-2.9,2.9) : 0;
      st[i]=segs[i].s0 + L*Math.tan(dIn/2);
      en[i]= i<n-1 ? segs[i+1].s0 - L*Math.tan(dOut/2) : Infinity;
      U[i]=u; if(i<n-1) u+=en[i]-st[i];
    }
    files.push({L,st,en,U});
  }
  return F._fi={P,key,idx,files};
}
function segIndex(fi,fs){ const i=fi.idx.get(fs.seg); return i===undefined ? 0 : i; }
/** Distance walked along file q's own lane up to state fs (for spacing between ranks). */
function fileU(q,fs){ const fi=fileInfo(), f=fi.files[q], i=segIndex(fi,fs); return f.U[i]+fs.s-f.st[i]; }
/** Walk file q forward (du>0) or back (du<0) along its own lane, pivoting at its pivot points. */
function fileWalk(q,fs,du){
  const fi=fileInfo(), f=fi.files[q], segs=F.path.segs; let i=segIndex(fi,fs), s=fs.s+du, pivoted=false;
  while(i<segs.length-1 && s>=f.en[i]){ s=f.st[i+1]+(s-f.en[i]); i++; pivoted=true; }
  while(i>0 && s<f.st[i]){ s=f.en[i-1]-(f.st[i]-s); i--; }
  return {seg:segs[i], s, pivoted};
}
function filePos(q,fs){ const g=fs.seg, d=dirV(g.h), n=nrmV(g.h), L=laneOf(q), u=fs.s-g.s0;
  return {x:g.x+d[0]*u+n[0]*L, y:g.y+d[1]*u+n[1]*L, h:g.h}; }
/** Put every file of a rank abreast at centre position s (after the path was rebuilt). */
function fsInit(rk){ const g=F.path.segAt(rk.s); rk.fs=[]; for(let q=0;q<F.W;q++) rk.fs.push({seg:g, s:rk.s}); }
function fsAll(){ for(const rk of F.ranks) fsInit(rk); }
function rankS(rk){ let t=0; for(const f of rk.fs) t+=f.s; return t/rk.fs.length; }
function onNewestSeg(fs){ return fs.seg===F.path.last || fileInfo().idx.get(fs.seg)===F.path.segs.length-1; }

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
  const r0=F.ranks[0], W=F.W;
  // Front rank. Each file marches to ITS OWN pivot point and pivots there (square corner).
  // Files that have pivoted take half steps until the rest are abreast; files that are behind
  // lengthen their stride (up to 1.25 steps, same cadence) to come abreast sooner.
  const pres=[]; for(let q=0;q<W;q++) if(F.ranks.some(rk=>rk.sol[q])) pres.push(q);
  const newest=pres.map(q=>onNewestSeg(r0.fs[q])), allNew=newest.every(Boolean), anyNew=newest.some(Boolean);
  const sv=pres.map(q=>r0.fs[q].s), minS=Math.min(...sv), maxS=Math.max(...sv);
  for(let q=0;q<W;q++){
    const j=pres.indexOf(q); let k=1;
    if(j>=0 && anyNew && !(allNew && maxS-minS<0.02)){
      if(newest[j] && (!allNew || sv[j]>minS+0.02)) k=0.5;                        // pivoted: half steps
      else k = allNew ? Math.min(CATCHUP_MAX, 1+(maxS-sv[j])) : CATCHUP_MAX;      // behind: longer strides
    }
    const oh=r0.fs[q].seg.h, w=fileWalk(q,r0.fs[q],dist*k); r0.fs[q]={seg:w.seg,s:w.s};
    if(w.pivoted && r0.sol[q]) markPivot(r0.sol[q], q, oh, true);
  }
  r0.s=rankS(r0);
  // Rear ranks: every soldier covers down on the soldier ahead in his file, one step back along
  // the file's lane, pivoting at the same pivot point; longer strides (same cadence) to close up.
  for(let r=1;r<F.ranks.length;r++){
    const rk=F.ranks[r], prev=F.ranks[r-1];
    for(let q=0;q<W;q++){
      const gap=fileU(q,prev.fs[q])-fileU(q,rk.fs[q]);
      let ds=dist; if(gap>F.rankDist+0.01) ds=Math.min(dist*CATCHUP_MAX, gap-F.rankDist+dist);
      ds=Math.max(0, Math.min(ds, gap-F.rankDist));
      const oh=rk.fs[q].seg.h, w=fileWalk(q,rk.fs[q],ds); rk.fs[q]={seg:w.seg,s:w.s};
      if(w.pivoted && rk.sol[q]) markPivot(rk.sol[q], q, oh, false);
    }
    rk.s=rankS(rk);
  }
  let sMin=Infinity; for(const rk of F.ranks) for(const f of rk.fs) sMin=Math.min(sMin,f.s);
  F.path.prune(sMin-20);
}
/** Visual pivot: the facing snaps round over a quarter beat; test hook records it. */
function markPivot(sol, q, oldH, front){
  const nh=F.ranks.find(rk=>rk.sol[q]===sol).fs[q].seg.h;
  sol.faceAnim={off:angWrap(oldH-nh), t0:now(), dur:clock.period*0.3};          // snap round on the ball of the foot
  const beat=clock.k-1+clamp((now()-clock.lastT)/clock.period,0,1);
  if(window.__pivotLog) window.__pivotLog.push({t:now(), beat, q, front});
  const pa=G.pendingAction;
  if(front && pa && /^col/.test(pa.id) && !pa.actT){ pa.actT=now(); pa.actBeat=beat; }
}

/** Each soldier's displayed position and facing (with transitions), plus measured step speed. */
function layoutSoldiers(dtBeats, snap){
  const t=now();
  F.ranks.forEach((rk,r)=>rk.sol.forEach((s,sq)=>{
    if(!s) return;
    const p = F.mode==="counter" ? F.cc.paths[sq].posAt(F.cc.headS[sq]-F.cc.depthQ[sq][r]) : filePos(sq,rk.fs[sq]);
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
  // In line (after a flank) the squads are ranks: a recruit falls in at the squad's tail, which is the end
  // file of the line, filled front to back, then a new file opens at that end. In column: rear rank, right first.
  if(F.inLine){
    if(F.mode!=="column" || G.busy || !F.ranks.every(rk=>rk.fs.every(onNewestSeg))){ G.pendingRecruits=(G.pendingRecruits||0)+1; return; }   // mid-maneuver: fall in once straight
    let tq = F.lineTail>0 ? F.W-1 : 0;
    let rk=F.ranks.find(rk=>!rk.sol[tq]);
    if(!rk){
      for(const r of F.ranks){
        const ref=r.fs[tq], f={seg:ref.seg, s:ref.s};
        if(F.lineTail>0){ r.sol.push(null); r.fs.push(f); } else { r.sol.unshift(null); r.fs.unshift(f); }
      }
      F.W++; F.cShift=(F.cShift||0)+(F.lineTail>0 ? .5 : -.5);       // every existing soldier keeps his lane
      tq = F.lineTail>0 ? F.W-1 : 0; F._fi=null; rk=F.ranks[0];
    }
    const s=newSoldier(); rk.sol[tq]=s; placeRecruit(s, tq, rk); return;
  }
  const last=F.ranks[F.ranks.length-1], s=newSoldier();
  let empty=-1; for(let sq=F.W-1;sq>=0;sq--) if(!last.sol[sq]){ empty=sq; break; }   // fill from the right file
  if(empty>=0){ last.sol[empty]=s; placeRecruit(s, empty, last); }
  else { const sol=new Array(F.W).fill(null); sol[F.W-1]=s;
    const fs=last.fs.map((f,q)=>{ const w=fileWalk(q,f,-F.rankDist); return {seg:w.seg,s:w.s}; });
    const rk={sol, fs, s:0}; rk.s=rankS(rk); F.ranks.push(rk); placeRecruit(s, F.W-1, rk); }
}
/** Put a new soldier straight onto his slot (facing the formation's direction), so nobody straggles. */
function placeRecruit(s, q, rk){
  if(!rk.fs || !rk.fs[q]) return;
  const p=filePos(q, rk.fs[q]); if(!p) return;
  s.x=p.x; s.y=p.y; s.face=p.h; s.px=null; s.py=null;
}
function snakeRules(){
  if(G.mode!=="snake"||G.over) return;
  const sol=allSoldiers();
  if(!window.__noWalls) for(const s of sol) if(s.x<0.25||s.x>SNAKE_W-0.25||s.y<0.25||s.y>SNAKE_H-0.25) return broke("You marched into the wall");
  // own formation: front rank vs every rank from the 3rd back (off during maneuvers)
  if(F.mode==="column" && !G.busy && !sol.some(s=>s.trans) && F.ranks.length>2){
    const front=F.ranks[0].sol.filter(Boolean);
    for(let r=2;r<F.ranks.length;r++) for(const b of F.ranks[r].sol) if(b) for(const a of front)
      if(Math.hypot(a.x-b.x,a.y-b.y)<0.55) return broke("You marched into your own formation");
  }
  if(G.pendingRecruits>0 && F.mode==="column" && !G.busy && F.ranks.every(rk=>rk.fs.every(onNewestSeg))){ G.pendingRecruits--; addRecruitToFormation(); }
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
  if(typeof stopListening==="function") stopListening();   // recording stops the moment the formation breaks
}
