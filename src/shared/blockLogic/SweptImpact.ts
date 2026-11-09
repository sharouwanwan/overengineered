/** Segment against an expanded box, in the moving target's relative frame. */
export function sweptImpact(start: Vector3, finish: Vector3, half: Vector3): number | undefined {
	let enter = 0,
		leave = 1;
	const axis = (a: number, b: number, extent: number) => {
		const delta = b - a;
		if (math.abs(delta) < 1e-8) return math.abs(a) <= extent;
		const x = (-extent - a) / delta,
			y = (extent - a) / delta;
		enter = math.max(enter, math.min(x, y));
		leave = math.min(leave, math.max(x, y));
		return enter <= leave;
	};
	return axis(start.X, finish.X, half.X) && axis(start.Y, finish.Y, half.Y) && axis(start.Z, finish.Z, half.Z)
		? enter
		: undefined;
}
