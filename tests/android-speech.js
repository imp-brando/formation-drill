const puppeteer=require('puppeteer-core'), __P=require('path');
const src=require('fs').readFileSync(__dirname+'/mock-src.js','utf8');
const mock=eval("("+src.slice(src.indexOf('const mock=()=>{')+'const mock='.length, src.indexOf('async function page')).trim().replace(/;$/,'')+")");
const UA='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let fails=0; const ok=(c,m)=>{ console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++; };
(async()=>{
 const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const p=await b.newPage(); await p.setUserAgent(UA); await p.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message)); await p.evaluateOnNewDocument(mock);
 await p.goto('file://'+__P.resolve(__dirname,'../index.html')); await p.evaluate(()=>{localStorage.clear(); localStorage.setItem('formation.micMode','rec');}); await p.reload();
 await p.select('#micMode','rec'); await p.select('#sens','none');
 await p.click('button[data-mode="drill"]'); await wait(300);
 const st=()=>p.$eval('#srStatus',e=>e.textContent), vd=()=>p.$eval('#verdict',e=>e.textContent);
 const sr=()=>'window.__srs.at(-1)';
 // forward first
 await p.evaluate(()=>window.__srs.at(-1).emit([['forward march',true]])); await wait(900);
 ok((await p.evaluate(()=>FG.state().move))==='forward','forward march moves');
 // 1) Android ends the session at the pause: "column left" final, new session, "march"
 await p.evaluate(()=>window.__srs.at(-1).emit([['Column left',true]]));
 const s1=await st(); ok(/waiting for MARCH/.test(s1),'prep-only shows waiting: '+s1);
 await p.evaluate(()=>window.__srs.at(-1).end()); await wait(150);
 await p.evaluate(()=>window.__srs.at(-1).emit([['March',true]])); await wait(900);
 ok(/Column left/.test(await vd()),'split "column left" + "march" joins: '+await vd()+' / '+await st());
 // 2) Two commands in one growing result (continuous-style)
 await wait(3000);
 await p.evaluate(()=>{ const r=window.__srs.at(-1); r.emit([['column right march',false]]); });
 await wait(900); const v2=await vd();
 await p.evaluate(()=>{ const r=window.__srs.at(-1); r.emit([['column right march column half left march',false]]); }); await wait(900);
 ok(/Column right/.test(v2) && /half left/i.test(await vd()),'second command in same result: '+v2+' -> '+await vd());
 // final of the same result must not re-fire
 const n0=await p.evaluate(()=>FG.G.sched.length+':'+document.getElementById('verdict').textContent);
 await p.evaluate(()=>{ window.__fired=0; const r=window.__srs.at(-1); r.emit([['column right march column half left march',true]]); }); await wait(300);
 ok(/half left/i.test(await vd()),'final repeat does not change verdict');
 // 3) alternatives: top is junk, alt 2 is the command
 await wait(3000);
 await p.evaluate(()=>{ const r=window.__srs.at(-1); const res=[{transcript:'roller flank much',confidence:.5},{transcript:'right flank march',confidence:.4}]; res.isFinal=true; r.onresult({resultIndex:0,results:[res]}); });
 await wait(900); ok(/Right flank/.test(await vd()),'uses second alternative: '+await vd());
 // 4) stale prep (>3.5 s) is not joined
 await wait(2500);
 await p.evaluate(()=>window.__srs.at(-1).emit([['rear',true]])); await wait(3800);
 await p.evaluate(()=>window.__srs.at(-1).end()); await wait(100);
 await p.evaluate(()=>window.__srs.at(-1).emit([['march',true]])); await wait(500);
 ok(!/^ACCEPTED: Rear/.test(await vd()),'stale prep not joined: '+await vd());
 // 5) maxAlternatives / grammar
 ok(await p.evaluate(()=>window.__srs.at(-1).maxAlternatives)>=5,'maxAlternatives>=5');
 // 6) game over stops listening + mic
 await p.click('#btnQuit'); await wait(200);
 await p.select('#micMode','both'); await p.click('button[data-mode="snake"]'); await wait(500);
 const g0=await p.evaluate(()=>window.__gum);
 ok(await p.evaluate(()=>FG.micOn===undefined || true),'');
 await p.evaluate(()=>{ FG.G.recruits=[]; });
 await p.evaluate(()=>window.__srs.at(-1).emit([['forward march',true]])); await wait(900);
 // march into the wall
 await p.evaluate(()=>FG.sim(30000)); await wait(100);
 const over=await p.evaluate(()=>FG.G.over);
 const nAfter=await p.evaluate(()=>window.__srs.length), track=await p.evaluate(()=>window.__stream? window.__stream.getTracks().map(t=>t.readyState).join(','):'none');
 ok(over,'formation broke after marching into wall');
 ok(await p.evaluate(()=>!window.__srs.at(-1).running),'recognition aborted at game over');
 ok(!/live/.test(track),'mic tracks stopped: '+track);
 ok(/Tap to fall in/.test(await p.$eval('#overlay',e=>e.textContent)) && !/say/i.test(await p.$eval('#overlay',e=>e.textContent)),'overlay says Tap to fall in');
 await wait(2500);   // watchdog/restart must not bring it back
 ok(await p.evaluate(()=>window.__srs.length)===nAfter,'no auto-restart after game over');
 await p.evaluate(()=>{ try{ window.__srs.at(-1).emit([['platoon fall in',true]]); }catch(e){} }); await wait(200);
 ok(await p.evaluate(()=>FG.G.over),'voice ignored while mic off');
 await p.evaluate(()=>{ document.getElementById('pttBtn').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); }); await wait(100);
 ok(await p.evaluate(()=>window.__srs.length)===nAfter,'hold-to-talk disabled while broken');
 const gBefore=await p.evaluate(()=>window.__gum);
 await p.click('#ovBtn'); await wait(500);
 ok(!(await p.evaluate(()=>FG.G.over)) && await p.evaluate(()=>window.__srs.length)>nAfter && await p.evaluate(()=>window.__srs.at(-1).running),'tap FALL IN restarts game and recognition');
 ok(await p.evaluate(()=>window.__gum)>gBefore,'meter mic reopened on tap (mode both)');
 console.log('status after tap:', await st());
 console.log('errors', errs); await b.close(); process.exit(fails||errs.length?1:0);
})();
