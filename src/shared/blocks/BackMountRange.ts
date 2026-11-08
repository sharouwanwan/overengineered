export const BACK_MOUNT_EQUIP_DISTANCE = 5;

/** Measure from the character, independently of camera zoom and prompt visibility. */
export function canEquipBackMount(player: Player, mount: BasePart): boolean {
	const character = player.Character;
	const humanoid = character?.FindFirstChildOfClass("Humanoid");
	const root = character?.FindFirstChild("HumanoidRootPart");
	return (
		humanoid !== undefined &&
		humanoid.Health > 0 &&
		root !== undefined &&
		root.IsA("BasePart") &&
		root.Position.sub(mount.Position).Magnitude <= BACK_MOUNT_EQUIP_DISTANCE
	);
}
