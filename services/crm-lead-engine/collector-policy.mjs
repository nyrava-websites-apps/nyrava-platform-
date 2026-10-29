import {createHash} from 'node:crypto';

export function prospectFromListing(item, source) {
  const title=String(item.PostingTitle||'').trim();
  if(!title||title==='undefined') return null;
  const supplied=item.PostingURL;
  const id=item.PostingID;
  let url;
  try {
    url=new URL(supplied||`https://${new URL(source.url).hostname}/reo/d/${id}.html`);
    if(url.protocol!=='https:'||!url.hostname.endsWith('.craigslist.org')||(!supplied&&!id)) return null;
  } catch {return null;}
  const phone=title.match(/\b[2-9]\d{2}[-.\s]?[2-9]\d{2}[-.\s]?\d{4}\b/)?.[0]||null;
  const email=title.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)?.[0]||null;
  const zip=String(item.PostalCode||item.postalCode||'').match(/^\d{5}$/)?.[0]||null;
  return {externalId:'cl-'+createHash('sha256').update(url.href).digest('hex').slice(0,40),title,ownerName:null,phone,email,zipCode:zip,sourceUrl:url.href,source:'Craigslist',searchZip:source.zip,discoveredAt:new Date().toISOString(),doNotContact:/no\s*(realtors?|agents?|brokers?)\b/i.test(title)};
}

export function reviewedPayload(lead, now=Date.now()) {
  const v=lead?.verification;
  if(!lead?.ownerName||lead.ownerName.startsWith('Owner:')||!/^\d{5}$/.test(lead.zipCode||'')||!lead.externalId||!lead.sourceUrl||lead.doNotContact) return null;
  if(!v||!['Phone','Email'].includes(v.method)||!v.recipientEmail||!v.consentText||!v.reviewReference) return null;
  const channel=v.method==='Phone'?lead.phone:lead.email;
  if(!channel) return null;
  for(const key of ['contactVerifiedAt','intentVerifiedAt','consentCapturedAt','adminReviewedAt']) {
    const stamp=Date.parse(v[key]);
    if(!Number.isFinite(stamp)||stamp>now+300000) return null;
  }
  return {ExternalLeadId:lead.externalId,Source:'Fsbo',Name:lead.ownerName,Email:lead.email||null,Phone:lead.phone||null,LeadType:'Seller',PropertyZipCode:lead.zipCode,ContactVerificationMethod:v.method,ContactVerifiedAt:v.contactVerifiedAt,IntentVerifiedAt:v.intentVerifiedAt,ConsentCapturedAt:v.consentCapturedAt,ConsentRecipient:v.recipientEmail,ConsentText:v.consentText,SourceUrl:lead.sourceUrl,ExternalFsbo:true,FsboAdminReviewReference:v.reviewReference,FsboAdminReviewedAt:v.adminReviewedAt};
}

export function ingestionResult(status) {
  if(status===201) return 'created';
  if(status===200) return 'existing';
  throw Error('CRM submission not confirmed ('+status+').');
}
