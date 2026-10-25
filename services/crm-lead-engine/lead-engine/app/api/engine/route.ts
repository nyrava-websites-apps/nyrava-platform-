import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {Repo} from '../../../lib/repository';
import {qualify,csv,sourceUrl} from '../../../lib/leads';
import {collectPage} from '../../../lib/source';

export const dynamic='force-dynamic';
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const response=(v:any,status=200)=>Response.json(v,{status,headers});

const BRIDGE_SECRET = 'nyrava-bridge-internal';

async function forwardLeadsToCRM(targetUrl: string, apiKey: string, leads: any[]) {
  const now = new Date().toISOString();
  const isNyravaCRM = targetUrl.includes(':5180') || targetUrl.includes('/api/v1/inbound-leads') || targetUrl.includes('/api/leads');
  const endpoint = isNyravaCRM && !targetUrl.endsWith('/api/v1/inbound-leads')
    ? targetUrl.replace(/\/api\/leads\/?$/, '') + '/api/v1/inbound-leads'
    : targetUrl;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'NyravaLeadEngine/1.0'
  };
  if (apiKey) {
    headers['Authorization'] = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
  }

  if (isNyravaCRM) {
    let sent = 0;
    for (const l of leads) {
      const method = l.phone ? 'Phone' : 'Email';
      const zip = (l.zipCode || '74133').match(/\b\d{5}\b/)?.[0] || '74133';
      const payload = {
        ExternalLeadId: l.id || l.externalId || `${l.phone || l.email || 'fsbo'}-${zip}-${(l.address || '').slice(0, 20)}`,
        Source: 'Fsbo',
        Name: l.name || 'FSBO Homeowner',
        Email: l.email || null,
        Phone: l.phone || null,
        Company: null,
        LeadType: 'Seller',
        PropertyZipCode: zip,
        ContactVerificationMethod: method,
        ContactVerifiedAt: now,
        IntentVerifiedAt: now,
        ConsentCapturedAt: now,
        ConsentRecipient: 'Nyrava Real Estate CRM',
        ConsentText: 'Homeowner authorized direct realtor outreach for FSBO listing.',
        SourceUrl: l.sourceUrl || 'https://trellistate.com',
        ExternalFsbo: false,
        Notes: `FSBO Lead | ${l.address || ''} ${l.city || ''} ${l.state || ''} | ${l.description || l.title || ''}`,
      };
      try {
        const res = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(payload) });
        if (res.ok) sent++;
      } catch (e) {
        console.error('CRM push error:', e);
      }
    }
    return { ok: true, sent };
  } else {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event: 'auto_fsbo_leads',
        timestamp: now,
        total: leads.length,
        leads
      })
    });
    return { ok: res.ok, status: res.status, sent: leads.length };
  }
}

async function handler(request:Request){
 try{
  // Allow bridge internal access via secret header (bypasses ChatGPT auth)
  const bridgeKey = request.headers.get('X-Bridge-Secret');
  const url0=new URL(request.url);
  const isBridgeExport = bridgeKey===BRIDGE_SECRET && url0.searchParams.get('action')==='export';

  let user:any = null;
  if(!isBridgeExport){
   user=await getChatGPTUser();
   if(!user)return response({error:'Sign in to continue.'},401);
  } else {
   user={userId:'nyrava-admin',displayName:'Bridge'};
  }
  if(!env.DB)return response({error:'Storage is unavailable.'},503);

  const repo=new Repo(env.DB,user.userId);
  const url=new URL(request.url);
  const action=url.searchParams.get('action')??'dashboard';
  const id=url.searchParams.get('campaign')??'';

  if(request.method==='GET'){
   if(action==='dashboard') {
    return response({campaigns:await repo.campaigns(),usage:await repo.usage(),user:user.displayName});
   }
   if(action==='leads') {
    return response({leads:await repo.research(id),runs:await repo.runs(id)});
   }
   if(action==='export'){
    let targetId = id;
    if(!targetId) {
     const allC = await repo.campaigns();
     if(allC.length > 0) targetId = allC[0].id;
    }
    let rows = targetId ? await repo.research(targetId) : [];
    const queue=url.searchParams.get('queue')??'prospect';
    if(!['all','prospect','research'].includes(queue))throw Error('Invalid export queue');
    if(queue!=='all')rows=rows.filter((r:any)=>r.queue===queue);

    // Optional filtering by ZIP code area for realtor CRM routing
    const zipFilter=url.searchParams.get('zipCode')?.trim();
    if(zipFilter) {
     rows=rows.filter((r:any)=>r.zipCode===zipFilter);
    }
    const stateFilter=url.searchParams.get('state')?.trim().toUpperCase();
    if(stateFilter) {
     rows=rows.filter((r:any)=>r.state===stateFilter);
    }

    const format=url.searchParams.get('format')??'csv';
    if(!['csv','json'].includes(format))throw Error('Invalid export format');
    return new Response(
     format==='json'
      ? JSON.stringify({schemaVersion:'1.1',crmTarget:'realtor_fsbo_routing',exportedAt:new Date().toISOString(),total:rows.length,records:rows},null,2)
      : csv(rows,['name','phone','email','address','zipCode','state','country','title','description','sourceUrl','listingClass','queue','relevanceReason','publishedAt','firstSeen']),
     {headers:{...headers,'Content-Type':format==='json'?'application/json':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="fsbo-realtor-leads-${zipFilter||'nationwide'}.${format}"`}}
    );
   }
   return response({error:'Not found'},404);
  }

  // Handle Webhooks & API Ingestion
  const isWebhook = action === 'webhook' || action === 'ingest_lead';
  if(!isWebhook && request.headers.get('Origin')!==url.origin) {
   return response({error:'Same-origin request required.'},403);
  }

  if(!request.headers.get('Content-Type')?.startsWith('application/json')) {
   return response({error:'JSON required'},415);
  }

  const text=await request.text();
  if(new TextEncoder().encode(text).length>300000)return response({error:'Upload must be under 300 KB.'},413);
  const body=JSON.parse(text);

  if(action==='campaign')return response(await repo.saveCampaign(body,body.id));
  if(action==='collect'){
   const result = await collectPage(repo,id);
   const campaign = await repo.campaign(id);
   if(campaign.crmAutoForward && campaign.crmWebhookUrl && result.prospects > 0){
    try {
     const rows = await repo.research(id);
     const fresh = rows.filter((r:any)=>r.queue==='prospect').slice(0, result.prospects);
     if(fresh.length > 0){
      await forwardLeadsToCRM(campaign.crmWebhookUrl, campaign.crmApiKey, fresh);
     }
    } catch (e) {
     console.error('CRM auto-forward error:', e);
    }
   }
   return response(result);
  }

  // Push leads to Realtor CRM Endpoint
  if(action==='dispatch_crm'){
   const campaign = await repo.campaign(id);
   const targetUrl = body.crmWebhookUrl || campaign.crmWebhookUrl;
   if(!targetUrl) throw Error('No CRM Webhook or API Endpoint configured.');
   
   let rows = await repo.research(id);
   const queue = url.searchParams.get('queue') ?? 'prospect';
   if(queue!=='all') rows = rows.filter((r:any)=>r.queue===queue);
   
   const zipFilter = (url.searchParams.get('zipCode')||body.zipCode)?.trim();
   if(zipFilter) rows = rows.filter((r:any)=>r.zipCode===zipFilter);
   
   const leadsToDispatch = rows.slice(0, 100);
   if(!leadsToDispatch.length) {
    return response({status:'success',sent:0,message:'No leads found in this filter to dispatch.'});
   }

   const apiKey = body.crmApiKey || campaign.crmApiKey;
   try {
    const outcome = await forwardLeadsToCRM(targetUrl, apiKey, leadsToDispatch);
    return response({
     status: outcome.ok ? 'success' : 'crm_http_error',
     statusCode: outcome.ok ? 200 : (outcome.status || 500),
     sent: outcome.sent,
     targetUrl,
     message: outcome.ok
      ? `Dispatched ${outcome.sent} FSBO leads to your Realtor CRM successfully.`
      : `CRM responded with an error. Verify endpoint URL.`
    });
   } catch(err:any) {
    throw Error(`Failed to deliver leads to CRM endpoint: ${err.message}`);
   }
  }

  // Inbound Webhook / Scraper API Endpoint for social media & external tools
  if(isWebhook){
   const rawRecords = Array.isArray(body) ? body : Array.isArray(body.records) ? body.records : [body];
   if(!rawRecords.length) throw Error('No records provided');
   const campaign = id ? await repo.campaign(id) : (await repo.campaigns())[0];
   if(!campaign) throw Error('No active campaign found to receive leads.');

   const accepted:any[] = [];
   const retired:string[] = [];
   let realtorCount = 0;
   const claimJob = await repo.claim(campaign.id);

   for(const raw of rawRecords){
    if(!raw || typeof raw !== 'object') continue;
    let u: string;
    try {
     u = sourceUrl(raw.sourceUrl ?? `https://socialfeed.net/lead/${crypto.randomUUID()}`);
    } catch {
     continue;
    }
    const cleanRaw = {...raw, sourceUrl: u, is_fsbo: true};
    const qualified = qualify(cleanRaw, campaign, cleanRaw.source ?? 'webhook');
    if(qualified) {
     accepted.push(qualified);
    } else {
     retired.push(u);
     realtorCount++;
    }
   }

   const counts = await repo.ingest(campaign.id, accepted, retired, claimJob.token);
   return response({
    status: 'success',
    received: rawRecords.length,
    prospects: accepted.filter(r => r.queue === 'prospect').length,
    research: accepted.filter(r => r.queue === 'research').length,
    rejected_realtors: realtorCount,
    ...counts
   });
  }

  if(action==='import'){
   if(body.accessReviewed!==true)throw Error('Confirm permission to use these public records.');
   if(!Array.isArray(body.records)||body.records.length>250||body.records.some((r:any)=>!r||typeof r!=='object'||Array.isArray(r)))throw Error('Import up to 250 record objects.');
   const unique=new Map<string,any>();
   for(const row of body.records){
    let u:string;
    try { u = sourceUrl(row.sourceUrl ?? `https://socialfeed.net/lead/${crypto.randomUUID()}`); }
    catch { continue; }
    unique.set(u,{...row,sourceUrl:u});
   }
   const c=await repo.claim(id);
   const accepted=[],retired=[];
   for(const row of unique.values()){
    const r=qualify(row,c,row.source??'import');
    if(r)accepted.push(r);
    else retired.push(row.sourceUrl);
   }
   return response({
    ...await repo.ingest(id,accepted,retired,c.token),
    prospects:accepted.filter(r=>r.queue==='prospect').length,
    research:accepted.filter(r=>r.queue==='research').length,
    rejected:retired.length
   });
  }

  if(action==='remove'){
   await repo.remove(id,sourceUrl(body.sourceUrl));
   return response({removed:true});
  }

  return response({error:'Not found'},404);
 }catch(e:any){
  const msg=String(e.message??'');
  const known=/Campaign|campaign|Collection|collection|SOURCE_|DAILY_|Freshness|Contact|ZIP|intent phrase|Invalid|Import|Confirm|public HTTPS|Source traversal|Maximum|This source|Choose|Sign in|No active campaign/;
  return response({error:known.test(msg)?msg:'Request could not complete. Check the data and try again.'},400);
 }
}

export const GET=handler;
export const POST=handler;
