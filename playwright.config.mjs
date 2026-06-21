import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: './test/playwright',
	timeout: 30_000,
	fullyParallel: true,
	use: {
		headless: true,
		serviceWorkers: 'allow'
	},
	projects: [
		{
			name: 'chromium',
			use: {
				browserName: 'chromium',
				channel: 'chromium'
			}
		}
	]
});
