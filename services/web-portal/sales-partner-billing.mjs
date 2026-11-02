import {createHash} from 'node:crypto';
// Receives only Stripe objects retrieved by the server or signature-verified webhook bodies.
// A subscription status alone never proves annual license payment.
export function partnerFinancialEvent(event, subscription, settings) {
  const object=event.data?.object;
  const ownerId=Number(subscription.metadata?.nyrava_owner_id);
  if(!Number.isSafeInteger(ownerId)||ownerId<=0)throw Error('Missing trusted subscriber attribution.');
  const recurring=(subscription.items?.data||[]).filter(x=>[settings.basicPriceId,settings.proPriceId].includes(x.price?.id));
  const known=recurring.length>0&&recurring.every(x=>Number.isSafeInteger(x.price?.unit_amount)&&x.price?.recurring?.interval==='month'&&Number.isSafeInteger(x.price?.recurring?.interval_count||1));
  const monthlyRecurringMinor=known?Math.round(recurring.reduce((n,x)=>n+x.price.unit_amount*(x.quantity||1)/(x.price.recurring.interval_count||1),0)):null;
  const base={sourceEventHash:createHash('sha256').update(JSON.stringify(event)).digest('hex'),observedAt:new Date().toISOString(),subscriptionStatus:subscription.status,subscriptionPlan:subscription.metadata?.nyrava_plan,monthlyRecurringMinor,ownerId,eventId:event.id,customerId:typeof subscription.customer==='string'?subscription.customer:subscription.customer.id,subscriptionId:subscription.id,
    invoiceId:'',paymentId:'',currency:'USD',invoicedMinor:0,receivedMinor:0,effectiveAt:new Date(event.created*1000).toISOString(),lines:[]};
  if(['charge.dispute.funds_withdrawn','charge.dispute.funds_reinstated'].includes(event.type)) {
    const withdrawn=event.type.endsWith('funds_withdrawn');
    const movements=(object.balance_transactions||[]).filter(t=>typeof t==='object'&&Number.isSafeInteger(t.amount)&&(withdrawn?t.amount<0:t.amount>0));
    if(movements.length!==1||movements[0].currency!=='usd'||!Number.isSafeInteger(movements[0].fee))throw Error('An unambiguous provider balance transaction is required for disputed funds.');
    const movement=movements[0];return {...base,kind:withdrawn?'CashDisputeWithdrawal':'CashDisputeReinstated',invoiceId:object.invoice||'',paymentId:movement.id,receivedMinor:movement.amount,knownFeeMinor:movement.fee};
  }
  if(event.type.startsWith('charge.dispute.'))return {...base,kind:'Dispute:'+String(object.status||'ReviewRequired'),invoiceId:object.invoice||'',paymentId:object.id};
  if(event.type.startsWith('refund.')) {
    if(object.currency?.toLowerCase()!=='usd')throw Error('Unsupported refund currency.');
    return {...base,kind:object.status==='succeeded'?'CashRefund':'RefundPending',invoiceId:object.invoice||'',paymentId:object.id,
      receivedMinor:object.status==='succeeded'?-object.amount:0};
  }
  if(!event.type.startsWith('invoice.'))return {...base,kind:event.type};
  if(object.currency?.toLowerCase()!=='usd')throw Error('Unsupported accounting currency.');
  if(object.lines?.has_more)throw Error('Complete invoice lines are required before commission processing.');
  const paid=event.type==='invoice.paid'&&object.paid===true&&object.status==='paid';
  base.kind=paid?'CashReceipt':'PaymentFailed';base.invoiceId=object.id;
  base.paymentId=typeof object.payment_intent==='string'?object.payment_intent:object.payment_intent?.id||object.charge||object.id;
  base.invoicedMinor=object.amount_due||0;base.receivedMinor=paid?object.amount_paid||0:0;
  if(!paid||base.receivedMinor<=0)return base;
  const invoiceMetadata=object.subscription_details?.metadata||object.parent?.subscription_details?.metadata||{};
  const invoicePrices=(object.lines?.data||[]).map(x=>x.price?.id||x.pricing?.price_details?.price);
  const invoicePlan=invoicePrices.includes(settings.proPriceId)?'PRO':invoicePrices.includes(settings.basicPriceId)?'BASIC':invoiceMetadata.nyrava_plan||subscription.metadata?.nyrava_plan;
  for(const line of object.lines?.data||[]) {
    const price=line.price?.id||line.pricing?.price_details?.price;
    const plan=price===settings.proPriceId?'PRO':price===settings.basicPriceId?'BASIC':invoicePlan;
    const annual=!!settings.annualPriceId&&price===settings.annualPriceId;
    if(!annual&&price!==settings.basicPriceId&&price!==settings.proPriceId)continue;
    if(!['BASIC','PRO'].includes(plan)||!line.period?.start||!line.period?.end||line.amount<=0)continue;
    const proration=line.proration===true||line.parent?.subscription_item_details?.proration===true;
    if(proration&&plan!=='PRO')continue;
    const starts=[subscription.current_period_start,...(subscription.items?.data||[]).map(x=>x.current_period_start)].filter(Number.isFinite);
    const ends=[subscription.current_period_end,...(subscription.items?.data||[]).map(x=>x.current_period_end)].filter(Number.isFinite);
    const iso=n=>new Date(n*1000).toISOString();
    if(proration&&(!starts.length||!ends.length))throw Error('Original paid billing period is required for upgrade proration.');
    base.lines.push({id:line.id,kind:annual?'AnnualLicensePaid':proration?'UpgradeProrationPaid':'MonthlyPaymentPaid',plan,paidMinor:line.amount,
      start:iso(line.period.start),end:iso(line.period.end),...(proration?{originalStart:iso(Math.min(...starts)),originalEnd:iso(Math.min(...ends))}:{})});
  }
  return base;
}
