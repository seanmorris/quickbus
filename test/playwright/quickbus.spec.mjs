import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(dirname, '../..');

const files = {
	'/Client.mjs': path.join(repoRoot, 'Client.mjs'),
	'/Server.mjs': path.join(repoRoot, 'Server.mjs')
};

const html = {
	'/iframe-parent.html': `<!doctype html>
<html>
	<body>
		<div id="result">loading</div>
		<iframe id="child" src="/iframe-child.html"></iframe>
		<script type="module">
			import { Client } from '/Client.mjs';

			const result = document.querySelector('#result');
			const iframe = document.querySelector('#child');

			iframe.addEventListener('load', async () => {
				try
				{
					const bus = Client.forIframe(iframe, window.location.origin);
					result.textContent = await bus.sayHello('World');
				}
				catch(error)
				{
					result.textContent = String(error);
				}
			}, { once: true });
		</script>
	</body>
</html>`,
	'/iframe-child.html': `<!doctype html>
<html>
	<body>
		<script type="module">
			import { Server } from '/Server.mjs';

			const server = new Server({
				sayHello(to) {
					return 'Hello, ' + to + '!';
				}
			}, window.location.origin);

			window.addEventListener('message', event => server.handleMessageEvent(event));
		</script>
	</body>
</html>`,
	'/window-parent.html': `<!doctype html>
<html>
	<body>
		<iframe id="child" src="/window-child.html"></iframe>
		<script type="module">
			import { Server } from '/Server.mjs';

			const server = new Server({
				sayHello(to) {
					return 'Hello from ' + to + '!';
				}
			}, window.location.origin);

			window.addEventListener('message', event => server.handleMessageEvent(event));
		</script>
	</body>
</html>`,
	'/window-child.html': `<!doctype html>
<html>
	<body>
		<div id="result">loading</div>
		<script type="module">
			import { Client } from '/Client.mjs';

			const result = document.querySelector('#result');

			try
			{
				const bus = Client.forWindow(window.parent, window.location.origin);
				result.textContent = await bus.sayHello('Parent');
			}
			catch(error)
			{
				result.textContent = String(error);
			}
		</script>
	</body>
</html>`,
	'/service-worker-page.html': `<!doctype html>
<html>
	<body>
		<div id="result">loading</div>
	</body>
</html>`,
	'/sw.mjs': `import { Server } from '/Server.mjs';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const server = new Server({
	sayHello(to) {
		return 'Hello, ' + to + '!';
	}
});

self.addEventListener('message', event => {
	server.handleMessageEvent(event);
});`
};

const createFixtureServer = async() => {
	const moduleCache = new Map();

	for(const [route, filePath] of Object.entries(files))
	{
		moduleCache.set(route, await readFile(filePath, 'utf8'));
	}

	const server = createServer((request, response) => {
		const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;

		if(moduleCache.has(pathname))
		{
			response.writeHead(200, {'content-type': 'text/javascript; charset=utf-8'});
			response.end(moduleCache.get(pathname));
			return;
		}

		if(pathname in html)
		{
			response.writeHead(200, {'content-type': pathname.endsWith('.mjs') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8'});
			response.end(html[pathname]);
			return;
		}

		response.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
		response.end('Not found');
	});

	await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

	const address = server.address();

	if(!address || typeof address === 'string')
	{
		throw new TypeError('Expected an ephemeral TCP port for the Playwright fixture server.');
	}

	return {
		baseUrl: `http://127.0.0.1:${address.port}`,
		close: () => new Promise((resolve, reject) => {
			server.close(error => error ? reject(error) : resolve());
		})
	};
};

test.describe('quickbus browser transports', () => {
	/** @type {{ baseUrl: string, close: () => Promise<void> }} */
	let fixtureServer;

	test.beforeAll(async() => {
		fixtureServer = await createFixtureServer();
	});

	test.afterAll(async() => {
		await fixtureServer.close();
	});

	test('supports parent-to-iframe rpc', async({ page }) => {
		await page.goto(`${fixtureServer.baseUrl}/iframe-parent.html`);
		await expect(page.locator('#result')).toHaveText('Hello, World!');
	});

	test('supports child-to-parent window rpc', async({ page }) => {
		await page.goto(`${fixtureServer.baseUrl}/window-parent.html`);
		await expect(page.frameLocator('#child').locator('#result')).toHaveText('Hello from Parent!');
	});

	test('supports page-to-service-worker rpc', async({ page }) => {
		await page.goto(`${fixtureServer.baseUrl}/service-worker-page.html`);
		const result = page.locator('#result');
		const firstPass = await page.evaluate(async() => {
			const { Client } = await import('/Client.mjs');
			const resultNode = document.querySelector('#result');
			const hadController = Boolean(navigator.serviceWorker.controller);

			await navigator.serviceWorker.register('/sw.mjs', { type: 'module' });
			await navigator.serviceWorker.ready;

			if(!hadController)
			{
				resultNode.textContent = 'registered';
				return 'registered';
			}

			const bus = Client.forServiceWorker(navigator.serviceWorker);
			const text = await bus.sayHello('Worker');
			resultNode.textContent = text;
			return text;
		});

		if(firstPass === 'registered')
		{
			await page.reload();

			const secondPass = await page.evaluate(async() => {
				const { Client } = await import('/Client.mjs');
				const resultNode = document.querySelector('#result');
				const bus = Client.forServiceWorker(navigator.serviceWorker);
				const text = await bus.sayHello('Worker');
				resultNode.textContent = text;
				return text;
			});

			expect(secondPass).toBe('Hello, Worker!');
		}

		await expect(result).toHaveText('Hello, Worker!', { timeout: 10_000 });
	});
});
