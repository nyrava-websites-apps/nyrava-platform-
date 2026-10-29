import test from 'node:test';
import assert from 'node:assert/strict';
import {prospectFromListing, reviewedPayload, ingestionResult} from '../collector-policy.mjs';
const source={url:'https://dallas.craigslist.org/jsonsearch/reo',zip:'75034'};
test('listing without contact remains unverified and never receives a fabricated phone, name or ZIP',()=>{
  const a=prospectFromListing({PostingID:123,PostingTitle:'House by owner'},source);
  assert.equal(a.phone,null);assert.equal(a.ownerName,null);assert.equal(a.zipCode,null);
  assert.equal(reviewedPayload(a),null);
  assert.equal(a.externalId,prospectFromListing({PostingID:123,PostingTitle:'House by owner'},source).externalId);
});
test('a real visible contact is preserved without being labeled verified',()=>{
  const p=prospectFromListing({PostingID:123,PostingTitle:'Call 214-222-3333 or owner@example.test',PostalCode:'75034'},source);
  assert.equal(p.phone,'214-222-3333');assert.equal(p.email,'owner@example.test');assert.equal(p.zipCode,'75034');
  assert.equal(reviewedPayload(p),null);
});
test('no-agent preference is retained and blocks reviewed delivery',()=>{
  const p=prospectFromListing({PostingID:123,PostingTitle:'No agents please'},source);
  assert.equal(p.doNotContact,true);assert.equal(reviewedPayload(p),null);
});
test('no source identifier or malicious source URL is not synthesized',()=>{
  assert.equal(prospectFromListing({PostingTitle:'House'},source),null);
  assert.equal(prospectFromListing({PostingTitle:'House',PostingURL:'https://evil.example.test/123'},source),null);
});
test('review requires real dates, contact, owner name, ZIP and recipient permission',()=>{
  const at=new Date().toISOString();
  const p={externalId:'cl-1',ownerName:'Real Owner',phone:'214-222-3333',zipCode:'75034',sourceUrl:'https://dallas.craigslist.org/reo/d/123.html',verification:{method:'Phone',recipientEmail:'realtor@example.test',consentText:'Authorized contact by the named Realtor.',reviewReference:'human-review-1',contactVerifiedAt:at,intentVerifiedAt:at,consentCapturedAt:at,adminReviewedAt:at}};
  const payload=reviewedPayload(p);assert.equal(payload.ContactVerifiedAt,at);assert.equal(payload.ConsentRecipient,'realtor@example.test');
  assert.equal(reviewedPayload({...p,verification:{...p.verification,contactVerifiedAt:null}}),null);
});
test('existing records do not count as new ingestion',()=>{
  assert.equal(ingestionResult(200),'existing');assert.equal(ingestionResult(201),'created');
  assert.throws(()=>ingestionResult(403));assert.throws(()=>ingestionResult(409));
});
