import test from 'node:test';
import assert from 'node:assert';
import { Client } from '../Client.mjs';

const replaceGlobalProperty = (name, value) => {
	const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);

	Object.defineProperty(globalThis, name, {
		configurable: true
		, writable: true
		, value
	});

	return () => {
		if(descriptor)
		{
			Object.defineProperty(globalThis, name, descriptor);
		}
		else
		{
			delete globalThis[name];
		}
	};
};

test('client supports custom send/listen transports and codecs', async() => {
	const sent = [];
	let listener;
	let disposed = false;
	const uuidStub = crypto.randomUUID;

	try
	{
		crypto.randomUUID = () => 'custom-token';

		const client = new Client({
			send: message => sent.push(message)
			, listen: callback => {
				listener = callback;

				return () => {
					disposed = true;
					listener = null;
				};
			}
			, encode: JSON.stringify
			, decode: JSON.parse
		});

		const request = client.getBioToken();

		assert.strictEqual(sent[0], JSON.stringify({
			action: 'getBioToken'
			, params: []
			, token: 'custom-token'
		}));

		listener(JSON.stringify({
			re: 'custom-token'
			, result: 'bio-token'
		}));

		assert.strictEqual(await request, 'bio-token');

		client.dispose();

		assert.strictEqual(disposed, true);
		assert.strictEqual(listener, null);
	}
	finally
	{
		crypto.randomUUID = uuidStub;
	}
});

test('client supports getRandomValues token fallback', async() => {
	const sent = [];
	const restoreCrypto = replaceGlobalProperty('crypto', {
		getRandomValues(values) {
			values.set([1, 2, 255, 0xabcdef01]);

			return values;
		}
	});

	try
	{
		const client = new Client({
			send: message => sent.push(message)
			, listen() {}
		});

		const request = client.fallbackToken();
		request.abort();

		assert.deepStrictEqual(sent[0], {
			action: 'fallbackToken'
			, params: []
			, token: '0000000100000002000000ffabcdef01'
		});
		await assert.rejects(request, {name: 'AbortError'});
	}
	finally
	{
		restoreCrypto();
	}
});

test('client supports Math.random token fallback', async() => {
	const sent = [];
	const restoreCrypto = replaceGlobalProperty('crypto', undefined);
	const dateNowStub = Date.now;
	const randomStub = Math.random;

	try
	{
		Date.now = () => 123456789;
		Math.random = () => 0.5;

		const client = new Client({
			send: message => sent.push(message)
			, listen() {}
		});

		const request = client.randomToken();
		request.abort();

		assert.match(sent[0].token, /^quickbus-/);
		await assert.rejects(request, {name: 'AbortError'});
	}
	finally
	{
		Date.now = dateNowStub;
		Math.random = randomStub;
		restoreCrypto();
	}
});

test('client validates reply origins when configured', async() => {
	let listener;
	const sent = [];
	const warnings = [];
	const warnStub = console.warn;
	const uuidStub = crypto.randomUUID;

	try
	{
		console.warn = (...args) => warnings.push(args);
		crypto.randomUUID = () => 'origin-token';

		const client = new Client({
			send: message => sent.push(message)
			, listen: callback => {
				listener = callback;
			}
			, replyOrigins: ['https://trusted.example']
		});

		const request = client.secureCall();

		listener({
			re: 'origin-token'
			, result: 'wrong origin'
		}, {origin: 'https://attacker.example'});

		listener({
			re: 'origin-token'
			, result: 'trusted origin'
		}, {origin: 'https://trusted.example'});

		assert.strictEqual(await request, 'trusted origin');
		assert.strictEqual(sent.length, 1);
		assert.match(String(warnings[0][0]), /unauthorized origin/);
	}
	finally
	{
		console.warn = warnStub;
		crypto.randomUUID = uuidStub;
	}
});

test('client validates constructor options', () => {
	assert.throws(
		() => new Client(),
		/Client requires a named options object\./
	);
	assert.throws(
		() => new Client({send() {}, listen() {}, encode: 'json'}),
		/Client option "encode" must be a function\./
	);
	assert.throws(
		() => new Client({send() {}, listen() {}, timeout: -1}),
		/Client option "timeout" must be a non-negative number\./
	);
	assert.throws(
		() => new Client({send() {}}),
		/Client custom transport requires "send" and "listen" functions\./
	);
	assert.throws(
		() => new Client({}),
		/Client requires either a "to" target or custom "send" and "listen" functions\./
	);
});

test('client uses global message listener fallback', async() => {
	const sent = [];
	let listener;
	const uuidStub = crypto.randomUUID;
	const restoreAdd = replaceGlobalProperty('addEventListener', (_type, callback) => {
		listener = callback;
	});
	const restoreRemove = replaceGlobalProperty('removeEventListener', () => {});

	try
	{
		crypto.randomUUID = () => 'global-listener-token';

		const client = new Client({
			to: {
				postMessage: message => sent.push(message)
			}
		});
		const request = client.globalListener();

		listener(new MessageEvent('message', {
			data: {
				re: 'global-listener-token'
				, result: 'global reply'
			}
		}));

		assert.strictEqual(await request, 'global reply');
		assert.strictEqual(sent[0].token, 'global-listener-token');

		client.dispose();
	}
	finally
	{
		crypto.randomUUID = uuidStub;
		restoreRemove();
		restoreAdd();
	}
});

test('client requires a reply listener for postMessage targets', () => {
	const restoreAdd = replaceGlobalProperty('addEventListener', undefined);
	const restoreRemove = replaceGlobalProperty('removeEventListener', undefined);

	try
	{
		assert.throws(
			() => new Client({to: {postMessage() {}}}),
			/No valid message event target was provided for Client replies\./
		);
	}
	finally
	{
		restoreRemove();
		restoreAdd();
	}
});

test('client accepts listeners without cleanup support', () => {
	let attached = false;
	const client = new Client({
		to: {postMessage() {}}
		, from: {
			addEventListener() {
				attached = true;
			}
		}
	});

	client.dispose();

	assert.strictEqual(attached, true);
});

test('client accepts origin strings from custom listeners', async() => {
	let listener;
	const uuidStub = crypto.randomUUID;

	try
	{
		crypto.randomUUID = () => 'string-origin-token';

		const client = new Client({
			send() {}
			, listen: callback => {
				listener = callback;
			}
			, replyOrigins: 'app://trusted'
		});
		const request = client.stringOrigin();

		listener({
			re: 'string-origin-token'
			, result: 'ok'
		}, 'app://trusted');

		assert.strictEqual(await request, 'ok');
	}
	finally
	{
		crypto.randomUUID = uuidStub;
	}
});

test('client ignores undecodable replies', async() => {
	let listener;
	const warnings = [];
	const warnStub = console.warn;
	const uuidStub = crypto.randomUUID;

	try
	{
		console.warn = (...args) => warnings.push(args);
		crypto.randomUUID = () => 'decode-token';

		const client = new Client({
			send() {}
			, listen: callback => {
				listener = callback;
			}
			, decode(message) {
				if(message === 'bad')
				{
					throw new Error('bad payload');
				}

				return message;
			}
		});
		const request = client.decodeRetry();

		listener('bad');
		listener({
			re: 'decode-token'
			, result: 'decoded'
		});

		assert.strictEqual(await request, 'decoded');
		assert.match(String(warnings[0][0]), /Could not decode quickbus reply message/);
	}
	finally
	{
		console.warn = warnStub;
		crypto.randomUUID = uuidStub;
	}
});

test('client rejects error replies', async() => {
	let listener;
	const uuidStub = crypto.randomUUID;

	try
	{
		crypto.randomUUID = () => 'error-token';

		const client = new Client({
			send() {}
			, listen: callback => {
				listener = callback;
			}
		});
		const request = client.rejectMe();

		listener({
			re: 'error-token'
			, error: {message: 'nope'}
		});

		await assert.rejects(request, error => {
			assert.deepStrictEqual(error, {message: 'nope'});

			return true;
		});
	}
	finally
	{
		crypto.randomUUID = uuidStub;
	}
});

test('client rejects when send throws', async() => {
	const thrown = new Error('bridge unavailable');
	const client = new Client({
		send() {
			throw thrown;
		}
		, listen() {}
	});

	await assert.rejects(client.bridgeDown(), thrown);
});

test('client timeouts reject pending requests', async() => {
	const uuidStub = crypto.randomUUID;

	try
	{
		crypto.randomUUID = () => 'timeout-token';

		const client = new Client({
			send() {}
			, listen() {}
			, timeout: 1
		});

		await assert.rejects(client.neverResolves(), error => {
			assert.strictEqual(error.name, 'TimeoutError');
			assert.strictEqual(error.action, 'neverResolves');
			assert.deepStrictEqual(error.params, []);
			assert.strictEqual(error.timeout, 1);
			return true;
		});

		client.dispose();
	}
	finally
	{
		crypto.randomUUID = uuidStub;
	}
});

test('client convenience constructors cover edge paths', async() => {
	assert.throws(
		() => Client.forIframe({contentWindow: null}),
		/Iframe client requires an iframe with a contentWindow\./
	);

	const uuidStub = crypto.randomUUID;

	try
	{
		crypto.randomUUID = () => 'window-token';

		const windowMessages = [];
		const windowClient = Client.forWindow({
			postMessage: message => windowMessages.push(message)
		}, undefined, new EventTarget());

		windowClient.windowCall();

		assert.deepStrictEqual(windowMessages[0], {
			action: 'windowCall'
			, params: []
			, token: 'window-token'
		});

		crypto.randomUUID = () => 'port-token';

		const portMessages = [];
		const port = new (class extends EventTarget {
			postMessage(message) {
				portMessages.push(message);
			}
		});
		const portClient = Client.forMessagePort(port);
		const portRequest = portClient.portCall();

		port.dispatchEvent(new MessageEvent('message', {
			data: {
				re: 'port-token'
				, result: 'from port'
			}
		}));

		assert.strictEqual(await portRequest, 'from port');
		assert.strictEqual(portMessages[0].token, 'port-token');

		crypto.randomUUID = () => 'service-container-token';

		const containerMessages = [];
		const container = new (class extends EventTarget {
			controller = {
				postMessage: message => containerMessages.push(message)
			};
		});
		const containerClient = Client.forServiceWorker(container);
		const containerRequest = containerClient.containerCall();

		container.dispatchEvent(new MessageEvent('message', {
			data: {
				re: 'service-container-token'
				, result: 'from container'
			}
		}));

		assert.strictEqual(await containerRequest, 'from container');
		assert.strictEqual(containerMessages[0].token, 'service-container-token');

		crypto.randomUUID = () => 'service-direct-token';

		const directMessages = [];
		const directClient = Client.forServiceWorker({
			postMessage: message => directMessages.push(message)
		}, new EventTarget());

		directClient.directCall();

		assert.strictEqual(directMessages[0].token, 'service-direct-token');
		assert.throws(
			() => Client.forServiceWorker({controller: null}),
			/ServiceWorker client requires a controller or ServiceWorker target\./
		);
	}
	finally
	{
		crypto.randomUUID = uuidStub;
	}
});

test('client dispose rejects pending requests', async() => {
	const uuidStub = crypto.randomUUID;

	try
	{
		crypto.randomUUID = () => 'dispose-token';

		const client = new Client({
			send() {}
			, listen() {}
		});
		const request = client.waitForever();

		client.dispose();

		await assert.rejects(request, error => {
			assert.strictEqual(error.name, 'AbortError');
			assert.match(error.message, /Disposed RPC client/);
			return true;
		});
	}
	finally
	{
		crypto.randomUUID = uuidStub;
	}
});
