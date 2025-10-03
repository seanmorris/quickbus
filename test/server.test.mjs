import test from 'node:test';
import assert from 'node:assert';
import { Server } from '../Server.mjs';

test('Server.handleMessageEvent replies with result', async () => {
  const handler = { add(a, b) { return a + b; } };
  const server = new Server(handler);
  const messages = [];
  const fakeSource = {
    postMessage: (msg, origin) => messages.push({ msg, origin })
  };

  await server.handleMessageEvent({
    data: { action: 'add', token: 'token123', params: [2, 3] },
    source: fakeSource
  });

  assert.strictEqual(messages.length, 1);
  assert.deepStrictEqual(messages[0].msg, { re: 'token123', result: 5, error: undefined });
});