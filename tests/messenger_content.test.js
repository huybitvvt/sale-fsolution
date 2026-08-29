const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadApi() {
  const context = {
    __STREAL_MESSENGER_TEST_MODE__: true,
    Date,
    URL,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  const source = fs.readFileSync(path.join(__dirname, '..', 'browser-extension', 'messenger-content.js'), 'utf8');
  vm.runInNewContext(source, context, { filename: 'messenger-content.js' });
  return context.__STREAL_MESSENGER_TEST_API__;
}

const api = loadApi();

test('recognises Messenger timestamps instead of message content', () => {
  assert.equal(api.isTimestampText('15:08'), true);
  assert.equal(api.isTimestampText('Hôm qua lúc 15:08'), true);
  assert.equal(api.isTimestampText('Hẹn lúc 15:08'), false);
});

test('merges the same Messenger bubble collected in multiple scroll rounds', () => {
  const messages = new Map();
  api.mergeMessages(messages, [{
    message_id: 'round-1', direction: 'incoming', text: 'Xin chào', display_time: '15:08', capture_round: 1,
  }]);
  api.mergeMessages(messages, [{
    message_id: 'round-2', direction: 'incoming', text: 'Xin chào', display_time: '15:08', capture_round: 2,
  }]);

  assert.equal(messages.size, 1);
  assert.equal([...messages.values()][0].message_id, 'round-1');
});
