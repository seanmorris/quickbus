import test from 'node:test';
import assert from 'node:assert';
import { Client } from '../source/Client.js';

test('client posts message with correct origin', async () => {
  const fakeMessages = [];
  const fakeRecipient = { postMessage: (msg, origin) => fakeMessages.push({ msg, origin }) };
  const origin = 'https://example.com';
  // Stub UUID to a predictable token
  const uuidStub = crypto.randomUUID;
  crypto.randomUUID = () => 'fixed-token';

  const cl = new Client(Promise.resolve(fakeRecipient), origin);
  cl.testAction(1, 2);
  // wait for postMessage to be invoked in a microtask
  await Promise.resolve();

  crypto.randomUUID = uuidStub;

  assert.strictEqual(fakeMessages.length, 1);
  assert.deepStrictEqual(fakeMessages[0], {
    msg: { action: 'testAction', params: [1, 2], token: 'fixed-token' },
    origin
  });
});