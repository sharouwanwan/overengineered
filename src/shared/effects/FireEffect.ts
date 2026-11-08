import { ReplicatedStorage, Workspace } from "@rbxts/services";
import { EffectBase } from "shared/effects/EffectBase";
import type { EffectCreator } from "shared/effects/EffectBase";

type Args = {
	readonly part: BasePart;
	readonly duration?: number;
};
@injectable
export class FireEffect extends EffectBase<Args> {
	private readonly pool = new Map<Instance, Instance[]>();
	private readonly active = new Map<BasePart, number>();
	constructor(@inject creator: EffectCreator) {
		super(creator, "effect_fire");
	}

	override justRun({ part, duration }: Args): void {
		if (!part?.Parent) return;
		const now = os.clock();
		for (const [other, expires] of this.active) if (!other.Parent || expires <= now) this.active.delete(other);
		if (this.active.has(part) || this.active.size() >= 48) return;
		if (Workspace.CurrentCamera && Workspace.CurrentCamera.CFrame.Position.sub(part.Position).Magnitude > 400)
			return;
		for (const [other] of this.active) if (other.Position.sub(part.Position).Magnitude < 6) return;
		this.active.set(part, now + (duration ?? 20));

		const effects = ReplicatedStorage.Assets.Effects.Fire.GetChildren();
		effects.forEach((value) => {
			const spare = this.pool.get(value);
			const obj = spare?.pop() ?? value.Clone();
			if (obj.IsA("PointLight")) {
				obj.Shadows = false;
				if (this.active.size() > 8) {
					obj.Destroy();
					return;
				}
			}
			if (obj.IsA("ParticleEmitter")) obj.Rate = 15;
			obj.Parent = part;

			if (obj.IsA("Sound")) {
				if (math.random(1, 4) === 1) {
					obj.Play();
				} else {
					obj.Destroy();
					return;
				}
			}

			// Delete effect
			task.delay(duration ?? 20, () => {
				if (!obj.Parent) return;
				if (obj.IsA("ParticleEmitter")) obj.Clear();
				if (obj.IsA("Sound")) obj.Stop();
				obj.Parent = undefined;
				let available = this.pool.get(value);
				if (!available) {
					available = [];
					this.pool.set(value, available);
				}
				if (available.size() < 48) available.push(obj);
				else obj.Destroy();
			});
		});
	}
}
