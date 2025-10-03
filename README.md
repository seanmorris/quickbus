# quickbus

A lightweight promise-based RPC wrapper for `postMessage`-style communication (ServiceWorker, iframe, cross-domain).

## Installation

```bash
npm install quickbus
```

## Importing

```js
// ES Modules
import { client, Server } from 'quickbus';

// CommonJS
const { client, Server } = require('quickbus');
```

## Architecture

quickbus implements a simple server/client protocol.

A server exposes a set of methods that can be called by the client. It can run in a tab, iframe, or worker/serviceworker.

### ServiceWorker Messaging

#### In your ServiceWorker (the "server" side)

```js
import { Server } from 'quickbus';

const handler = {
  sayHello: async (to) => {
    return `Hello, ${to}!`;
  }
};

const qbServer = new Server(handler);

self.addEventListener('message', event => {
  qbServer.handleMessageEvent(event);
});
```

#### In your page (the "client" side)

Then, in the outer page, spawn a client. If you're communicating across different origin, you'll need to supply the other frame's origin as the second param:

```js
import { Client } from 'quickbus';

const iframe = document.querySelector('iframe');
const frameOrigin = 'https://child.example.com';
const qbClient = new Client(iframe, iframeOrigin);

async function callRemoteMethod() {
  const result = qbClient.sayHello('World');
  console.log(result); // Hello, World!
}

callRemoteMethod();
```

### iFrames

#### In your iFrame (the "server" side)

Spawn a quickbus server within an iframe to expose methods to the outer page. This can also be done vice versa.

If you plan to communicate across different origins, you'll need to supply a list of origins that the server can accept as the second parameter.

```js
import { Server } from 'quickbus';

const handler = {
  sayHello: async (to) => {
    return `Hello, ${to}!`;
  }
};

const qbServer = new Server(handler, ['https://example.com']); // only respond to https://example.com

self.addEventListener('message', event => {
  qbServer.handleMessageEvent(event);
});
```

#### In your page (the "client" side)

Then, in the outer page, spawn a client. If you're communicating across different origin, you'll need to supply the other frame's origin as the second param:

```js
import { Client } from 'quickbus';

const iframe = document.querySelector('iframe');
const frameOrigin = 'https://child.example.com';
const qbClient = new Client(iframe, iframeOrigin);

async function callRemoteMethod() {
  const result = qbClient.sayHello('World');
  console.log(result); // Hello, World!
}

callRemoteMethod();
```

## API Reference

### `client(recipient, origin?)`

- **recipient**: A `Window`-like object (e.g. `WindowClient` or `Window`) with `.postMessage(...)`.
- **origin**: Optional second argument passed as `targetOrigin` for `postMessage`; defaults to `*` (same-origin).

Returns a Proxy: any method call (`bus.foo(arg1, arg2)`) sends `{ action: 'foo', params: [arg1, arg2], token }` and returns a Promise resolving to the remote result.

### `Server(handler, origin?)`

- **handler**: An object whose methods (sync or async) implement your RPC endpoints.
- **origin**: Optional `targetOrigin` for replies; defaults to same-origin.

Use `server.handleMessageEvent(event)` inside a `message` event listener to dispatch RPC calls and post responses back.

```js
const server = new Server(handler, 'https://client.example.com');
self.addEventListener('message', server.handleMessageEvent.bind(server));
```