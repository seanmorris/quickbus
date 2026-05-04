const incomplete = new Map;

const originSymbol = Symbol('origin');
const toSymbol = Symbol('to');
const fromSymbol = Symbol('from');

/**
 * @typedef {{ postMessage(message: unknown, targetOrigin?: string): void }} PostMessageTarget
 * @typedef {{ addEventListener(type: 'message', listener: (event: MessageEvent) => void): void }} MessageEventTarget
 * @typedef {{ to: PostMessageTarget, from?: MessageEventTarget | null, origin?: string | null }} ClientOptions
 * @typedef {{ contentWindow: PostMessageTarget | null }} IframeLike
 * @typedef {{ controller: PostMessageTarget | null, addEventListener(type: 'message', listener: (event: MessageEvent) => void): void }} ServiceWorkerContainerLike
 */

const canListen = target => target && typeof target.addEventListener === 'function';

const getGlobalListenerTarget = () => canListen(globalThis) ? globalThis : null;
const promiseMethodNames = new Set(['then', 'catch', 'finally']);

const createAbortError = (action, params) => {
	const error = new Error(`Aborted RPC request "${action}".`);

	error.name = 'AbortError';
	error.action = action;
	error.params = params;

	return error;
};

const normalizeOptions = options => {
	if(options && typeof options === 'object' && 'to' in options)
	{
		return {
			to: options.to
			, origin: options.origin ?? undefined
			, from: options.from ?? undefined
		};
	}

	throw new TypeError('Client requires a named options object with a "to" target.');
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

const onMessage = event => {
	if(event.data.re && incomplete.has(event.data.re))
	{
		const callbacks = incomplete.get(event.data.re);

		if(!event.data.error)
		{
			callbacks.resolve(event.data.result);
		}
		else
		{
			callbacks.reject(event.data.error);
		}
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
	const token  = crypto.randomUUID();
	let accept;
	let reject;
	let settled = false;

	const result = new Promise((_accept, _reject) => [accept, reject] = [_accept, _reject]);

	const settle = (callback, value) => {
		if(settled)
		{
			return;
		}

		settled = true;
		incomplete.delete(token);
		callback(value);
	};

	const request = createRequestHandle(
		result
		, () => settle(reject, createAbortError(action, params))
	);

	incomplete.set(token, {
		resolve: value => settle(accept, value)
		, reject: error => settle(reject, error)
	});

	try
	{
		const recipient = client[toSymbol];

		if(client[originSymbol])
		{
			recipient.postMessage({action, params, token}, client[originSymbol]);
		}
		else
		{
			recipient.postMessage({action, params, token});
		}
	}
	catch(error)
	{
		incomplete.delete(token);
		settled = true;
		reject(error);
	}

	return request;
};

/**
 *
 */
export class Client
{
	/**
	 * Create an RPC client around a `postMessage` transport.
	 * @param {ClientOptions} options Named transport options.
	 */
	constructor(options)
	{
		const normalized = normalizeOptions(options);

		this[originSymbol] = normalized.origin ?? undefined;
		this[toSymbol] = normalized.to;
		this[fromSymbol] = resolveListenerTarget(normalized.to, normalized.from);

		this[fromSymbol].addEventListener('message', onMessage);

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
}
