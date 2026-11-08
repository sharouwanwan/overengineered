import { Debris, ReplicatedStorage } from "@rbxts/services";
import { EffectBase } from "shared/effects/EffectBase";
import type { EffectCreator } from "shared/effects/EffectBase";

ReplicatedStorage.WaitForChild("Assets");

type Args = {
	readonly part: BasePart;
	readonly position?: Vector3;
	readonly index?: number;
};
@injectable
export class ExplosionEffect extends EffectBase<Args> {
	readonly soundsFolder = ReplicatedStorage.Assets.Sounds.Explosion.GetChildren();

	constructor(@inject creator: EffectCreator) {
		super(creator, "explosion_effect", "RemoteEvent");
	}

	override justRun({ part, index, position }: Args): void {
		if (!part) return;
		if (position) {
			const anchor = new Instance("Part");
			anchor.Anchored = true;
			anchor.CanCollide = false;
			anchor.CanQuery = false;
			anchor.CanTouch = false;
			anchor.Transparency = 1;
			anchor.Size = Vector3.one;
			anchor.Position = position;
			anchor.Parent = game.GetService("Workspace");
			part = anchor;
			Debris.AddItem(anchor, 15);
		}

		const soundIndex = index ?? math.random(0, this.soundsFolder.size() - 1);
		const sound = this.soundsFolder[soundIndex].Clone() as Sound;

		sound.Parent = part;
		sound.Play();

		this.playVisualEffect(part);

		Debris.AddItem(sound, sound.TimeLength);
	}

	private playVisualEffect(part: BasePart): void {
		ReplicatedStorage.Assets.Effects.Explosion.GetChildren().forEach((effect) => {
			const instance = effect.Clone() as ParticleEmitter;
			instance.Enabled = false;
			instance.Parent = part;
			instance.Emit(math.max(1, math.floor(instance.Rate * 0.1)));
			Debris.AddItem(instance, instance.Lifetime.Max + 0.1);
		});
	}
}
