import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// GitHub Pages віддає лише статику; adapter-node тут нема на чому запустити
		adapter: adapter({ fallback: '404.html' }),
		// для Pages на github.io/<repo> задати BASE_PATH=/<repo> під час збірки
		paths: { base: process.env.BASE_PATH ?? '', relative: true }
	}
};
