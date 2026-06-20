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

test('Server.handleMessageEvent replies to allowed origins with target origin', async() => {
	const handler = { add(a, b) { return a + b; } };
	const server = new Server(handler, 'https://trusted.example');
	const messages = [];
	const fakeSource = {
		postMessage: (msg, origin) => messages.push({ msg, origin })
	};

	await server.handleMessageEvent({
		data: { action: 'add', token: 'token-origin', params: [4, 5] }
		, origin: 'https://trusted.example'
		, source: fakeSource
	});

	assert.deepStrictEqual(messages[0], {
		msg: { re: 'token-origin', result: 9, error: undefined }
		, origin: 'https://trusted.example'
	});
});

test('Server.handleMessageEvent ignores events without reply target', async() => {
	const server = new Server({
		add() {
			throw new Error('handler should not be called');
		}
	});

	await server.handleMessageEvent({
		data: { action: 'add', token: 'no-reply', params: [] }
	});
});

test('Server.handleMessageEvent can reply through currentTarget', async() => {
	const server = new Server({
		add(a, b) {
			return a + b;
		}
	});
	const messages = [];

	await server.handleMessageEvent({
		data: { action: 'add', token: 'current-target', params: [5, 6] }
		, currentTarget: {
			postMessage: message => messages.push(message)
		}
	});

	assert.deepStrictEqual(messages[0], {
		re: 'current-target'
		, result: 11
		, error: undefined
	});
});

test('Server.handleMessageEvent ignores non-postMessage event targets', async() => {
	const server = new Server({
		add() {
			throw new Error('handler should not be called');
		}
	});

	await server.handleMessageEvent({
		data: { action: 'add', token: 'bad-target', params: [] }
		, currentTarget: {}
	});
});

test('Server.handleMessage replies through explicit reply function', async() => {
	const handler = { add(a, b) { return a + b; } };
	const server = new Server(handler, 'app://native');
	const messages = [];

	await server.handleMessage({
		data: { action: 'add', token: 'token456', params: [3, 4] }
		, origin: 'app://native'
		, reply: (msg, origin) => messages.push({ msg, origin })
	});

	assert.strictEqual(messages.length, 1);
	assert.deepStrictEqual(messages[0], {
		msg: { re: 'token456', result: 7, error: undefined }
		, origin: 'app://native'
	});
});

test('Server.handleMessage ignores messages without reply functions', async() => {
	const server = new Server({
		add() {
			throw new Error('handler should not be called');
		}
	});

	await server.handleMessage(null);
	await server.handleMessage('not an object');
	await server.handleMessage({
		data: { action: 'add', token: 'missing-reply', params: [] }
	});
});

test('Server.handleMessage ignores malformed and non-rpc messages', async() => {
	const handler = {
		add() {
			throw new Error('handler should not be called');
		}
		, notFunction: 1
	};
	const server = new Server(handler);
	const messages = [];

	await server.handleMessage({
		data: 'not-json'
		, reply: message => messages.push(message)
	});
	await server.handleMessage({
		data: null
		, reply: message => messages.push(message)
	});
	await server.handleMessage({
		data: { action: 1, token: 'bad-action', params: [] }
		, reply: message => messages.push(message)
	});
	await server.handleMessage({
		data: { action: 'add', token: 1, params: [] }
		, reply: message => messages.push(message)
	});
	await server.handleMessage({
		data: { action: 'add', token: 'bad-params', params: 'nope' }
		, reply: message => messages.push(message)
	});
	await server.handleMessage({
		data: { action: 'notFunction', token: 'not-function', params: [] }
		, reply: message => messages.push(message)
	});
	await server.handleMessage({
		data: { action: 'missingMethod', token: 'unknown', params: [] }
		, reply: message => messages.push(message)
	});

	assert.deepStrictEqual(messages, []);
});

test('Server.handleMessage rejects allowlisted calls without origins', async() => {
	let called = false;
	const warnings = [];
	const warnStub = console.warn;
	const server = new Server({
		add() {
			called = true;
		}
	}, 'https://trusted.example');

	try
	{
		console.warn = (...args) => warnings.push(args);

		await server.handleMessage({
			data: { action: 'add', token: 'missing-origin', params: [] }
			, reply() {}
		});
	}
	finally
	{
		console.warn = warnStub;
	}

	assert.strictEqual(called, false);
	assert.match(String(warnings[0][0]), /unknown origin/);
});

test('Server.handleMessage serializes thrown handler values', async() => {
	const errors = [];
	const errorStub = console.error;
	const server = new Server({
		fail() {
			throw {message: 'failed', code: 'E_FAIL'};
		}
	});
	const messages = [];

	try
	{
		console.error = (...args) => errors.push(args);

		await server.handleMessage({
			data: { action: 'fail', token: 'throw-token', params: [] }
			, reply: message => messages.push(message)
		});
	}
	finally
	{
		console.error = errorStub;
	}

	assert.deepStrictEqual(messages[0], {
		re: 'throw-token'
		, result: undefined
		, error: {message: 'failed', code: 'E_FAIL'}
	});
	assert.strictEqual(errors.length, 1);
});

test('Server.handleMessage falls back for unserializable handler errors', async() => {
	const errorStub = console.error;
	const thrown = {};
	const server = new Server({
		fail() {
			thrown.self = thrown;

			throw thrown;
		}
	});
	const messages = [];

	try
	{
		console.error = () => {};

		await server.handleMessage({
			data: { action: 'fail', token: 'circular-token', params: [] }
			, reply: message => messages.push(message)
		});
	}
	finally
	{
		console.error = errorStub;
	}

	assert.deepStrictEqual(messages[0], {
		re: 'circular-token'
		, result: undefined
		, error: {message: '[object Object]'}
	});
});

test('Server.handleMessage does not invoke unauthorized origins', async() => {
	let called = false;
	const warnings = [];
	const warnStub = console.warn;
	const server = new Server({
		add() {
			called = true;
			return 1;
		}
	}, 'https://trusted.example');
	const messages = [];

	try
	{
		console.warn = (...args) => warnings.push(args);

		await server.handleMessage({
			data: { action: 'add', token: 'blocked', params: [] }
			, origin: 'https://attacker.example'
			, reply: message => messages.push(message)
		});
	}
	finally
	{
		console.warn = warnStub;
	}

	assert.strictEqual(called, false);
	assert.deepStrictEqual(messages, []);
	assert.match(String(warnings[0][0]), /unauthorized origin/);
});
