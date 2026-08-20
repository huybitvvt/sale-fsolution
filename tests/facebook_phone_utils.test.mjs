import assert from 'node:assert/strict';
import test from 'node:test';

await import('../browser-extension/facebook-phone-utils.js');

const { normalizePhone, extractPhones } = globalThis.STREALFacebookPhoneUtils;

test('normalizes supported Vietnamese phone formats', () => {
  for (const input of ['0912345678', '0912 345 678', '0912.345.678', '0912-345-678', '+84 912 345 678']) {
    assert.equal(normalizePhone(input), '0912345678');
  }
});

test('rejects obvious non-phone numeric strings', () => {
  assert.equal(normalizePhone('1234567890'), '');
  assert.equal(normalizePhone('0123456789'), '');
  assert.deepEqual(extractPhones('Mã đơn 1234567890, giá 12.345.678 đồng'), []);
});

test('extracts unique phone numbers from comments', () => {
  assert.deepEqual(extractPhones('Gọi 0912 345 678 hoặc +84 987-654-321'), ['0912345678', '0987654321']);
});
