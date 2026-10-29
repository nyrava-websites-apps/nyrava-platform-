import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('billing session forwards authentication and keeps the CRM subscription state', async t => {
  const seen=[];
  const upstream=http.createServer((req,res)=>{
    seen.push({url:req.url,cookie:req.headers.cookie||''});
    res.setHeader('Content-Type','application/json');
    if(!req.headers.cookie){res.writeHead(401);return res.end('{"error":"Sign in"}');}
    res.end(JSON.stringify({role:'RealtorSubscriber',billing:{state:'PENDING',checkoutEnabled:true,planCode:'BASIC'}}));
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const probe=http.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),CRM_SERVICE_URL:'http://127.0.0.1:'+upstream.address().port},stdio:['ignore','pipe','pipe']});
  t.after(()=>{child.kill();upstream.close();});
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Gateway stopped');})]);
  const base='http://127.0.0.1:'+port;
  const anonymous=await fetch(base+'/api/billing/session');
  assert.equal(anonymous.status,401);
  const authorized=await fetch(base+'/api/billing/session',{headers:{Cookie:'session=unpaid-account'}});
  assert.equal(authorized.status,200);
  const body=await authorized.json();
  assert.equal(body.billing.state,'PENDING');
  assert.equal(body.role,'RealtorSubscriber');
  assert.ok(body.csrf);
  assert.equal(seen.at(-1).url,'/api/billing/session');
  assert.equal(seen.at(-1).cookie,'session=unpaid-account');
});

test('checkout is unavailable rather than returning a fabricated Stripe URL when settings are absent', async t => {
  const upstream=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end('{"id":1,"email":"checkout-user@example.test","role":"Owner","subscriptionStatus":"PaymentPending"}');});
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const probe=http.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),CRM_SERVICE_URL:'http://127.0.0.1:'+upstream.address().port,STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:''},stdio:['ignore','pipe','pipe']});
  t.after(()=>{child.kill();upstream.close();});
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Gateway stopped');})]);
  const response=await fetch('http://127.0.0.1:'+port+'/api/billing/account/checkout',{method:'POST',headers:{Cookie:'NyravaCRM.Session=unpaid-account','Content-Type':'application/json'},body:JSON.stringify({plan:'BASIC',licenseTermsAccepted:true})});
  const body=await response.json();
  assert.equal(response.status,503);
  assert.equal(body.url,undefined);
});

test('public ZIP availability returns live CRM capacity without requiring signup', async t => {
  let seenCookie='not-checked';
  const upstream=http.createServer((req,res)=>{
    seenCookie=req.headers.cookie||'';
    res.setHeader('Content-Type','application/json');
    if(req.url!=='/api/territories/check/75001'){res.writeHead(404);return res.end('{}');}
    res.end(JSON.stringify({zip:'75001',maxSlots:2,occupied:0,availableSlots:2,status:'AVAILABLE'}));
  });
  upstream.listen(0,'127.0.0.1');await once(upstream,'listening');
  const probe=http.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),CRM_SERVICE_URL:'http://127.0.0.1:'+upstream.address().port},stdio:['ignore','pipe','pipe']});
  t.after(()=>{child.kill();upstream.close();});
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Gateway stopped');})]);
  const response=await fetch('http://127.0.0.1:'+port+'/api/territories/check/75001');
  assert.equal(response.status,200);
  const data=await response.json();
  assert.equal(data.availableSlots,2);
  assert.equal(data.occupied,0);
  assert.equal(seenCookie,'');
});

test('Stripe webhook rejects unsigned events before recording them', async t => {
  const probe=http.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),STRIPE_WEBHOOK_SECRET:'whsec_test_only'},stdio:['ignore','pipe','pipe']});
  t.after(()=>child.kill());
  await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Gateway stopped');})]);
  const response=await fetch('http://127.0.0.1:'+port+'/api/billing/stripe/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'evt_unverified_fixture',type:'invoice.paid'})});
  assert.equal(response.status,400);
  assert.notEqual((await response.json()).received,true);
});
