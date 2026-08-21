import assert from 'node:assert/strict';
import test from 'node:test';

await import('../browser-extension/facebook-post-reference.js');

const { postIdFromUrl, isPostReferenceUrl } = globalThis.STREALFacebookPostReference;

test('extracts Facebook post IDs from supported permalink formats', () => {
  assert.equal(postIdFromUrl('https://www.facebook.com/groups/123/posts/987654321/'), '987654321');
  assert.equal(postIdFromUrl('https://www.facebook.com/phan.hieu/posts/pfbid02AbCdEf123/'), 'pfbid02AbCdEf123');
  assert.equal(postIdFromUrl('https://m.facebook.com/permalink.php?story_fbid=456789&id=123'), '456789');
  assert.equal(postIdFromUrl('https://m.facebook.com/permalink.php?story_fbid=pfbid02AbCdEf&id=123'), 'pfbid02AbCdEf');
  assert.equal(postIdFromUrl('https://www.facebook.com/groups/897227121487685?multi_permalinks=pfbid02x123'), 'pfbid02x123');
  assert.equal(postIdFromUrl('https://www.facebook.com/groups/897227121487685?multi_permalinks=12345678'), '12345678');
  assert.equal(postIdFromUrl('https://www.facebook.com/photo/?fbid=7654321'), '7654321');
  assert.equal(postIdFromUrl('https://www.facebook.com/share/p/AbC_123xyz/'), 'AbC_123xyz');
  assert.equal(postIdFromUrl('https://www.facebook.com/share/v/AbC_123xyz/'), 'AbC_123xyz');
  assert.equal(postIdFromUrl('https://www.facebook.com/reel/9988776655/'), '9988776655');
});

test('treats Facebook post share links as browser-readable references', () => {
  assert.equal(postIdFromUrl('https://www.facebook.com/share/p/opaque-code/'), 'opaque-code');
  assert.equal(isPostReferenceUrl('https://www.facebook.com/share/p/opaque-code/'), true);
});

test('rejects pending content review URLs', () => {
  assert.equal(postIdFromUrl('https://www.facebook.com/groups/513812408802363/my_pending_content'), '');
  assert.equal(isPostReferenceUrl('https://www.facebook.com/groups/513812408802363/my_pending_content'), false);
  assert.equal(postIdFromUrl('https://www.facebook.com/groups/513812408802363/my_pending_content?fbid=12345'), '');
  assert.equal(isPostReferenceUrl('https://www.facebook.com/groups/513812408802363/my_pending_content?fbid=12345'), false);
});
