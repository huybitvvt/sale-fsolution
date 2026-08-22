import assert from 'node:assert/strict';
import test from 'node:test';

await import('../browser-extension/facebook-post-data.js');

const { parseCountToken, extractMetricCounts } = globalThis.STREALFacebookPostData;

test('parses plain and compact Facebook counters', () => {
  assert.equal(parseCountToken('1.234'), 1234);
  assert.equal(parseCountToken('1,2K'), 1200);
  assert.equal(parseCountToken('2,5 triệu'), 2500000);
});

test('extracts Vietnamese Facebook engagement labels', () => {
  assert.deepEqual(extractMetricCounts([
    '25 người đã bày tỏ cảm xúc về tin này',
    '8 bình luận',
    '3 lượt chia sẻ',
  ]), { reactionCount: 25, commentCount: 8, shareCount: 3 });
});

test('extracts English Facebook engagement labels without using unrelated numbers', () => {
  assert.deepEqual(extractMetricCounts(['Excel 30 ngày', '1.2K reactions', '42 comments', '7 shares']), {
    reactionCount: 1200,
    commentCount: 42,
    shareCount: 7,
  });
});

test('extracts a reaction count when Facebook puts the number after the control label', () => {
  assert.deepEqual(extractMetricCounts([
    'Xem ai đã bày tỏ cảm xúc 1',
    '1 bình luận',
  ]), {
    reactionCount: 1,
    commentCount: 1,
    shareCount: null,
  });
});

test('extracts counters when Facebook renders the label before the number', () => {
  assert.deepEqual(extractMetricCounts([
    'Thích 1',
    'Bình luận 1',
    'Chia sẻ 2',
  ]), {
    reactionCount: 1,
    commentCount: 1,
    shareCount: 2,
  });
});
