const incomplete = new Map;

const recipientSymbol = Symbol('recipient');
const originSymbol = Symbol('origin');

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

	recipient.then(recipient => {
		if(client[originSymbol])
		{
			recipient.postMessage({action, params, token}, client[originSymbol]);
		}
		else
		{
			recipient.postMessage({action, params, token});
		}
	});

	return result;
};

if (typeof navigator !== 'undefined' && navigator.serviceWorker &&
	typeof navigator.serviceWorker.addEventListener === 'function')
{
	navigator.serviceWorker.addEventListener('message', onMessage);
}

export class Client
{
	constructor(recipient, origin)
	{
		this[originSymbol] = origin;
		this[recipientSymbol] = recipient;
		
		return new Proxy(this, {
				get: (target, action, receiver) => {

				if(typeof action === 'symbol')
				{
					return target[action];
				}

				return (...params)  => sendMessage(receiver, action, params);
			}
		});
	}
}
