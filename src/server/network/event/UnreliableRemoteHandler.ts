import { Players, RunService, Workspace } from "@rbxts/services";
import { HostedService } from "engine/shared/di/HostedService";
import { ServerBlockLogic } from "server/blocks/ServerBlockLogic";
import { CombatDamage } from "server/network/CombatDamage";
import { CombatHistory } from "server/network/CombatHistory";
import { attachedBlastParts, tntBlastDistance } from "server/network/TNTBlast";
import { ServerPartUtils } from "server/plots/ServerPartUtils";
import { BlockManager } from "shared/building/BlockManager";
import { RemoteEvents } from "shared/RemoteEvents";
import { CustomRemotes } from "shared/Remotes";
import { PartUtils } from "shared/utils/PartUtils";
import type { PlayModeController } from "server/modes/PlayModeController";
import type { ServerPlayersController } from "server/ServerPlayersController";
import type { SpreadingFireController } from "server/SpreadingFireController";
import type { ExplosionEffect } from "shared/effects/ExplosionEffect";
import type { ImpactSoundEffect } from "shared/effects/ImpactSoundEffect";
import type { ExplodeArgs } from "shared/RemoteEvents";

@injectable
export class UnreliableRemoteController extends HostedService {
	constructor(
		@inject impactSoundEffect: ImpactSoundEffect,
		@inject spreadingFire: SpreadingFireController,
		@inject explosionEffect: ExplosionEffect,
		@inject playModeController: PlayModeController,
		@inject private readonly playersController: ServerPlayersController,
	) {
		super();

		const serverBreakQueue: Set<BasePart> = new Set();
		const budgets = new Map<Player, { time: number; count: number }>();
		this.event.subscribe(Players.PlayerRemoving, (player) => budgets.delete(player));
		const validParts = (player: Player | undefined, parts: BasePart[]): BasePart[] => {
			if (!typeIs(parts, "table") || parts.size() > 256) return [];
			if (player) {
				const now = os.clock();
				const budget = budgets.get(player);
				if (budget && now - budget.time < 1) {
					budget.count += parts.size();
					if (budget.count > 1024) return [];
				} else budgets.set(player, { time: now, count: parts.size() });
			}
			return parts.filter(
				(part) =>
					typeIs(part, "Instance") &&
					part.IsA("BasePart") &&
					BlockManager.isActiveBlockPart(part) &&
					(!player || part.GetNetworkOwner() === player),
			);
		};

		const impactBreakEvent = (player: Player | undefined, parts: BasePart[]) => {
			parts = validParts(player, parts);
			if (parts.size() === 0) return;
			if (!player) {
				for (const part of parts) {
					serverBreakQueue.add(part);
				}
				return;
			}

			task.spawn(() => {
				const players = this.playersController.getPlayers().filter((p) => p !== player);
				CustomRemotes.physics.normalizeRootparts.send(players, { parts });

				for (const part of parts) {
					if (!BlockManager.isActiveBlockPart(part)) continue;
					ServerPartUtils.BreakJoints(part);
				}

				impactSoundEffect.send(parts[0], { blocks: parts, index: undefined });
			});
		};

		this.event.subscribe(RunService.Heartbeat, () => {
			if (serverBreakQueue.size() > 0) {
				const copy = [...serverBreakQueue];
				serverBreakQueue.clear();

				task.spawn(() => {
					const toSend = new Map<Player | 0, BasePart[]>();

					for (const block of copy) {
						impactSoundEffect.send(block, { blocks: [block], index: undefined });
						ServerPartUtils.BreakJoints(block);

						const owner = block.IsDescendantOf(Workspace) ? block.GetNetworkOwner() : undefined;
						toSend.getOrSet(owner ?? 0, () => []).push(block);
					}

					const players = this.playersController.getPlayers();
					for (const [player, parts] of toSend) {
						let sendTo = players;
						if (player !== 0) sendTo = players.except([player]);

						CustomRemotes.physics.normalizeRootparts.send(sendTo, { parts });
					}
				});
			}
		});

		const burnEvent = (parts: BasePart[]) => {
			parts.forEach((part) => {
				if (!BlockManager.isActiveBlockPart(part)) return;

				spreadingFire.burn(part);
			});
		};

		const history = new CombatHistory();
		let sampled = 0;
		this.event.subscribe(RunService.Heartbeat, () => {
			const now = Workspace.GetServerTimeNow();
			if (now - sampled < 0.1) return;
			sampled = now;
			const parts: BasePart[] = [];
			for (const player of this.playersController.getPlayers()) {
				if (playModeController.getPlayerMode(player) !== "ride") continue;
				const controller = this.playersController.controllers.get(player.UserId);
				if (!controller) continue;
				for (const block of controller.plotController.blocks.getBlocks()) {
					if (block.PrimaryPart) parts.push(block.PrimaryPart);
				}
			}
			history.record(now, parts);
		});
		const detonated = new Set<BasePart>();
		const impulseBudget = new Map<BasePart, { at: number; used: number }>();
		this.event.subscribe(RunService.Heartbeat, () => {
			for (const [root, budget] of impulseBudget)
				if (!root.Parent || os.clock() - budget.at > 0.1) impulseBudget.delete(root);
		});
		// Each source can detonate once during its lifetime.
		const explode = (
			player: Player | undefined,
			{ part, isFlammable, pressure, radius, position, time }: ExplodeArgs,
		) => {
			if (!ServerBlockLogic.staticIsValidBlock(part, player, playModeController)) {
				return;
			}

			if (
				!typeIs(radius, "number") ||
				!typeIs(pressure, "number") ||
				radius !== radius ||
				pressure !== pressure ||
				math.abs(radius) === math.huge ||
				math.abs(pressure) === math.huge
			)
				return;
			if (validParts(player, [part]).size() === 0) return;
			const source = BlockManager.tryGetBlockModelByPart(part);
			if (
				!source ||
				!["tnt", "cylindricaltnt", "sphericaltnt", "halfsphericaltnt"].includes(
					BlockManager.manager.id.get(source),
				)
			)
				return;
			let center = part.Position;
			if (player && position !== undefined) {
				if (!typeIs(position, "Vector3") || !typeIs(time, "number")) return;
				const age = Workspace.GetServerTimeNow() - time;
				if (age < -0.1 || age > 0.5) return;
				const tolerance = math.min(64, 4 + part.AssemblyLinearVelocity.Magnitude * (math.max(age, 0) + 0.1));
				const model = BlockManager.tryGetBlockModelByPart(part);
				const collider = model?.PrimaryPart;
				const pose = collider ? history.at(time)?.get(collider) : undefined;
				const historical =
					pose && collider
						? pose.frame.PointToWorldSpace(collider.CFrame.PointToObjectSpace(part.Position))
						: center;
				if (math.min(position.sub(center).Magnitude, position.sub(historical).Magnitude) > tolerance) return;
				center = position;
			}
			if (detonated.has(part)) return;
			detonated.add(part);
			part.SetAttribute("ExplosionDetonated", true);
			part.Destroying.Once(() => detonated.delete(part));
			radius = math.clamp(radius, 1, 12);
			pressure = math.clamp(pressure, 0, 2500);

			const sourceRoot = part.AssemblyRootPart ?? part;
			const attachedCenter = part.Position;
			const attached = new Set<BasePart>();
			const hitSet = new Set(Workspace.GetPartBoundsInRadius(center, radius));
			// The remote can arrive ahead of physics replication. Attached parts and the TNT
			// still agree in server space, even when the aircraft has already flown past the blast.
			for (const candidate of attachedBlastParts(
				Workspace.GetPartBoundsInRadius(attachedCenter, radius),
				sourceRoot,
				attachedCenter,
				radius,
			)) {
				if (!BlockManager.isActiveBlockPart(candidate)) continue;
				attached.add(candidate);
				hitSet.add(candidate);
			}
			if (player && time !== undefined) {
				const snapshot = history.at(time);
				if (snapshot)
					for (const [collider, pose] of snapshot) {
						if (!collider.Parent || !CombatHistory.intersects(pose, center, radius)) continue;
						const model = BlockManager.tryGetBlockModelByPart(collider);
						if (!model) continue;
						for (const candidate of model.GetDescendants()) {
							if (!candidate.IsA("BasePart") || !BlockManager.isActiveBlockPart(candidate)) continue;
							const past = pose.frame.mul(collider.CFrame.ToObjectSpace(candidate.CFrame));
							if (CombatHistory.intersects({ frame: past, size: candidate.Size }, center, radius))
								hitSet.add(candidate);
						}
					}
			}
			const hitParts = [...hitSet].filter(
				(hit) =>
					hit.CollisionGroup !== "ColBoxExclusive" &&
					hit.CollisionGroup !== "RadarDetects" &&
					hit.CollisionGroup !== "BlockCollider",
			);

			if (isFlammable) {
				const flameHitParts = new Set(Workspace.GetPartBoundsInRadius(center, radius * 1.5));
				for (const hit of attached) flameHitParts.add(hit);

				flameHitParts.forEach((part) => {
					if (
						BlockManager.isActiveBlockPart(part) &&
						math.random() < 0.15 * (attached.has(part) ? 1 : CombatDamage.exposure(center, part, source))
					) {
						spreadingFire.burn(part);
					}
				});
			}

			const affected = new Set<BasePart>();
			const damage = new Map<Model, { part: BasePart; amount: number }>();
			hitParts.forEach((hit) => {
				const model = BlockManager.tryGetBlockModelByPart(hit) ?? hit.FindFirstAncestorOfClass("Model");
				if (!model || model === source) return;
				const localCenter = attached.has(hit) ? attachedCenter : center;
				let distance = tntBlastDistance(hit, localCenter);
				const pose =
					time !== undefined && model.PrimaryPart ? history.at(time)?.get(model.PrimaryPart) : undefined;
				if (pose)
					distance = math.min(
						distance,
						math.max(0, pose.frame.Position.sub(center).Magnitude - pose.size.Magnitude / 2),
					);
				const falloff = math.clamp(1 - distance / radius, 0, 1);
				// An internal blast should not be shielded by another piece of its own aircraft.
				const exposure = attached.has(hit) ? 1 : CombatDamage.exposure(center, hit, source);
				const amount = 180 * falloff * (pressure / 2500) * exposure;
				if (amount > (damage.get(model)?.amount ?? 0)) damage.set(model, { part: hit, amount });
			});
			for (const [, hit] of damage) CombatDamage.apply(hit.part, hit.amount, "explosion");
			hitParts.forEach((part) => {
				if (!BlockManager.isActiveBlockPart(part)) return;
				const root = part.AssemblyRootPart ?? part;
				if (!root.Anchored && !affected.has(root)) {
					affected.add(root);
					const localCenter = attached.has(part) ? attachedCenter : center;
					const offset = root.AssemblyCenterOfMass.sub(localCenter);
					const direction = offset.Magnitude > 0.001 ? offset.Unit : Vector3.yAxis;
					const owner = root.GetNetworkOwner();
					const canOwn = root.CanSetNetworkOwnership()[0];
					if (canOwn) root.SetNetworkOwner(undefined);
					const falloff = math.clamp(1 - tntBlastDistance(part, localCenter) / math.max(radius, 0.001), 0, 1);
					const budget = impulseBudget.get(root) ?? { at: os.clock(), used: 0 };
					const deltaSpeed = math.min(
						(pressure * falloff * (attached.has(part) ? 1 : CombatDamage.exposure(center, part, source))) /
							40,
						math.max(0, 62.5 - budget.used),
					);
					budget.used += deltaSpeed;
					impulseBudget.set(root, budget);
					root.ApplyImpulse(direction.mul(root.AssemblyMass * deltaSpeed));
					if (canOwn && owner)
						task.delay(0.2, () => {
							if (
								root.Parent &&
								!root.Anchored &&
								root.CanSetNetworkOwnership()[0] &&
								root.GetNetworkOwner() === undefined &&
								owner.Parent === Players
							)
								root.SetNetworkOwner(owner);
						});
				}
			});

			part.Transparency = 1;
			part.CanCollide = false;
			part.CanTouch = false;
			part.CanQuery = false;
			PartUtils.applyToAllDescendantsOfType("Decal", part, (decal) => decal.Destroy());

			// Explosion sound
			explosionEffect.send(part, { part, position: center, index: undefined });
		};

		this.event.subscribe(RemoteEvents.ImpactBreak.invoked, impactBreakEvent);
		this.event.subscribe(RemoteEvents.Burn.invoked, (player, parts) => burnEvent(validParts(player, parts)));
		this.event.subscribe(RemoteEvents.Explode.invoked, explode);
	}
}
