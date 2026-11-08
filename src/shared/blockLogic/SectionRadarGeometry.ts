export const sectionFields = new Map<BlockModel, { length: number; radius: number; enabled: boolean }>();
export function sectionFrame(model: Model): CFrame {
	return (model.PrimaryPart?.CFrame ?? model.GetPivot()).mul(new CFrame(0, 0.4, 0));
}
export function coneContainsSphere(p: Vector3, sphere: number, length: number, radius: number): boolean {
	if (p.Y < -sphere || p.Y > length + sphere) return false;
	const radialSquared = p.X * p.X + p.Z * p.Z;
	if (radialSquared > (radius + sphere) ** 2) return false;
	if (p.Y >= 0 && p.Y <= length && radialSquared <= ((p.Y * radius) / length) ** 2) return true;
	const radial = math.sqrt(radialSquared);
	const t = math.clamp((radial * radius + p.Y * length) / (radius * radius + length * length), 0, 1);
	return (
		math.min(
			(radial - t * radius) ** 2 + (p.Y - t * length) ** 2,
			math.max(0, radial - radius) ** 2 + (p.Y - length) ** 2,
		) <=
		sphere * sphere
	);
}
