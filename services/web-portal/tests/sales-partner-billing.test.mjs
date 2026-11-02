import test from 'node:test';import assert from 'node:assert/strict';import {partnerFinancialEvent} from '../sales-partner-billing.mjs';
const sub={id:'sub_1',customer:'cus_1',metadata:{nyrava_owner_id:'42',nyrava_plan:'BASIC'},current_period_start:100,current_period_end:200};
const settings={annualPriceId:'price_annual',basicPriceId:'price_basic',proPriceId:'price_pro'};
const event={id:'evt_1',type:'invoice.paid',created:150,data:{object:{id:'in_1',currency:'usd',paid:true,status:'paid',amount_paid:34900,amount_due:34900,lines:{data:[{id:'il_1',amount:34900,price:{id:'price_annual'},period:{start:100,end:200}}]}}}};
test('Annual commission requires explicit paid annual price line',()=>{const r=partnerFinancialEvent(event,sub,settings);assert.equal(r.lines[0].kind,'AnnualLicensePaid');assert.equal(r.receivedMinor,34900);assert.equal(r.ownerId,42)});
test('Failed payment produces no commission candidates',()=>{const r=partnerFinancialEvent({...event,type:'invoice.payment_failed'},sub,settings);assert.equal(r.receivedMinor,0);assert.deepEqual(r.lines,[])});
test('Upgrade uses actual provider interval and original billing period',()=>{const e=structuredClone(event);e.data.object.lines.data[0]={id:'il_up',amount:3000,price:{id:'price_pro'},proration:true,period:{start:150,end:200}};const r=partnerFinancialEvent(e,sub,settings);assert.equal(r.lines[0].kind,'UpgradeProrationPaid');assert.equal(Date.parse(r.lines[0].originalStart),100000);assert.equal(Date.parse(r.lines[0].start),150000)});
test('Missing annual price never infers a license payment from subscription status',()=>{assert.equal(partnerFinancialEvent(event,sub,{...settings,annualPriceId:''}).lines.length,0)});
test('Partial invoice pages fail closed',()=>{const e=structuredClone(event);e.data.object.lines.has_more=true;assert.throws(()=>partnerFinancialEvent(e,sub,settings))});

test('Fully discounted invoice earns no acquisition commission',()=>{const e=structuredClone(event);e.data.object.amount_paid=0;assert.deepEqual(partnerFinancialEvent(e,sub,settings).lines,[])});

test('Disputes create explicit review facts without inventing a refund or fee',()=>{const e={id:'evt_dispute',type:'charge.dispute.created',created:150,data:{object:{id:'dp_1',status:'needs_response',invoice:'in_1'}}};const r=partnerFinancialEvent(e,sub,settings);assert.equal(r.kind,'Dispute:needs_response');assert.equal(r.receivedMinor,0);assert.equal(r.lines.length,0)});

test('Dispute cash movements and fees use actual balance transaction facts',()=>{const e={id:'evt_funds',type:'charge.dispute.funds_withdrawn',created:150,data:{object:{id:'dp_1',invoice:'in_1',balance_transactions:[{id:'txn_1',currency:'usd',amount:-8900,fee:1500}]}}};const r=partnerFinancialEvent(e,sub,settings);assert.equal(r.receivedMinor,-8900);assert.equal(r.knownFeeMinor,1500);assert.equal(r.paymentId,'txn_1')});
