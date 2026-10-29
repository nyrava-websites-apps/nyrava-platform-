const {createRequire}=require('node:module');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const path=require('node:path');
const runtime=process.env.NYRAVA_TEST_NODE_MODULES;
const {chromium}=runtime?createRequire(path.join(runtime,'entry.js'))('playwright'):require('playwright');
const base=process.env.NYRAVA_TEST_BASE_URL||'http://127.0.0.1:13000';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('This test creates isolated records and must run on localhost.');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.NYRAVA_TEST_BROWSER?{executablePath:process.env.NYRAVA_TEST_BROWSER}:{})});
 try{
  for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
   const context=await browser.newContext({viewport});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   const email=`browser-${Date.now()}-${viewport.width}@example.test`,password=crypto.randomBytes(24).toString('base64url');
   let response=await context.request.post(base+'/api/register',{data:{email,password}});assert.equal(response.status(),200,await response.text());
   await page.goto(base+'/dashboard/home#crm');
   let frame=page.frameLocator('#nyrava-crm-frame');
   await frame.locator('#newContact').click();
   await frame.locator('[name=fullName]').fill('Isolated Browser Lead');await frame.locator('[name=email]').fill('client@example.test');
   await frame.locator('[name=propertyAddress]').fill('Isolated test address');
   if(viewport.width<900){await frame.locator('#editor').hover();await page.mouse.wheel(0,1400);await page.mouse.move(viewport.width-3,600);await page.mouse.wheel(0,1400);console.log('Mobile scroll',await page.evaluate(()=>({y:scrollY,sh:document.scrollingElement.scrollHeight,ch:document.scrollingElement.clientHeight,overflow:getComputedStyle(document.documentElement).overflow})));}
   await frame.locator('#saveEditor').click();
   await frame.locator('.detail-name h2').waitFor();
   assert.equal(await frame.locator('.detail-name h2').textContent(),'Isolated Browser Lead');
   await frame.locator('[data-edit=note]').click();await frame.locator('[name=text]').fill('Browser saved conversation');await frame.locator('#saveEditor').click();
   await frame.locator('#records').getByText('Browser saved conversation',{exact:true}).waitFor();
   await frame.locator('[data-edit=task]').click();await frame.locator('[name=text]').fill('Browser follow-up');await frame.locator('[name=startsAt]').fill('2030-01-12T10:00');await frame.locator('#saveEditor').click();await frame.locator('#editor').waitFor({state:'hidden'});
   await frame.locator('[data-edit=appointment]').click();await frame.locator('[name=text]').fill('Browser consultation');await frame.locator('[name=startsAt]').fill('2030-01-12T11:00');await frame.locator('#saveEditor').click();await frame.locator('#editor').waitFor({state:'hidden'});
   await frame.locator('#clientStage').selectOption('CLOSED');await frame.getByText('Pipeline stage updated.',{exact:true}).waitFor();
   await page.reload();frame=page.frameLocator('#nyrava-crm-frame');await frame.locator('.detail-name h2').waitFor();
   assert.equal(await frame.locator('#clientStage').inputValue(),'CLOSED');await frame.locator('#records').getByText('Browser saved conversation',{exact:true}).waitFor();
   if(viewport.width<900)await page.locator('#mobileMenu').click();
   await page.locator('#leadsMenuToggle').click();await page.reload();await page.locator('#leadList [data-lead]').first().click();
   await frame.locator('.detail-name h2').waitFor();assert.equal(await frame.locator('.detail-name h2').textContent(),'Isolated Browser Lead');
   if(viewport.width<900)await page.locator('#mobileMenu').click();
   await page.locator('[data-crm-view=pipeline]').click();await frame.locator('#pipeline').waitFor({state:'visible'});await page.goBack();await frame.locator('.detail-name h2').waitFor();
   assert.equal(new URL(page.url()).hash,'#crm');
   response=await context.request.get(base+'/api/workbench/dashboard');const data=await response.json();const lead=data.leads.find(x=>x.fullName==='Isolated Browser Lead');assert.ok(lead);assert.equal(data.tasks.length,1);assert.equal(data.appointments.length,1);
   const storage=await context.storageState();assert.ok(storage.cookies.length);
   await context.request.post(base+'/api/auth/logout');
   assert.equal((await context.request.get(base+'/api/workbench/workspace')).status(),401);
   response=await context.request.post(base+'/api/login',{data:{email,password}});assert.equal(response.status(),200);
   response=await context.request.get(base+`/api/workbench/contacts/${lead.kind}/${lead.id}`);assert.equal(response.status(),200);assert.equal((await response.json()).contact.crmStatus,'CLOSED');
   assert.deepEqual(errors,[]);
   console.log(`PASS ${viewport.width}px: create, save note/task/appointment, pipeline, refresh, My Leads, iframe, Back, logout and sign-in persistence`);
   await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
