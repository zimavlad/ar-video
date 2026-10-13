<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { base } from '$app/paths';
	import { config } from '$lib/config';
	import { addToCalendar, when } from '$lib/calendar';
	import { cueAt, Voice, type Cue } from '$lib/voice';
	import { detectTier, FrameGuard } from '$lib/quality';
	import type { Stage, Tier } from '$lib/hat/stage';
	import Icon from '$lib/components/Icon.svelte';

	/**
	 * Усе відбувається поверх відео з камери:
	 *   камера вмикається одразу → QR у кадрі → капелюх вилазить і світиться,
	 *   підказка «Увімкни звук» → дотик будь-де → говорить → «Деталі».
	 * Дотик потрібен лише тому, що браузер не дає звук без жесту.
	 * Якщо дотик був раніше за QR — говорить одразу, як з’явиться.
	 * Без камери — той самий капелюх на темному тлі.
	 */

	const ui = config.ui;
	const CLOSED = { open: 0, wide: 0.5 };
	/** ?debug&mouth=0.8 — тримати рот відкритим і капелюх прокинутим (для скріншотів) */
	const forcedMouth = () => {
		const value = import.meta.env.DEV ? params().get('mouth') : null;
		return value === null ? null : { open: Number(value), wide: 0.3 };
	};
	const date = when(config.event);
	const asset = (path: string) => `${base}/${path}`;

	let mode = $state<'starting' | 'live' | 'fallback'>('starting');
	let note = $state('');
	let found = $state(false);
	let lost = $state(false);
	/** людина торкнулась екрана — звук дозволено */
	let touched = $state(false);
	let offerFallback = $state(false);
	let finished = $state(false);
	let detailsOpen = $state(false);
	let muted = $state(false);
	let cue = $state('');

	let stageEl: HTMLDivElement;

	let tier: Tier = 'high';
	let voice: Voice | null = null;
	let stage: Stage | null = null;
	let stopHost: (() => void) | null = null;
	let lines: Cue[] = [];
	let timers: ReturnType<typeof setTimeout>[] = [];
	let speechStarted = $state(false);

	const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
	const t = (ms: number) => (reduced() ? 0 : ms);
	const later = (fn: () => void, ms: number) => timers.push(setTimeout(fn, ms));
	const params = () => new URLSearchParams(location.search);
	const inAppBrowser = () => /FBAN|FBAV|Instagram|Line\/|Telegram|TwitterAndroid|; wv\)/i.test(navigator.userAgent);

	onMount(() => {
		tier = detectTier();
		voice = new Voice(asset(config.assets.audio));
		voice.analyse();
		voice.audio.addEventListener('ended', () => {
			finished = true;
			cue = '';
		});

		const onVisibility = () => {
			if (!voice || !speechStarted || finished) return;
			if (document.hidden) voice.audio.pause();
			else voice.audio.play().catch(() => (touched = false));
		};
		document.addEventListener('visibilitychange', onVisibility);

		startCamera();
		return () => document.removeEventListener('visibilitychange', onVisibility);
	});

	onDestroy(teardown);

	function teardown() {
		timers.forEach(clearTimeout);
		timers = [];
		stopHost?.();
		stopHost = null;
		stage?.dispose();
		stage = null;
	}

	async function makeHat() {
		if (config.assets.hatModel) {
			try {
				const { glbHat } = await import('$lib/hat/glb');
				return await glbHat(asset(config.assets.hatModel));
			} catch {
				/* модель не завантажилась — процедурний капелюх не підведе */
			}
		}
		const { proceduralHat } = await import('$lib/hat/procedural');
		return proceduralHat(tier);
	}

	async function startCamera() {
		const hatReady = Promise.all([import('$lib/hat/stage'), makeHat()]);
		if (params().has('fallback')) return startFallback('');
		if (typeof navigator.mediaDevices?.getUserMedia !== 'function') return startFallback(inAppBrowser() ? ui.inApp : ui.unsupported);

		let stream: MediaStream;
		try {
			if (import.meta.env.DEV && params().has('fakecam')) stream = await (await import('$lib/ar/fake-camera')).fakeCamera(location.origin);
			else stream = await navigator.mediaDevices.getUserMedia({
				audio: false,
				video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
			});
		} catch (error) {
			const denied = (error as DOMException)?.name === 'NotAllowedError';
			return startFallback(denied ? ui.cameraDenied : inAppBrowser() ? ui.inApp : ui.unsupported);
		}

		try {
			const [{ startQrAr }, [{ Stage }, hat]] = await Promise.all([import('$lib/ar/qr-ar'), hatReady]);
			const host = await startQrAr({
				container: stageEl,
				stream,
				tier,
				onFound: () => {
					found = true;
					lost = false;
					offerFallback = false;
					if (stage && !stage.emerged) {
						stage.emerge();
						if (touched) {
							stage.wake();
							later(speak, 1300);
						}
					}
				},
				onLost: () => (lost = true)
			});
			stopHost = host.stop;
			stage = new Stage(host.scene, host.camera, host.renderer, hat, tier, config.tracking.hatScale);
			mode = 'live';
			if (params().has('debug')) Object.assign(window, { __dbg: { stage, host, voice } });
			later(() => {
				if (!found) offerFallback = true;
			}, config.tracking.offerFallbackAfter * 1000);

			const guard = new FrameGuard(() => {
				tier = 'low';
				stage?.setTier('low');
				host.renderer.setPixelRatio(1);
			});
			let last = performance.now();
			host.renderer.setAnimationLoop(() => {
				const now = performance.now();
				const raw = (now - last) / 1000;
				const dt = Math.min(0.05, raw);
				last = now;
				guard.push(raw);
				if (!stage) return;
				stage.setCard(host.pose(), dt);
				stage.update(dt, voice?.mouth() ?? CLOSED, voice?.playing ?? false);
				host.renderer.render(host.scene, host.camera);
				tickCue();
			});
		} catch {
			stream.getTracks().forEach((track) => track.stop());
			startFallback(ui.unsupported);
		}
	}

	async function startFallback(reason: string) {
		teardown();
		note = reason;
		mode = 'fallback';
		found = true;
		lost = false;
		offerFallback = false;
		const [{ startFallback }, { Stage }, hat] = await Promise.all([import('$lib/hat/fallback'), import('$lib/hat/stage'), makeHat()]);
		const host = startFallback(stageEl, tier, config.tracking.hatScale);
		stopHost = host.stop;
		stage = new Stage(host.scene, host.camera, host.renderer, hat, tier, config.tracking.hatScale);
		stage.setCard(host.anchor, 0);
		if (touched || forcedMouth()) stage.wake();
		later(() => stage?.emerge(), t(400) || 1);
		if (touched) later(speak, 1500);
		if (params().has('debug')) Object.assign(window, { __dbg: { stage, host, voice } });

		const guard = new FrameGuard(() => {
			tier = 'low';
			stage?.setTier('low');
			host.renderer.setPixelRatio(1);
		});
		let last = performance.now();
		host.renderer.setAnimationLoop(() => {
			const now = performance.now();
			const raw = (now - last) / 1000;
			const dt = Math.min(0.05, raw);
			last = now;
			guard.push(raw);
			if (!stage) return;
			host.tick(dt);
			const forced = forcedMouth();
			stage.update(dt, forced ?? voice?.mouth() ?? CLOSED, forced ? true : (voice?.playing ?? false));
			host.renderer.render(host.scene, host.camera);
			tickCue();
		});
	}

	/**
	 * Дотик будь-де (крім кнопок). Звук запускаємо синхронно тут же:
	 * iOS дозволяє його лише в тому ж кроці, що й жест.
	 */
	function onTouch(event: PointerEvent) {
		if (touched || !voice || (event.target as HTMLElement).closest('button, a')) return;
		touched = true;
		stage?.wake();
		if (stage?.emerged) speak();
		else voice.unlock();
	}

	function speak() {
		if (!voice || speechStarted) return;
		speechStarted = true;
		finished = false;
		lines = voice.cues(config.speech.lines);
		voice.start().then((ok) => {
			if (ok) return;
			// браузер не дав звук — знову просимо дотик
			speechStarted = false;
			touched = false;
		});
	}

	function replay() {
		if (!voice) return;
		finished = false;
		detailsOpen = false;
		stage?.puff(0.6);
		voice.start();
	}

	function toggleMute() {
		muted = !muted;
		if (voice) voice.audio.muted = muted;
	}

	function tickCue() {
		const text = voice && speechStarted && !finished ? (cueAt(lines, voice.time)?.text ?? '') : '';
		if (text !== cue) cue = text;
	}
</script>

<svelte:head>
	<title>{config.event.title} — запрошення</title>
	<meta name="description" content="Запрошення: {config.event.title}, {date.day} о {date.time}" />
</svelte:head>

<main class="app" data-mode={mode} onpointerdown={onTouch}>
	<div class="stage" bind:this={stageEl}></div>

	<header class="bar">
		{#if note}
			<p class="note" in:fly={{ y: -8, duration: t(220), easing: cubicOut }}>{note}</p>
		{:else}
			<span></span>
		{/if}
		{#if speechStarted || finished}
			<button class="icon-btn" onclick={toggleMute} aria-label={muted ? ui.unmute : ui.mute} in:fade={{ duration: t(180) }}>
				<Icon name={muted ? 'mute' : 'sound'} />
			</button>
		{/if}
	</header>

	{#if mode === 'starting'}
		<p class="center" transition:fade={{ duration: t(180) }}>{ui.starting}</p>
	{/if}

	{#if mode === 'live' && !found}
		<div class="reticle" aria-hidden="true" transition:fade={{ duration: t(200) }}><i></i><i></i><i></i><i></i></div>
	{/if}

	{#if lost && !finished && mode === 'live'}
		<p class="toast" transition:fly={{ y: -6, duration: t(200), easing: cubicOut }}>{ui.lost}</p>
	{/if}

	{#if found && !touched && mode !== 'starting'}
		<div class="sound-wrap" transition:fly={{ y: 10, duration: t(240), easing: cubicOut }}>
			<div class="sound" role="status">
				<span class="sound-icon"><Icon name="sound" size={22} /></span>
				<span class="sound-text">
					<b>{ui.sound}</b>
					<span>{ui.soundHint}</span>
				</span>
			</div>
		</div>
	{/if}

	<footer class="bottom">
		{#if finished}
			<div class="row" in:fly={{ y: 12, duration: t(240), easing: cubicOut }}>
				<button class="primary" onclick={() => (detailsOpen = true)}>
					<Icon name="calendar" /><span>{ui.details}</span>
				</button>
				<button class="icon-btn big" onclick={replay} aria-label={ui.replay}><Icon name="replay" /></button>
			</div>
		{:else if cue}
			{#key cue}
				<p class="cue" in:fly={{ y: 6, duration: t(180), easing: cubicOut }}>{cue}</p>
			{/key}
		{:else if mode === 'live' && !found}
			<div class="stack">
				<p class="hint" transition:fade={{ duration: t(180) }}>{ui.point}</p>
				{#if offerFallback}
					<button class="ghost" onclick={() => startFallback('')} in:fly={{ y: 8, duration: t(220), easing: cubicOut }}>
						<span class="muted">{ui.noQr}</span>
						<span>{ui.noQrAction}</span>
						<Icon name="arrow" size={18} />
					</button>
				{/if}
			</div>
		{/if}
	</footer>

	{#if detailsOpen}
		<div class="scrim" role="presentation" onclick={() => (detailsOpen = false)} transition:fade={{ duration: t(180) }}></div>
		<div class="sheet" role="dialog" aria-modal="true" aria-label={ui.details} transition:fly={{ y: 40, duration: t(240), easing: cubicOut }}>
			<header>
				<h2>{config.event.title}</h2>
				<button class="icon-btn" onclick={() => (detailsOpen = false)} aria-label={ui.close}><Icon name="close" /></button>
			</header>
			<dl>
				<div>
					<dt>Коли</dt>
					<dd>
						<span class="big num">{date.time}</span>
						<span>{date.day}, {date.weekday}</span>
					</dd>
				</div>
				<div>
					<dt>Де</dt>
					<dd>
						<span>{config.event.place}</span>
						<span class="muted">{config.event.address}</span>
					</dd>
				</div>
			</dl>
			<p class="muted small">{config.event.note}</p>
			<div class="row">
				<button class="primary" onclick={() => addToCalendar(config.event)}>
					<Icon name="calendar" /><span>{ui.calendar}</span>
				</button>
				{#if config.event.mapUrl}
					<a class="ghost" href={config.event.mapUrl} target="_blank" rel="noopener"><Icon name="pin" /><span>{ui.map}</span></a>
				{/if}
			</div>
		</div>
	{/if}
</main>

<style lang="scss">
	.app {
		position: fixed;
		inset: 0;
		overflow: hidden;
		background: #000;
		user-select: none;
		-webkit-user-select: none;
		&[data-mode='fallback'] {
			background:
				radial-gradient(70% 45% at 50% 60%, color-mix(in srgb, var(--gold) 14%, transparent), transparent 70%),
				radial-gradient(140% 90% at 50% 110%, var(--bg-deep), transparent 70%),
				var(--bg);
		}
	}
	.stage {
		position: absolute;
		inset: 0;
		overflow: hidden;
	}

	.bar {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: var(--safe-t) var(--safe-r) 0 var(--safe-l);
	}

	/* поверх відео все на напівпрозорих підкладках: камера може показати що завгодно */
	%glass {
		border: 1px solid rgba(255, 255, 255, 0.16);
		background: rgba(14, 11, 9, 0.55);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		color: #f3e9d2;
	}

	.icon-btn {
		@extend %glass;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: var(--r);
		transition:
			border-color var(--fast) var(--ease),
			transform var(--fast) var(--ease);
		&:hover {
			border-color: rgba(255, 255, 255, 0.36);
		}
		&:active {
			transform: scale(0.95);
		}
		&.big {
			width: 54px;
			height: 54px;
			flex: none;
		}
	}

	.primary,
	.ghost {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		min-height: 54px;
		padding: 0 22px;
		border-radius: var(--r);
		font-weight: 500;
		font-size: 17px;
		text-decoration: none;
		transition:
			transform var(--fast) var(--ease),
			border-color var(--fast) var(--ease),
			background var(--fast) var(--ease);
		&:active {
			transform: scale(0.97);
		}
	}
	.primary {
		border: 1px solid #dcae55;
		background: #dcae55;
		color: #1a130a;
		&:hover {
			background: #e6bd6c;
		}
	}
	.ghost {
		@extend %glass;
		&:hover {
			border-color: rgba(255, 255, 255, 0.36);
		}
	}
	.muted {
		color: rgba(243, 233, 210, 0.66);
	}
	.small {
		font-size: 15px;
	}

	.note,
	.toast,
	.hint {
		@extend %glass;
		margin: 0;
		padding: 9px 14px;
		border-radius: var(--r);
		font-size: 15px;
		line-height: 1.3;
	}
	.toast {
		position: absolute;
		top: calc(var(--safe-t) + 56px);
		left: 50%;
		transform: translateX(-50%);
		white-space: nowrap;
		border-radius: 999px;
	}
	.hint {
		align-self: center;
		text-align: center;
	}

	.center {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
		color: rgba(243, 233, 210, 0.7);
	}

	/* приціл під QR: квадрат по центру */
	.reticle {
		position: absolute;
		left: 50%;
		top: 46%;
		width: min(58vw, 260px);
		aspect-ratio: 1;
		transform: translate(-50%, -50%);
		animation: breathe 2.4s ease-in-out infinite;
		i {
			position: absolute;
			width: 30%;
			height: 30%;
			border: 0 solid #8fd3c2;
		}
		i:nth-child(1) {
			top: 0;
			left: 0;
			border-width: 3px 0 0 3px;
			border-top-left-radius: var(--r-lg);
		}
		i:nth-child(2) {
			top: 0;
			right: 0;
			border-width: 3px 3px 0 0;
			border-top-right-radius: var(--r-lg);
		}
		i:nth-child(3) {
			bottom: 0;
			left: 0;
			border-width: 0 0 3px 3px;
			border-bottom-left-radius: var(--r-lg);
		}
		i:nth-child(4) {
			bottom: 0;
			right: 0;
			border-width: 0 3px 3px 0;
			border-bottom-right-radius: var(--r-lg);
		}
	}

	.bottom {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		justify-content: center;
		padding: 48px var(--safe-r) var(--safe-b) var(--safe-l);
		background: linear-gradient(to top, rgba(0, 0, 0, 0.55), transparent);
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 10px;
		width: 100%;
		max-width: 440px;
	}
	/* «Увімкни звук»: висить над капелюхом, поки людина не торкнеться */
	/* центруємо обгорткою: transform плашки зайнятий анімаціями */
	.sound-wrap {
		position: absolute;
		left: 0;
		right: 0;
		bottom: calc(var(--safe-b) + 28px);
		display: flex;
		justify-content: center;
		pointer-events: none;
	}
	.sound {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 18px 12px 12px;
		border-radius: var(--r-lg);
		border: 1px solid rgba(255, 210, 130, 0.45);
		background: rgba(20, 15, 10, 0.6);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
		color: #f8eed8;
		white-space: nowrap;
		animation: invite 2.6s var(--ease) infinite;
	}
	.sound-icon {
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		border-radius: var(--r);
		background: #dcae55;
		color: #1a130a;
	}
	.sound-text {
		display: flex;
		flex-direction: column;
		line-height: 1.2;
		b {
			font-weight: 500;
			font-size: 18px;
		}
		span {
			font-size: 14px;
			color: rgba(248, 238, 216, 0.72);
		}
	}
	.row {
		display: flex;
		gap: 10px;
		width: 100%;
		max-width: 440px;
		.primary {
			flex: 1;
		}
	}
	.cue {
		margin: 0;
		max-width: 440px;
		text-align: center;
		font-family: var(--display);
		font-style: italic;
		font-weight: 600;
		font-size: clamp(24px, 6.6vw, 32px);
		line-height: 1.15;
		color: #fbf3df;
		text-shadow: 0 1px 12px rgba(0, 0, 0, 0.7);
		text-wrap: balance;
	}

	.scrim {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.45);
	}
	.sheet {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		max-width: 520px;
		margin: 0 auto;
		padding: 16px var(--safe-r) var(--safe-b) var(--safe-l);
		border: 1px solid rgba(255, 255, 255, 0.16);
		border-bottom: 0;
		border-radius: var(--r-lg) var(--r-lg) 0 0;
		background: rgba(18, 14, 11, 0.86);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		color: #f3e9d2;
		header {
			display: flex;
			align-items: flex-start;
			justify-content: space-between;
			gap: 12px;
		}
		h2 {
			margin: 4px 0 14px;
			font-family: var(--display);
			font-style: italic;
			font-weight: 600;
			font-size: 34px;
			line-height: 1.05;
		}
		dl {
			display: grid;
			grid-template-columns: 1fr 1fr;
			margin: 0 0 14px;
			border: 1px solid rgba(255, 255, 255, 0.14);
			border-radius: var(--r);
			> div {
				padding: 12px 14px;
				&:first-child {
					border-right: 1px solid rgba(255, 255, 255, 0.14);
				}
			}
		}
		dt {
			font-size: 13px;
			color: rgba(243, 233, 210, 0.6);
			margin-bottom: 4px;
		}
		dd {
			margin: 0;
			display: flex;
			flex-direction: column;
			gap: 2px;
			line-height: 1.25;
		}
		.big {
			font-size: 28px;
			min-width: 5ch;
		}
	}

	@keyframes invite {
		50% {
			border-color: rgba(255, 210, 130, 0.9);
			transform: translateY(-3px);
		}
	}
	@keyframes breathe {
		50% {
			transform: translate(-50%, -50%) scale(1.03);
			opacity: 0.75;
		}
	}
</style>
