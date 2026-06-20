/**
 * Promise-based RPC server for `postMessage` transports.
 */

/**
 * @typedef {{ action?: string, token?: string, params?: unknown[] }} RpcRequest
 * @typedef {{ re: string, result?: unknown, error?: unknown }} RpcResponse
 * @typedef {{ postMessage(message: unknown, targetOrigin?: string): void }} ReplyTarget
 * @typedef {(message: RpcResponse, targetOrigin?: string) => void} ReplyFunction
 * @typedef {{ data?: unknown, origin?: string, reply?: ReplyFunction | null }} InboundMessage
 */

const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const isObject = value => value && typeof value === 'object';

const serializeError = error => {
	try
	{
		return JSON.parse(JSON.stringify(error));
	}
	catch
	{
		return {message: String(error)};
	}
};

const getReplyTarget = event => {
	const target = event.source ?? event.currentTarget ?? event.target;

	return target && typeof target.postMessage === 'function'
		? target
		: null;
};

const createEventReply = event => {
	const target = getReplyTarget(event);

	if(!target)
	{
		return null;
	}

	return (message, targetOrigin) => {
		if(targetOrigin)
		{
			target.postMessage(message, targetOrigin);
		}
		else
		{
			target.postMessage(message);
		}
	};
};

/**
 * Promise-based RPC server.
 */
export class Server
{
	/**
	 * Create an RPC server that dispatches incoming actions to the supplied handler object.
	 * @param {Record<string, (...params: unknown[]) => unknown | Promise<unknown>>} handler Method map used to service RPC calls.
	 * @param {string[]} [origins] Allowed origins for replies when `event.origin` is present.
	 */
	constructor(handler, ...origins)
	{
		this.handler = handler;
		this.origins = new Set(origins);
	}

	/**
	 * Check whether the sender origin is allowed to invoke this server.
	 * @param {string | undefined} origin Inbound message origin.
	 * @returns {boolean} Whether the origin is allowed.
	 */
	allowsOrigin(origin)
	{
		if(!this.origins.size)
		{
			return true;
		}

		if(origin && this.origins.has(origin))
		{
			return true;
		}

		console.warn(`Got a message from unauthorized origin: ${origin ?? 'unknown origin'}`);

		return false;
	}

	/**
	 * Handle one normalized inbound message and send the result through its reply function.
	 * @param {InboundMessage} message Normalized RPC message with an explicit reply function.
	 */
	async handleMessage(message)
	{
		if(!message || typeof message !== 'object' || typeof message.reply !== 'function')
		{
			return;
		}

		const { data, origin, reply } = message;

		if(!isObject(data))
		{
			return;
		}

		const request = /** @type {RpcRequest} */(data);
		const { action, token, params = [] } = request;

		if(
			typeof action !== 'string'
			|| typeof token !== 'string'
			|| !Array.isArray(params)
			|| !hasOwn(this.handler, action)
			|| typeof this.handler[action] !== 'function'
		) {
			return;
		}

		if(!this.allowsOrigin(origin))
		{
			return;
		}

		let result, error;

		try
		{
			result = await this.handler[action](...params);
		}
		catch(_error)
		{
			error = serializeError(_error);
			console.error(_error);
		}
		finally
		{
			const response = {re: token, result, error};

			if(this.origins.size && origin)
			{
				reply(response, origin);
			}
			else
			{
				reply(response);
			}
		}
	}

	/**
	 * Handle one inbound `message` event and post the result back to the event source.
	 * @param {MessageEvent<RpcRequest> & { source?: ReplyTarget | null }} event Incoming RPC message event.
	 */
	async handleMessageEvent(event)
	{
		await this.handleMessage({
			data: event.data
			, origin: event.origin
			, reply: createEventReply(event)
		});
	}
}
