'use client';
import {useEffect,useState,useRef} from 'react';
import {LayoutDashboard,Users,Search,SlidersHorizontal,Database,ArrowUpRight,Plus,Download,Upload,Play,ShieldCheck,ChevronRight,ExternalLink,X,Activity,Layers,Link2,Check,AlertCircle,RefreshCw,MapPin,Phone,Mail,Copy,CheckCheck} from 'lucide-react';

type Campaign={
 id?:string;
 name:string;
 kind:string;
 keywords:string[];
 exclude:string[];
 zips:string[];
 maxAgeDays:number;
 contactPolicy:string;
 cursor?:string;
 checked?:number;
 busy?:boolean;
 crmWebhookUrl?:string;
 crmApiKey?:string;
 crmAutoForward?:boolean;
};
const preset:Campaign={name:'Nationwide FSBO Homeowners',kind:'fsbo',keywords:[],exclude:[],zips:[],maxAgeDays:90,contactPolicy:'either',crmWebhookUrl:'',crmApiKey:'',crmAutoForward:false};
const label=(v:string)=>({CONFIRMED_FSBO:'Confirmed FSBO',POSSIBLE_SELLER_INTENT:'Seller intent signal',PRODUCT_INTENT:'Product intent'}[v]??v);
const date=(v:any)=>v?new Date(v).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}):'Recent';

export default function Dashboard({name}:{name:string}){
 const [tab,setTab]=useState('overview'),
       [campaigns,setCampaigns]=useState<Campaign[]>([]),
       [active,setActive]=useState(''),
       [leads,setLeads]=useState<any[]>([]),
       [runs,setRuns]=useState<any[]>([]),
       [usage,setUsage]=useState(0),
       [busy,setBusy]=useState(false),
       [loading,setLoading]=useState(true),
       [message,setMessage]=useState(''),
       [error,setError]=useState(''),
       [query,setQuery]=useState(''),
       [zipFilter,setZipFilter]=useState(''),
       [filter,setFilter]=useState('all'),
       [leadPage,setLeadPage]=useState(1),
       [editor,setEditor]=useState<Campaign|null>(null),
       [selected,setSelected]=useState<any>(null),
       [importOpen,setImportOpen]=useState(false),
       [permission,setPermission]=useState(false),
       [importText,setImportText]=useState(''),
       [copied,setCopied]=useState('');

 const epoch=useRef(0),
       current=campaigns.find(c=>c.id===active),
       prospects=leads.filter(r=>r.queue==='prospect'),
       research=leads.filter(r=>r.queue==='research');

 async function api(action:string,body?:any,id=active){
  const r=await fetch('/api/engine?action='+action+(id?'&campaign='+encodeURIComponent(id):''),body===undefined?{cache:'no-store'}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const data:any=await r.json();
  if(!r.ok)throw Error(data.error??'Request failed');
  return data;
 }

 async function load(id=active){
  const n=++epoch.current;
  setLoading(true);
  try{
   const d=await api('dashboard',undefined,'');
   if(n!==epoch.current)return;
   setCampaigns(d.campaigns);
   setUsage(d.usage);
   const chosen=id&&d.campaigns.some((c:any)=>c.id===id)?id:d.campaigns[0]?.id??'';
   setActive(chosen);
   if(chosen){
    const r=await api('leads',undefined,chosen);
    if(n!==epoch.current)return;
    setLeads(r.leads);
    setRuns(r.runs);
   }else{
    setLeads([]);
    setRuns([]);
   }
  }catch(e:any){
   if(n===epoch.current)setError(e.message);
  }finally{
   if(n===epoch.current)setLoading(false);
  }
 }

 useEffect(()=>{load();return()=>{epoch.current++};},[]);

 async function act(fn:()=>Promise<any>){
  if(busy)return;
  setBusy(true);
  setError('');
  setMessage('');
  try{await fn();}
  catch(e:any){setError(e.message);}
  finally{setBusy(false);}
 }

 function switchCampaign(id:string){
  setSelected(null);
  setLeads([]);
  setRuns([]);
  setQuery('');
  setZipFilter('');
  load(id);
 }

 async function collect(){
  await act(async()=>{
   const r=await api('collect',{});
   setMessage(`Pulled ${r.prospects} verified FSBO owner leads with phone/email and NO realtors. Added ${r.newRecords} new records to your CRM queue.`);
   await load();
  });
 }

 async function save(e:React.FormEvent){
  e.preventDefault();
  if(!editor)return;
  await act(async()=>{
   const clean=(v:string[])=>v.map(x=>x.trim()).filter(Boolean);
   const c=await api('campaign',{...editor,keywords:clean(editor.keywords),exclude:clean(editor.exclude),zips:clean(editor.zips)});
   setEditor(null);
   await load(c.id);
   setMessage('Campaign rules saved.');
  });
 }

 async function importRows(e:React.FormEvent){
  e.preventDefault();
  await act(async()=>{
   let payload;
   try{payload=JSON.parse(importText);}
   catch{throw Error('Valid JSON array or {"records": [...]} required.');}
   const records=Array.isArray(payload)?payload:payload.records;
   const r=await api('import',{records,accessReviewed:permission});
   setMessage(`Imported: ${r.prospects} qualified prospects (phone/email present, realtors filtered out); ${r.rejected} rejected.`);
   setImportOpen(false);
   setImportText('');
   setPermission(false);
   await load();
  });
 }

 async function exportRows(format:string, targetZip=''){
  await act(async()=>{
   const queue=tab==='research'?'research':'prospect';
   const zipParam=targetZip?`&zipCode=${encodeURIComponent(targetZip)}`:zipFilter?`&zipCode=${encodeURIComponent(zipFilter)}`:'';
   const r=await fetch(`/api/engine?action=export&campaign=${encodeURIComponent(active)}&queue=${queue}&format=${format}${zipParam}`);
   if(!r.ok)throw Error((await r.json() as any).error);
   const url=URL.createObjectURL(await r.blob()),a=document.createElement('a');
   a.href=url;
   a.download=`realtor-crm-fsbo-${targetZip||zipFilter||'nationwide'}.${format}`;
   a.click();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
   setMessage(`Exported FSBO leads (${format.toUpperCase()}) for Realtor CRM routing.`);
  });
 }

 async function dispatchToCrm(targetZip=''){
  await act(async()=>{
   const r=await api('dispatch_crm',{zipCode:targetZip||zipFilter});
   setMessage(r.message);
  });
 }

 function copyToClipboard(text:string, tag:string){
  navigator.clipboard.writeText(text);
  setCopied(tag);
  setTimeout(()=>setCopied(''),2500);
 }

 // Extract unique ZIP codes present in leads for quick routing
 const uniqueZips=[...new Set(prospects.map(r=>r.zipCode).filter(Boolean))].sort();

 const rows=(tab==='research'?research:prospects).filter(r=>{
  const matchesFilter=filter==='all'||r.listingClass===filter;
  const matchesZip=!zipFilter||r.zipCode===zipFilter||String(r.state??'').toLowerCase()===zipFilter.toLowerCase();
  const matchesQuery=!query||[r.title,r.address,r.zipCode,r.name,r.email,r.phone,r.state].join(' ').toLowerCase().includes(query.toLowerCase());
  return matchesFilter && matchesZip && matchesQuery;
 });

 const sourceStatuses=[
  ['Nationwide FSBO Signals','Public Social & Web Feeds','Active','Direct owner listings from social channels, forums, and syndication feeds across all 50 US states with phone/email and no realtors.',''],
  ['Realtor CRM Ingestion Webhook','API / Scraper Gateway','Ready','Endpoint available for Facebook Marketplace scrapers, Apify actors, Craigslist feeds, and Zapier automations to post leads directly into your site.',''],
  ['Trellistate Public API','Public Listing Feed','Monitored','Monitored public API with automatic failover to prevent pipeline interruption.','https://trellistate.com/docs'],
  ['CSV & JSON Import','Bulk Lead Ingest','Ready','Upload raw scraped leads or bulk lists with instant automatic realtor rejection and contact verification.','']
 ];

 const nav=[
  ['overview','Overview',LayoutDashboard],
  ['leads','Realtor Lead Workspace',Users],
  ['research','Review / Incomplete Queue',Search],
  ['campaigns','Campaign Settings',SlidersHorizontal],
  ['sources','Sources & Real-Time Feeds',Database],
  ['integrations','Realtor CRM & Webhooks',Link2]
 ] as const;

 return (
  <div className="shell">
   <aside className="sidebar">
    <a className="brand" href="/"><span className="brand-mark">N</span><span>nyrava<span className="brand-sub">REALTOR CRM FEED</span></span></a>
    <div className="workspace-badge"><span className="green-dot"/> Live Lead Pipeline <ShieldCheck size={14}/></div>
    <div className="nav-label">CRM WORKSPACE</div>
    <nav>
     {nav.map(([id,title,Icon])=>(
      <button key={id} className={tab===id?'nav-item active':'nav-item'} onClick={()=>{setTab(id);setSelected(null);setQuery('');setFilter('all');}}>
       <Icon size={18}/>{title}
       {id==='leads'&&prospects.length>0&&<span className="count good">{prospects.length}</span>}
       {id==='research'&&research.length>0&&<span className="count">{research.length}</span>}
      </button>
     ))}
    </nav>
    <div className="sidebar-bottom">
     <div className="quiet-card">
      <ShieldCheck size={20}/>
      <strong>Zero Realtor Guarantee</strong>
      <p>Every lead is strictly validated to ensure it is a real homeowner selling by owner, with phone or email included.</p>
     </div>
     <div className="account">
      <span className="avatar">{name.slice(0,1).toUpperCase()}</span>
      <div><strong>{name}</strong><a href="/signout-with-chatgpt?return_to=/" target="_top">Sign out</a></div>
     </div>
    </div>
   </aside>

   <main>
    <header className="topbar">
     <span>Realtor Lead Engine <ChevronRight size={14}/> <strong>{nav.find(x=>x[0]===tab)?.[1]}</strong></span>
     <span className="private-label"><ShieldCheck size={14}/> 100% Realtor-Free Leads</span>
    </header>

    <div className="content">
     <div className="page-heading">
      <div>
       <div className="eyebrow">NATIONWIDE FSBO LEAD DISPATCH SYSTEM</div>
       <h1>{tab==='overview'?'FSBO Leads for Your Realtor CRM':nav.find(x=>x[0]===tab)?.[1]}</h1>
       <p>
        {tab==='overview'?'Pull real homeowner FSBO leads from social media and web feeds across any US ZIP code area for your realtors.':
         tab==='leads'?'Filter and dispatch verified homeowner leads by ZIP code area to local realtors.':
         tab==='integrations'?'Route leads by ZIP code into your Realtor CRM or push leads from external social media scrapers.':
         tab==='sources'?'Real-time collection feeds across US metros with strict broker suppression.':
         'Manage rules and qualification bounds.'}
       </p>
      </div>
      <button className="primary" onClick={()=>setEditor({...preset,name:campaigns.length?'New Campaign':preset.name})}><Plus size={16}/> New campaign</button>
     </div>

     <div className="campaign-bar">
      <div>
       <Layers size={17}/>
       <label htmlFor="campaignSelect">Campaign:</label>
       <select id="campaignSelect" value={active} disabled={busy||loading} onChange={e=>switchCampaign(e.target.value)}>
        <option value="" disabled>{campaigns.length?'Select campaign':'No campaigns yet'}</option>
        {campaigns.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
       </select>
      </div>
      <span>
       {current?.zips.length?`${current.zips.length} Target ZIPs`:'Nationwide USA Targeting'} 
       <span className="separator">/</span> 
       <strong>{prospects.length} Active FSBO Prospects Ready for CRM</strong>
      </span>
      <button className="icon-button" title="Refresh workspace" aria-label="Refresh workspace" disabled={busy||loading} onClick={()=>load()}>
       <RefreshCw size={16} className={loading?'spin':''}/>
      </button>
     </div>

     {error&&<div role="alert" className="notice error"><AlertCircle size={17}/><span>{error}</span><button onClick={()=>setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
     {message&&<div role="status" className="notice"><Check size={17}/><span>{message}</span><button onClick={()=>setMessage('')} aria-label="Dismiss message"><X size={15}/></button></div>}

     {tab==='overview'&&<>
      <div className="metrics">
       {[
        [prospects.length,'Ready for Realtors','Verified FSBO + Phone/Email',Users],
        [uniqueZips.length,'Covered ZIP Code Areas','Ready for local routing',MapPin],
        [leads.length,'Total Records Ingested','Deduplicated by property',Layers],
        [`${usage} / 20`,'Daily Pull Quota','Resets UTC',Activity]
       ].map(([value,title,subtitle,Icon]:any)=>(
        <div className="metric" key={title}>
         <div><span>{title}</span><Icon size={17}/></div>
         <strong>{value}</strong>
         <small>{subtitle}</small>
        </div>
       ))}
      </div>

      <div className="overview-grid">
       <section className="panel discovery-hero">
        <span className="pill">NATIONWIDE COLLECTION</span>
        <h2>Pull Fresh FSBO Owner Leads</h2>
        <p>
         Scrapes and syndicates authentic For Sale By Owner listings across social platforms and web sources.
         Guarantees owner phone or email, US ZIP code area, and strictly filters out all real estate agents, brokers, and MLS listings.
        </p>
        <div className="actions">
         <button className="primary" disabled={!current||busy||loading} onClick={collect}>
          <Play size={15}/>{busy?'Pulling FSBO leads…':'Pull FSBO Leads (Social & Web Feeds)'}
         </button>
         <button className="secondary" disabled={!current||busy} onClick={()=>setImportOpen(true)}>
          <Upload size={15}/> Import Custom Leads
         </button>
        </div>
        <div className="source-note">
         <span className="green-dot"/> Multi-Source Social & Web Aggregator <span>•</span> Zero Realtors Verified
        </div>
       </section>

       <section className="panel coverage-card">
        <div className="section-title">
         <h2>Realtor CRM Dispatch</h2>
         <MapPin size={18}/>
        </div>
        <div className="coverage-graphic">
         <span>USA</span>
         <div className="dot-field" aria-hidden="true">
          {Array.from({length:65},(_,i)=><i key={i} style={{opacity:0.25+(i%7)*0.1}}/>)}
         </div>
        </div>
        <strong>Nationwide Coverage · Route by ZIP Area</strong>
        <p>Leads contain 5-digit ZIP codes, city, state, owner phone numbers, and emails ready to dispatch to local realtors in your CRM.</p>
        <button className="text-button" onClick={()=>setTab('integrations')}>
         View CRM API & Webhook Setup <ArrowUpRight size={15}/>
        </button>
       </section>
      </div>

      <section className="panel">
       <div className="section-title">
        <div>
         <h2>Latest FSBO Opportunities Ready for Realtors</h2>
         <p>Homeowner leads with verified contact info and zero realtor representation.</p>
        </div>
        <button className="text-button" onClick={()=>setTab('leads')}>Open Full Workspace <ChevronRight size={16}/></button>
       </div>
       {prospects.length?(
        <div className="latest-list">
         {prospects.slice(0,6).map(r=>(
          <button key={r.sourceUrl} onClick={()=>setSelected(r)}>
           <span className="listing-icon"><Users size={19}/></span>
           <span>
            <strong>{r.title||r.address||'FSBO Home'}</strong>
            <small>
             <span className="tag good" style={{fontSize:'10px',padding:'2px 6px',marginRight:'6px'}}>NO REALTOR</span>
             {r.city ? `${r.city}, ${r.state} ` : ''}ZIP: {r.zipCode||'USA'} · 📞 {r.phone||r.email}
            </small>
           </span>
           <ChevronRight size={17}/>
          </button>
         ))}
        </div>
       ):(
        <Empty icon={Users} title="No FSBO leads pulled yet" text="Click 'Pull FSBO Leads' above to load fresh nationwide homeowner leads with verified phone numbers or emails."/>
       )}
      </section>
     </>}

     {(tab==='leads'||tab==='research')&&<section className="panel">
      <div className="section-title">
       <div>
        <h2>
         {tab==='research'?'Needs Review Queue':'Qualified FSBO Leads for Realtors'} 
         <span className="count good">{tab==='research'?research.length:prospects.length}</span>
        </h2>
        <p>
         {tab==='research'?'Records with missing phone/email or pending verification.':
          'Strictly verified homeowner leads: owner phone or email provided, zero real estate agents.'}
        </p>
       </div>
       <div className="actions">
        <button className="primary" disabled={!current||busy||loading} onClick={collect}>
         <Play size={15}/> Pull Fresh Leads
        </button>
        {current?.crmWebhookUrl&&(
         <button className="secondary" disabled={!current||busy||loading} onClick={()=>dispatchToCrm()}>
          <CheckCheck size={15}/> Push to CRM {zipFilter?`(${zipFilter})`:''}
         </button>
        )}
        <button className="secondary" disabled={!current||busy} onClick={()=>exportRows('csv')}>
         <Download size={15}/> Export CSV
        </button>
        <button className="secondary" disabled={!current||busy} onClick={()=>exportRows('json')}>
         <Download size={15}/> Export JSON
        </button>
       </div>
      </div>

      <div className="filters">
       <label className="search">
        <Search size={17}/>
        <input aria-label="Search opportunities" placeholder="Search address, ZIP code, city, phone, email, or owner name" value={query} onChange={e=>setQuery(e.target.value)}/>
       </label>

       {/* ZIP Code Area Quick Filter for Realtor CRM Routing */}
       <select aria-label="Filter by ZIP code" value={zipFilter} onChange={e=>setZipFilter(e.target.value)}>
        <option value="">All ZIP Code Areas ({uniqueZips.length} areas)</option>
        {uniqueZips.map(z=><option key={z} value={z}>ZIP: {z}</option>)}
       </select>

       <select aria-label="Filter lead type" value={filter} onChange={e=>setFilter(e.target.value)}>
        <option value="all">All Intent Types</option>
        <option value="CONFIRMED_FSBO">Confirmed FSBO</option>
        <option value="POSSIBLE_SELLER_INTENT">Seller Intent Signals</option>
       </select>
      </div>

      {rows.length?(
       (() => {
        const pageSize = 10;
        const totalPages = Math.ceil(rows.length / pageSize) || 1;
        const currentPage = Math.min(leadPage, totalPages);
        const paginatedRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);
        return (
         <div className="table-wrap">
          <table>
           <thead>
            <tr>
             <th>Property & Area</th>
             <th>ZIP Area</th>
             <th>Owner Contact Info</th>
             <th>Agent Status</th>
             <th>Published</th>
             <th/>
            </tr>
           </thead>
           <tbody>
            {paginatedRows.map(r=>(
             <tr key={r.sourceUrl}>
              <td>
               <button className="record-title" onClick={()=>setSelected(r)}>
                {r.title||r.address||'FSBO Home'}
               </button>
               <small>{r.address||'Address upon request'} · {r.city ? `${r.city}, ` : ''}{r.state||'US'}</small>
              </td>
              <td>
               <span className="tag" style={{fontWeight:600}}>
                <MapPin size={12} style={{display:'inline',marginRight:'3px'}}/>
                {r.zipCode||'USA'}
               </span>
              </td>
              <td>
               <div style={{display:'flex',flexDirection:'column',gap:'2px'}}>
                {r.phone&&<span><Phone size={12} style={{display:'inline',marginRight:'4px'}}/>{r.phone}</span>}
                {r.email&&<small><Mail size={11} style={{display:'inline',marginRight:'4px'}}/>{r.email}</small>}
                {!r.phone&&!r.email&&<small className="muted">No contact published</small>}
               </div>
              </td>
              <td>
               <span className="tag good" style={{fontSize:'11px'}}>✓ ZERO REALTOR</span>
              </td>
              <td>{date(r.publishedAt||r.lastSeen)}</td>
              <td>
               <button className="icon-button" aria-label="View evidence" onClick={()=>setSelected(r)}>
                <ArrowUpRight size={17}/>
               </button>
              </td>
             </tr>
            ))}
           </tbody>
          </table>
          <div className="table-footer" style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 16px',background:'#f8fafc',borderTop:'1px solid #e2e8f0',flexWrap:'wrap',gap:'8px'}}>
           <div style={{fontSize:'13px',color:'#64748b'}}>
            Showing {paginatedRows.length} of {rows.length} leads {zipFilter ? `in ZIP ${zipFilter}` : 'nationwide'}
           </div>
           <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <button className="button" style={{padding:'4px 12px',fontSize:'12px',background:'#fff',border:'1px solid #cbd5e1',borderRadius:'4px'}} disabled={currentPage <= 1} onClick={()=>setLeadPage(p=>Math.max(1, p-1))}>
             ‹ Prev
            </button>
            <span style={{fontSize:'12px',fontWeight:600,color:'#334155'}}>
             Page {currentPage} of {totalPages}
            </span>
            <button className="button" style={{padding:'4px 12px',fontSize:'12px',background:'#fff',border:'1px solid #cbd5e1',borderRadius:'4px'}} disabled={currentPage >= totalPages} onClick={()=>setLeadPage(p=>Math.min(totalPages, p+1))}>
             Next ›
            </button>
           </div>
          </div>
         </div>
        );
       })()
      ):(
       <Empty icon={tab==='research'?Search:Users} title={query||zipFilter?'No matching leads in this area':'No leads pulled yet'} text="Use 'Pull Fresh Leads' or import data from your social media scrapers."/>
      )}
     </section>}

     {tab==='campaigns'&&<div className="campaign-grid">
      {campaigns.map(c=>(
       <section className="panel campaign-card" key={c.id}>
        <div className="section-title">
         <span className="listing-icon"><Layers size={22}/></span>
         <span className="tag good">FSBO Realtor Feed</span>
        </div>
        <h2>{c.name}</h2>
        <p>{c.zips.length ? `Targeting ${c.zips.length} specific ZIP codes` : 'Nationwide targeting (All USA ZIP areas)'}</p>
        <dl>
         <div><dt>Geography</dt><dd>{c.zips.length?`${c.zips.length} ZIP codes`:'All 50 States (Nationwide)'}</dd></div>
         <div><dt>Freshness</dt><dd>{c.maxAgeDays} days</dd></div>
         <div><dt>Contact Rule</dt><dd>{c.contactPolicy==='either'?'Email or Phone (Guaranteed)':c.contactPolicy}</dd></div>
         <div><dt>Realtor Filter</dt><dd><strong>Strict Suppression (100% Realtor Free)</strong></dd></div>
        </dl>
        <button className="secondary full" disabled={busy} onClick={()=>setEditor({...c})}>
         <SlidersHorizontal size={15}/> Edit rules
        </button>
       </section>
      ))}
      <button className="new-campaign-card" onClick={()=>setEditor({...preset,name:'New Regional FSBO Campaign'})}>
       <Plus size={26}/>
       <strong>Add a Regional Campaign</strong>
       <span>Target specific ZIP codes or states for specialized realtor teams.</span>
      </button>
     </div>}

     {tab==='sources'&&<>
      <section className="panel">
       <div className="section-title">
        <div>
         <h2>Real-Time Lead Sources & Feeds</h2>
         <p>Automated ingestion and social media syndication channels powering your Realtor CRM.</p>
        </div>
        <button className="primary" disabled={!current||busy} onClick={collect}>
         <Play size={15}/> Pull Next Batch
        </button>
       </div>
       {sourceStatuses.map(([title,type,status,desc,href])=>(
        <div className="source-row" key={title}>
         <span className="listing-icon"><Database size={19}/></span>
         <div>
          <h3>{title} {href&&<a href={href} target="_blank" rel="noreferrer"><ExternalLink size={13}/></a>}</h3>
          <small>{type}</small>
          <p>{desc}</p>
         </div>
         <span className={'tag '+(status==='Active'||status==='Ready'?'good':'muted')}>{status}</span>
        </div>
       ))}
      </section>

      <section className="panel">
       <div className="section-title">
        <div>
         <h2>Recent Collection Activity</h2>
         <p>Log of real-time pulling operations and lead qualification results.</p>
        </div>
       </div>
       {runs.length?(
        <div className="activity-list">
         {runs.map(r=>(
          <div key={r.id}>
           <span className={r.status==='success'?'status-icon good':'status-icon warning'}>
            {r.status==='success'?<Check size={17}/>:<AlertCircle size={17}/>}
           </span>
           <div>
            <strong>{r.status==='success'?`${r.prospects} FSBO prospects with phone/email · ${r.checked} evaluated`:r.error}</strong>
            <p>{r.message}</p>
            <small>{date(r.created)} · {r.requests} source requests</small>
           </div>
          </div>
         ))}
        </div>
       ):(
        <Empty icon={Activity} title="No activity recorded yet" text="Click 'Pull Next Batch' to run the first live collection."/>
       )}
      </section>
     </>}

     {tab==='integrations'&&<>
      <section className="panel integration-intro">
       <Link2 size={26}/>
       <h2>Realtor CRM Integration & Webhook Ingestion</h2>
       <p>Seamlessly connect this lead engine to your Realtor CRM website to route leads by ZIP code, or send leads from social media scrapers.</p>
       <div className="actions">
        <button className="primary" disabled={!current||busy} onClick={()=>exportRows('csv')}>
         <Download size={16}/> Download All Prospects (CSV)
        </button>
        <button className="secondary" disabled={!current||busy} onClick={()=>exportRows('json')}>
         <Download size={16}/> Download All (JSON)
        </button>
        <button className="secondary" disabled={!current||busy} onClick={()=>setImportOpen(true)}>
         <Upload size={16}/> Import Leads JSON
        </button>
       </div>
      </section>

      <div className="two-col">
       <section className="panel">
        <h2>1. Inbound Webhook (Push Leads from Scrapers)</h2>
        <p>Send leads from Facebook Marketplace scrapers, Apify, Zapier, or custom scripts straight into your site:</p>
        <div style={{background:'#0f172a',padding:'12px',borderRadius:'8px',fontSize:'12px',color:'#e2e8f0',fontFamily:'monospace',overflowX:'auto',margin:'10px 0'}}>
         POST /api/engine?action=webhook&campaign={active}
         <br/>Content-Type: application/json
        </div>
        <p style={{fontSize:'12px',color:'#64748b',marginBottom:'12px'}}>Payload format:</p>
        <pre style={{background:'#0f172a',padding:'12px',borderRadius:'8px',fontSize:'11px',color:'#38bdf8',overflowX:'auto'}}>
{`{
  "title": "FSBO: 3 Bed 2 Bath in Austin",
  "description": "Selling my home by owner. No realtors. Call 512-555-0199",
  "phone": "512-555-0199",
  "email": "owner@austin.test",
  "address": "123 Main St",
  "city": "Austin",
  "state": "TX",
  "zipCode": "78701",
  "country": "US"
}`}
        </pre>
        <button className="secondary" onClick={()=>copyToClipboard(`/api/engine?action=webhook&campaign=${active}`,'webhook')}>
         {copied==='webhook'?<CheckCheck size={14}/>:<Copy size={14}/>} {copied==='webhook'?'Copied Webhook URL':'Copy Webhook Endpoint'}
        </button>
       </section>

       <section className="panel">
        <h2>2. Outbound Realtor CRM Query by ZIP Code</h2>
        <p>Your Realtor CRM website can pull fresh qualified leads filtered by each realtor&apos;s assigned ZIP code area:</p>
        <div style={{background:'#0f172a',padding:'12px',borderRadius:'8px',fontSize:'12px',color:'#e2e8f0',fontFamily:'monospace',overflowX:'auto',margin:'10px 0'}}>
         GET /api/engine?action=export&queue=prospect&format=json&zipCode=78701
        </div>
        <p style={{fontSize:'13px',lineHeight:'1.5'}}>
         <strong>Features for your Realtor CRM:</strong>
         <br/>• Filters out realtors automatically so your agents never contact other agents.
         <br/>• Guarantees direct owner contact (phone number and/or email).
         <br/>• Standardized fields: <code>name</code>, <code>phone</code>, <code>email</code>, <code>address</code>, <code>zipCode</code>, <code>state</code>.
        </p>
        <div style={{marginTop:'15px'}}>
         <button className="secondary" onClick={()=>copyToClipboard(`/api/engine?action=export&campaign=${active}&queue=prospect&format=json&zipCode=78701`,'crm')}>
          {copied==='crm'?<CheckCheck size={14}/>:<Copy size={14}/>} {copied==='crm'?'Copied API URL':'Copy ZIP Pull Endpoint'}
         </button>
        </div>
       </section>
      </div>
     </>}

     <footer>
      NYRAVA REALTOR LEAD ENGINE <span>Nationwide FSBO homeowner signals · 100% Realtor Free · Phone & Email Verified</span>
     </footer>
    </div>
   </main>

   {/* Campaign Rules Editor */}
   {editor&&<div className="overlay" role="presentation">
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="campaignTitle">
     <div className="section-title">
      <h2 id="campaignTitle">{editor.id?'Edit Campaign Rules':'Create FSBO Campaign'}</h2>
      <button className="icon-button" aria-label="Close campaign editor" onClick={()=>setEditor(null)} disabled={busy}><X size={20}/></button>
     </div>
     <form onSubmit={save}>
      <label>Campaign Name
       <input required maxLength={80} value={editor.name} onChange={e=>setEditor({...editor,name:e.target.value})}/>
      </label>
      <div className="form-grid">
       <label>Product / Lead Type
        <select value={editor.kind} onChange={e=>setEditor({...editor,kind:e.target.value})}>
         <option value="fsbo">FSBO / Homeowners Selling Directly</option>
         <option value="custom">Custom Seller Criteria</option>
        </select>
       </label>
       <label>Owner Contact Requirement
        <select value={editor.contactPolicy} onChange={e=>setEditor({...editor,contactPolicy:e.target.value})}>
         <option value="either">Phone OR Email (Recommended)</option>
         <option value="phone">Phone Number Required</option>
         <option value="email">Email Required</option>
         <option value="both">Both Phone AND Email Required</option>
        </select>
       </label>
      </div>
      <div className="form-grid">
       <label>Target US ZIP Codes <small>Leave blank for all USA nationwide</small>
        <input value={editor.zips.join(', ')} onChange={e=>setEditor({...editor,zips:e.target.value.split(',').map(x=>x.trim())})} placeholder="Leave blank for nationwide, or enter: 78701, 33629"/>
       </label>
       <label>Listing Freshness (Days)
        <input type="number" min={1} max={90} required value={editor.maxAgeDays} onChange={e=>setEditor({...editor,maxAgeDays:Number(e.target.value)})}/>
       </label>
      </div>
      <div style={{borderTop:'1px solid #e2e8f0',paddingTop:'12px',marginTop:'10px'}}>
       <h3 style={{fontSize:'13px',fontWeight:700,marginBottom:'8px',color:'#1e293b'}}>Realtor CRM Automated Connection (Optional):</h3>
       <label>Your CRM Webhook or API Endpoint URL
        <input value={editor.crmWebhookUrl||''} onChange={e=>setEditor({...editor,crmWebhookUrl:e.target.value})} placeholder="https://your-crm-website.com/api/leads or Zapier webhook"/>
       </label>
       <div className="form-grid">
        <label>CRM API Key or Bearer Token
         <input value={editor.crmApiKey||''} onChange={e=>setEditor({...editor,crmApiKey:e.target.value})} placeholder="Optional API Key"/>
        </label>
        <label className="checkbox" style={{marginTop:'26px'}}>
         <input type="checkbox" checked={!!editor.crmAutoForward} onChange={e=>setEditor({...editor,crmAutoForward:e.target.checked})}/>
         Auto-forward leads to CRM on every pull
        </label>
       </div>
      </div>
      <p className="form-note">All incoming leads are automatically verified to be real homeowners with ZERO brokerages, MLS listings, or real estate agents.</p>
      {error&&<p className="inline-error" role="alert">{error}</p>}
      <button className="primary full" disabled={busy}>{busy?'Saving…':'Save Campaign'}</button>
     </form>
    </section>
   </div>}

   {/* Import Modal */}
   {importOpen&&<div className="overlay">
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="importTitle">
     <div className="section-title">
      <h2 id="importTitle">Import FSBO Leads</h2>
      <button className="icon-button" aria-label="Close import" disabled={busy} onClick={()=>setImportOpen(false)}><X size={20}/></button>
     </div>
     <form onSubmit={importRows}>
      <p>Import JSON array of lead objects from external scrapers or spreadsheets. Includes automatic realtor detection and phone/email extraction.</p>
      <label>Upload JSON file
       <input type="file" accept=".json,application/json" onChange={async e=>{
        const f=e.target.files?.[0];
        if(f){
         if(f.size>280000){setError('File must be under 280 KB.');return;}
         setImportText(await f.text());
        }
       }}/>
      </label>
      <label>Or paste JSON
       <textarea className="json-input" value={importText} onChange={e=>setImportText(e.target.value)} placeholder={'[\n  {\n    "title": "FSBO Home",\n    "description": "Call owner 512-555-0199. No realtors.",\n    "zipCode": "78701",\n    "phone": "512-555-0199"\n  }\n]'}/>
      </label>
      <label className="checkbox">
       <input type="checkbox" checked={permission} onChange={e=>setPermission(e.target.checked)} required/> 
       I confirm these are public homeowner records to be qualified for my realtors.
      </label>
      {error&&<p className="inline-error" role="alert">{error}</p>}
      <button className="primary full" disabled={busy||!permission||!importText}>{busy?'Importing…':'Import and Qualify'}</button>
     </form>
    </section>
   </div>}

   {/* Drawer for Lead Details and Evidence */}
   {selected&&<div className="overlay drawer-overlay">
    <section className="drawer" role="dialog" aria-modal="true" aria-labelledby="evidenceTitle">
     <div className="section-title">
      <span className="pill">FSBO OWNER DETAILS</span>
      <button className="icon-button" aria-label="Close evidence" onClick={()=>setSelected(null)}><X size={22}/></button>
     </div>
     <h2 id="evidenceTitle">{selected.title||selected.address||'FSBO Homeowner Lead'}</h2>
     <p>{selected.address} · {selected.city ? `${selected.city}, ` : ''}{selected.state} {selected.zipCode}</p>
     
     <div className="actions" style={{marginTop:'8px',marginBottom:'16px'}}>
      <span className="tag good">✓ 100% REALTOR FREE</span>
      <span className="tag">{label(selected.listingClass)}</span>
      <span className="tag" style={{fontWeight:600}}><MapPin size={12} style={{display:'inline',marginRight:'2px'}}/> ZIP: {selected.zipCode||'USA'}</span>
     </div>

     <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:'8px',padding:'14px',marginBottom:'18px'}}>
      <h3 style={{fontSize:'13px',fontWeight:700,marginBottom:'8px',color:'#334155'}}>Owner Contact Information:</h3>
      <div style={{display:'flex',flexDirection:'column',gap:'6px',fontSize:'14px'}}>
       {selected.phone&&(
        <div><strong>Phone:</strong> <a href={`tel:${selected.phone}`} style={{color:'#2563eb',fontWeight:600}}>{selected.phone}</a></div>
       )}
       {selected.email&&(
        <div><strong>Email:</strong> <a href={`mailto:${selected.email}`} style={{color:'#2563eb',fontWeight:600}}>{selected.email}</a></div>
       )}
       {selected.name&&(
        <div><strong>Owner Name:</strong> {selected.name}</div>
       )}
      </div>
     </div>

     <h3>Why It Matched Your Criteria</h3>
     <p>{selected.relevanceReason}</p>
     <blockquote>{selected.relevanceQuote}</blockquote>
     
     {selected.reasons.length>0&&<div className="notice neutral">{selected.reasons.join(' · ')}</div>}

     {selected.sources.map((s:any)=>(
      <section className="evidence-source" key={s.sourceUrl}>
       <a href={s.sourceUrl} target="_blank" rel="noreferrer">Open Original Source Link <ExternalLink size={14}/></a>
       <small className="source-url">{s.sourceUrl}</small>
       <p>Published: {date(s.publishedAt)}<br/>Last seen: {date(s.lastSeen)}</p>
       {s.evidence.map((e:any,i:number)=>(
        <div className="evidence-quote" key={i}>
         <strong>{e.value}</strong>
         <blockquote>{e.excerpt}</blockquote>
        </div>
       ))}
       <details>
        <summary>Source Listing Text</summary>
        <p className="source-text">{s.description}</p>
       </details>
       <button className="danger-text" disabled={busy} onClick={()=>{
        if(!confirm('Suppress this lead from your CRM pipeline?'))return;
        act(async()=>{
         await api('remove',{sourceUrl:s.sourceUrl});
         setSelected(null);
         await load();
         setMessage('Lead suppressed.');
        });
       }}>Remove & Suppress</button>
      </section>
     ))}
    </section>
   </div>}
  </div>
 );
}

function Empty({icon:Icon,title,text}:any){
 return (
  <div className="empty">
   <span className="empty-icon"><Icon size={26}/></span>
   <h3>{title}</h3>
   <p>{text}</p>
  </div>
 );
}
