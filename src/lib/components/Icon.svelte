<script lang="ts">
	/** Власний невеликий набір іконок, лінія 1.6 */
	type Name = 'calendar' | 'pin' | 'replay' | 'sound' | 'mute' | 'close' | 'sun' | 'moon' | 'camera' | 'spark' | 'arrow';
	let { name, size = 20 }: { name: Name; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	{#if name === 'calendar'}
		<rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /><path d="M8 14h3" />
	{:else if name === 'pin'}
		<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" /><circle cx="12" cy="10" r="2.3" />
	{:else if name === 'replay'}
		<path d="M4 12a8 8 0 1 0 2.4-5.7" /><path d="M4 4v4.5h4.5" />
	{:else if name === 'sound'}
		<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
	{:else if name === 'mute'}
		<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="m16 9.5 5 5M21 9.5l-5 5" />
	{:else if name === 'close'}
		<path d="M6 6l12 12M18 6 6 18" />
	{:else if name === 'sun'}
		<circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
	{:else if name === 'moon'}
		<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10Z" />
	{:else if name === 'camera'}
		<path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" /><circle cx="12" cy="12.5" r="3.5" />
	{:else if name === 'spark'}
		<path d="M12 3c.6 4.4 2.6 6.4 7 7-4.4.6-6.4 2.6-7 7-.6-4.4-2.6-6.4-7-7 4.4-.6 6.4-2.6 7-7Z" />
	{:else if name === 'arrow'}
		<path d="M5 12h14M13 6l6 6-6 6" />
	{/if}
</svg>
