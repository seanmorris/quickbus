import test from 'node:test';
import assert from 'node:assert';
import { Client } from '../Client.mjs';

test('client method calls return abortable thenables', async () => {
	const fakeMessages = [];
	const fakeRecipient = {
		postMessage: msg => fakeMessages.push(msg)
	};
	const fakeWindow = new EventTarget();
	const uuidStub = crypto.randomUUID;

	try
	{
		crypto.randomUUID = () => 'abortable-token';

		const client = new Client({to: fakeRecipient, from: fakeWindow});
		const request = client.sayHello('World');

		assert.strictEqual(typeof request.abort, 'function');

		queueMicrotask(() => {
			fakeWindow.dispatchEvent(new MessageEvent('message', {
				data: {
					re: 'abortable-token'
					, result: 'Hello, World!'
				}
			}));
		});

		assert.strictEqual(await request, 'Hello, World!');
		assert.deepStrictEqual(fakeMessages[0], {
			action: 'sayHello'
			, params: ['World']
			, token: 'abortable-token'
		});

		request.abort();
	}
	finally
	{
		crypto.randomUUID = uuidStub;
	}
});

test('abort rejects pending requests and ignores late replies', async () => {
	const fakeMessages = [];
	const fakeRecipient = {
		postMessage: msg => fakeMessages.push(msg)
	};
	const fakeWindow = new EventTarget();
	const uuidStub = crypto.randomUUID;

	try
	{
		crypto.randomUUID = () => 'abort-token';

		const client = new Client({to: fakeRecipient, from: fakeWindow});
		const request = client.readFile('/tmp/demo.txt');

		request.abort();

		await assert.rejects(request, error => {
			assert.strictEqual(error.name, 'AbortError');
			assert.strictEqual(error.action, 'readFile');
			assert.deepStrictEqual(error.params, ['/tmp/demo.txt']);
			return true;
		});

		fakeWindow.dispatchEvent(new MessageEvent('message', {
			data: {
				re: 'abort-token'
				, result: 'too late'
			}
		}));

		assert.deepStrictEqual(fakeMessages[0], {
			action: 'readFile'
			, params: ['/tmp/demo.txt']
			, token: 'abort-token'
		});
	}
	finally
	{
		crypto.randomUUID = uuidStub;
	}
});

test('client proxies are not thenable', async () => {
	const fakeMessages = [];
	const fakeRecipient = {
		postMessage: msg => fakeMessages.push(msg)
	};
	const fakeWindow = new EventTarget();

	const client = new Client({to: fakeRecipient, from: fakeWindow});

	assert.strictEqual(client.then, undefined);
	assert.strictEqual(await Promise.resolve(client), client);
	assert.deepStrictEqual(fakeMessages, []);
});
