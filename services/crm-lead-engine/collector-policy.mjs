import {createHash} from 'node:crypto';

// Only contact information printed publicly in the title or the original listing body qualifies.
// Never click Reply, use hidden contact details, or infer a contact.
function mixedWordPhone(text) {
  // Sellers may deliberately spell digits, e.g. "9seven2-77five-zero2one2".
  // Only consider such patterns near an explicit call/text instruction.
  const digits = {zero:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9'};
  const unit = '(?:zero|one|two|three|four|five|six|seven|eight|nine|[0-9])';
  const pattern = new RegExp('(?<![a-z0-9])' + unit + '(?:[ .()-]*' + unit + '){9}(?![a-z0-9])', 'gi');
  for (const match of String(text).matchAll(pattern)) {
    if (!/[a-z]/i.test(match[0])) continue;
    const prior = text.slice(Math.max(0, match.index - 90), match.index);
    if (!/\b(call|text|phone|contact|reach|telephone|tel)\b/i.test(prior)) continue;
    const phone = match[0].replace(/zero|one|two|three|four|five|six|seven|eight|nine|[0-9]/gi, x => digits[x.toLowerCase()] || x).replace(/[^0-9]/g,'');
    if (/^[2-9]\d{2}[2-9]\d{6}$/.test(phone)) return phone.replace(/(\d{3})(\d{3})(\d{4})/,'$1-$2-$3');
  }
  return null;
}

export function upfrontContact(title) {
  const text = String(title || '');
  const phone = mixedWordPhone(text) || text.match(/(?<!\d)(?:\+1[ .-]?)?\(?[2-9]\d{2}\)?[ .-]?[2-9]\d{2}[ .-]?\d{4}(?!\d)/)?.[0] || null;
  const email = text.match(/[\w.+-]+@[\w-]+\.[a-z]{2,}/i)?.[0] || null;
  return { phone, email, eligible: Boolean(phone || email) };
}


export function publicPostingText(html) {
  const match=String(html||'').match(/<section\b(?=[^>]*\bid=["']postingbody["'])[^>]*>([\s\S]*?)<\/section>/i);
  if(!match) return '';
  return match[1].replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
    .replace(/<[^>]*>/g,' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const v=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return v>0&&v<=0x10ffff?String.fromCodePoint(v):' ';})
    .replace(/&(nbsp|amp|lt|gt|quot|apos);/gi,(_,e)=>({nbsp:' ',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"}[e.toLowerCase()]))
    .replace(/\s+/g,' ').trim();
}

export function listingUrl(item,source) {
  try {
    const base=new URL(source.url);
    if(base.protocol!=='https:'||!base.hostname.endsWith('.craigslist.org')) return null;
    if(!item?.PostingURL&&!item?.PostingID) return null;
    const url=new URL(item.PostingURL||('/reo/d/'+item.PostingID+'.html'),base);
    return url.protocol==='https:'&&url.hostname.endsWith('.craigslist.org')?url.href:null;
  } catch { return null; }
}


// Extract only an explicitly named contact from the public listing.
export function extractContactName(text) {
  const value = String(text || '').replace(/\s+/g, ' ');

  const patterns = [
    /\b(?:seller|owner|contact)(?:\s+name)?\s*:\s*([A-Za-z][A-Za-z'-]{1,29}(?:\s+[A-Za-z][A-Za-z'-]{1,29})?)/i,
    /\b(?:call|text|ask for|contact|reach out to|speak with)\s+([A-Za-z][A-Za-z'-]{1,29})(?=\s+(?:at|on|for|about|via)\b|[\s,.:;!?-]*\d|[\s,.;!?]|$)/i,
    /\bmy name is\s+([A-Za-z][A-Za-z'-]{1,29})\b/i
  ];

  const excluded = new Set([
    'owner','seller','homeowner','agent','realtor','broker',
    'contact','house','home','property','listing','private',
    'party','information','details','today','now','me','us',
    'please','more','the','this','sale','number','email',
    'for','at','with','by','to','of','in','from','details','info'
  ]);

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;
    const name = match[1].trim();
    if (name.split(/\s+/).every(word =>
      !excluded.has(word.toLowerCase()) &&
      /^[A-Za-z][A-Za-z'-]{1,29}$/.test(word)
    )) return name;
  }
  return null;
}

export function prospectFromListing(item, source) {
  const title=String(item.PostingTitle||'').trim();
  if(!title||title==='undefined') return null;
  const contact = upfrontContact(title + ' ' + String(item.publicDescription || ''));
  if (!contact.eligible) return null;
  const sourceUrl=listingUrl(item,source);
  if(!sourceUrl) return null;
  const {phone, email} = contact;
  // Explicitly labeled fields only: never mistake a street or headline for an owner name.
  const ownerName = extractContactName(title + ' ' + String(item.publicDescription || ''));
  if (!ownerName) return null;
  const propertyAddress = title.match(/\b(?:property\s+)?address\s*:\s*(\d{1,6}\s+[\w .'-]+?)(?=\s*[,|;]|$)/i)?.[1]?.trim() || null;
  const description = String(item.publicDescription || '');
  const listingText = title + ' ' + description;

  const fieldZip = String(item.PostalCode || item.postalCode || '')
    .match(/^\d{5}$/)?.[0] || null;

  const labeledZip = listingText.match(
    /\b(?:property\s+zip|property\s+zip\s*code|property\s+postal\s*code|zip\s*code|zipcode)\s*[:#-]?\s*(\d{5})\b/i
  )?.[1] || null;

  const locationZip = listingText.match(
    /\b(?:property\s+location|property\s+address|located\s+at)\s*:\s*[^.;\n]{0,100}?\b[A-Za-z][A-Za-z .'-]{1,40},\s*[A-Z]{2}\s+(\d{5})\b/i
  )?.[1] || null;

  const zip = fieldZip || labeledZip || locationZip || null;
  if (!zip) return null;
  return {publicDescription:String(item.publicDescription||''),externalId:'cl-'+createHash('sha256').update(sourceUrl).digest('hex').slice(0,40),title,ownerName,propertyAddress,phone,email,zipCode:zip,sourceUrl:sourceUrl,source:'Craigslist',searchZip:source.zip,discoveredAt:new Date().toISOString(),doNotContact:/no\s*(realtors?|agents?|brokers?)\b/i.test(title+' '+String(item.publicDescription||''))};
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
