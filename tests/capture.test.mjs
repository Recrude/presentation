import test from 'node:test';
import assert from 'node:assert/strict';
import { captureTarget, isPublicAddress } from '../api/capture.mjs';
test('capture takes any public HTTPS site and rejects private destinations',()=>{
 for(const raw of ['http://ved.kr/','file:///etc/passwd','https://127.0.0.1/','https://ved.kr:8443/','https://user:pass@ved.kr/','https://[::1]/','https://10.0.0.1/']) assert.throws(()=>captureTarget(raw),raw);
 assert.equal(captureTarget('https://r777-dice-roll.vercel.app/').kind,'web');
 assert.equal(captureTarget('https://ved.kr/').kind,'web');
 assert.equal(captureTarget('https://www.youtube-nocookie.com/embed/QIAcSGkOLDk').id,'QIAcSGkOLDk');
 for(const ip of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.1.1','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1']) assert.equal(isPublicAddress(ip),false,ip);
 assert.equal(isPublicAddress('1.1.1.1'),true);assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
});
