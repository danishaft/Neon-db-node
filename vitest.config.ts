import { defineConfig } from 'vitest/config';

export default defineConfig({
	logLevel: 'error',
	test: {
		include: ['test/**/*.test.ts'],
	},
});
