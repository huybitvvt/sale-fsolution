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

test('only classifies explicit Zalo group headers as groups', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.classifyConversationKind({ text: 'Duyy NGƯỜI LẠ Nhóm chung (1) Gửi yêu cầu kết bạn' }))),
    { type: 'private', isGroup: false, evidence: 'private_header' },
  );
  assert.equal(api.classifyConversationKind({ text: 'Duyy NGƯỜI LẠ' }).type, 'private');
  assert.equal(api.classifyConversationKind({ text: 'Nhóm khách hàng 25 thành viên' }).isGroup, true);
  assert.equal(api.classifyConversationKind({ text: 'Nhóm khách hàng' }).type, 'unknown');
});

test('allows private chats without weakening group approval', () => {
  assert.equal(api.requiresGroupApproval({ type: 'private' }), false);
  assert.equal(api.requiresGroupApproval({ type: 'group' }), true);
  assert.equal(api.requiresGroupApproval({ type: 'unknown' }), true);
});

test('refines known-contact chats from visible sender layout', () => {
  const unknown = { type: 'unknown', isGroup: false, evidence: 'no_group_evidence' };
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.refineConversationKind(unknown, [
      { direction: 'incoming', sender_name: 'Khách hàng', sender_id: 'avatar-one' },
      { direction: 'outgoing', sender_name: 'Nhân viên' },
    ]))),
    { type: 'private', isGroup: false, evidence: 'private_message_layout' },
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.refineConversationKind(unknown, [
      { direction: 'incoming', sender_name: 'Thành viên A', sender_id: 'avatar-a' },
    ]))),
    { type: 'group', isGroup: true, evidence: 'group_message_senders' },
  );
  assert.equal(api.refineConversationKind(unknown, []).type, 'unknown');
});

test('uses a loose minute key to merge the same bubble across scans', () => {
  const base = { direction: 'outgoing', text: 'bác còn gpt k ạ', media_urls: [] };
  assert.equal(
    api.messageContentKey({ ...base, display_time: '17:58' }, { looseTime: true }),
    api.messageContentKey({ ...base, display_time: '17:58 18/8/2026' }, { looseTime: true }),
  );
});

test('detects only the latest incoming bubble for automatic suggestions', () => {
  const signal = api.latestIncomingSignal([
    { direction: 'incoming', sender_id: 'customer-a', text: 'Tin cũ', display_time: '10:00', media_urls: [], message_id: 'm1' },
    { direction: 'outgoing', sender_id: 'sale', text: 'Sale trả lời', display_time: '10:01', media_urls: [], message_id: 'm2' },
    { direction: 'incoming', sender_id: 'customer-a', text: 'Giá này đắt quá', display_time: '10:02', media_urls: [], message_id: 'm3' },
  ]);
  assert.equal(signal.messageId, 'm3');
  assert.equal(signal.text, 'Giá này đắt quá');
  assert.match(signal.key, /Giá này đắt quá/);
  assert.equal(api.latestIncomingSignal([{ direction: 'outgoing', text: 'Chỉ có sale' }]), null);
  assert.equal(api.latestIncomingSignal([
    { direction: 'incoming', text: 'Khách đã hỏi' },
    { direction: 'outgoing', text: 'Sale đã trả lời' },
  ]), null);
});

test('removes Zalo reaction artifacts and the rendered bubble timestamp', () => {
  const marker = api.parseTimelineMarker('15:08');
  assert.equal(
    api.cleanMessageText('400 b 15:08 /-strong /-heart :> :o :-(( :-h', marker),
    '400 b',
  );
  assert.equal(api.stripZaloIconArtifacts('Nội dung thật /-heart :o'), 'Nội dung thật');
});

test('extracts lazy image sources from srcset and computed CSS values', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.srcsetCandidates('https://cdn.example/small.jpg 1x, https://cdn.example/large.jpg 2x'))),
    ['https://cdn.example/small.jpg', 'https://cdn.example/large.jpg'],
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(api.cssImageUrls('image-set(url("blob:https://chat.zalo.me/a") 1x, url(https://cdn.example/a.jpg) 2x)'))),
    ['blob:https://chat.zalo.me/a', 'https://cdn.example/a.jpg'],
  );
});

test('separates a Zalo group sender label from the message body', () => {
  assert.equal(api.senderNameText('Hoàng Dương Nguyên', 'UPCODE_SPA ĐỒ HIỆU LUXURY'), 'Hoàng Dương Nguyên');
  assert.equal(api.senderNameText('@Nguyễn Đắc Công', 'UPCODE_SPA ĐỒ HIỆU LUXURY'), '');
  assert.equal(api.stripSenderPrefix('Hoàng Dương Nguyên Em ơi', 'Hoàng Dương Nguyên'), 'Em ơi');
  assert.equal(api.stripSenderPrefix('Nguyễn Đắc Công em nghe ạ', 'Nguyễn Đắc Công'), 'em nghe ạ');
});
