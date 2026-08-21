import assert from 'node:assert/strict';
import test from 'node:test';

await import('../browser-extension/facebook-network-capture.js');

const {
  extractGraphqlPostReference,
  isCreatePostGraphqlRequest,
} = globalThis.STREALFacebookNetworkCapture;

test('recognizes Facebook composer GraphQL mutations', () => {
  assert.equal(isCreatePostGraphqlRequest(
    'https://www.facebook.com/api/graphql/',
    'fb_api_req_friendly_name=ComposerStoryCreateMutation&doc_id=123',
  ), true);
  assert.equal(isCreatePostGraphqlRequest(
    'https://www.facebook.com/api/graphql/',
    'doc_id=123&variables=%7B%7D',
  ), false);
  assert.equal(isCreatePostGraphqlRequest('https://www.facebook.com/ajax/notifications', ''), false);
});

test('extracts a permalink returned by a composer GraphQL response', () => {
  const response = JSON.stringify({
    data: {
      story_create: {
        story: {
          legacy_fbid: '987654321012345',
          url: 'https://www.facebook.com/groups/123456789/posts/987654321012345/?__cft__=abc',
        },
      },
    },
  });
  assert.deepEqual(extractGraphqlPostReference(response, {
    targetType: 'group', targetId: '123456789',
  }), {
    postId: '987654321012345',
    postUrl: 'https://www.facebook.com/groups/123456789/posts/987654321012345/',
    score: 170,
  });
});

test('builds a group permalink when GraphQL only returns post_id', () => {
  const reference = extractGraphqlPostReference(
    '{"data":{"story_create":{"post_id":"987654321012345"}}}',
    { targetType: 'group', targetId: '123456789' },
  );
  assert.equal(reference.postId, '987654321012345');
  assert.equal(reference.postUrl, 'https://www.facebook.com/groups/123456789/posts/987654321012345/');
});

test('ignores unrelated GraphQL object ids', () => {
  const reference = extractGraphqlPostReference(
    '{"data":{"viewer":{"actor":{"id":"987654321012345"}}}}',
    { targetType: 'group', targetId: '123456789' },
  );
  assert.equal(reference, null);
});

test('prefers the created story id over the actor legacy id', () => {
  const reference = extractGraphqlPostReference(JSON.stringify({
    data: {
      actor: { legacy_fbid: '111111111111111' },
      story_create: { story: { legacy_fbid: '987654321012345' } },
    },
  }), { targetType: 'group', targetId: '123456789' });
  assert.equal(reference.postId, '987654321012345');
});
