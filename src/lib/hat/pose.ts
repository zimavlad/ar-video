import { Matrix4, Quaternion, Vector3 } from 'three';

/**
 * Де і як стоїть капелюх відносно листівки.
 *
 * Граблі з AR_quest: орієнтацію «на око» підбирали під один випадок, і
 * в іншому все їхало. Тут правило одне й неперервне:
 *  - листівка лежить, а ми дивимось під кутом → капелюх стоїть на ній
 *    (вгору = нормаль листівки);
 *  - листівку тримають перед собою або дивляться згори → капелюх стоїть
 *    вертикально відносно екрана й висить перед листівкою;
 *  - між ними — плавне змішування, без стрибка.
 * Обличчя завжди повернуте до камери.
 */

export interface CardFrame {
	center: Vector3;
	/** вісь +Z мітки: з листівки до глядача */
	normal: Vector3;
	/** вісь +Y мітки: «верх» малюнка */
	up: Vector3;
	/** ширина мітки в одиницях сцени */
	width: number;
}

export interface HatPose {
	position: Vector3;
	quaternion: Quaternion;
	/** 0 — висить перед листівкою, 1 — стоїть на ній */
	stand: number;
}

const tmpQ = new Quaternion();
const tmpS = new Vector3();

export function cardFrame(m: Matrix4, out?: CardFrame): CardFrame {
	const frame = out ?? { center: new Vector3(), normal: new Vector3(), up: new Vector3(), width: 1 };
	m.decompose(frame.center, tmpQ, tmpS);
	frame.normal.set(0, 0, 1).applyQuaternion(tmpQ);
	frame.up.set(0, 1, 0).applyQuaternion(tmpQ);
	frame.width = tmpS.x;
	return frame;
}

const smoothstep = (a: number, b: number, x: number) => {
	const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
	return t * t * (3 - 2 * t);
};

const up = new Vector3();
const fwd = new Vector3();
const side = new Vector3();
const basis = new Matrix4();

/**
 * @param size висота капелюха в одиницях сцени
 * @param brim радіус крисів відносно висоти
 */
export function hatPose(
	card: CardFrame,
	cameraPos: Vector3,
	cameraUp: Vector3,
	size: number,
	brim = 0.62,
	out?: HatPose
): HatPose {
	const pose = out ?? { position: new Vector3(), quaternion: new Quaternion(), stand: 0 };
	const n = card.normal;

	const stand = smoothstep(0.1, 0.75, n.dot(cameraUp));
	up.copy(cameraUp).lerp(n, stand).normalize();

	// коли висить перед листівкою — відсуваємо на радіус крисів, щоб не
	// встромлявся в папір, і опускаємо, щоб займав середину малюнка
	const away = 1 - stand;
	pose.position
		.copy(card.center)
		.addScaledVector(n, size * brim * away * 1.05 + 0.004 * card.width)
		.addScaledVector(up, -size * 0.42 * away);

	// обличчям до камери, але лише поворотом навколо «вгору»
	fwd.copy(cameraPos).sub(pose.position);
	fwd.addScaledVector(up, -fwd.dot(up));
	if (fwd.lengthSq() < 1e-8) fwd.copy(card.up).addScaledVector(up, -card.up.dot(up)).negate();
	if (fwd.lengthSq() < 1e-8) fwd.set(0, 0, 1);
	fwd.normalize();
	side.crossVectors(up, fwd).normalize();
	fwd.crossVectors(side, up);
	basis.makeBasis(side, up, fwd);
	pose.quaternion.setFromRotationMatrix(basis);

	pose.stand = stand;
	return pose;
}
