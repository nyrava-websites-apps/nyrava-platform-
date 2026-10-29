import test from 'node:test';
import assert from 'node:assert/strict';
import {subscriptionState,checkoutParameters,registerBillingIntegration} from '../billing-integration.mjs';
const settings={basicPriceId:'price_basic',proPriceId:'price_pro',annualPriceId:'price_annual'};
const sub={id:'sub_1',status:'active',customer:'cus_1',items:{data:[{price:{id:'price_basic'},current_period_end:2000000000}]},latest_invoice:{status:'paid',paid:true},metadata:{nyrava_owner_id:'4'}};
test('active Stripe status alone never proves payment',()=>{
  assert.equal(subscriptionState({...sub,latest_invoice:{status:'open',paid:false}},settings).status,'PaymentPending');
  assert.equal(subscriptionState(sub,settings).status,'Active');
});
test('past due, canceled, future cancellation and expired are reflected truthfully',()=>{
  assert.equal(subscriptionState({...sub,status:'past_due'},settings).status,'PastDue');
  assert.equal(subscriptionState({...sub,status:'canceled'},settings).status,'Expired');
  assert.equal(subscriptionState({...sub,cancel_at_period_end:true},settings).status,'Canceled');
  assert.equal(subscriptionState(sub,settings,2100000000000).status,'Expired');
});
test('unknown plans are not granted entitlement',()=>{
  assert.throws(()=>subscriptionState({...sub,items:{data:[]}},settings));
});
test('checkout remains unavailable with blank placeholders',()=>{
  assert.equal(checkoutParameters(settings,{ownerId:4,email:'owner@example.test'},'BASIC'),null);
  assert.equal(checkoutParameters({...settings,basicCheckoutParameters:{'line_items[0][price]':'REPLACE_PRICE_ID'}},{ownerId:4},'BASIC'),null);
});
test('configured checkout preserves supplied price selection and trial without inventing an annual charge',()=>{
  const p=checkoutParameters({...settings,basicCheckoutParameters:{'line_items[0][price]':'{{BASIC_PRICE_ID}}','line_items[0][quantity]':'1','subscription_data[trial_period_days]':'30'}},{ownerId:4,email:'owner@example.test'},'BASIC');
  assert.equal(p.get('line_items[0][price]'),'price_basic');assert.equal(p.get('line_items[1][price]'),null);
  assert.equal(p.get('subscription_data[trial_period_days]'),'30');assert.equal(p.get('subscription_data[metadata][nyrava_owner_id]'),'4');
});
test('checkout template cannot redirect users to an arbitrary destination',()=>{
  assert.throws(()=>checkoutParameters({...settings,basicCheckoutParameters:{success_url:'https://evil.example.test'}},{ownerId:4},'BASIC'));
});
function harness(options={}) {
  const routes=new Map();const app={post:(route,handler)=>routes.set(route,handler)};
  registerBillingIntegration(app,{CRM_SERVICE_URL:'http://crm.test',getStripeSettings:()=>settings,recordWebhookEvent:()=>{throw Error('Must not record an unverified event')},isValidStripeWebhookSignature:()=>false,...options});
  return async(route,req={})=>{
    const res={code:200,set(){return this},status(code){this.code=code;return this},json(body){this.body=body;return this}};
    await routes.get(route)({headers:{},body:{},get:()=>'',...req},res);return res;
  };
}
test('webhook without configured signing secret is unavailable',async()=>{
  const result=await harness()('/api/billing/stripe/webhook');assert.equal(result.code,503);
});
test('unsigned webhook cannot activate a subscription',async()=>{
  const result=await harness({getStripeSettings:()=>({...settings,webhookSecret:'whsec_test_only'})})('/api/billing/stripe/webhook');assert.equal(result.code,400);
});
test('admin and exempt test account cannot be charged',async()=>{
  for(const me of [{role:'Admin',exempt:true},{role:'Owner',exempt:true}]) {
    const run=harness({fetchImpl:async()=>({ok:true,json:async()=>me})});
    const result=await run('/api/billing/account/checkout');assert.equal(result.code,403);
  }
});
test('paid users cannot start another subscription',async()=>{
  const result=await harness({fetchImpl:async()=>({ok:true,json:async()=>({role:'Owner',canAccess:true})})})('/api/billing/account/checkout');assert.equal(result.code,409);
});
