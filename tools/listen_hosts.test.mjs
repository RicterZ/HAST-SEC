import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedHosts,validateListenHost} from '../service/listen_hosts.mjs';
const interfaces={lo:[{address:'127.0.0.1',family:'IPv4'}],en0:[{address:'192.168.1.42',family:'IPv4'},{address:'fe80::1',family:'IPv6'}]};
test('default host stays local and wildcard allows actual interface IPs only',()=>{
 const local=allowedHosts('127.0.0.1',8769,interfaces);
 assert(local.has('localhost:8769'));assert(!local.has('192.168.1.42:8769'));
 const lan=allowedHosts('0.0.0.0',8769,interfaces);
 assert(lan.has('192.168.1.42:8769'));assert(!lan.has('evil.example:8769'));
 assert(!lan.has('192.168.1.42:9999'));assert(!lan.has('0.0.0.0:8769'));
 assert(!lan.has('[fe80::1]:8769'));
});
test('specific addresses and IPv6 use explicit authorities',()=>{
 assert(allowedHosts('192.168.1.42',80,{}).has('192.168.1.42:80'));
 assert(allowedHosts('::',8769,interfaces).has('[fe80::1]:8769'));
 assert(allowedHosts('::1',8769,{}).has('[::1]:8769'));
});
test('invalid bind addresses fail before server initialization',()=>{
 for(const host of ['0.0.0.0','127.0.0.1','::1','localhost'])assert.equal(validateListenHost(host),host);
 for(const host of ['',undefined,'evil.example','http://0.0.0.0','127.0.0.1:8769'])assert.throws(()=>validateListenHost(host),/HOST/);
});
