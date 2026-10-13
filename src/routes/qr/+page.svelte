<script lang="ts">
	import { onMount } from 'svelte';
	import { base } from '$app/paths';
	import QRCode from 'qrcode';

	/**
	 * Тестовий QR: показати на екрані комп’ютера або роздрукувати.
	 * Той самий код і відкриває сторінку, і є якорем для капелюха.
	 * Адреса — ?url=… або адреса цього сайту.
	 */

	let svg = $state('');
	let url = $state('');

	onMount(async () => {
		url = new URLSearchParams(location.search).get('url') || new URL(`${base}/`, location.href).href;
		svg = await QRCode.toString(url, { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
	});
</script>

<svelte:head>
	<title>QR запрошення</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main>
	<div class="qr">{@html svg}</div>
	<p class="num">{url}</p>
</main>

<style>
	main {
		min-height: 100vh;
		display: grid;
		place-content: center;
		justify-items: center;
		gap: 16px;
		padding: 16px;
		background: #fff;
		color: #333;
	}
	/* біле поле довкола — «тиха зона», без неї QR читається гірше */
	.qr {
		width: min(70vmin, 520px);
		padding: 6%;
		background: #fff;
	}
	.qr :global(svg) {
		display: block;
		width: 100%;
		height: auto;
	}
	p {
		margin: 0;
		font-size: 13px;
		word-break: break-all;
		text-align: center;
	}
	@media print {
		p {
			display: none;
		}
	}
</style>
