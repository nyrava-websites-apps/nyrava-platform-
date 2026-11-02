import {createHash} from 'node:crypto';
import {upfrontContact} from './collector-policy.mjs';

const API = 'https://trellistate.com/api/v1/listings';
const PROPERTY_TYPES = new Set(['house','single_family','single-family','condo','townhouse','multi_family','multi-family','apartment','manufactured','mobile_home','residential']);

export function trellistateProspect(record) {
  if (!record || record.status !== 'active' || record.listing_type !== 'sale' ||
      !PROPERTY_TYPES.has(record.property_type) || record.country !== 'US') return null;
  if (typeof record.id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(record.id)) return null;
  const title = String(record.title || '').slice(0,1000);
  const publicDescription = String(record.description || '').slice(0,10000);
  // Structured contact fields do NOT qualify: they must be printed in the public listing.
  const {phone,email,eligible} = upfrontContact(title+' '+publicDescription);
  if (!eligible || !/\b(fsbo|for sale by owner|owner selling|selling by owner|direct from owner)\b/i.test(title+' '+publicDescription)) return null;
  let sourceUrl;
  try {
    const u=new URL(record.url);
    if(u.origin!=='https://trellistate.com'|| !u.pathname.startsWith('/listings/')) return null;
    sourceUrl=u.href;
  } catch { return null; }
  const zipCode=/^\d{5}$/.test(String(record.postal_code||'')) ? record.postal_code : null;
  // No unconfirmed owner identity or authorization is inferred from a property listing.
  return {externalId:'trellistate-'+createHash('sha256').update(record.id).digest('hex').slice(0,36),
    title,publicDescription,phone,email,zipCode,sourceUrl,source:'Trellistate',
    ownerName:null,propertyAddress:null,doNotContact:/\b(no agents?|no realtors?|no brokers?|do not contact)\b/i.test(title+' '+publicDescription),
    discoveredAt:new Date().toISOString()};
}

export async function collectTrellistate(fetcher=fetch) {
  // Documented public API; bounded read only, with no hidden contact lookup.
  const url=new URL(API);
  for(const [k,v] of Object.entries({country:'US',listing_type:'sale',status:'active',limit:'25',sort:'newest'})) url.searchParams.set(k,v);
  const res=await fetcher(url.href,{headers:{Accept:'application/json','User-Agent':'NyravaHome-PublicListingAudit/1.0'},redirect:'error',signal:AbortSignal.timeout(12000)});
  if(!res.ok) throw Error('Trellistate HTTP '+res.status);
  const body=await res.text();
  if(body.length>500000) throw Error('Trellistate response too large');
  const parsed=JSON.parse(body);
  if(!Array.isArray(parsed.data)||parsed.data.length>25) throw Error('Invalid Trellistate response');
  return parsed.data.map(trellistateProspect).filter(Boolean);
}
