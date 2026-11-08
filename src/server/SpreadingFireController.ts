import { RunService, Workspace } from "@rbxts/services";
import { LocalInstanceData } from "engine/shared/LocalInstanceData";
import { ServerPartUtils } from "server/plots/ServerPartUtils";
import { BlockManager } from "shared/building/BlockManager";
import { GameDefinitions } from "shared/data/GameDefinitions";
import { CustomRemotes } from "shared/Remotes";
import { CustomDebrisService } from "shared/service/CustomDebrisService";
import { TagUtils } from "shared/utils/TagUtils";
import type { ServerPlayersController } from "server/ServerPlayersController";
import type { FireEffect } from "shared/effects/FireEffect";

const overlapParams = new OverlapParams();
overlapParams.CollisionGroup = "Blocks";

@injectable
export class SpreadingFireController {
	constructor(
		@inject private readonly fireEffect: FireEffect,
		@inject private readonly playersController: ServerPlayersController,
	) {
		RunService.Heartbeat.Connect(() => {
			const start = os.clock();
			let ignited = 0;
			for (const part of this.ignitions) {
				if (ignited++ >= 16 || os.clock() - start > 0.001) break;
				this.ignitions.delete(part);
				if (part.Parent) this.ignite(part);
			}
			let count = 0;
			for (const [part, job] of this.pending) {
				if (count >= 8 || os.clock() - start > 0.002) break;
				if (!part.Parent) {
					this.pending.delete(part);
					continue;
				}
				if (job.at > start) continue;
				this.pending.delete(part);
				count++;
				job.run();
			}
		});
	}
	private readonly ignitions = new Set<BasePart>();
	private readonly pending = new Map<BasePart, { at: number; run: () => void }>();

	private isPartBurnable(part: BasePart) {
		if (
			!BlockManager.isActiveBlockPart(part) ||
			part.CollisionGroup === "ColBoxExclusive" ||
			part.CollisionGroup === "BlockCollider" ||
			part.CollisionGroup === "RadarDetects" ||
			LocalInstanceData.HasLocalTag(part, "Burn") ||
			part.HasTag(TagUtils.allTags.FIREPROOF_MATERIAL) ||
			(math.random(1, 8) !== 1 && part.Position.Y < 1 + GameDefinitions.HEIGHT_OFFSET)
		) {
			return false;
		}

		return true;
	}

	burn(part: BasePart) {
		if (part.Parent && !LocalInstanceData.HasLocalTag(part, "Burn")) this.ignitions.add(part);
	}
	private ignite(part: BasePart) {
		if (!this.isPartBurnable(part)) {
			return;
		}

		LocalInstanceData.AddLocalTag(part, "Burn");
		const cleanup = CustomDebrisService.get(part);
		if (cleanup !== undefined) CustomDebrisService.set(part, math.max(35, cleanup - os.clock()));

		// Apply color
		const darkness = math.random(0, 50);
		part.Color = Color3.fromRGB(darkness, darkness, darkness);

		const duration = math.random(15, 30);

		// Apply fire effect
		this.fireEffect.send(part, { part, duration });

		part.AddTag("ActiveFire");
		part.SetAttribute("BurnUntil", Workspace.GetServerTimeNow() + duration);
		this.pending.set(part, {
			at: os.clock() + duration,
			run: () => {
				part.RemoveTag("ActiveFire");
				if (!part.Parent) return;
				if (!part.CanSetNetworkOwnership()[0]) return;

				// Break joints with a chance
				if (math.random(1, 4) === 1) {
					const players = this.playersController.getPlayers().filter((p) => p !== part.GetNetworkOwner());
					CustomRemotes.physics.normalizeRootparts.send(players, { parts: [part] });
					part.SetAttribute("LastDamageCause", "fire");
					ServerPartUtils.BreakJoints(part);
				}

				// Burn closest parts
				const closestParts = Workspace.GetPartBoundsInRadius(part.Position, 3.5, overlapParams);
				closestParts.forEach((part) => this.burn(part));
			},
		});
	}
}
