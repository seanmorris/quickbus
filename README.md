 # quickbus

 A lightweight promise-based RPC wrapper for ServiceWorker messaging.

 ## Installation

 ```bash
 npm install quickbus
 ```

 ## Usage

 ### Server side

 ```js
 import { Server } from 'quickbus';

 const handler = {
   echo(data) {
     return data;
   }
 };

 const server = new Server(handler);
 navigator.serviceWorker.addEventListener(
   'message',
   server.handleMessageEvent.bind(server)
 );
 ```

 ### Client side

 ```js
 import { client } from 'quickbus';

 (async () => {
   const cl = new client(navigator.serviceWorker.controller);
   const response = await cl.echo('Hello, world!');
   console.log(response);
 })();
 ```

 ## API

 - `client(recipient)`: creates a proxy for invoking remote methods.
 - `Server(handler, origin?)`: dispatches incoming messages to `handler` and replies via postMessage.