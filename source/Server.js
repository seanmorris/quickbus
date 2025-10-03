export class Server
{	
	constructor(handler, origins)
	{
		this.handler = handler;
		this.origins = Array.isArray(origins) ? origins : [origins];
	}

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
				if(event.origin)
				{
					if(!this.origins.includes(event.origin))
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
