<script lang="ts">
	import '../styles/app.scss';
	import { onMount } from 'svelte';

	let { children } = $props();

	onMount(() => {
		try {
			const saved = localStorage.getItem('theme');
			if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved;
		} catch {
			/* приватний режим — лишаємо темну */
		}
	});
</script>

{@render children()}
