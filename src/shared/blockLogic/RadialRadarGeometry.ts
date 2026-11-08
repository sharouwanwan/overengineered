export const radialFields = new Map<BlockModel, { radius: number; enabled: boolean }>();

/** Build bounds may intersect the sphere; player roots use a zero-size bound. */
export function radialContains(delta: Vector3, radius: number, targetRadius = 0): boolean {
	return delta.Dot(delta) <= (radius + targetRadius) ** 2;
}
