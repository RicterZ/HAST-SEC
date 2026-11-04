import {isIP} from 'node:net';
import {networkInterfaces} from 'node:os';

export function validateListenHost(host) {
 if(host!=='localhost'&&!isIP(host))throw Error('HOST must be an IP address or localhost.');
 return host;
}

export function allowedHosts(host,port,interfaces=networkInterfaces()) {
 const addresses=new Set(['127.0.0.1','localhost','::1']);
 if(host==='0.0.0.0'||host==='::') {
  for(const entries of Object.values(interfaces))for(const entry of entries??[]) {
   if(host==='::'||entry.family==='IPv4')addresses.add(entry.address);
  }
 }else addresses.add(host);
 // Browsers use the destination IP in Host, never the wildcard bind address.
 return new Set([...addresses].map(address=>(isIP(address)===6?'['+address+']':address)+':'+port));
}
