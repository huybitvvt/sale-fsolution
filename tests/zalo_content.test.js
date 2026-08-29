const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadApi() {
  const context = {
    __STREAL_ZALO_TEST_MODE__: true,
    Date,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  const source = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'zalo-content.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'zalo-content.js' });
  return context.__STREAL_ZALO_TEST_API__;
}

const api = loadApi();

test('recognises Vietnamese Zalo date separators instead of messages', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.parseTimelineMarker('T3 18/08/2026'))),
    { kind: 'date', text: 'T3 18/08/2026', day: 18, month: 8, year: 2026, dateKey: '2026-08-18' },
  );
  assert.equal(api.parseTimelineMarker('CN 23/08/2026').dateKey, '2026-08-23');
  assert.equal(api.parseTimelineMarker('18:43 18/08/2026').kind, 'datetime');
  assert.equal(api.parseTimelineMarker('18:43 18/08/2026').dateKey, '2026-08-18');
  assert.equal(api.parseTimelineMarker('bác còn gpt k ạ'), null);
});

test('builds a full display timestamp from the nearest date separator', () => {
  const marker = api.parseTimelineMarker('17:58');
  assert.equal(api.markerDisplayTime(marker, '2026-08-18'), '17:58 18/8/2026');
  assert.match(api.markerIso(marker, '2026-08-18'), /^2026-08-18T/);
});

test('rejects header controls and generic DOM ids', () => {
  assert.equal(api.cleanTitleText('Duyy'), 'Duyy');
  assert.equal(api.cleanTitleText('NGƯỜI LẠ'), '');
  assert.equal(api.cleanTitleText('Gửi yêu cầu kết bạn tới người này'), '');
  assert.equal(api.stableAttributeValue('id', 'chatView'), '');
  assert.equal(api.stableAttributeValue('data-id', 'conversation-row-12345'), 'conversation-row-12345');
  assert.equal(api.stableAttributeValue('data-uid', 'user-stable-key'), 'user-stable-key');
});

test('uses a loose minute key to merge the same bubble across scans', () => {
  const base = { direction: 'outgoing', text: 'bác còn gpt k ạ', media_urls: [] };
  assert.equal(
    api.messageContentKey({ ...base, display_time: '17:58' }, { looseTime: true }),
    api.messageContentKey({ ...base, display_time: '17:58 18/8/2026' }, { looseTime: true }),
  );
});
