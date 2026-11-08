/** Preserve the original seven slots, then place extra connectors in rings above the block. */
export function wireMarkerOffset(size: Vector3, index: number): Vector3 {
	const x = size.X / 2;
	const y = size.Y / 2;
	const z = size.Z / 2;
	const inset = 0.25;
	const original = [
		new Vector3(-x + inset, 0, 0),
		new Vector3(x - inset, 0, 0),
		new Vector3(0, 0, -z + inset),
		new Vector3(0, 0, z - inset),
		new Vector3(0, -y + inset, 0),
		new Vector3(0, y - inset, 0),
		Vector3.zero,
	];
	if (index < original.size()) return original[index];
	const extra = index - original.size();
	const angle = ((extra % 8) * math.pi) / 4;
	return new Vector3(
		math.max(x - inset, 0.35) * math.cos(angle),
		y + inset + math.floor(extra / 8) * 0.4,
		math.max(z - inset, 0.35) * math.sin(angle),
	);
}
