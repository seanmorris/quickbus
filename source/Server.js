export class Server
{	
	constructor(handler, origin)
	{
		this.handler = handler;
		this.origin = origin;
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
				if(this.origin)
				{
					source.postMessage({re: token, result, error}, this.origin);
				}
				else
				{
					source.postMessage({re: token, result, error});
				}
			}
		}
	}
}
