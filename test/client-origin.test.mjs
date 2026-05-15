import test from 'node:test';
import assert from 'node:assert';
import { Client } from '../Client.mjs';

test('client posts message with correct origin', async () => {
  const fakeMessages = [];
  const fakeRecipient = new (class extends EventTarget { postMessage = (msg, origin) => fakeMessages.push({ msg, origin }) });
  const origin = 'https://example.com';
  // Stub UUID to a predictable token
  const uuidStub = crypto.randomUUID;
  crypto.randomUUID = () => 'fixed-token';

  const cl = new Client({to: fakeRecipient, origin});
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

test('iframe client listens on the provided from target', async () => {
  const fakeMessages = [];
  const fakeFrame = {
    contentWindow: {
      postMessage: (msg, origin) => fakeMessages.push({ msg, origin })
    }
  };
  const fakeWindow = new EventTarget();
  const uuidStub = crypto.randomUUID;
  crypto.randomUUID = () => 'frame-token';

  const cl = Client.forIframe(fakeFrame, 'https://child.example.com', fakeWindow);
  cl.openFile('/tmp/demo.txt');
  await Promise.resolve();

  crypto.randomUUID = uuidStub;

  assert.strictEqual(fakeMessages.length, 1);
  assert.deepStrictEqual(fakeMessages[0], {
    msg: { action: 'openFile', params: ['/tmp/demo.txt'], token: 'frame-token' },
    origin: 'https://child.example.com'
  });
});

test('service-worker-registration client listens on navigator.serviceWorker by default', async () => {
  const fakeMessages = [];
  const fakeActiveWorker = {
    postMessage: msg => fakeMessages.push(msg)
  };
  const fakeServiceWorker = new EventTarget();
  const originalNavigator = globalThis.navigator;
  const uuidStub = crypto.randomUUID;

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      ...(originalNavigator ?? {}),
      serviceWorker: fakeServiceWorker
    }
  });

  crypto.randomUUID = () => 'service-worker-token';

  try
  {
    const client = Client.forServiceWorkerRegistration({
      active: fakeActiveWorker
    });
    const request = client.sayHello('Worker');

    queueMicrotask(() => {
      fakeServiceWorker.dispatchEvent(new MessageEvent('message', {
        data: {
          re: 'service-worker-token',
          result: 'Hello, Worker!'
        }
      }));
    });

    assert.strictEqual(await request, 'Hello, Worker!');
    assert.deepStrictEqual(fakeMessages[0], {
      action: 'sayHello',
      params: ['Worker'],
      token: 'service-worker-token'
    });
  }
  finally
  {
    crypto.randomUUID = uuidStub;

    if(originalNavigator === undefined)
    {
      delete globalThis.navigator;
    }
    else
    {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: originalNavigator
      });
    }
  }
});

test('service-worker-registration client requires an active worker', () => {
  assert.throws(
    () => Client.forServiceWorkerRegistration({active: null}),
    /ServiceWorker registration client requires an active worker\./
  );
});
