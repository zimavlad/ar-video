import {
	AdditiveBlending,
	BufferAttribute,
	BufferGeometry,
	Color,
	NormalBlending,
	Points,
	ShaderMaterial,
	type Texture,
	Vector3
} from 'three';

/**
 * Частинки з власним розміром і прозорістю: іскри, димок, пил.
 * Розмір задається в одиницях групи, у якій лежать частинки, —
 * тому в AR (де листівка може бути «тисячею» одиниць) і в запасній
 * сцені вони виглядають однаково.
 */
export class Particles {
	readonly points: Points;
	private pos: Float32Array;
	private vel: Float32Array;
	private alpha: Float32Array;
	private size: Float32Array;
	private life: Float32Array;
	private maxLife: Float32Array;
	private baseSize: Float32Array;
	private next = 0;
	private material: ShaderMaterial;
	private geometry: BufferGeometry;

	constructor(
		readonly capacity: number,
		options: {
			color: string;
			map: Texture;
			additive?: boolean;
			/** прискорення вздовж +Y групи */
			lift?: number;
			drag?: number;
			/** у скільки разів частинка росте до кінця життя */
			grow?: number;
			/** як швидко з’являється: частка життя на наростання */
			fadeIn?: number;
			opacity?: number;
		}
	) {
		this.pos = new Float32Array(capacity * 3);
		this.vel = new Float32Array(capacity * 3);
		this.alpha = new Float32Array(capacity);
		this.size = new Float32Array(capacity);
		this.life = new Float32Array(capacity);
		this.maxLife = new Float32Array(capacity);
		this.baseSize = new Float32Array(capacity);
		this.geometry = new BufferGeometry();
		this.geometry.setAttribute('position', new BufferAttribute(this.pos, 3));
		this.geometry.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1));
		this.geometry.setAttribute('aSize', new BufferAttribute(this.size, 1));
		this.material = new ShaderMaterial({
			uniforms: {
				uMap: { value: options.map },
				uColor: { value: new Color(options.color) },
				uScale: { value: 1 },
				uOpacity: { value: options.opacity ?? 1 }
			},
			vertexShader: /* glsl */ `
				attribute float aAlpha;
				attribute float aSize;
				uniform float uScale;
				varying float vAlpha;
				void main() {
					vec4 mv = modelViewMatrix * vec4(position, 1.0);
					gl_Position = projectionMatrix * mv;
					gl_PointSize = aSize * uScale / max(0.0001, -mv.z);
					vAlpha = aAlpha;
				}`,
			fragmentShader: /* glsl */ `
				uniform sampler2D uMap;
				uniform vec3 uColor;
				uniform float uOpacity;
				varying float vAlpha;
				void main() {
					float a = texture2D(uMap, gl_PointCoord).a * vAlpha * uOpacity;
					if (a < 0.004) discard;
					gl_FragColor = vec4(uColor, a);
				}`,
			transparent: true,
			depthWrite: false,
			blending: options.additive ? AdditiveBlending : NormalBlending
		});
		this.points = new Points(this.geometry, this.material);
		this.points.frustumCulled = false;
		this.lift = options.lift ?? 0;
		this.drag = options.drag ?? 0;
		this.grow = options.grow ?? 1;
		this.fadeIn = options.fadeIn ?? 0.1;
	}

	private lift: number;
	private drag: number;
	private grow: number;
	private fadeIn: number;

	/** Скільки пікселів займає одиниця групи на відстані 1 від камери */
	setScale(pixelsPerUnit: number) {
		this.material.uniforms.uScale.value = pixelsPerUnit;
	}

	emit(position: Vector3, velocity: Vector3, life: number, size: number) {
		const i = this.next;
		this.next = (this.next + 1) % this.capacity;
		this.pos.set([position.x, position.y, position.z], i * 3);
		this.vel.set([velocity.x, velocity.y, velocity.z], i * 3);
		this.life[i] = 0;
		this.maxLife[i] = life;
		this.baseSize[i] = size;
	}

	update(dt: number) {
		const damp = Math.exp(-this.drag * dt);
		for (let i = 0; i < this.capacity; i++) {
			if (this.maxLife[i] <= 0) {
				this.alpha[i] = 0;
				continue;
			}
			this.life[i] += dt;
			const k = this.life[i] / this.maxLife[i];
			if (k >= 1) {
				this.maxLife[i] = 0;
				this.alpha[i] = 0;
				continue;
			}
			const j = i * 3;
			this.vel[j + 1] += this.lift * dt;
			this.vel[j] *= damp;
			this.vel[j + 1] *= damp;
			this.vel[j + 2] *= damp;
			this.pos[j] += this.vel[j] * dt;
			this.pos[j + 1] += this.vel[j + 1] * dt;
			this.pos[j + 2] += this.vel[j + 2] * dt;
			this.alpha[i] = Math.min(1, k / this.fadeIn) * (1 - k) * (1 - k);
			this.size[i] = this.baseSize[i] * (1 + (this.grow - 1) * k);
		}
		this.geometry.attributes.position.needsUpdate = true;
		this.geometry.attributes.aAlpha.needsUpdate = true;
		this.geometry.attributes.aSize.needsUpdate = true;
	}

	dispose() {
		this.geometry.dispose();
		this.material.dispose();
	}
}
