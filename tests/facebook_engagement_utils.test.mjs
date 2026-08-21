import assert from 'node:assert/strict';
import test from 'node:test';

await import('../browser-extension/facebook-engagement-utils.js');

const { parseCompactCount, extractEngagementMetrics } = globalThis.STREALFacebookEngagementUtils;

test('parses localized compact Facebook counters', () => {
  assert.equal(parseCompactCount('1,2K'), 1200);
  assert.equal(parseCompactCount('2,5 nghìn'), 2500);
  assert.equal(parseCompactCount('1.234'), 1234);
  assert.equal(parseCompactCount('3 triệu'), 3000000);
});

test('extracts reactions comments and shares from Facebook labels', () => {
  assert.deepEqual(extractEngagementMetrics([
    '1,2K lượt bày tỏ cảm xúc',
    '34 bình luận',
    '5 lượt chia sẻ',
  ]), {
    reaction_count: 1200,
    comment_count: 34,
    share_count: 5,
  });
});

test('keeps missing counters unknown instead of inventing zero', () => {
  assert.deepEqual(extractEngagementMetrics(['Thích', 'Bình luận', 'Chia sẻ']), {
    reaction_count: null,
    comment_count: null,
    share_count: null,
  });
});
