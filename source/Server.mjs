/**
 * Promise-based RPC server for `postMessage` transports.
 */

/**
 * @typedef {{ action?: string, token?: string, params?: unknown[] }} RpcRequest
 * @typedef {{ postMessage(message: unknown, targetOrigin?: string): void }} ReplyTarget
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
	 * Handle one inbound `message` event and post the result back to the event source.
	 * @param {MessageEvent<RpcRequest> & { source: ReplyTarget | null }} event Incoming RPC message event.
	 */
	async handleMessageEvent(event)
	{
		const { data, source } = event;
		const { action, token, params = [] } = data;

		if(action in this.handler)
		{
			let result, error;

			try
			{
				result = await this.handler[action](...params);
			}
			catch(_error)
			{
				error = JSON.parse(JSON.stringify(_error));
				console.error(_error);
			}
			finally
			{
				if(this.origins.size && event.origin)
				{
					if(!this.origins.has(event.origin))
					{
						console.warn(`Got a message from unauthorized origin: ${event.origin}`);
					}
					else
					{
						source.postMessage({re: token, result, error}, event.origin);
					}
				}
				else
				{
					source.postMessage({re: token, result, error});
				}
			}
		}
	}
}
