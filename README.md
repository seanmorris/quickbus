# quickbus

A lightweight promise-based RPC wrapper for `postMessage`-style communication (ServiceWorker, iframe, cross-domain).

> ### I am giving up my bed for one night.
> My Sleep Out helps youth facing homelessness find safe shelter and loving care at Covenant House. That care includes essential services like education, job training, medical care, mental health and substance use counseling, and legal aid — everything they need to build independent, sustainable futures.
>
> By supporting my Sleep Out, you are supporting the dreams of young people overcoming homelessness.
>
> <a href = "https://www.sleepout.org/participants/62915"><img width = "50%" alt="Donate to Covenant House" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fwww.sleepout.org%2Fapi%2F1.3%2Fparticipants%2F62915%3F_%3D1760039017428&query=%24.sumDonations&prefix=%24&suffix=%20Raised&style=for-the-badge&label=Sleep%20Out%3A%20NYC&link=https%3A%2F%2Fwww.sleepout.org%2Fparticipants%2F62915"></a>
>
> Click here to help out: https://www.sleepout.org/participants/62915
>
> More info: https://www.sleepout.org/ | https://www.covenanthouse.org/ | https://www.charitynavigator.org/ein/132725416
>
> Together, we are working towards a future where every young person has a safe place to sleep.
>
> Thank you.
>
> *and now back to your documentation...*

## Installation

```bash
npm install quickbus
```

## Importing

```js
// ES Modules
import { Client, Server } from 'quickbus';
```
```js
// CommonJS
const { Client, Server } = require('quickbus');
```

## Architecture

quickbus implements a simple server/client protocol.

A server exposes a set of methods that can be called by the client. It can run in a tab, iframe, or worker/serviceworker.

### ServiceWorker Messaging

#### In your ServiceWorker (the "server" side)

Spawn a quickbus server within an iframe to expose methods to pages.

```js
import { Server } from 'quickbus';

const qbServer = new Server({
  sayHello(to) {
    return `Hello, ${to}!`;
  }
});

globalThis.addEventListener('message', event => {
  qbServer.handleMessageEvent(event);
});
```

#### In your page (the "client" side)

Spawn a quickbus client and call your method, and await the result.

Pass `navigator.serviceWorker.controller` to select the service worker as the recipient of the client's requests.

```js
import { Client } from 'quickbus';

async function callRemoteMethod() {
  const qbClient = new Client(navigator.serviceWorker.controller);
  const greeting = await qbClient.sayHello('World');
  console.log(greeting); // Hello, World!
}

callRemoteMethod();
```

### iFrames

#### In your iFrame (the "server" side)

Spawn a quickbus server within an iframe to expose methods to the outer page. This can also be done vice versa.

If you plan to communicate across different origins, supply the target origin as the second parameter.

```js
import { Server } from 'quickbus';

const handler = {
  sayHello: (to) => {
    return `Hello, ${to}!`;
  }
};

const qbServer = new Server(handler, 'https://example.com');

globalThis.addEventListener('message', event => {
  qbServer.handleMessageEvent(event);
});
```

#### In your page (the "client" side)

Spawn a quickbus client and call your method, and await the result.

Pass the iframe as the first parameter to select it as the recipient of the client's requests.

You'll also need to pass its origin as the second parameter if you plan to make cross-domain calls.

```js
import { Client } from 'quickbus';

const iframe = document.querySelector('iframe');
const frameOrigin = 'https://child.example.com';
const qbClient = new Client(iframe.contentWindow, frameOrigin);

async function callRemoteMethod() {
  const greeting = await qbClient.sayHello('World');
  console.log(greeting); // Hello, World!
}

callRemoteMethod();
```

## API Reference

### `Client(recipient, origin?)`

- **recipient**: A `Window`-like object (e.g. `WindowClient` or `Window`) with `.postMessage(...)`.
- **origin**: Optional second argument passed as `targetOrigin` for `postMessage`; defaults to `*` (same-origin).

Returns a Proxy: any method call (`bus.foo(arg1, arg2)`) sends `{ action: 'foo', params: [arg1, arg2], token }` and returns a Promise resolving to the remote result.

### `Server(handler, origins?)`

- **handler**: An object whose methods (sync or async) implement your RPC endpoints.
- **origins**: Optional array of acceptable `targetOrigin`s for responses; defaults to same-origin.

Use `server.handleMessageEvent(event)` inside a `message` event listener to dispatch RPC calls and post responses back.

```js
const server = new Server(handler, 'https://client.example.com');
globalThis.addEventListener('message', server.handleMessageEvent.bind(server));
```