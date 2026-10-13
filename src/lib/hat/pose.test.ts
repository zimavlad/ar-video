import { describe, expect, it } from 'vitest';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { cardFrame, hatPose } from './pose';

const camera = new Vector3(0, 0, 0);
const cameraUp = new Vector3(0, 1, 0);

function card(rotation: Euler, position: Vector3, width = 1) {
	return cardFrame(new Matrix4().compose(position, new Quaternion().setFromEuler(rotation), new Vector3(width, width, width)));
}

const axis = (q: Quaternion, x: number, y: number, z: number) => new Vector3(x, y, z).applyQuaternion(q);

describe('hatPose', () => {
	it('листівка перед камерою: капелюх вертикальний, обличчям до глядача, перед папером', () => {
		const frame = card(new Euler(0, 0, 0), new Vector3(0, 0, -3));
		const pose = hatPose(frame, camera, cameraUp, 1);
		expect(pose.stand).toBe(0);
		expect(axis(pose.quaternion, 0, 1, 0).y).toBeCloseTo(1, 5);
		expect(axis(pose.quaternion, 0, 0, 1).z).toBeCloseTo(1, 5);
		expect(pose.position.z).toBeGreaterThan(-3); // ближче до камери, ніж листівка
	});

	it('листівка лежить, дивимось під 60°: капелюх стоїть на ній', () => {
		// нормаль листівки дивиться вгору й трохи до камери
		const frame = card(new Euler(-Math.PI / 2 + Math.PI / 6, 0, 0), new Vector3(0, -1, -2));
		const pose = hatPose(frame, camera, cameraUp, 1);
		expect(pose.stand).toBeCloseTo(1, 5);
		const hatUp = axis(pose.quaternion, 0, 1, 0);
		expect(hatUp.angleTo(frame.normal)).toBeLessThan(1e-4);
		expect(pose.position.distanceTo(frame.center)).toBeLessThan(0.01);
	});

	it('проміжний кут дає проміжний нахил, без стрибка', () => {
		let previous: Vector3 | null = null;
		for (let deg = 0; deg <= 90; deg += 1) {
			const frame = card(new Euler((-deg * Math.PI) / 180, 0, 0), new Vector3(0, 0, -2));
			const hatUp = axis(hatPose(frame, camera, cameraUp, 1).quaternion, 0, 1, 0);
			if (previous) expect(hatUp.angleTo(previous)).toBeLessThan(0.1);
			previous = hatUp;
		}
	});

	it('мітка збоку кадру: обличчя все одно повернуте до камери', () => {
		const frame = card(new Euler(0, 0.4, 0), new Vector3(1.5, 0, -3));
		const pose = hatPose(frame, camera, cameraUp, 1);
		const face = axis(pose.quaternion, 0, 0, 1);
		const toCamera = camera.clone().sub(pose.position).setY(0).normalize();
		expect(face.angleTo(toCamera)).toBeLessThan(0.02);
	});

	it('масштаб мітки читається з матриці', () => {
		expect(card(new Euler(), new Vector3(), 2.5).width).toBeCloseTo(2.5, 5);
	});
});
