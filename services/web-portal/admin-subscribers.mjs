import fs from 'node:fs';
import path from 'node:path';

export function registerAdminSubscribers(app,{CRM_SERVICE_URL,dataDir,fetchImpl=fetch}){
 const wrap=fn=>async(req,res)=>{res.set('Cache-Control','private, no-store');try{if(!req.platformAdminUser?.isPlatformAdmin)return res.status(403).json({error:'Website administrator access required.'});await fn(req,res);}catch(e){res.status(e.status||502).json({error:e.message||'CRM records are unavailable.'});}};
 async function crm(req,url){const r=await fetchImpl(CRM_SERVICE_URL+url,{headers:{Cookie:req.headers.cookie||'',Authorization:req.headers.authorization||''},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Object.assign(Error('CRM lookup failed ('+r.status+').'),{status:r.status});return r.json();}
 async function rows(req){const accounts=await crm(req,'/api/admin/accounts');
  let billing=[],paymentEvidenceAvailable=true;try{billing=(await crm(req,'/api/sales-partners/accounting')).billing;}catch{paymentEvidenceAvailable=false;}
  if(!Array.isArray(billing)){billing=[];paymentEvidenceAvailable=false;}
  return accounts.filter(x=>x.isOwner&&!x.isAdmin&&['Owner','RealtorSubscriber'].includes(x.role)).map(x=>{
   let p={};try{p=JSON.parse(fs.readFileSync(path.join(dataDir,'subscriber-profiles',String(x.id)+'.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
   const cash=billing.filter(b=>b.subscriberUserId===x.id&&b.providerEventId.endsWith(':cash'));
   const amounts={};for(const b of cash)amounts[b.currency]=(amounts[b.currency]||0)+b.receivedMinor;
   const receipts=cash.filter(b=>b.receivedMinor>0).sort((a,b)=>String(b.effectiveAt).localeCompare(String(a.effectiveAt)));
   return {...x,fullName:p.fullName||'',planCode:x.subscriptionPlan, zips:String(x.subscribedZipCodes||'').split(/[,;\s]+/).filter(Boolean),paymentEvidenceAvailable,betaTester:Boolean(x.nonBillingAccessGrantedAt&&/beta|test/i.test(x.nonBillingAccessReason||'')),paymentStatus:x.nonBillingAccessGrantedAt?'Beta / approved access — no payment required':!paymentEvidenceAvailable?'Payment records unavailable':receipts.length?'Payment recorded':'No payment recorded',recordedPayments:cash,recordedNetByCurrency:amounts,lastPaymentAt:receipts[0]?.effectiveAt||null,paymentCoverage:'Recorded billing events only; not complete historical Stripe statements.'};
  });
 }
 app.get('/api/admin/operations/subscribers',wrap(async(req,res)=>{
  const all=await rows(req),search=String(req.query.search||'').toLowerCase(),filtered=all.filter(x=>[x.email,x.fullName,x.subscriptionPlan,x.subscriptionStatus,...x.zips].join(' ').toLowerCase().includes(search)),page=Math.max(1,Number(req.query.page)||1);
  res.json({rows:filtered.slice((page-1)*25,page*25),total:filtered.length,paymentCoverage:'Payment evidence reflects recorded billing events. Active access alone is not proof of payment.'});
 }));
 app.get('/api/admin/operations/subscribers/:id',wrap(async(req,res)=>{
  const x=(await rows(req)).find(x=>String(x.id)===req.params.id);if(!x)return res.status(404).json({error:'Subscriber not found.'});
  const audit=await crm(req,'/api/admin/subscriptions/'+x.id+'/audit');res.json({...x,audit});
 }));
 app.get('/api/admin/operations/zips',wrap(async(req,res)=>{
  const all=await crm(req,'/api/admin/accounts'),byZip=new Map();
  for(const a of all.filter(a=>a.isOwner&&!a.isAdmin))for(const zip of new Set(String(a.subscribedZipCodes||'').split(/[,;\s]+/).filter(Boolean)))byZip.set(zip,(byZip.get(zip)||0)+1);
  const filtered=[...byZip].filter(([zip])=>zip.includes(String(req.query.search||''))),page=Math.max(1,Number(req.query.page)||1);
  res.json({rows:filtered.slice((page-1)*25,page*25).map(([zip,occupied])=>({zipCode:zip,city:'',stateCode:'',occupied,incoming:null,delivered:null})),total:filtered.length});
 }));
 app.get('/api/admin/audit-logs',wrap(async(req,res)=>{
  const accounts=await crm(req,'/api/admin/accounts'),owners=accounts.filter(a=>a.role==='Owner'&&!a.isAdmin);
  const histories=await Promise.all(owners.map(async a=>(await crm(req,'/api/admin/subscriptions/'+a.id+'/audit')).map(e=>({timestamp:e.createdAt,actorEmail:accounts.find(x=>x.id===e.actorUserId)?.email||'User #'+e.actorUserId,action:e.action,entityName:a.email+' - '+e.reason}))));
  const events=(await crm(req,'/api/sales-partners/audit')).map(e=>({timestamp:e.createdAt,actorEmail:accounts.find(x=>x.id===e.actorUserId)?.email||'System',action:e.action,entityName:e.entityType+' #'+e.entityId}));
  res.json([...histories.flat(),...events].sort((a,b)=>String(b.timestamp).localeCompare(String(a.timestamp))).slice(0,100));
 }));
 // The audit found fabricated rows and success-only handlers in these legacy
 // screens. Surface unavailable operations instead of displaying demo evidence.
 for(const route of ['/api/admin/quality-reports','/api/admin/complaints','/api/admin/complaints/:id/candidates','/api/admin/fsbo','/api/admin/ai/providers','/api/admin/meetings/settings'])
  app.get(route,wrap((req,res)=>res.status(501).json({error:'This legacy admin view is not connected to verified persistent records. Use Sales Partner Center for its support and accounting records.'})));
 for(const route of ['/api/admin/meetings/settings','/api/admin/ai/providers','/api/admin/ai/providers/:provider/test','/api/admin/inquiries/:id/resend-confirmation'])
  app.post(route,wrap((req,res)=>res.status(501).json({error:'This legacy action is not connected to the live service. No change or message was sent.'})));
 app.put('/api/admin/fsbo/prospects/:id',wrap((req,res)=>res.status(501).json({error:'Legacy prospect editing is unavailable. No change was saved.'})));
 // Stop placeholder mutation handlers from claiming that unsaved work succeeded.
 for(const route of ['/api/admin/operations/records/:id/decision','/api/admin/operations/zip-change','/api/admin/operations/send','/api/admin/quality-reports/:id/review','/api/admin/complaints/:id/review'])
  app.post(route,wrap((req,res)=>res.status(501).json({error:'This legacy action is not connected to persistent CRM records. No change was made.'})));
}
