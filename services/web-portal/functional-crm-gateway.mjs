import express from 'express';

// Registered before legacy handlers. Pass through CRM errors and commits; never
// substitute successful empty lists or synthesized contacts on upstream failures.
export function registerFunctionalCrmGateway(app,{CRM_SERVICE_URL}) {
  async function call(req,path,method=req.method,body=req.body){
    const response=await fetch(CRM_SERVICE_URL+path,{
      method,redirect:'manual',signal:AbortSignal.timeout(15000),
      headers:{Accept:'application/json',Cookie:req.headers.cookie||'',Authorization:req.headers.authorization||'',...(body===undefined?{}:{'Content-Type':'application/json'})},
      body:['GET','HEAD'].includes(method)||body===undefined?undefined:JSON.stringify(body)
    });
    return response;
  }
  async function forward(req,res,path,method=req.method,body=req.body){
    res.set('Cache-Control','no-store');
    try{
      const upstream=await call(req,path,method,body);
      const content=await upstream.text();
      if(upstream.status>=300&&upstream.status<400)return res.status(502).json({error:'Unexpected CRM redirect. Sign in again.'});
      if(content&&!upstream.headers.get('content-type')?.includes('json'))return res.status(502).json({error:'CRM returned an invalid response.'});
      res.status(upstream.status);if(content)res.type('json');return res.send(content);
    }catch(e){return res.status(502).json({error:'The CRM service is unavailable. Your operation was not confirmed. Refresh before retrying.'});}
  }
  app.all('/api/workbench/*',express.json(),(req,res)=>forward(req,res,req.originalUrl));
  app.get('/api/crm/workspace',(req,res)=>forward(req,res,'/api/workbench/dashboard'));
  app.get(['/api/auth/me','/api/me'],async(req,res)=>{
    try{
      const upstream=await call(req,'/api/auth/me');
      if(!upstream.ok)return res.status(upstream.status).json({error:'Sign in to access your workspace.'});
      const data=await upstream.json();
      const owner=['Owner','RealtorSubscriber'].includes(data.role);
      res.set('Cache-Control','no-store').json({...data,originalRole:data.role,role:owner?'RealtorSubscriber':data.role==='Employee'?'BusinessEmployee':data.role,planCode:data.subscriptionPlan||null,canManage:owner||data.role==='Admin',activeZips:String(data.subscribedZipCodes||'').split(/[,;\s]+/).filter(Boolean)});
    }catch{return res.status(502).json({error:'Authentication service unavailable.'});}
  });
  app.get('/api/dashboard/summary',async(req,res)=>{
    try{
      const upstream=await call(req,'/api/auth/me');if(!upstream.ok)return res.status(upstream.status).json({error:'Sign in to access your workspace.'});
      const me=await upstream.json();res.set('Cache-Control','no-store').json({subscribedZips:String(me.subscribedZipCodes||'').split(/[,;\s]+/).filter(Boolean).map(zipCode=>({zipCode,slotNumber:null})),plan:me.subscriptionPlan,planStatus:me.subscriptionStatus,monthlyPrice:me.subscriptionPrice,currency:me.currency});
    }catch{return res.status(502).json({error:'CRM summary unavailable.'});}
  });
  app.get('/api/team/workspace',(req,res)=>forward(req,res,'/api/workbench/team'));
  app.get('/api/team/employee/memberships',(req,res)=>forward(req,res,'/api/workbench/memberships'));
  app.post('/api/team/leads/:id/assign',express.json(),(req,res)=>forward(req,res,'/api/workbench/contacts/'+encodeURIComponent(req.params.id)+'/assign'));
  app.post('/api/team/staff',express.json(),(req,res)=>forward(req,res,'/api/team/invitations'));
  app.delete('/api/team/staff/:id',(req,res)=>forward(req,res,'/api/team/'+encodeURIComponent(req.params.id)+'/deactivate','POST'));
  app.post('/api/team/staff/:id/active',(req,res)=>forward(req,res,'/api/team/'+encodeURIComponent(req.params.id)+'/activate','POST'));
  app.post('/api/crm/tasks/:id/complete',(req,res)=>forward(req,res,'/api/activities/'+encodeURIComponent(req.params.id)+'/complete','PUT'));
  for(const [suffix,action]of [['notes','note'],['tasks','task'],['appointments','appointment']])
    app.post('/api/crm/leads/:id/'+suffix,express.json(),(req,res)=>forward(req,res,'/api/workbench/contacts/platform/'+encodeURIComponent(req.params.id)+'/action','POST',{...req.body,action}));
  // Unsupported legacy actions must not acknowledge a database write or delivery.
  app.all(['/api/team/staff/*','/api/crm/quality-reports*','/api/crm/distribution*'],async(req,res)=>{
    try{const me=await call(req,'/api/auth/me');if(!me.ok)return res.status(me.status).json({error:'Sign in to access this operation.'});}
    catch{return res.status(502).json({error:'CRM unavailable.'});}
    res.status(501).json({error:'This operation is not connected to the CRM database.'});
  });
}
