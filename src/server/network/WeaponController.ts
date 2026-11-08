import { Players, RunService, Workspace } from "@rbxts/services";
import { HostedService } from "engine/shared/di/HostedService";
import { PlayerRank } from "engine/shared/PlayerRank";
import { ServerBlockLogic } from "server/blocks/ServerBlockLogic";
import { CombatDamage } from "server/network/CombatDamage";
import { BlockManager } from "shared/building/BlockManager";
import { WeaponModule } from "shared/weaponProjectiles/WeaponModuleSystem";
import { WeaponProtocol, weaponProfiles } from "shared/weaponProjectiles/WeaponProtocol";
import type { PlayModeController } from "server/modes/PlayModeController";
import type { WeaponModuleSystem } from "shared/weaponProjectiles/WeaponModuleSystem";
import type { WeaponProfile } from "shared/weaponProjectiles/WeaponProtocol";
type Projectile = {
	id: number;
	owner: Player;
	position: Vector3;
	velocity: Vector3;
	gravity: Vector3;
	remaining: number;
	damage: number;
	blast: number;
	params: RaycastParams;
	source: Model;
};
type WeaponState = { ammo: number; ready: number; reloadAt: number; profile: WeaponProfile };
@injectable
export class WeaponController extends HostedService {
	constructor(@inject modes: PlayModeController, @inject modules: WeaponModuleSystem) {
		super();
		const states = new Map<Model, WeaponState>(),
			active: Projectile[] = [];
		const budgets = new Map<Player, { time: number; count: number }>();
		let shotId = 0;
		this.event.subscribe(Players.PlayerRemoving, (p) => budgets.delete(p));
		const publish = (core: Model, s: WeaponState) => {
			core.SetAttribute("WeaponAmmo", s.ammo);
			core.SetAttribute("WeaponReadyAt", s.ready);
			core.SetAttribute("WeaponReloadAt", s.reloadAt);
		};
		const reload = (core: Model, s: WeaponState, now: number) => {
			if (s.reloadAt > now || s.ammo >= s.profile.magazine) return;
			s.reloadAt = now + s.profile.reload;
			s.ready = math.max(s.ready, s.reloadAt);
			publish(core, s);
		};
		this.event.subscribe(WeaponProtocol.fire.invoked, (player, request) => {
			if (!PlayerRank.isAdmin(player)) return;
			const core = request.core,
				part = core.PrimaryPart;
			if (
				!part ||
				!ServerBlockLogic.staticIsValidBlock(part, player, modes) ||
				part.Anchored ||
				core.GetAttribute("CombatDestroyed") === true
			)
				return;
			const data = BlockManager.getBlockDataByPart(part),
				profile = data && weaponProfiles[data.id];
			if (!data || !profile) return;
			const now = Workspace.GetServerTimeNow();
			let state = states.get(core);
			if (!state) {
				state = { ammo: profile.magazine, ready: 0, reloadAt: 0, profile };
				states.set(core, state);
				core.Destroying.Once(() => states.delete(core));
			}
			if (request.reload) {
				reload(core, state, now);
				return;
			}
			if (now < state.ready || now < state.reloadAt) return;
			if (state.ammo <= 0) {
				reload(core, state, now);
				return;
			}
			if (core.Parent) modules.flush(core.Parent);
			const module = WeaponModule.allModules[data.uuid];
			if (!module || module.instance !== core) return;
			const outputs = module.parentCollection.calculatedOutputs.filter(
				(e) =>
					e.source === module &&
					e.module.instance.Parent === core.Parent &&
					e.module.instance.GetAttribute("CombatDestroyed") !== true,
			);
			const muzzles: {
				module: WeaponModule;
				marker: (typeof outputs)[number]["outputs"][number];
				modifier: (typeof outputs)[number]["modifier"];
			}[] = [];
			const seen = new Set<BasePart>();
			for (const e of outputs)
				for (const marker of e.outputs)
					if (!seen.has(marker.markerInstance)) {
						seen.add(marker.markerInstance);
						muzzles.push({ module: e.module, marker, modifier: e.modifier });
					}
			if (muzzles.size() === 0) return;
			const budget = budgets.get(player) ?? { time: now, count: 0 };
			if (now - budget.time >= 1) {
				budget.time = now;
				budget.count = 0;
			}
			const count = math.min(16, muzzles.size());
			if (budget.count + count > 120 || active.size() + count > 512) return;
			budget.count += count;
			budgets.set(player, budget);
			state.ammo--;
			state.ready = now + profile.interval;
			publish(core, state);
			if (state.ammo === 0) reload(core, state, now);
			const params = new RaycastParams();
			params.RespectCanCollide = true;
			params.FilterDescendantsInstances = [core.Parent ?? core, ...(player.Character ? [player.Character] : [])];
			for (let i = 0; i < count; i++) {
				const m = muzzles[i],
					frame = m.module.instance.GetPivot().mul(m.marker.localFrame),
					direction = frame.RightVector.mul(-1);
				const position = frame.Position.add(direction.mul(0.1));
				const modifier = m.modifier.speedModifier;
				const speed = math.clamp(
					modifier ? (modifier.isRelative ? profile.speed * modifier.value : modifier.value) : profile.speed,
					50,
					3000,
				);
				const gravity = new Vector3(0, -Workspace.Gravity * profile.gravity, 0);
				const velocity = direction.mul(speed).add(part.AssemblyLinearVelocity);
				const id = ++shotId,
					damage = profile.damage / count;
				if (profile.laser) {
					const hit = Workspace.Raycast(position, direction.mul(5000), params),
						endpoint = hit?.Position ?? position.add(direction.mul(5000));
					if (hit) CombatDamage.apply(hit.Instance, damage, "laser");
					WeaponProtocol.spawn.send("everyone", {
						id,
						position,
						velocity: Vector3.zero,
						gravity: Vector3.zero,
						lifetime: profile.lifetime,
						color: request.color,
						time: now,
						endpoint,
					});
				} else {
					active.push({
						id,
						owner: player,
						position,
						velocity,
						gravity,
						remaining: profile.lifetime,
						damage,
						blast: profile.blast,
						params,
						source: core,
					});
					WeaponProtocol.spawn.send("everyone", {
						id,
						position,
						velocity,
						gravity,
						lifetime: profile.lifetime,
						color: request.color,
						time: now,
					});
				}
			}
		});
		this.event.subscribe(RunService.Heartbeat, (dt) => {
			const now = Workspace.GetServerTimeNow();
			for (const [core, s] of states) {
				if (!core.Parent) {
					states.delete(core);
					continue;
				}
				if (s.reloadAt > 0 && now >= s.reloadAt) {
					s.ammo = s.profile.magazine;
					s.reloadAt = 0;
					publish(core, s);
				}
			}
			for (let i = active.size() - 1; i >= 0; i--) {
				const p = active[i];
				let remove = p.owner.Parent !== Players || modes.getPlayerMode(p.owner) !== "ride";
				const remaining = math.min(math.max(0, dt), p.remaining);
				// Limit curve approximation error while bounding work during a slow frame.
				const steps = math.clamp(math.ceil(remaining / (1 / 30)), 1, 8),
					step = remaining / steps;
				for (let j = 0; j < steps && !remove; j++) {
					const delta = p.velocity.mul(step).add(p.gravity.mul(0.5 * step * step));
					const hit = Workspace.Raycast(p.position, delta, p.params);
					if (hit) {
						p.position = hit.Position;
						CombatDamage.apply(hit.Instance, p.damage, "projectile");
						if (p.blast > 0) CombatDamage.blast(hit.Position, p.blast, p.damage, p.source);
						remove = true;
					} else {
						p.position = p.position.add(delta);
						p.velocity = p.velocity.add(p.gravity.mul(step));
					}
				}
				p.remaining -= remaining;
				if (remove || p.remaining <= 0) {
					WeaponProtocol.hit.send("everyone", { id: p.id, position: p.position });
					active.remove(i);
				}
			}
		});
	}
}
