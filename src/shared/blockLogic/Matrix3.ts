/** Row-major 3x3 matrix. Vectors are multiplied as columns. */
export type Matrix3 = {
	readonly m11: number;
	readonly m12: number;
	readonly m13: number;
	readonly m21: number;
	readonly m22: number;
	readonly m23: number;
	readonly m31: number;
	readonly m32: number;
	readonly m33: number;
};
export namespace Matrix3 {
	export const keys = ["m11", "m12", "m13", "m21", "m22", "m23", "m31", "m32", "m33"] as const;
	export const zero: Matrix3 = { m11: 0, m12: 0, m13: 0, m21: 0, m22: 0, m23: 0, m31: 0, m32: 0, m33: 0 };
	export const identity: Matrix3 = { m11: 1, m12: 0, m13: 0, m21: 0, m22: 1, m23: 0, m31: 0, m32: 0, m33: 1 };
	export function rows(a: Vector3, b: Vector3, c: Vector3): Matrix3 {
		return { m11: a.X, m12: a.Y, m13: a.Z, m21: b.X, m22: b.Y, m23: b.Z, m31: c.X, m32: c.Y, m33: c.Z };
	}
	export function transform(a: Matrix3, v: Vector3): Vector3 {
		return new Vector3(
			a.m11 * v.X + a.m12 * v.Y + a.m13 * v.Z,
			a.m21 * v.X + a.m22 * v.Y + a.m23 * v.Z,
			a.m31 * v.X + a.m32 * v.Y + a.m33 * v.Z,
		);
	}
	export function transpose(a: Matrix3): Matrix3 {
		return {
			m11: a.m11,
			m12: a.m21,
			m13: a.m31,
			m21: a.m12,
			m22: a.m22,
			m23: a.m32,
			m31: a.m13,
			m32: a.m23,
			m33: a.m33,
		};
	}
	export function add(a: Matrix3, b: Matrix3, scale = 1): Matrix3 {
		return {
			m11: a.m11 + b.m11 * scale,
			m12: a.m12 + b.m12 * scale,
			m13: a.m13 + b.m13 * scale,
			m21: a.m21 + b.m21 * scale,
			m22: a.m22 + b.m22 * scale,
			m23: a.m23 + b.m23 * scale,
			m31: a.m31 + b.m31 * scale,
			m32: a.m32 + b.m32 * scale,
			m33: a.m33 + b.m33 * scale,
		};
	}
	export function scale(a: Matrix3, n: number): Matrix3 {
		return {
			m11: a.m11 * n,
			m12: a.m12 * n,
			m13: a.m13 * n,
			m21: a.m21 * n,
			m22: a.m22 * n,
			m23: a.m23 * n,
			m31: a.m31 * n,
			m32: a.m32 * n,
			m33: a.m33 * n,
		};
	}
	export function multiply(a: Matrix3, b: Matrix3): Matrix3 {
		return {
			m11: a.m11 * b.m11 + a.m12 * b.m21 + a.m13 * b.m31,
			m12: a.m11 * b.m12 + a.m12 * b.m22 + a.m13 * b.m32,
			m13: a.m11 * b.m13 + a.m12 * b.m23 + a.m13 * b.m33,
			m21: a.m21 * b.m11 + a.m22 * b.m21 + a.m23 * b.m31,
			m22: a.m21 * b.m12 + a.m22 * b.m22 + a.m23 * b.m32,
			m23: a.m21 * b.m13 + a.m22 * b.m23 + a.m23 * b.m33,
			m31: a.m31 * b.m11 + a.m32 * b.m21 + a.m33 * b.m31,
			m32: a.m31 * b.m12 + a.m32 * b.m22 + a.m33 * b.m32,
			m33: a.m31 * b.m13 + a.m32 * b.m23 + a.m33 * b.m33,
		};
	}
	export function determinant(a: Matrix3): number {
		return (
			a.m11 * (a.m22 * a.m33 - a.m23 * a.m32) -
			a.m12 * (a.m21 * a.m33 - a.m23 * a.m31) +
			a.m13 * (a.m21 * a.m32 - a.m22 * a.m31)
		);
	}
	export function inverse(a: Matrix3): Matrix3 | undefined {
		let magnitude = 0;
		for (const k of keys) magnitude = math.max(magnitude, math.abs(a[k]));
		if (magnitude === 0 || magnitude !== magnitude || magnitude === math.huge) return undefined;
		const n = scale(a, 1 / magnitude),
			d = determinant(n);
		if (math.abs(d) < 1e-10 || d !== d) return undefined;
		return scale(
			{
				m11: n.m22 * n.m33 - n.m23 * n.m32,
				m12: n.m13 * n.m32 - n.m12 * n.m33,
				m13: n.m12 * n.m23 - n.m13 * n.m22,
				m21: n.m23 * n.m31 - n.m21 * n.m33,
				m22: n.m11 * n.m33 - n.m13 * n.m31,
				m23: n.m13 * n.m21 - n.m11 * n.m23,
				m31: n.m21 * n.m32 - n.m22 * n.m31,
				m32: n.m12 * n.m31 - n.m11 * n.m32,
				m33: n.m11 * n.m22 - n.m12 * n.m21,
			},
			1 / (d * magnitude),
		);
	}
}
