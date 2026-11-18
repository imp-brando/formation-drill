// Android phone that can't share the mic: after the prep the game switches the mic to the meter,
// catches the burst, then hands the mic back to speech recognition. Two silent windows -> words only.
const puppeteer=require('puppeteer-core'), P=require('path');
const src=require('fs').readFileSync(__dirname+'/mock-src.js','utf8');
const mock=eval("("+src.slice(src.indexOf('const mock=()=>{')+'const mock='.length, src.indexOf('async function page')).trim().replace(/;$/,'')+")");
(async()=>{
 const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const p=await b.newPage(); await p.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36');
 await p.setViewport({width:390,height:844,deviceScaleFactor:2}); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.evaluateOnNewDocument(mock); await p.goto('file://'+P.resolve(__dirname,'../index.html'));
 await p.evaluate(()=>{ localStorage.clear(); localStorage.setItem("formation.coexist","no"); }); await p.reload();
 let fails=0; const check=(ok,msg)=>{ console.log((ok?'PASS ':'FAIL ')+msg); if(!ok) fails++; };
 await p.click('[data-mode="drill"]'); await new Promise(r=>setTimeout(r,500)); await p.evaluate(()=>FG.formNow());
 const step=async(fn,arg)=>p.evaluate(fn,arg);
 const st=await step(async()=>{
   const R=()=>window.__srs[window.__srs.length-1];
   const emit=(t,f)=>{ R().emit([[t,f]]); };
   FG.settings.sens="none";
   const sim=ms=>FG.sim(ms);
   emit("forward march",true); R().end(); sim(2600);
   const before={srs:window.__srs.length, gum:window.__gum};
   emit("column left",true);                       // Android: the session ends at the pause with the prep
   await new Promise(r=>setTimeout(r,200));         // getUserMedia (async)
   const armed=FG.burst().armed, recAborted=!R().running, gumOpened=window.__gum>before.gum;
   window.__burstLog=[]; FG.meter(true);
   for(let i=0;i<8;i++){ sim(25); FG.frame(-58); }
   const h0=FG.state().heading;
   for(let i=0;i<12;i++){ sim(25); FG.frame(-36); }   // MARCH
   for(let i=0;i<20;i++){ sim(25); FG.frame(-58); }
   sim(3000);
   const fired=window.__burstLog.length, h1=FG.state().heading;
   const recBack = window.__srs.length>before.srs+0 && R().running;
   // two windows with a silent meter -> words only
   const res=[]; window.__armLog=[];
   for(let w=0;w<2;w++){ await new Promise(r=>setTimeout(r,60)); emit("column right",true); await new Promise(r=>setTimeout(r,200)); FG.meter(true); for(let i=0;i<150;i++){ sim(25); FG.frame(-90); } res.push(FG.burst().execMode); }
   return {armLog:window.__armLog, armed, recAborted, gumOpened, fired, h0, h1, recBack, modes:res, status:document.getElementById('srStatus').textContent};
 });
 check(st.armed && st.armed.src==="switch", 'prep armed with the mic switched to the meter: '+JSON.stringify(st.armed));
 check(st.recAborted && st.gumOpened, 'recognition stopped and the meter opened for the execution word');
 check(st.fired===1 && st.h1!==st.h0, `burst executed Column left (heading ${st.h0} -> ${st.h1})`);
 check(st.recBack, 'speech recognition restarted after the burst');
 check(st.modes[1]==="words", 'two silent windows: falls back to words only ('+st.modes.join(", ")+'): '+st.status);
 await p.screenshot({path:P.resolve(__dirname,'../shots/burst-android-fallback.png')});
 console.log('errors',errs); await b.close(); process.exit(fails||errs.length?1:0);
})();
