# quickbus

A small promise-based RPC layer for `postMessage` transports.

[![npm version](https://img.shields.io/npm/v/quickbus?style=for-the-badge)](https://www.npmjs.com/package/quickbus)
[![npm license](https://img.shields.io/npm/l/quickbus?style=for-the-badge)](https://www.npmjs.com/package/quickbus)
[![CI](https://img.shields.io/github/actions/workflow/status/seanmorris/quickbus/ci.yml?branch=master&style=for-the-badge)](https://github.com/seanmorris/quickbus/actions/workflows/ci.yml)

`quickbus` lets you expose a handler object on one side of a messaging boundary and call it from the other side as if it were a local async API. It is intended for:

- parent page <-> iframe communication
- window <-> popup communication
- page <-> service worker communication
- `MessagePort` / `MessageChannel` communication

<!-- > ### I am giving up my bed for one night.
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
> *and now back to your documentation...* -->

## Installation

```bash
npm install quickbus
```

## Importing

```js
import { Client, Server } from 'quickbus';
```

```js
const { Client, Server } = require('quickbus');
```

## Quick Start

### Parent Page To Iframe

Page:

```js
import { Client } from 'quickbus';

const iframe = document.querySelector('iframe');
const frameOrigin = 'https://child.example.com';
const bus = Client.forIframe(iframe, frameOrigin);

const greeting = await bus.sayHello('World');
console.log(greeting);
```

Each client call returns an awaitable request handle. That means this still works:

```js
const greeting = await bus.sayHello('World');
```

But you can also keep the handle and abort it locally if the caller decides to stop waiting:

```js
const request = bus.sayHello('World');

setTimeout(() => request.abort(), 5000);

const greeting = await request;
```

Iframe:

```js
import { Server } from 'quickbus';

const server = new Server({
  sayHello(to) {
    return `Hello, ${to}!`;
  }
}, 'https://parent.example.com');

window.addEventListener('message', event => {
  server.handleMessageEvent(event);
});
```

### Child Iframe To Parent Window

Parent:

```js
import { Server } from 'quickbus';

const server = new Server({
  sayHello(name) {
    return `Hello from ${name}!`;
  }
}, window.location.origin);

window.addEventListener('message', event => {
  server.handleMessageEvent(event);
});
```

Child iframe:

```js
import { Client } from 'quickbus';

const bus = Client.forWindow(window.parent, window.location.origin);
const message = await bus.sayHello('Parent');
console.log(message);
```

### Page To Service Worker

Page:

```js
import { Client } from 'quickbus';

await navigator.serviceWorker.register('/sw.mjs', { type: 'module' });
await navigator.serviceWorker.ready;

const bus = Client.forServiceWorker(navigator.serviceWorker);
const greeting = await bus.sayHello('Worker');
console.log(greeting);
```

`Client.forServiceWorker(navigator.serviceWorker)` requires the page to already be controlled by the worker. On first load, register the worker, wait for `ready`, and use the registration helper instead:

```js
import { Client } from 'quickbus';

await navigator.serviceWorker.register('/sw.mjs', { type: 'module' });
const registration = await navigator.serviceWorker.ready;

const bus = Client.forServiceWorkerRegistration(registration);
const greeting = await bus.sayHello('Worker');
console.log(greeting);
```

Service worker:

```js
import { Server } from 'quickbus';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const server = new Server({
  sayHello(to) {
    return `Hello, ${to}!`;
  }
});

self.addEventListener('message', event => {
  server.handleMessageEvent(event);
});
```

### Service Worker To Page

Page:

```js
import { Server } from 'quickbus';

const server = new Server({
  getOpenTabs() {
    return Array.from(document.querySelectorAll('[data-tab]'))
      .map(tab => tab.getAttribute('data-tab'));
  }
});

window.addEventListener('message', event => {
  server.handleMessageEvent(event);
});
```

Service worker:

```js
import { Client } from 'quickbus';

self.addEventListener('message', async event => {
  if(event.data?.action !== 'inspect-tabs')
  {
    return;
  }

  const client = Client.forWindow(event.source);
  const tabs = await client.getOpenTabs();

  console.log(tabs);
});
```

### MessagePort

```js
import { Client, Server } from 'quickbus';

const channel = new MessageChannel();

const client = Client.forMessagePort(channel.port1);
const server = new Server({
  add(a, b) {
    return a + b;
  }
});

channel.port2.addEventListener('message', event => {
  server.handleMessageEvent(event);
});

channel.port2.start?.();
channel.port1.start?.();

console.log(await client.add(2, 3));
```

### String-Only Transports

Some `postMessage`-style bridges only accept strings or do not expose a browser
`MessageEvent.source` reply target. Use a custom transport for those cases.

Web page inside a React Native WebView:

```js
import { Client } from 'quickbus';

const bus = new Client({
  send(message) {
    window.ReactNativeWebView.postMessage(message);
  },
  listen(callback) {
    const handler = event => callback(event.data, event);

    window.addEventListener('message', handler);
    document.addEventListener('message', handler);

    return () => {
      window.removeEventListener('message', handler);
      document.removeEventListener('message', handler);
    };
  },
  encode: JSON.stringify,
  decode: JSON.parse
});

const token = await bus.getBioToken();
```

React Native side:

```js
import { Server } from 'quickbus';

const server = new Server({
  getBioToken() {
    return getBioToken();
  },
  registerBioToken(token) {
    return registerBioToken(token);
  }
}, 'https://app.example.com');

function onMessage(event) {
  server.handleMessage({
    data: JSON.parse(event.nativeEvent.data),
    origin: new URL(event.nativeEvent.url).origin,
    reply(message) {
      webviewRef.current?.postMessage(JSON.stringify(message));
    }
  });
}
```

## Client API

### `new Client({ to, from?, origin? })`

Creates a proxy-backed RPC client.

Parameters:

- `to`: required `postMessage` target
- `from`: optional event target that receives reply `message` events
- `origin`: optional `targetOrigin` for outbound `postMessage(...)`
- `encode`: optional function that converts outgoing protocol objects before sending
- `decode`: optional function that converts incoming reply payloads before matching them
- `replyOrigins`: optional allowed origin or origin list for replies
- `timeout`: optional request timeout in milliseconds

Example:

```js
const bus = new Client({
  to: iframe.contentWindow,
  from: window,
  origin: 'https://child.example.com'
});
```

Notes:

- If `from` is omitted, `Client` first tries `globalThis`.
- If `globalThis` cannot receive `message` events in the current runtime, it falls back to `to` when possible.
- The constructor accepts a named options object only.
- Each RPC method returns a promise-like request handle with `.abort()`.
- Aborting a request clears the local pending token, but does not send a cancellation message to the remote transport.
- Timed out requests reject with a `TimeoutError`.

### `new Client({ send, listen, encode?, decode?, replyOrigins?, timeout? })`

Creates a proxy-backed RPC client around a custom transport.

Parameters:

- `send`: function called with each outbound protocol message
- `listen`: function that receives a callback for inbound replies
- `encode`: optional function that converts outgoing protocol objects before `send`
- `decode`: optional function that converts inbound reply payloads before matching them
- `replyOrigins`: optional allowed origin or origin list for replies
- `timeout`: optional request timeout in milliseconds

The `listen` callback accepts the inbound message as its first argument and may
receive either an event-like object with `origin` or an origin string as its
second argument. If `listen` returns a function, `client.dispose()` calls it.

Example:

```js
const bus = new Client({
  send: message => bridge.postMessage(JSON.stringify(message)),
  listen: callback => {
    bridge.onMessage(payload => callback(JSON.parse(payload)));
  }
});
```

### `client.dispose()`

Removes this client's reply listener when cleanup is available and rejects all
pending requests with an `AbortError`.

### `Client.forIframe(iframe, origin?, from?)`

Convenience wrapper for parent-page-to-iframe messaging.

Equivalent to:

```js
new Client({
  to: iframe.contentWindow,
  from,
  origin
});
```

When `from` is omitted, the normal `Client` fallback logic applies, which usually resolves to the parent `window`.

### `Client.forWindow(targetWindow, origin?, from?)`

Convenience wrapper for window or popup targets such as:

- `window.parent`
- `window.opener`
- a handle returned by `window.open(...)`

### `Client.forServiceWorker(serviceWorkerOrContainer, from?)`

Convenience wrapper for service worker messaging from a page.

Accepted inputs:

- `navigator.serviceWorker`
- `navigator.serviceWorker.controller`
- a `ServiceWorker`-like target

If you pass a `ServiceWorkerContainer` such as `navigator.serviceWorker`, `quickbus` uses:

- `to = navigator.serviceWorker.controller`
- `from = navigator.serviceWorker` by default

That default matters because service worker replies are delivered on the container, not the page `window`.

When you need to talk to a newly registered worker before it controls the page, use `Client.forServiceWorkerRegistration(...)` instead of `Client.forServiceWorker(navigator.serviceWorker)`.

### `Client.forServiceWorkerRegistration(registration, from?)`

Convenience wrapper for page-to-service-worker messaging through a `ServiceWorkerRegistration`.

This uses:

- `to = registration.active`
- `from = navigator.serviceWorker` by default when available

This is the helper to use after `await navigator.serviceWorker.ready` on a first-load page that is not yet controlled by the worker.

### `Client.forMessagePort(port, origin?)`

Convenience wrapper for `MessagePort`.

This uses the same port for both directions:

- `to = port`
- `from = port`

## Server API

### `new Server(handler, ...origins)`

Creates an RPC server that dispatches inbound actions to `handler`.

Parameters:

- `handler`: object whose function properties implement your RPC methods
- `...origins`: optional allowlist of acceptable `event.origin` values

Example:

```js
const server = new Server(handler, 'https://client.example.com');
```

Behavior:

- If no origins are provided, replies are allowed by default.
- If one or more origins are provided, replies are only sent when `event.origin` matches one of them.
- `handleMessageEvent(...)` posts responses back through the event source when available.

### `server.handleMessage(message)`

Handles one normalized inbound message.

```js
server.handleMessage({
  data: { action: 'add', params: [2, 3], token: 'uuid' },
  origin: 'https://client.example.com',
  reply: message => bridge.postMessage(JSON.stringify(message))
});
```

Parameters:

- `data`: decoded RPC request object
- `origin`: optional sender origin used with the server allowlist
- `reply`: function that sends the response object back to the caller

### `server.handleMessageEvent(event)`

Handles one inbound `message` event.

Typical usage:

```js
window.addEventListener('message', event => {
  server.handleMessageEvent(event);
});
```

The handler return value may be synchronous or async. Errors are caught, serialized with `JSON.stringify`, and returned as the `error` field in the reply payload.

## Protocol

Outgoing request shape:

```js
{
  action: 'methodName',
  params: [arg1, arg2],
  token: 'uuid'
}
```

Reply shape:

```js
{
  re: 'uuid',
  result: value,
  error: serializedError
}
```

## Security Notes

- Always pass explicit origins for cross-origin iframe or window messaging.
- `Server` origin filtering is opt-in. If you want origin enforcement, provide one or more origins to the constructor.
- `Client` reply origin filtering is opt-in. Use `replyOrigins` when the reply event includes a meaningful origin.

## Mental Model

`quickbus` has two pieces:

- `Server` listens for inbound `message` events, dispatches the requested action to a handler object, and posts the result back to the sender.
- `Client` sends `{ action, params, token }` messages and resolves a promise when the matching `{ re: token, result, error }` reply arrives.

The important design detail is that the place you send to is not always the place you listen on:

- parent page -> iframe:
  `to = iframe.contentWindow`, `from = window`
- child iframe -> parent:
  `to = window.parent`, `from = window`
- `MessagePort`:
  `to = port`, `from = port`
- service worker from a page:
  `to = navigator.serviceWorker.controller`, `from = navigator.serviceWorker`

That is why `Client` uses named transport options and wrapper helpers instead of a single positional constructor.

## Development

Available scripts:

```bash
npm run build
npm test
npm run test:e2e
npm run lint
npm run tsc
```

What they do:

- `npm run build`: rebuilds the published root artifacts from `source/`
- `npm test`: runs the Node unit tests in `test/*.test.mjs`
- `npm run test:e2e`: runs the Playwright browser transport tests
- `npm run lint`: runs ESLint on `source/`
- `npm run tsc`: runs TypeScript checking against the JSDoc-typed source

## Current Browser Coverage

The Playwright suite currently verifies:

- parent page -> iframe RPC
- child iframe -> parent window RPC
- page -> service worker RPC

## License

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

Copyright 2025-2026 Sean Morris
