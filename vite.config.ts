import { sveltekit } from '@sveltejs/kit/vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [
		// HTTPS у локальній мережі (самопідписаний сертифікат): камера в браузері
		// працює лише через https. Вмикається npm run phone
		...(process.env.HTTPS ? [basicSsl()] : []),
		sveltekit()
	],
	server: { host: true, allowedHosts: true },
	preview: { host: true, allowedHosts: true },
	test: { include: ['src/**/*.test.ts'] }
});
