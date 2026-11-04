// Web Crypto digest/randomUUID require a secure context; LAN HTTP is not one.
const SHA256_K=new Uint32Array([
 0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
 0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
 0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
 0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
 0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
 0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
 0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
 0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
]);
const rotate=(value,bits)=>(value>>>bits)|(value<<(32-bits));
function sha256Fallback(bytes) {
 const state=new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
 const padded=new Uint8Array(Math.ceil((bytes.length+9)/64)*64);
 padded.set(bytes);padded[bytes.length]=0x80;
 const view=new DataView(padded.buffer),bitLength=bytes.length*8;
 view.setUint32(padded.length-8,Math.floor(bitLength/2**32));view.setUint32(padded.length-4,bitLength>>>0);
 const words=new Uint32Array(64);
 for(let offset=0;offset<padded.length;offset+=64) {
  for(let i=0;i<16;i++)words[i]=view.getUint32(offset+i*4);
  for(let i=16;i<64;i++) {
   const x=words[i-15],y=words[i-2];
   words[i]=words[i-16]+(rotate(x,7)^rotate(x,18)^(x>>>3))+words[i-7]+(rotate(y,17)^rotate(y,19)^(y>>>10));
  }
  let [a,b,c,d,e,f,g,h]=state;
  for(let i=0;i<64;i++) {
   const first=(h+(rotate(e,6)^rotate(e,11)^rotate(e,25))+((e&f)^(~e&g))+SHA256_K[i]+words[i])>>>0;
   const second=((rotate(a,2)^rotate(a,13)^rotate(a,22))+((a&b)^(a&c)^(b&c)))>>>0;
   h=g;g=f;f=e;e=(d+first)>>>0;d=c;c=b;b=a;a=(first+second)>>>0;
  }
  [a,b,c,d,e,f,g,h].forEach((value,i)=>{state[i]+=value;});
 }
 return Array.from(state,value=>value.toString(16).padStart(8,'0')).join('');
}
export async function sha256(data,cryptoProvider=globalThis.crypto) {
 const bytes=ArrayBuffer.isView(data)?new Uint8Array(data.buffer,data.byteOffset,data.byteLength):new Uint8Array(data);
 if(cryptoProvider?.subtle) {
  const digest=await cryptoProvider.subtle.digest('SHA-256',bytes);
  return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,'0')).join('');
 }
 return sha256Fallback(bytes);
}
export function randomUUID(cryptoProvider=globalThis.crypto) {
 if(cryptoProvider?.randomUUID)return cryptoProvider.randomUUID();
 // getRandomValues is available on HTTP too; do not weaken session randomness.
 const bytes=cryptoProvider.getRandomValues(new Uint8Array(16));
 bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;
 const hex=Array.from(bytes,value=>value.toString(16).padStart(2,'0'));
 return [hex.slice(0,4).join(''),hex.slice(4,6).join(''),hex.slice(6,8).join(''),hex.slice(8,10).join(''),hex.slice(10).join('')].join('-');
}
