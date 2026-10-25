export type Campaign = {
 name:string;
 kind:'fsbo'|'custom';
 keywords:string[];
 exclude:string[];
 zips:string[];
 maxAgeDays:number;
 contactPolicy:'either'|'email'|'phone'|'both';
 crmWebhookUrl?:string;
 crmApiKey?:string;
 crmAutoForward?:boolean;
};

export function campaignInput(raw:any):Campaign {
 if(!raw || typeof raw.name!=='string'||!raw.name.trim()||raw.name.length>80)throw Error('Campaign name is required (80 characters maximum).');
 if(!['fsbo','custom'].includes(raw.kind))throw Error('Choose an FSBO or custom campaign.');
 const list=(v:any,max:number)=>{if(!Array.isArray(v)||v.length>max||v.some(x=>typeof x!=='string'||!x.trim()||x.length>100))throw Error('Invalid campaign rule list.');return [...new Set(v.map(x=>x.trim()))] as string[];};
 const keywords=list(raw.keywords??[],30),exclude=list(raw.exclude??[],30),zips=list(raw.zips??[],5000);
 if(zips.some(z=>!/^\d{5}$/.test(z)))throw Error('Use five-digit ZIP codes, including leading zeroes.');
 if(raw.kind==='custom'&&!keywords.length)throw Error('Custom campaigns need at least one intent phrase.');
 const maxAgeDays=Number(raw.maxAgeDays??90);if(!Number.isInteger(maxAgeDays)||maxAgeDays<1||maxAgeDays>90)throw Error('Freshness must be 1–90 days.');
 if(!['either','email','phone','both'].includes(raw.contactPolicy??'either'))throw Error('Invalid contact rule.');
 
 const crmWebhookUrl = typeof raw.crmWebhookUrl==='string'&&raw.crmWebhookUrl.trim().startsWith('http')?raw.crmWebhookUrl.trim():'';
 const crmApiKey = typeof raw.crmApiKey==='string'?raw.crmApiKey.trim().slice(0,500):'';
 const crmAutoForward = Boolean(raw.crmAutoForward);

 return {
  name:raw.name.trim(),
  kind:raw.kind,
  keywords,
  exclude,
  zips,
  maxAgeDays,
  contactPolicy:raw.contactPolicy??'either',
  crmWebhookUrl,
  crmApiKey,
  crmAutoForward
 };
}

export function sourceUrl(value:any){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.href.length>1500||!u.hostname.includes('.')||/^(?:\d|\[)/.test(u.hostname)||/\.(?:local|localhost|internal)$/.test(u.hostname))throw Error('A public HTTPS source URL without credentials is required.');
 u.hash='';
 return u.href;
}

const fsbo=/\b(?:FSBO|for sale by owner|owner[- ]listed|selling without an agent|selling (?:my|our) (?:own )?(?:home|house|condo|property|townhouse))\b/i;
const intent=/\b(?:I(?:'m| am)?|we(?:'re| are)?)\s+(?:(?:thinking about|considering|planning (?:on|to)|want(?:ing)? to|need(?:ing)? to|going to)\s+)?sell(?:ing)?\s+(?:my|our)\s+(?:home|house|condo|property|townhouse)\b|\b(?:my|our) (?:home|house|condo|property|townhouse) is (?:up )?for sale\b/i;

const baseExcluded=/\b(?:my|our) (?:listing|client)\b|\b(?:not (?:an? )?(?:FSBO|for sale by owner|owner[- ]listed)|sold my|sold our|not selling|not for sale|no longer (?:selling|for sale)|under contract|sale pending|guide to|tips for|how to|looking to buy|we buy houses)\b|\b(?:home|house|property) (?:is|was|has been) sold\b/i;
const badRole=/\b(?:agent|realtor|broker|lender|mortgage|support|advertis\w*|example|sample)\b/i;
const cue=/\b(?:(?:call|text|email|contact|reach|phone|tel|cell|ph(?:one)?#?|message|inquire)\b|(?:owner|seller)(?: phone| email)?\s*:)/i;
const states='AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' ');

/**
 * Checks whether text or contact data represents a licensed realtor, brokerage, or agent representation.
 * Explicitly preserves authentic FSBO owner disclaimers (e.g. "no realtors", "no agents please").
 */
export function isRealtor(text:string, raw:any={}):boolean {
 const name=String(raw?.name??raw?.contact?.name??'');
 if(/\b(?:agent|realtor|broker|brokerage|realty|real estate team|real estate group|properties llc)\b/i.test(name))return true;
 if(raw?.is_realtor===true||raw?.listing_by==='agent')return true;

 // Protect authentic FSBO owners who say "no realtors", "agents do not call", etc.
 const sanitized=text
  .replace(/\b(?:no|not|never|don't|do not|please no)\s+(?:solicitation|realtors?|agents?|brokers?|lenders?)\b/gi,' ')
  .replace(/\b(?:realtors?|agents?|brokers?)\s+(?:please\s+)?(?:do not|don't|no)\s+(?:call|contact|solicit|reach out|message)\b/gi,' ')
  .replace(/\b(?:buyers only|principals only)\s*[,-]?\s*(?:no\s+(?:realtors?|agents?|brokers?))?\b/gi,' ')
  .replace(/\bnot\s+interested\s+in\s+(?:listing|working with)\s+(?:with\s+)?(?:an?\s+)?(?:agent|realtor|broker)\b/gi,' ');

 const realtorPatterns=[
  /\b(?:I am|I'm|we are|we're) (?:a |an )?(?:(?:licensed )?real estate (?:agent|broker)|realtor|agent|broker|lender)\b/i,
  /\b(?:my|our) (?:listing|client|buyer client|seller client)\b/i,
  /\b(?:listed by|listing agent|co-listing agent|listing office|listing broker|brokered by|listing courtesy of|presented by|represented by)\b/i,
  /\b(?:eXp(?:\s+Realty)?|Keller\s+Williams|KW(?:\s+Realty)?|RE\/?MAX|Remax|Century\s+21|Coldwell\s+Banker|Compass(?:\s+Real\s+Estate)?|Redfin|Berkshire\s+Hathaway|Sotheby'?s|Realty\s+ONE|ERA\s+Real\s+Estate|Howard\s+Hanna|Weichert|Douglas\s+Elliman|Corcoran|HomeSmart)\b/i,
  /\b(?:CalDRE|DRE|TREC|Lic|License|BRE)\s*(?:#|no\.?|num(?:ber)?)?\s*[:#]?\s*\d{5,}\b/i,
  /\bMLS\s*(?:#|id|no\.?|listing)?\s*[:#]?\s*[A-Za-z0-9-]+\b/i,
  /\b(?:buyer(?:'s)? agent (?:commission|compensation|fee)|BAC\s*[:\s]\s*\d|Schedule via ShowingTime|ShowingTime|Equal Housing Opportunity|Each office is independently owned)\b/i,
  /\b(?:licensed (?:real estate )?(?:salesperson|agent|broker|associate))\b/i
 ];

 return realtorPatterns.some(pat=>pat.test(sanitized));
}

export function qualify(raw:any,c:Campaign,source='import'):any|null {
 if(!raw||typeof raw!=='object')return null;
 let url:string;try{url=sourceUrl(raw.sourceUrl);}catch{return null;}
 const title=String(raw.title??'').slice(0,300),description=String(raw.description??'').slice(0,12000),text=title+'\n'+description,lower=text.toLowerCase();
 if(['sold','inactive','pending','withdrawn','expired'].includes(String(raw.status).toLowerCase())||['rent','lease'].includes(raw.listing_type))return null;
 if(c.exclude.some(x=>lower.includes(x.toLowerCase())))return null;
 if(c.keywords.length&&!c.keywords.some(x=>lower.includes(x.toLowerCase())))return null;
 
 // Realtor / agent filtering - strictly reject realtors
 if(isRealtor(text,raw))return null;
 if(c.kind==='fsbo'&&baseExcluded.test(text))return null;

 const explicit=c.kind==='fsbo'&&(fsbo.test(text)||raw.is_fsbo===true||raw.listing_type==='fsbo');
 const firstPerson=c.kind==='fsbo'&&intent.test(text);
 const unknown=c.kind==='fsbo'&&source==='trellistate'&&!explicit&&!firstPerson;
 if(c.kind==='fsbo'&&!explicit&&!firstPerson&&!unknown)return null;

 const evidence:any[]=[];
 function add(kind:string,value:string,excerpt:string){
  let v=value.toLowerCase();
  if(kind==='phone'){
   v=value.replace(/\D/g,'');
   if(v.length===11&&v[0]==='1')v=v.slice(1);
   if(!/^[2-9]\d{2}[2-9]\d{6}$/.test(v)||v.slice(3,6)==='555'&&Number(v.slice(6))>=100&&Number(v.slice(6))<=199)return;
   v='+1'+v;
  }else if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)||/@(?:example\.(?:com|org|net))$|\.(?:example|invalid|localhost)$/.test(v)||/^(?:support|noreply|no-reply|webmaster|info|admin|help)@/.test(v))return;
  if(!evidence.some(e=>e.value===v))evidence.push({kind,value:v,excerpt:excerpt.slice(0,700),sourceUrl:url,role:'owner_or_author'});
 }

 // 1. Extract contact from structured fields across ALL sources
 const candidateContacts:Array<{kind:'phone'|'email';val:string;label:string}>=[];
 const rawPhone=raw.phone??raw.phoneNumber??raw.contact_phone??raw.contact?.phone;
 if(rawPhone)candidateContacts.push({kind:'phone',val:String(rawPhone),label:'Provided phone'});
 const rawEmail=raw.email??raw.contact_email??raw.contact?.email;
 if(rawEmail)candidateContacts.push({kind:'email',val:String(rawEmail),label:'Provided email'});

 for(const item of candidateContacts){
  if(!badRole.test(String(raw.contact?.name??raw.name??''))){
   add(item.kind,item.val,`${item.label}: ${item.val}`);
  }
 }

 // 2. Extract contacts from description and title
 const matches=[
  ...description.matchAll(/[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g),
  ...description.matchAll(/(?<!\d)(?:\+?1[ .-]*)?(?:\([2-9]\d{2}\)|[2-9]\d{2})[ .-]*[2-9]\d{2}[ .-]*\d{4}(?!\d)/g)
 ];

 for(const m of matches){
  const before=description.slice(0,m.index),
        start=Math.max(before.lastIndexOf('\n'),before.lastIndexOf('. '),before.lastIndexOf('! '),before.lastIndexOf('? '))+1,
        tail=description.slice(m.index!+m[0].length),
        boundary=tail.search(/\n|[.!?](?:\s|$)/),
        quote=description.slice(start,m.index!+m[0].length+(boundary<0?Math.min(tail.length,160):boundary+1)).trim();
  if(cue.test(quote)&&!badRole.test(quote)&&!unknown){
   add(m[0].includes('@')?'email':'phone',m[0],quote);
  }
 }

 const emails=evidence.filter(e=>e.kind==='email').map(e=>e.value);
 const phones=evidence.filter(e=>e.kind==='phone').map(e=>e.value);
 const reasons:string[]=[];

 const loc=text.match(new RegExp('\\b('+states.join('|')+')\\s+(\\d{5})(?:-\\d{4})?\\b'));
 const stateMatch=text.match(new RegExp('\\b('+states.join('|')+')\\b'));
 const zipCode=String(raw.zipCode??loc?.[2]??'');
 const state=String(raw.state??loc?.[1]??stateMatch?.[1]??'');
 const country=String(raw.country??'').toUpperCase();
 const hasUsState=states.includes(state);
 const us=(!country||['US','USA','UNITED STATES'].includes(country))&&(/^\d{5}$/.test(zipCode)||hasUsState);

 if(c.zips.length&&!c.zips.includes(zipCode))return null;
 if(!us)reasons.push('US location needs review');
 if(unknown)reasons.push('Owner role not established');

 // Strictly check contact presence
 if(!emails.length&&!phones.length){
  reasons.push('No attributed published contact');
 }else if(c.contactPolicy==='both'&&(!emails.length||!phones.length)||c.contactPolicy==='email'&&!emails.length||c.contactPolicy==='phone'&&!phones.length){
  reasons.push('Contact rule not met');
 }

 const publishedAt=raw.publishedAt?String(raw.publishedAt):null;
 const age=Date.now()-Date.parse(publishedAt??'');
 if(!Number.isFinite(age)||age>c.maxAgeDays*86400000||age< -86400000)reasons.push('Publication date needs review');

 const listingClass=c.kind==='custom'?'PRODUCT_INTENT':explicit?'CONFIRMED_FSBO':'POSSIBLE_SELLER_INTENT';

 return {
  sourceUrl:url,
  title,
  description,
  address:String(raw.address??'').slice(0,300),
  name:String(raw.name??raw.contact?.name??'').slice(0,150),
  zipCode,
  state,
  country:us?'US':country,
  publishedAt,
  listingClass,
  queue:reasons.length?'research':'prospect',
  reasons,
  evidence,
  email:emails.join('; '),
  phone:phones.join('; '),
  contactVerified:false,
  contactAuthorized:false,
  isRealtorFree:true,
  relevanceReason:unknown?'Active sale listing; ownership unknown':explicit?'Explicit owner-sale language':c.kind==='custom'?'Matched campaign intent phrase':'First-person intention to sell',
  relevanceQuote:explicit?text.match(fsbo)?.[0]:firstPerson?text.match(intent)?.[0]:c.keywords.find(x=>lower.includes(x.toLowerCase()))??'Active sale listing',
  source
 };
}

export function csv(rows:any[],fields:string[]){
 const cell=(v:any)=>{
  let s=typeof v==='object'?JSON.stringify(v):String(v??'');
  if(/^[\s]*[=+@-]/.test(s))s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
 };
 return '\ufeff'+[fields.map(cell).join(','),...rows.map(r=>fields.map(k=>cell(r[k])).join(','))].join('\r\n');
}
