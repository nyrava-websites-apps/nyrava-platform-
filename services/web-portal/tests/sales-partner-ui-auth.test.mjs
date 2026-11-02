import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../public/sales-partners.js',import.meta.url),'utf8');const apiSource=source.slice(source.indexOf('async function api('),source.indexOf('\nfunction message'));
function client(response){const context=vm.createContext({fetch:async()=>response,Error,JSON});vm.runInContext(apiSource+';this.requestApi=api;',context);return context.requestApi;}
test('Signed-out empty 401 response displays a sign-in message',async()=>{await assert.rejects(client(new Response(null,{status:401}))('/session'),/Sign in to your Nyrava account/)});
test('Empty successful response never claims an operation succeeded',async()=>{await assert.rejects(client(new Response(null,{status:200}))('/tickets',{}),/operation was not confirmed/)});
test('Valid successful response remains available to the UI',async()=>{const result=await client(new Response('{"id":42}',{status:200}))('/tickets',{});assert.equal(result.id,42)});
