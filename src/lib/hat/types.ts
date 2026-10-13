import type { Group, Material } from 'three';

export interface HatInput {
	time: number;
	dt: number;
	/** відкритість рота 0..1 — з обвідної голосу */
	mouth: number;
	/** форма рота: 0 — кругла «о/у», 1 — широка «і/е/с» */
	wide: number;
	/** капелюх зараз говорить 0..1 (плавно) — більше жестів */
	talk: number;
	/** кліпання 0..1 */
	blink: number;
	/** прокинувся 0..1 — вогники в очах */
	awake: number;
}

/**
 * Будь-який капелюх: процедурний або з .glb.
 * root: висота ≈ 1, основа в нулі, обличчям до +Z.
 */
export interface Hat {
	root: Group;
	/** матеріали, яким сцена ставить площину відсікання (капелюх «вилазить» з паперу) */
	materials: Material[];
	update(input: HatInput): void;
	dispose(): void;
}
