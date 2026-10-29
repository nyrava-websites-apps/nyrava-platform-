import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('gateway preserves workbench failures, authentication, request body and real identity', async t => {
  const seen=[];
  const upstream=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    seen.push({url:req.url,method:req.method,body,cookie:req.headers.cookie});
    res.setHeader('Content-Type','application/json');
    if(!req.headers.cookie){res.writeHead(401);return res.end('{"error":"Sign in"}');}
    if(req.url==='/api/auth/me')return res.end(JSON.stringify({id:7,role:'Employee',email:'actual@example.test',subscriptionPlan:'BASIC',subscriptionStatus:'Inactive',subscribedZipCodes:''}));
    if(req.url.includes('/action')){res.writeHead(409);return res.end('{"error":"Database rejected operation"}');}
    res.writeHead(404);res.end('{"error":"Contact not found"}');
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const probe=http.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),CRM_SERVICE_URL:'http://127.0.0.1:'+upstream.address().port},stdio:['ignore','pipe','pipe']});
  t.after(()=>{child.kill();upstream.close();});
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Gateway stopped');})]);
  const base='http://127.0.0.1:'+port;
  assert.equal((await fetch(base+'/api/workbench/workspace')).status,401);
  assert.equal((await fetch(base+'/api/workbench/contacts/platform/999',{headers:{Cookie:'session=test'}})).status,404);
  const action=await fetch(base+'/api/workbench/contacts/platform/3/action',{method:'POST',headers:{Cookie:'session=test','Content-Type':'application/json'},body:JSON.stringify({action:'note',text:'real note'})});
  assert.equal(action.status,409);
  assert.equal((await action.json()).error,'Database rejected operation');
  assert.deepEqual(JSON.parse(seen.find(x=>x.url.endsWith('/action')).body),{action:'note',text:'real note'});
  const me=await (await fetch(base+'/api/auth/me',{headers:{Cookie:'session=test'}})).json();
  assert.equal(me.subscriptionStatus,'Inactive');assert.equal(me.subscriptionPlan,'BASIC');assert.equal(me.canManage,false);assert.deepEqual(me.activeZips,[]);
  const intake=await fetch(base+'/api/inquiries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fullName:'Isolated intake',zipCode:'78701',email:'test@example.test'})});
  assert.equal(intake.status,503);
});
