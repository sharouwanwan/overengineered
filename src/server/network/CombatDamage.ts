import { Workspace } from "@rbxts/services";
import { ServerPartUtils } from "server/plots/ServerPartUtils";
import { BlockManager } from "shared/building/BlockManager";
import { CustomRemotes } from "shared/Remotes";
export namespace CombatDamage {
	export function apply(part: BasePart, amount: number, cause: string): void {
		if (amount <= 0 || amount !== amount || amount === math.huge || !part.Parent) return;
		const character = part.FindFirstAncestorOfClass("Model"),
			humanoid = character?.FindFirstChildOfClass("Humanoid");
		if (humanoid) {
			humanoid.TakeDamage(amount);
			return;
		}
		if (!BlockManager.isActiveBlockPart(part)) return;
		const model = BlockManager.tryGetBlockModelByPart(part),
			primary = model?.PrimaryPart;
		if (!model || !primary || model.GetAttribute("CombatDestroyed") === true) return;
		const density = new PhysicalProperties(BlockManager.manager.material.get(model)).Density;
		const maxHealth = math.clamp(
			80 * density * math.max(0.7, math.min(primary.Size.X, primary.Size.Y, primary.Size.Z)),
			20,
			1000,
		);
		const health = (model.GetAttribute("CombatHealth") as number | undefined) ?? maxHealth;
		model.SetAttribute("CombatHealth", math.max(0, health - amount));
		model.SetAttribute("LastDamageCause", cause);
		if (health > amount) return;
		model.SetAttribute("CombatDestroyed", true);
		const broken: BasePart[] = [];
		for (const item of model.GetDescendants())
			if (item.IsA("BasePart") && BlockManager.isActiveBlockPart(item)) {
				broken.push(item);
				ServerPartUtils.BreakJoints(item);
			}
		if (broken.size() > 0) CustomRemotes.physics.normalizeRootparts.send("everyone", { parts: broken });
	}
	export function exposure(center: Vector3, part: BasePart, source?: Instance): number {
		const delta = part.Position.sub(center);
		if (delta.Magnitude < 0.05) return 1;
		const params = new RaycastParams();
		params.RespectCanCollide = true;
		params.FilterDescendantsInstances = source ? [source] : [];
		const hit = Workspace.Raycast(center, delta, params);
		if (!hit || hit.Instance === part) return 1;
		const model = BlockManager.tryGetBlockModelByPart(part);
		return model && hit.Instance.IsDescendantOf(model) ? 1 : 0.15;
	}
	export function blast(center: Vector3, radius: number, damage: number, source?: Instance): void {
		const params = new OverlapParams();
		params.MaxParts = 512;
		const seen = new Set<Instance>();
		for (const part of Workspace.GetPartBoundsInRadius(center, radius, params)) {
			const model = BlockManager.tryGetBlockModelByPart(part) ?? part.FindFirstAncestorOfClass("Model");
			if (!model || model === source || seen.has(model)) continue;
			const factor = math.clamp(
				1 - math.max(0, part.Position.sub(center).Magnitude - part.Size.Magnitude / 2) / radius,
				0,
				1,
			);
			if (factor <= 0) continue;
			seen.add(model);
			apply(part, damage * factor * exposure(center, part, source), "explosion");
		}
	}
}
