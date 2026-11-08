/** Attached parts share the TNT's replication delay. Compare them in the same server frame. */
export function tntBlastDistance(part: BasePart, center: Vector3): number {
	const point = part.CFrame.PointToObjectSpace(center);
	const half = part.Size.mul(0.5);
	return new Vector3(
		math.max(0, math.abs(point.X) - half.X),
		math.max(0, math.abs(point.Y) - half.Y),
		math.max(0, math.abs(point.Z) - half.Z),
	).Magnitude;
}

export function attachedBlastParts(
	parts: readonly BasePart[],
	root: BasePart,
	center: Vector3,
	radius: number,
): BasePart[] {
	return parts.filter((part) => part.AssemblyRootPart === root && tntBlastDistance(part, center) <= radius);
}
