import {createHmac, randomUUID} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';


export function checkoutParameters(settings, owner, plan) {
  const template=plan==='PRO'?settings.proCheckoutParameters:settings.basicCheckoutParameters;
  if(!template||typeof template!=='object'||Array.isArray(template)||Object.keys(template).length===0) return null;
  const params=new URLSearchParams();
  const replacements={ANNUAL_PRICE_ID:settings.annualPriceId,BASIC_PRICE_ID:settings.basicPriceId,PRO_PRICE_ID:settings.proPriceId};
  for(const [key,raw] of Object.entries(template)) {
    if(!/^(line_items\[\d+\]\[(price|quantity)\]|subscription_data\[(trial_period_days|billing_cycle_anchor|proration_behavior)\])$/.test(key)) throw Error('Checkout template contains an unsupported option: '+key);
    const value=String(raw).replace(/\{\{(ANNUAL_PRICE_ID|BASIC_PRICE_ID|PRO_PRICE_ID)\}\}/g,(_,name)=>replacements[name]||'');
    if(!value||value.includes('{{')||value.includes('REPLACE_')) return null;
    if(key.endsWith('[price]')&&!/^price_[A-Za-z0-9]+$/.test(value)) return null;
    params.set(key,value);
  }
  if(!params.has('line_items[0][price]')) return null;
  params.set('mode','subscription');
  params.set('client_reference_id',String(owner.ownerId));
  params.set('customer_email',owner.email);
  params.set('subscription_data[metadata][nyrava_owner_id]',String(owner.ownerId));
  params.set('subscription_data[metadata][nyrava_plan]',plan);
  params.set('success_url','https://home.nyrava.com/billing-checkout.html?returned=1');
  params.set('cancel_url','https://home.nyrava.com/billing-checkout.html');
  return params;
}

export function subscriptionState(sub, settings, now = Date.now()) {
  const prices = (sub.items?.data || []).map(i => i.price?.id);
  const plan = prices.includes(settings.proPriceId) ? 'PRO' : prices.includes(settings.basicPriceId) ? 'BASIC' : sub.metadata?.nyrava_plan;
  if (!['BASIC','PRO'].includes(plan)) throw Error('Subscription has no recognized Nyrava plan.');
  const invoice = sub.latest_invoice;
  const paid = !!invoice && typeof invoice === 'object' && invoice.status === 'paid' && invoice.paid === true;
  const ends = [sub.current_period_end, ...(sub.items?.data || []).map(i=>i.current_period_end)].filter(Number.isFinite);
  const end = ends.length ? Math.min(...ends) : null;
  let status = 'PaymentPending';
  if (sub.status === 'active' && paid) status = sub.cancel_at_period_end ? 'Canceled' : 'Active';
  else if (['past_due','unpaid','paused'].includes(sub.status)) status = 'PastDue';
  else if (['canceled','incomplete_expired'].includes(sub.status)) status = 'Expired';
  if (end && end * 1000 <= now && status === 'Active') status = 'Expired';
  return {plan, paid, status, currentPeriodEnd: end ? new Date(end*1000).toISOString() : null};
}

export function registerBillingIntegration(app, {CRM_SERVICE_URL, getStripeSettings, recordWebhookEvent, isValidStripeWebhookSignature, fetchImpl=fetch}) {
  const secret = process.env.Crm__BillingSyncSecret || '';
  const busy=new Set();
  const sessionFile=path.join(process.env.NYRAVA_DATA_DIR||path.resolve('data'),'checkout-sessions.json');
  async function identity(req) {
    const r=await fetchImpl(CRM_SERVICE_URL+'/api/billing/identity',{headers:{Cookie:req.headers.cookie||'',Authorization:req.headers.authorization||''},signal:AbortSignal.timeout(10000)});
    if(!r.ok) throw Object.assign(Error('Sign in to manage billing.'),{status:r.status});
    return r.json();
  }
  async function stripe(path, method='GET', params, idempotency) {
    const s=getStripeSettings();
    if(!s.secretKey) throw Object.assign(Error('Stripe is not configured.'),{status:503});
    const r=await fetchImpl('https://api.stripe.com/v1/'+path,{method,headers:{Authorization:'Bearer '+s.secretKey,...(params?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotency?{'Idempotency-Key':idempotency}:{})},body:params?new URLSearchParams(params).toString():undefined,signal:AbortSignal.timeout(15000)});
    const body=await r.json();
    if(!r.ok) throw Object.assign(Error(body.error?.message||'Stripe request failed.'),{status:502});
    return body;
  }
  async function sync(subscriptionId,eventId,expectedOwner) {
    if(secret.length<32) throw Object.assign(Error('Billing reconciliation is not configured.'),{status:503});
    const observedAt=new Date().toISOString();
    const sub=await stripe('subscriptions/'+encodeURIComponent(subscriptionId)+'?expand[]=latest_invoice');
    const ownerId=Number(sub.metadata?.nyrava_owner_id);
    if(!Number.isSafeInteger(ownerId)||ownerId<=0||(expectedOwner&&ownerId!==Number(expectedOwner))) throw Error('Subscription workspace identity is missing or mismatched.');
    const state=subscriptionState(sub,getStripeSettings());
    const raw=JSON.stringify({...state,ownerId,eventId,subscriptionId:sub.id,customerId:typeof sub.customer==='string'?sub.customer:sub.customer.id,observedAt});
    const stamp=String(Math.floor(Date.now()/1000));
    const signature=createHmac('sha256',secret).update(stamp+'.'+raw).digest('hex');
    const r=await fetchImpl(CRM_SERVICE_URL+'/api/internal/billing/sync',{method:'POST',headers:{'Content-Type':'application/json','X-Nyrava-Timestamp':stamp,'X-Nyrava-Signature':signature},body:raw,signal:AbortSignal.timeout(15000)});
    if(!r.ok) throw Error('CRM billing reconciliation failed ('+r.status+').');
    return r.json();
  }
  const handler=fn=>async(req,res)=>{try{res.set('Cache-Control','no-store');await fn(req,res);}catch(e){res.status(e.status||502).json({error:e.message});}};
  app.post('/api/billing/account/checkout',handler(async(req,res)=>{
    const me=await identity(req);
    if(me.role!=='Owner'||me.exempt) return res.status(403).json({error:'This account does not require subscriber checkout.'});
    if(me.canAccess||me.stripeSubscriptionId) return res.status(409).json({error:'Manage the existing subscription; a second subscription will not be created.'});
    const plan=String(req.body?.plan||'').toUpperCase();
    if(!['BASIC','PRO'].includes(plan)||req.body?.licenseTermsAccepted!==true) return res.status(400).json({error:'Choose a plan and accept the subscription terms.'});
    const settings=getStripeSettings();
    if(!settings.webhookSecret||secret.length<32||!settings.checkoutEnabled) return res.status(503).json({error:'Checkout is not enabled. No payment was started.'});
    const params=checkoutParameters(settings,me,plan);
    if(!params) return res.status(503).json({error:'Checkout settings are incomplete. No payment was started.'});
    if(busy.has(me.ownerId)) return res.status(409).json({error:'Checkout is already being prepared. Please wait.'});
    busy.add(me.ownerId);
    try {
      let sessions={};
      if(fs.existsSync(sessionFile)) sessions=JSON.parse(fs.readFileSync(sessionFile,'utf8'));
      const prior=sessions[me.ownerId];
      if(prior?.id) {
        const session=await stripe('checkout/sessions/'+encodeURIComponent(prior.id));
        if(session.status==='complete') return res.status(409).json({error:'Payment already completed. Refresh billing; do not pay again.'});
        if(session.status==='open') {
          if(prior.plan!==plan) return res.status(409).json({error:'An existing checkout is open for the other plan. Complete or let it expire before starting another.'});
          return res.json({url:session.url});
        }
      }
      const generation=(prior?.generation||0)+1;
      const session=await stripe('checkout/sessions','POST',params,'nyrava-checkout-'+me.ownerId+'-'+generation);
      if(!session.id||!session.url?.startsWith('https://checkout.stripe.com/')) throw Error('Stripe did not return a secure checkout session.');
      if(fs.existsSync(sessionFile)) sessions=JSON.parse(fs.readFileSync(sessionFile,'utf8'));
      sessions[me.ownerId]={id:session.id,plan,generation};
      fs.mkdirSync(path.dirname(sessionFile),{recursive:true});
      const temporary=sessionFile+'.tmp';
      fs.writeFileSync(temporary,JSON.stringify(sessions),{mode:0o600});fs.renameSync(temporary,sessionFile);
      res.json({url:session.url});
    } finally { busy.delete(me.ownerId); }
  }));
  app.post('/api/billing/account/portal',handler(async(req,res)=>{
    const me=await identity(req);
    if(me.role!=='Owner'||me.exempt||!me.stripeCustomerId) return res.status(403).json({error:'No subscriber billing portal is available for this account.'});
    const session=await stripe('billing_portal/sessions','POST',{customer:me.stripeCustomerId,return_url:'https://home.nyrava.com/billing-checkout.html?manage=1'});
    res.json({url:session.url});
  }));
  app.post('/api/billing/account/refresh',handler(async(req,res)=>{
    const me=await identity(req);
    if(me.role==='Owner'&&!me.exempt&&me.stripeSubscriptionId) await sync(me.stripeSubscriptionId,'refresh-'+randomUUID(),me.ownerId);
    const r=await fetchImpl(CRM_SERVICE_URL+'/api/billing/session',{headers:{Cookie:req.headers.cookie||'',Authorization:req.headers.authorization||''},signal:AbortSignal.timeout(10000)});
    res.status(r.status).json(await r.json());
  }));
  app.post('/api/billing/account/cancel',handler(async(req,res)=>{
    const me=await identity(req);
    if(me.role!=='Owner'||me.exempt||!me.stripeSubscriptionId) return res.status(403).json({error:'No subscriber subscription is available to cancel.'});
    const sub=await stripe('subscriptions/'+encodeURIComponent(me.stripeSubscriptionId));
    if(Number(sub.metadata?.nyrava_owner_id)!==Number(me.ownerId)) throw Error('Subscription workspace mismatch.');
    await stripe('subscriptions/'+encodeURIComponent(me.stripeSubscriptionId),'POST',{cancel_at_period_end:'true'});
    await sync(me.stripeSubscriptionId,'cancel-'+randomUUID(),me.ownerId);
    res.json({ok:true,state:'ENDING'});
  }));
  app.post('/api/billing/stripe/webhook',handler(async(req,res)=>{
    const settings=getStripeSettings();
    if(!settings.webhookSecret) return res.status(503).json({error:'Stripe webhook verification is not configured.'});
    if(!isValidStripeWebhookSignature(req.rawBody,req.get('stripe-signature'),settings.webhookSecret)) return res.status(400).json({error:'Stripe webhook signature is invalid or expired.'});
    const event=req.body;
    const types=['checkout.session.completed','customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed'];
    if(!types.includes(event.type)) return res.json({received:true,ignored:true});
    const obj=event.data?.object;
    const id=event.type.startsWith('customer.subscription.')?obj?.id:obj?.subscription||obj?.parent?.subscription_details?.subscription;
    if(!event.id||typeof id!=='string'||!id.startsWith('sub_')) return res.status(400).json({error:'A subscription and event ID are required.'});
    await sync(id,event.id);
    recordWebhookEvent({id:event.id,type:event.type,receivedAt:new Date().toISOString(),state:'SYNCHRONIZED'});
    res.json({received:true});
  }));
}
