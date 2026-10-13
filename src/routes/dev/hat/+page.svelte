<script lang="ts">
	import { onMount } from 'svelte';
	import { config } from '$lib/config';

	/**
	 * Лише для розробки: капелюх у заданому стані, один детермінований кадр —
	 * щоб знімати скріншоти без камери й без залежності від таймерів.
	 *   /dev/hat?mouth=0.8&wide=0.3&awake=1&t=4
	 */
	let el: HTMLDivElement;
	let ready = $state(false);

	onMount(async () => {
		if (!import.meta.env.DEV) return;
		const q = new URLSearchParams(location.search);
		const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
		const [{ startFallback }, { Stage }, { proceduralHat }] = await Promise.all([
			import('$lib/hat/fallback'),
			import('$lib/hat/stage'),
			import('$lib/hat/procedural')
		]);
		const host = startFallback(el, 'high', config.tracking.hatScale);
		const stage = new Stage(host.scene, host.camera, host.renderer, proceduralHat('high'), 'high', config.tracking.hatScale);
		stage.setCard(host.anchor, 0);
		if (num('awake', 1)) stage.wake();
		stage.emerge();
		const steps = Math.round(num('t', 4) * 60);
		const mouth = { open: num('mouth', 0), wide: num('wide', 0.5) };
		for (let i = 0; i < steps; i++) {
			host.tick(1 / 60);
			stage.update(1 / 60, mouth, mouth.open > 0);
		}
		// кадр той самий, але малюємо його постійно: інакше знімок бачить очищений буфер
		host.renderer.setAnimationLoop(() => host.renderer.render(host.scene, host.camera));
		Object.assign(window, { __dbg: { stage, host } });
		ready = true;
	});
</script>

<div class="stage" bind:this={el} data-ready={ready}></div>

<style>
	.stage {
		position: fixed;
		inset: 0;
		background: radial-gradient(70% 45% at 50% 60%, #3a2c18, transparent 70%), #120f0d;
	}
</style>
