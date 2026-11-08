import { RunService, Workspace } from "@rbxts/services";
import { HostedService } from "engine/shared/di/HostedService";
import { WeaponProtocol } from "shared/weaponProjectiles/WeaponProtocol";
import type { ShotVisual } from "shared/weaponProjectiles/WeaponProtocol";
@injectable
export class WeaponEffectsController extends HostedService {
	constructor() {
		super();
		const folder = new Instance("Folder");
		folder.Name = "WeaponVisuals";
		folder.Parent = Workspace;
		const active = new Map<number, { shot: ShotVisual; parts: Part[]; receivedAt: number }>(),
			pool: Part[] = [],
			ended = new Map<number, number>();
		const acquire = () => {
			const part = pool.pop() ?? new Instance("Part");
			part.Anchored = true;
			part.CanCollide = false;
			part.CanTouch = false;
			part.CanQuery = false;
			part.CastShadow = false;
			part.Material = Enum.Material.Neon;
			part.Parent = folder;
			return part;
		};
		const clear = (id: number) => {
			const v = active.get(id);
			if (!v) return;
			for (const p of v.parts) {
				p.Parent = undefined;
				if (pool.size() < 128) pool.push(p);
				else p.Destroy();
			}
			active.delete(id);
		};
		this.event.subscribe(WeaponProtocol.spawn.invoked, (shot) => {
			if (active.size() >= 512 || ended.has(shot.id)) return;
			const parts: Part[] = [];
			const delta = shot.endpoint?.sub(shot.position),
				length = delta?.Magnitude ?? 0;
			if (delta && length > 0.001) {
				const count = math.ceil(length / 2000);
				for (let i = 0; i < count; i++) {
					const start = shot.position.add(delta.mul(i / count)),
						segmentEnd = shot.position.add(delta.mul((i + 1) / count)),
						part = acquire();
					part.Size = new Vector3(0.15, 0.15, length / count);
					part.CFrame = CFrame.lookAt(start.add(segmentEnd).div(2), segmentEnd);
					part.Color = shot.color;
					parts.push(part);
				}
			} else {
				const part = acquire();
				part.Size = new Vector3(0.15, 0.15, 2);
				part.Position = shot.position;
				part.Color = shot.color;
				parts.push(part);
			}
			active.set(shot.id, { shot, parts, receivedAt: Workspace.GetServerTimeNow() });
		});
		this.event.subscribe(WeaponProtocol.hit.invoked, (hit) => {
			clear(hit.id);
			ended.set(hit.id, os.clock() + 2);
		});
		this.event.subscribe(RunService.PreRender, () => {
			const now = Workspace.GetServerTimeNow();
			for (const [id, v] of active) {
				const elapsed = math.max(0, now - v.shot.time);
				// An instant laser must remain visible after receipt, even when its
				// network transit time exceeds the short beam duration.
				const visualAge = v.shot.endpoint ? now - v.receivedAt : elapsed;
				if (visualAge >= v.shot.lifetime) {
					clear(id);
					continue;
				}
				if (v.shot.endpoint) continue;
				const position = v.shot.position
					.add(v.shot.velocity.mul(elapsed))
					.add(v.shot.gravity.mul(0.5 * elapsed * elapsed));
				const velocity = v.shot.velocity.add(v.shot.gravity.mul(elapsed));
				v.parts[0].CFrame =
					velocity.Magnitude > 0.001 ? CFrame.lookAlong(position, velocity) : new CFrame(position);
			}
			for (const [id, expiresAt] of ended) if (os.clock() >= expiresAt) ended.delete(id);
		});
		this.onDestroy(() => {
			folder.Destroy();
			for (const part of pool) part.Destroy();
		});
	}
}
