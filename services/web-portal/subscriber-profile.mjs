import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const root='/api/subscriber/profile';
const keys={photo:'profilePhotoUrl',banner:'bannerUrl',logo:'brokerageLogoUrl'};
const detailKeys=['professionalTitle','phoneNumber','businessAddress','businessCity','businessState','businessZipCode','licenseNumber','licenseState','website','facebookUrl','instagramUrl','linkedInUrl','biography'];
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';

// Files live in the existing persistent data volume. Never infer ownership of
// the old shared profile-data.json: it may contain another subscriber's details.
export function registerSubscriberProfile(app,{CRM_SERVICE_URL,dataDir,fetchImpl=fetch}){
 const directory=path.join(dataDir,'subscriber-profiles');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const filename=id=>path.join(directory,String(id)+'.json');
 function read(id){try{return JSON.parse(fs.readFileSync(filename(id),'utf8'));}catch(e){if(e.code==='ENOENT')return {};throw e;}}
 function write(id,value){const tmp=filename(id)+'.'+randomUUID()+'.tmp';try{fs.writeFileSync(tmp,JSON.stringify(value),{mode:0o600});fs.renameSync(tmp,filename(id));}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
 function profile(me){const p=read(me.id),agency=me.employee?read(me.workspaceId):p;
  const result={fullName:p.fullName||'',email:me.email,role:me.role,brokerage:agency.brokerage||'',details:p.details||{},communications:p.communications||{},planCode:me.subscriptionPlan,subscriptionStatus:me.subscriptionStatus,activeZips:String(me.subscribedZipCodes||'').split(/[,;\s]+/).filter(Boolean),agencies:me.employee?[{staffId:String(me.workspaceId),name:agency.brokerage||'',realtorName:agency.fullName||'',...agency.details}]:[]};
  for(const [kind,key] of Object.entries(keys))result[key]=(kind==='photo'?p:agency).images?.[kind]?root+'/'+kind:null;
  return result;
 }
 const wrap=fn=>async(req,res,next)=>{try{await fn(req,res,next);}catch(e){console.error('[Subscriber profile]',e.message);res.status(500).json({error:'Your profile could not be saved or loaded. Please retry.'});}};
 app.use(root,wrap(async(req,res,next)=>{
  res.set({'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
  const response=await fetchImpl(CRM_SERVICE_URL+'/api/auth/me',{headers:{Cookie:req.headers.cookie||'',Authorization:req.headers.authorization||''},signal:AbortSignal.timeout(10000)});
  if(!response.ok)return res.status(response.status).json({error:'Sign in to manage your profile.'});
  const me=await response.json();
  if(!Number.isSafeInteger(me.id)||me.id<1||!Number.isSafeInteger(me.workspaceId)||me.workspaceId<1||!['Owner','Admin','Employee','RealtorSubscriber','BusinessEmployee'].includes(me.role))return res.status(403).json({error:'Realtor or team account required.'});
  me.employee=['Employee','BusinessEmployee'].includes(me.role);req.profileIdentity=me;
  if(!['GET','HEAD'].includes(req.method)){
   const origin=req.get('origin');if(origin&&origin!==req.protocol+'://'+req.get('host')&&origin!=='https://home.nyrava.com')return res.status(403).json({error:'Use the profile page on Nyrava to make changes.'});
  }
  next();
 }));
 app.get(root,wrap((req,res)=>res.json(profile(req.profileIdentity))));
 app.put(root,express.json({limit:'32kb'}),wrap((req,res)=>{
  const me=req.profileIdentity,p=read(me.id),body=req.body||{};
  for(const key of ['fullName',...(!me.employee?['brokerage']:[])])if(key in body)p[key]=text(body[key],160);
  if(body.details){p.details={...p.details};for(const k of detailKeys)if(k in body.details&&!(me.employee&&['businessAddress','businessCity','businessState','businessZipCode'].includes(k)))p.details[k]=text(body.details[k],k==='biography'?2000:300);}
  if(body.communications){p.communications={...p.communications};for(const k of ['workEmail','signature'])if(k in body.communications)p.communications[k]=text(body.communications[k],k==='signature'?1500:254);}
  write(me.id,p);res.json(profile(me));
 }));
 app.get(root+'/:kind',wrap((req,res)=>{
  const {kind}=req.params;if(!keys[kind])return res.sendStatus(404);
  const me=req.profileIdentity,p=read(me.employee&&kind!=='photo'?me.workspaceId:me.id),image=p.images?.[kind];
  if(!image)return res.status(404).end();
  res.type(image.type).send(Buffer.from(image.data,'base64'));
 }));
 app.post(root+'/:kind',express.raw({type:'multipart/form-data',limit:'2100kb'}),wrap((req,res)=>{
  const {kind}=req.params,me=req.profileIdentity;if(!keys[kind])return res.sendStatus(404);
  if(me.employee&&kind!=='photo')return res.status(403).json({error:'Only your Realtor can change agency images.'});
  const boundary=/boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(req.get('content-type')||'');
  if(!boundary||!Buffer.isBuffer(req.body))return res.status(400).json({error:'Choose a PNG or JPEG image.'});
  const marker=Buffer.from('--'+(boundary[1]||boundary[2])),body=req.body;
  let cursor=0,image=null,count=0;
  while((cursor=body.indexOf(marker,cursor))!==-1){cursor+=marker.length;if(body.subarray(cursor,cursor+2).toString()==='--')break;
   const end=body.indexOf(Buffer.from('\r\n'+marker.toString()),cursor);if(end<0)break;
   const headerEnd=body.indexOf('\r\n\r\n',cursor);if(headerEnd<0||headerEnd>end)return res.status(400).json({error:'Invalid image upload.'});
   const headers=body.subarray(cursor,headerEnd).toString();
   if(/name="image"/.test(headers)){count++;image=body.subarray(headerEnd+4,end);}cursor=end+2;
  }
  if(count!==1||!image?.length||image.length>2097152)return res.status(400).json({error:'Choose one PNG or JPEG image up to 2 MB.'});
  const png=image.length>32&&image.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&image.subarray(12,16).toString()==='IHDR'&&image.readUInt32BE(16)>0&&image.readUInt32BE(20)>0;
  const jpeg=image.length>4&&image[0]===255&&image[1]===216&&image[2]===255&&image[image.length-2]===255&&image[image.length-1]===217;
  if(!png&&!jpeg)return res.status(400).json({error:'That file is not a PNG or JPEG image. Convert HEIC or other formats first.'});
  const p=read(me.id);p.images={...p.images,[kind]:{type:png?'image/png':'image/jpeg',data:image.toString('base64')}};write(me.id,p);res.json(profile(me));
 }));
 app.delete(root+'/:kind',wrap((req,res)=>{
  const {kind}=req.params,me=req.profileIdentity;if(!keys[kind])return res.sendStatus(404);
  if(me.employee&&kind!=='photo')return res.status(403).json({error:'Only your Realtor can change agency images.'});
  const p=read(me.id);if(p.images)delete p.images[kind];write(me.id,p);res.json(profile(me));
 }));
 app.use(root,(error,req,res,next)=>res.status(error.status||400).json({error:error.status===413?'Choose an image up to 2 MB.':'Invalid profile request.'}));
}
