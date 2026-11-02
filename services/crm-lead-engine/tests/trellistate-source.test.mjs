import test from 'node:test';
import assert from 'node:assert/strict';
import {trellistateProspect,collectTrellistate} from '../trellistate-source.mjs';
const listing={id:'lst_123',url:'https://trellistate.com/listings/lst_123',status:'active',listing_type:'sale',property_type:'house',country:'US',postal_code:'77002',title:'FSBO - owner selling house',description:'Call 713-555-0144'};
test('public FSBO listing with printed phone can enter review',()=>{
 const p=trellistateProspect(listing);
 assert.equal(p.phone,'713-555-0144');
 assert.equal(p.zipCode,'77002');
 assert.equal(p.ownerName,null);
 assert.equal(p.source,'Trellistate');
});
test('structured private contact field never qualifies',()=>{
 assert.equal(trellistateProspect({...listing,description:'Contact via listing form',contact:{phone:'713-555-0144'}}),null);
});
test('non-FSBO and listings without contacts are rejected',()=>{
 assert.equal(trellistateProspect({...listing,title:'Agent listing'}),null);
 assert.equal(trellistateProspect({...listing,description:'Open house Saturday'}),null);
});
test('untrusted source URLs rejected',()=>{
 assert.equal(trellistateProspect({...listing,url:'https://other.example/listings/lst_123'}),null);
});
test('bounded live public API maps only qualifying records',async()=>{
 const rows=await collectTrellistate(async(url)=>({
   ok:true,text:async()=>JSON.stringify({data:[listing,{...listing,id:'lst_124',description:'No phone available'}]})
 }));
 assert.equal(rows.length,1);
});
