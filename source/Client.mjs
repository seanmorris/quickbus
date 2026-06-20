const sendSymbol = Symbol('send');
const listenCleanupSymbol = Symbol('listenCleanup');
const pendingSymbol = Symbol('pending');
const replyOriginsSymbol = Symbol('replyOrigins');
const timeoutSymbol = Symbol('timeout');
const encodeSymbol = Symbol('encode');
const decodeSymbol = Symbol('decode');

/**
 * @typedef {{ postMessage(message: unknown, targetOrigin?: string): void }} PostMessageTarget
 * @typedef {{ addEventListener: (type: string, listener: (event: MessageEvent) => void) => void, removeEventListener?: (type: string, listener: (event: MessageEvent) => void) => void }} MessageEventTarget
 * @typedef {(message: unknown) => unknown} MessageCodec
 * @typedef {{ origin?: string }} MessageMetadata
 * @typedef {(message: unknown, metadata?: MessageMetadata | MessageEvent | string) => void} MessageListener
 * @typedef {() => void} ListenerCleanup
 * @typedef {{ to: PostMessageTarget, from?: MessageEventTarget | null, origin?: string | null, encode?: MessageCodec, decode?: MessageCodec, replyOrigins?: string[] | string | null, timeout?: number | null }} PostMessageClientOptions
 * @typedef {{ send(message: unknown): void, listen(listener: MessageListener): void | ListenerCleanup, encode?: MessageCodec, decode?: MessageCodec, replyOrigins?: string[] | string | null, timeout?: number | null }} CustomTransportClientOptions
 * @typedef {PostMessageClientOptions | CustomTransportClientOptions} ClientOptions
 * @typedef {{ contentWindow: PostMessageTarget | null }} IframeLike
 * @typedef {{ controller: PostMessageTarget | null, addEventListener(type: 'message', listener: (event: MessageEvent) => void): void }} ServiceWorkerContainerLike
 * @typedef {{ active: PostMessageTarget | null }} ServiceWorkerRegistrationLike
 */

const identity = value => value;
const canListen = target => target && typeof target.addEventListener === 'function';
const getGlobalListenerTarget = () => canListen(globalThis) ? globalThis : null;
const promiseMethodNames = new Set(['then', 'catch', 'finally']);
const getDefaultServiceWorkerReplyTarget = () => globalThis.navigator?.serviceWorker ?? null;
const hasOrigin = metadata => metadata && typeof metadata === 'object' && 'origin' in metadata;
const isObject = value => value && typeof value === 'object';

const createToken = () => {
	if(globalThis.crypto?.randomUUID)
	{
		return globalThis.crypto.randomUUID();
	}

	if(globalThis.crypto?.getRandomValues)
	{
		const values = new Uint32Array(4);
		globalThis.crypto.getRandomValues(values);

		return Array.from(values, value => value.toString(16).padStart(8, '0')).join('');
	}

	return `quickbus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

const createAbortError = (action, params) => {
	const error = /** @type {Error & { action?: string, params?: unknown[] }} */(
		new Error(`Aborted RPC request "${action}".`)
	);

	error.name = 'AbortError';
	error.action = action;
	error.params = params;

	return error;
};

const createTimeoutError = (action, params, timeout) => {
	const error = /** @type {Error & { action?: string, params?: unknown[], timeout?: number }} */(
		new Error(`Timed out RPC request "${action}" after ${timeout}ms.`)
	);

	error.name = 'TimeoutError';
	error.action = action;
	error.params = params;
	error.timeout = timeout;

	return error;
};

const createDisposeError = () => {
	const error = new Error('Disposed RPC client.');

	error.name = 'AbortError';

	return error;
};

const normalizeCodec = (codec, name) => {
	if(codec === undefined || codec === null)
	{
		return identity;
	}

	if(typeof codec !== 'function')
	{
		throw new TypeError(`Client option "${name}" must be a function.`);
	}

	return codec;
};

const normalizeTimeout = timeout => {
	if(timeout === undefined || timeout === null)
	{
		return undefined;
	}

	if(typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout < 0)
	{
		throw new TypeError('Client option "timeout" must be a non-negative number.');
	}

	return timeout;
};

const normalizeReplyOrigins = replyOrigins => {
	if(replyOrigins === undefined || replyOrigins === null)
	{
		return new Set;
	}

	const origins = Array.isArray(replyOrigins)
		? replyOrigins
		: [replyOrigins];

	return new Set(origins);
};

const resolveListenerTarget = (to, from) => {
	if(canListen(from))
	{
		return from;
	}

	const globalTarget = getGlobalListenerTarget();

	if(globalTarget)
	{
		return globalTarget;
	}

	if(canListen(to))
	{
		return to;
	}

	throw new TypeError('No valid message event target was provided for Client replies.');
};

const createPostMessageSender = (target, origin) => message => {
	if(origin)
	{
		target.postMessage(message, origin);
	}
	else
	{
		target.postMessage(message);
	}
};

const createPostMessageListener = target => callback => {
	const listener = event => callback(event.data, event);

	target.addEventListener('message', listener);

	if(typeof target.removeEventListener === 'function')
	{
		return () => target.removeEventListener('message', listener);
	}

	return undefined;
};

const normalizeOptions = options => {
	if(!options || typeof options !== 'object')
	{
		throw new TypeError('Client requires a named options object.');
	}

	const encode = normalizeCodec(options.encode, 'encode');
	const decode = normalizeCodec(options.decode, 'decode');
	const timeout = normalizeTimeout(options.timeout);
	const replyOrigins = normalizeReplyOrigins(options.replyOrigins);

	if('send' in options || 'listen' in options)
	{
		if(typeof options.send !== 'function' || typeof options.listen !== 'function')
		{
			throw new TypeError('Client custom transport requires "send" and "listen" functions.');
		}

		return {
			send: options.send
			, listen: options.listen
			, encode
			, decode
			, replyOrigins
			, timeout
		};
	}

	if('to' in options)
	{
		const from = resolveListenerTarget(options.to, options.from);

		return {
			send: createPostMessageSender(options.to, options.origin ?? undefined)
			, listen: createPostMessageListener(from)
			, encode
			, decode
			, replyOrigins
			, timeout
		};
	}

	throw new TypeError('Client requires either a "to" target or custom "send" and "listen" functions.');
};

const getMessageOrigin = metadata => {
	if(typeof metadata === 'string')
	{
		return metadata;
	}

	if(hasOrigin(metadata) && typeof metadata.origin === 'string')
	{
		return metadata.origin;
	}

	return undefined;
};

const handleReplyMessage = (client, message, metadata) => {
	let data;

	try
	{
		data = client[decodeSymbol](message);
	}
	catch(error)
	{
		console.warn('Could not decode quickbus reply message.', error);
		return;
	}

	if(!isObject(data) || !data.re || !client[pendingSymbol].has(data.re))
	{
		return;
	}

	const origin = getMessageOrigin(metadata);

	if(client[replyOriginsSymbol].size && (!origin || !client[replyOriginsSymbol].has(origin)))
	{
		console.warn(`Got a reply from unauthorized origin: ${origin ?? 'unknown origin'}`);
		return;
	}

	const callbacks = client[pendingSymbol].get(data.re);

	if(!data.error)
	{
		callbacks.resolve(data.result);
	}
	else
	{
		callbacks.reject(data.error);
	}
};

const createRequestHandle = (promise, abort) => ({
	abort
	, then: promise.then.bind(promise)
	, catch: promise.catch.bind(promise)
	, finally: promise.finally.bind(promise)
	, [Symbol.toStringTag]: 'Promise'
});

const sendMessage = (client, action, params) => {
	const token  = createToken();
	let accept;
	let reject;
	let settled = false;
	let timeoutId;

	const result = new Promise((_accept, _reject) => [accept, reject] = [_accept, _reject]);

	const settle = (callback, value) => {
		if(settled)
		{
			return;
		}

		settled = true;
		client[pendingSymbol].delete(token);

		if(timeoutId !== undefined)
		{
			clearTimeout(timeoutId);
		}

		callback(value);
	};

	const request = createRequestHandle(
		result
		, () => settle(reject, createAbortError(action, params))
	);

	client[pendingSymbol].set(token, {
		resolve: value => settle(accept, value)
		, reject: error => settle(reject, error)
	});

	if(client[timeoutSymbol] !== undefined)
	{
		timeoutId = setTimeout(
			() => settle(reject, createTimeoutError(action, params, client[timeoutSymbol]))
			, client[timeoutSymbol]
		);
	}

	try
	{
		client[sendSymbol](client[encodeSymbol]({action, params, token}));
	}
	catch(error)
	{
		settle(reject, error);
	}

	return request;
};

/**
 *
 */
export class Client
{
	/**
	 * Create an RPC client around a `postMessage` or custom transport.
	 * @param {ClientOptions} options Named transport options.
	 */
	constructor(options)
	{
		const normalized = normalizeOptions(options);

		this[sendSymbol] = normalized.send;
		this[pendingSymbol] = new Map;
		this[replyOriginsSymbol] = normalized.replyOrigins;
		this[timeoutSymbol] = normalized.timeout;
		this[encodeSymbol] = normalized.encode;
		this[decodeSymbol] = normalized.decode;

		const cleanup = normalized.listen(
			(message, metadata) => handleReplyMessage(this, message, metadata)
		);

		this[listenCleanupSymbol] = typeof cleanup === 'function'
			? cleanup
			: null;

		return new Proxy(this, {
			get: (target, action, receiver) => {
				if(typeof action === 'string' && action in target)
				{
					const value = target[action];

					return typeof value === 'function'
						? value.bind(receiver)
						: value;
				}

				if(typeof action === 'string' && promiseMethodNames.has(action))
				{
					return undefined;
				}

				if(typeof action === 'symbol')
				{
					return target[action];
				}

				return (...params)  => sendMessage(receiver, action, params);
			}
		});
	}

	/**
	 * Remove this client's reply listener and reject any pending requests.
	 */
	dispose()
	{
		if(this[listenCleanupSymbol])
		{
			this[listenCleanupSymbol]();
			this[listenCleanupSymbol] = null;
		}

		const disposeError = createDisposeError();

		for(const callbacks of Array.from(this[pendingSymbol].values()))
		{
			callbacks.reject(disposeError);
		}
	}

	/**
	 * Create a client that sends requests to an iframe window.
	 * @param {IframeLike} iframe Iframe element or iframe-like wrapper with `contentWindow`.
	 * @param {string} [origin] Optional target origin for cross-origin iframe messaging.
	 * @param {MessageEventTarget | null} [from] Optional local event target that receives replies.
	 * @returns {Client} Configured iframe client.
	 */
	static forIframe(iframe, origin, from = null)
	{
		if(!iframe?.contentWindow)
		{
			throw new TypeError('Iframe client requires an iframe with a contentWindow.');
		}

		return new Client({to: iframe.contentWindow, origin, from});
	}

	/**
	 * Create a client for another window, such as `window.parent` or a popup.
	 * @param {PostMessageTarget} targetWindow Remote window-like target that receives requests.
	 * @param {string} [origin] Optional target origin for cross-origin messaging.
	 * @param {MessageEventTarget | null} [from] Optional local event target that receives replies.
	 * @returns {Client} Configured window client.
	 */
	static forWindow(targetWindow, origin, from = null)
	{
		return new Client({to: targetWindow, origin, from});
	}

	/**
	 * Create a client that both sends and receives on the same `MessagePort`.
	 * @param {PostMessageTarget & MessageEventTarget} port Message port used for both directions.
	 * @param {string} [origin] Optional target origin, accepted for API consistency.
	 * @returns {Client} Configured message-port client.
	 */
	static forMessagePort(port, origin)
	{
		return new Client({to: port, from: port, origin});
	}

	/**
	 * Create a client for a `ServiceWorker` or `ServiceWorkerContainer`.
	 * @param {PostMessageTarget | ServiceWorkerContainerLike} serviceWorker Service worker target or container with a `controller`.
	 * @param {MessageEventTarget | null} [from] Optional local event target that receives replies.
	 * @returns {Client} Configured service-worker client.
	 */
	static forServiceWorker(serviceWorker, from = null)
	{
		/** @type {PostMessageTarget | null | undefined} */
		const to = serviceWorker && 'controller' in serviceWorker
			? serviceWorker.controller
			: /** @type {PostMessageTarget} */(serviceWorker);
		const replyTarget = from ?? (serviceWorker && 'controller' in serviceWorker && canListen(serviceWorker)
			? serviceWorker
			: null);

		if(!to)
		{
			throw new TypeError('ServiceWorker client requires a controller or ServiceWorker target.');
		}

		return new Client({to, from: replyTarget});
	}

	/**
	 * Create a client for an active service worker registration target.
	 * @param {ServiceWorkerRegistrationLike} registration Registration with an active worker.
	 * @param {MessageEventTarget | null} [from] Optional local event target that receives replies.
	 * @returns {Client} Configured service-worker-registration client.
	 */
	static forServiceWorkerRegistration(
		registration
		, from = getDefaultServiceWorkerReplyTarget()
	) {
		if(!registration?.active)
		{
			throw new TypeError('ServiceWorker registration client requires an active worker.');
		}

		return new Client({to: registration.active, from});
	}
}
