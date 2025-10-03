const incomplete = new Map;

const recipientSymbol = Symbol('recipient');

const onMessage = event => {
	if(event.data.re && incomplete.has(event.data.re))
	{
		const callbacks = incomplete.get(event.data.re);

		if(!event.data.error)
		{
			callbacks[0](event.data.result);
		}
		else
		{
			callbacks[1](event.data.error);
		}
	}
};


const sendMessage = (client, action, params, accept, reject) => {
	const token  = crypto.randomUUID();
	const result = new Promise((_accept, _reject) => [accept, reject] = [_accept, _reject]);

	incomplete.set(token, [accept, reject]);

	let recipient = client[recipientSymbol];

	if(!(recipient instanceof Promise))
	{
		recipient = Promise.resolve(recipient);
	}

	recipient.then(recipient => recipient.postMessage({action, params, token}));

	return result;
};

let count = 0;

navigator.serviceWorker.addEventListener('message', onMessage);

const registry = new FinalizationRegistry(() => {
	if(count-- === 0)
	{
		navigator.serviceWorker.removeEventListener('message', onMessage);
	}
});

export class client
{
	constructor(recipient)
	{
		this[recipientSymbol] = recipient;
		count++;
		
		return new Proxy(this, {
			get: (target, action, receiver) => (...params)  => sendMessage(
				receiver, action, params
			)
		});
	}	
}
