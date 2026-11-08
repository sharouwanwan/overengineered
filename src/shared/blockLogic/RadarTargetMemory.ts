// Store world position, so held offsets remain meaningful as the radar moves.
export class RadarTargetMemory {
	private position?: Vector3;
	update(position: Vector3 | undefined, hold: boolean): Vector3 | undefined {
		if (position !== undefined || !hold) this.position = position;
		return this.position;
	}
	clear(): void {
		this.position = undefined;
	}
}
export function radarContainsPlayer(
	x: number,
	y: number,
	z: number,
	length: number,
	width: number,
	radial: boolean,
): boolean {
	if (radial) return x * x + y * y + z * z <= (width * width) / 4;
	const depth = y - 0.4;
	if (depth < 0 || depth > length) return false;
	const radius = (width * depth) / (2 * length);
	return x * x + z * z <= radius * radius;
}
