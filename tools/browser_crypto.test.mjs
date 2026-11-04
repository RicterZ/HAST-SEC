import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {sha256,randomUUID} from '../web/browser_crypto.mjs';
test('HTTP SHA-256 fallback matches native across padding boundaries and multiple blocks',async()=>{
 for(const length of [0,1,3,55,56,63,64,65,127,128,1024,1000000]) {
  const bytes=Uint8Array.from({length},(_,i)=>(i*13+7)%256);
  const expected=createHash('sha256').update(bytes).digest('hex');
  assert.equal(await sha256(bytes,{}),expected,'fallback length '+length);
  assert.equal(await sha256(bytes,webcrypto),expected,'native length '+length);
 }
 assert.equal(await sha256(new TextEncoder().encode('abc'),{}),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('hashing a typed-array slice respects its offset and length',async()=>{
 const bytes=new Uint8Array([0,1,2,3,4,5]).subarray(1,4);
 assert.equal(await sha256(bytes,{}),createHash('sha256').update(bytes).digest('hex'));
});
test('HTTP session UUID uses getRandomValues with RFC 4122 version and variant',()=>{
 let calls=0;
 const cryptoProvider={getRandomValues(bytes){calls++;bytes.fill(255);return bytes;}};
 assert.equal(randomUUID(cryptoProvider),'ffffffff-ffff-4fff-bfff-ffffffffffff');assert.equal(calls,1);
 const httpCrypto={getRandomValues:bytes=>webcrypto.getRandomValues(bytes)};
 const ids=new Set(Array.from({length:100},()=>randomUUID(httpCrypto)));
 assert.equal(ids.size,100);for(const id of ids)assert.match(id,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
 assert.equal(randomUUID({randomUUID:()=> 'native'}),'native');
});
