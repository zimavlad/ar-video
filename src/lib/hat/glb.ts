import { Box3, Group, Mesh, Vector3, type Material } from 'three';
import type { Hat, HatInput } from './types';

/**
 * Капелюх з Blender (.glb) замість процедурного.
 *
 * Модель нормалізується сама: висота → 1, основа → нуль, центр по X/Z.
 * Обличчям вона має дивитись на +Z (у Blender це −Y при експорті з +Y Up).
 * Рот — морф-таргет «mouthOpen», кліпання — «blink» (обидва необов’язкові).
 * Дихання й хитання робить сцена для будь-якого капелюха.
 */
export async function glbHat(url: string): Promise<Hat> {
	const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
	const gltf = await new GLTFLoader().loadAsync(url);
	const model = gltf.scene;

	const box = new Box3().setFromObject(model);
	const size = box.getSize(new Vector3());
	const scale = 1 / Math.max(1e-6, size.y);
	model.scale.setScalar(scale);
	model.position.set(
		-((box.min.x + box.max.x) / 2) * scale,
		-box.min.y * scale,
		-((box.min.z + box.max.z) / 2) * scale
	);

	const root = new Group();
	root.add(model);

	const materials = new Set<Material>();
	const morphs: { mesh: Mesh; mouth?: number; blink?: number }[] = [];
	model.traverse((object) => {
		const mesh = object as Mesh;
		if (!mesh.isMesh) return;
		(Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => materials.add(m));
		const dict = mesh.morphTargetDictionary;
		if (dict) morphs.push({ mesh, mouth: dict.mouthOpen, blink: dict.blink });
	});

	return {
		root,
		materials: [...materials],
		update(input: HatInput) {
			for (const { mesh, mouth, blink } of morphs) {
				const influences = mesh.morphTargetInfluences;
				if (!influences) continue;
				if (mouth !== undefined) influences[mouth] = input.mouth;
				if (blink !== undefined) influences[blink] = input.blink;
			}
		},
		dispose() {
			model.traverse((object) => (object as Mesh).geometry?.dispose());
			materials.forEach((m) => m.dispose());
		}
	};
}
