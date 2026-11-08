/** Markers are part of their weapon, never independent physics objects. */
export function prepareWeaponMarkers(model: Model, visible?: boolean): void {
	const root = model.PrimaryPart,
		folder = model.FindFirstChild("moduleMarkers");
	if (!root || !folder) return;
	for (const marker of folder.GetDescendants()) {
		if (!marker.IsA("BasePart")) continue;
		marker.CanCollide = false;
		marker.CanTouch = false;
		marker.CanQuery = false;
		marker.Massless = true;
		marker.CastShadow = false;
		marker.EnableFluidForces = false;
		if (visible !== undefined) marker.Transparency = visible ? 0 : 1;
		let weld = marker.FindFirstChild("WeaponMarkerWeld");
		if (!weld?.IsA("WeldConstraint")) {
			weld = new Instance("WeldConstraint");
			weld.Name = "WeaponMarkerWeld";
			weld.Parent = marker;
		}
		const constraint = weld as WeldConstraint;
		constraint.Part0 = root;
		constraint.Part1 = marker;
		constraint.Enabled = true;
		marker.Anchored = false;
	}
}
