import assert from 'node:assert/strict';
import test from 'node:test';

await import('../browser-extension/facebook-post-reference.js');

const { postIdFromUrl, isPostReferenceUrl } = globalThis.STREALFacebookPostReference;

test('extracts Facebook post IDs from supported permalink formats', () => {
  assert.equal(postIdFromUrl('https://www.facebook.com/groups/123/posts/987654321/'), '987654321');
  assert.equal(postIdFromUrl('https://m.facebook.com/permalink.php?story_fbid=456789&id=123'), '456789');
  assert.equal(postIdFromUrl('https://www.facebook.com/photo/?fbid=7654321'), '7654321');
});

test('does not treat opaque Facebook share links as post references', () => {
  assert.equal(postIdFromUrl('https://www.facebook.com/share/p/opaque-code/'), '');
  assert.equal(isPostReferenceUrl('https://www.facebook.com/share/p/opaque-code/'), false);
});
