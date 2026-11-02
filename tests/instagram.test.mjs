import test from 'node:test';
import assert from 'node:assert/strict';
import { postCode, assetUrl, instagramPost, instagramAsset, captionTitle, CHUNK } from '../server/instagram.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
// A fake Graph API: two pages of /me/media, one carousel with an image, a video and a video without media_url.
function graphApi(calls = []) {
  return async url => {
    const u = new URL(url);
    calls.push(u.pathname + (u.searchParams.has('after') ? '?after' : ''));
    assert.equal(u.searchParams.get('access_token'), 'TOKEN');
    if (u.pathname === '/v26.0/me/media' && !u.searchParams.has('after'))
      return json({ data: [{ id: '1', shortcode: 'AAAAA1', media_type: 'IMAGE', media_url: 'https://scontent.cdninstagram.com/a.jpg', caption: '첫 글' }], paging: { next: 'https://graph.instagram.com/v26.0/me/media?after=x&access_token=TOKEN' } });
    if (u.pathname === '/v26.0/me/media')
      return json({ data: [{ id: '2', shortcode: 'DS7HWFfCXIl', media_type: 'CAROUSEL_ALBUM', caption: '\n  전시 기록 · 2025\n둘째 줄' }] });
    if (u.pathname === '/v26.0/2/children')
      return json({ data: [
        { id: '21', media_type: 'IMAGE', media_url: 'https://scontent-ssn1-1.cdninstagram.com/1.jpg' },
        { id: '22', media_type: 'VIDEO', media_url: 'https://video.fbcdn.net/2.mp4', thumbnail_url: 'https://scontent.cdninstagram.com/2.jpg' },
        { id: '23', media_type: 'VIDEO', thumbnail_url: 'https://scontent.cdninstagram.com/3.jpg' },
      ] });
    return json({ error: { message: 'unknown', code: 100 } }, 400);
  };
}

test('post links: /p/, /reel/, with a username, instagr.am; others are refused', () => {
  assert.equal(postCode('https://www.instagram.com/p/DS7HWFfCXIl/'), 'DS7HWFfCXIl');
  assert.equal(postCode('https://www.instagram.com/reel/CjR_yIwpMKZ/?igsh=abc'), 'CjR_yIwpMKZ');
  assert.equal(postCode('https://www.instagram.com/jaeyeonkim.kr/p/DRcCGFRCYWi/?img_index=2'), 'DRcCGFRCYWi');
  assert.equal(postCode(' https://instagr.am/p/B4IWh8EHPvK '), 'B4IWh8EHPvK');
  for (const bad of ['https://www.instagram.com/jaeyeonkim.kr/', 'http://www.instagram.com/p/DS7HWFfCXIl/', 'https://instagram.com.evil.example/p/DS7HWFfCXIl/', 'nope'])
    assert.throws(() => postCode(bad), { status: 400 }, bad);
});

test('a carousel is found on a later page; images, videos and stills of licensed-audio videos in order', async () => {
  const calls = [];
  const post = await instagramPost('https://www.instagram.com/p/DS7HWFfCXIl/', { token: 'TOKEN', fetchImpl: graphApi(calls) });
  assert.deepEqual(post, { code: 'DS7HWFfCXIl', title: '전시 기록 · 2025', items: [
    { type: 'image', url: 'https://scontent-ssn1-1.cdninstagram.com/1.jpg' },
    { type: 'video', url: 'https://video.fbcdn.net/2.mp4' },
    { type: 'image', url: 'https://scontent.cdninstagram.com/3.jpg', still: true },
  ] });
  assert.deepEqual(calls, ['/v26.0/me/media', '/v26.0/me/media?after', '/v26.0/2/children']);
  const single = await instagramPost('https://www.instagram.com/p/AAAAA1/', { token: 'TOKEN', fetchImpl: graphApi() });
  assert.deepEqual(single.items, [{ type: 'image', url: 'https://scontent.cdninstagram.com/a.jpg' }]);
});

test('the slide title is the caption’s first line, cut at a word', () => {
  assert.equal(captionTitle('\n  전시 기록 · 2025\n둘째 줄'), '전시 기록 · 2025');
  assert.equal(captionTitle('올해 3월부터 한국과학기술원 KAIST 산업디자인학과 강이룬(@rrrrroon) 교수님의 시각도구연구실(@vil)에서'), '올해 3월부터 한국과학기술원 KAIST 산업디자인학과…');
  assert.equal(captionTitle(), '');
});

test('missing token, someone else’s post and an expired token say so', async () => {
  await assert.rejects(instagramPost('https://www.instagram.com/p/DS7HWFfCXIl/', { token: '', fetchImpl: graphApi() }), { status: 503 });
  await assert.rejects(instagramPost('https://www.instagram.com/p/ZZZZZZ/', { token: 'TOKEN', fetchImpl: graphApi() }), { status: 404, message: /연결된 인스타그램 계정/ });
  await assert.rejects(instagramPost('https://www.instagram.com/p/ZZZZZZ/', { token: 'TOKEN', fetchImpl: async () => json({ error: { code: 190, message: 'expired' } }, 400) }), { message: /토큰이 만료/ });
  // A paging link that leaves graph.instagram.com is not followed.
  const away = async () => json({ data: [], paging: { next: 'https://example.com/steal' } });
  await assert.rejects(instagramPost('https://www.instagram.com/p/ZZZZZZ/', { token: 'TOKEN', fetchImpl: away }), { message: /API 주소가 아닙니다/ });
});

test('files come only from Instagram’s CDN, in parts with the total size', async () => {
  assert.equal(assetUrl('https://scontent-ssn1-1.cdninstagram.com/v/x.jpg?oh=1').hostname, 'scontent-ssn1-1.cdninstagram.com');
  for (const bad of ['https://example.com/x.jpg', 'http://scontent.cdninstagram.com/x.jpg', 'https://cdninstagram.com.evil.example/x.jpg', 'https://user:pw@scontent.cdninstagram.com/x.jpg', 'https://scontent.cdninstagram.com:8443/x.jpg'])
    assert.throws(() => assetUrl(bad), { status: 400 }, bad);
  const video = Buffer.alloc(CHUNK + 1000, 7);
  const cdn = async (url, init) => {
    assert.equal(init.redirect, 'error');
    const [, a, b] = init.headers.Range.match(/bytes=(\d+)-(\d+)/).map(Number);
    const part = video.subarray(a, b + 1);
    return new Response(part, { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${a}-${a + part.length - 1}/${video.length}` } });
  };
  const first = await instagramAsset('https://video.fbcdn.net/2.mp4', 0, { fetchImpl: cdn });
  assert.equal(first.bytes.length, CHUNK); assert.equal(first.total, video.length); assert.equal(first.type, 'video/mp4');
  const second = await instagramAsset('https://video.fbcdn.net/2.mp4', 1, { fetchImpl: cdn });
  assert.equal(second.bytes.length, 1000);
  // A CDN that ignores Range: the part is cut from the whole file.
  const whole = async () => new Response(Buffer.alloc(10, 1), { status: 200, headers: { 'Content-Type': 'image/jpeg' } });
  assert.deepEqual(await instagramAsset('https://scontent.cdninstagram.com/1.jpg', 0, { fetchImpl: whole }), { bytes: Buffer.alloc(10, 1), type: 'image/jpeg', total: 10 });
  await assert.rejects(instagramAsset('https://scontent.cdninstagram.com/1.html', 0, { fetchImpl: async () => new Response('<b>', { headers: { 'Content-Type': 'text/html' } }) }), { status: 415 });
  await assert.rejects(instagramAsset('https://video.fbcdn.net/big.mp4', 0, { fetchImpl: async () => new Response(Buffer.alloc(4), { status: 206, headers: { 'Content-Type': 'video/mp4', 'Content-Range': 'bytes 0-3/50000000' } }) }), { status: 413 });
  await assert.rejects(instagramAsset('https://video.fbcdn.net/2.mp4', 10, { fetchImpl: cdn }), { status: 400 });
});
