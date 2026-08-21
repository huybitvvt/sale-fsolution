import assert from 'node:assert/strict';
import test from 'node:test';

await import('../browser-extension/facebook-post-reference.js');

const { postIdFromUrl, isPostReferenceUrl } = globalThis.STREALFacebookPostReference;

test('extracts Facebook post IDs from supported permalink formats', () => {
  assert.equal(postIdFromUrl('https://www.facebook.com/groups/123/posts/987654321/'), '987654321');
  assert.equal(postIdFromUrl('https://www.facebook.com/phan.hieu/posts/pfbid02AbCdEf123/'), 'pfbid02AbCdEf123');
  assert.equal(postIdFromUrl('https://m.facebook.com/permalink.php?story_fbid=456789&id=123'), '456789');
  assert.equal(postIdFromUrl('https://www.facebook.com/photo/?fbid=7654321'), '7654321');
  assert.equal(postIdFromUrl('https://www.facebook.com/share/p/AbC_123xyz/'), 'AbC_123xyz');
});

test('treats Facebook post share links as browser-readable references', () => {
  assert.equal(postIdFromUrl('https://www.facebook.com/share/p/opaque-code/'), 'opaque-code');
  assert.equal(isPostReferenceUrl('https://www.facebook.com/share/p/opaque-code/'), true);
});
