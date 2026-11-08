import { Debris } from "@rbxts/services";
import { HostedService } from "engine/shared/di/HostedService";
import { PlayerWatcher } from "engine/shared/PlayerWatcher";
import { ReplicatedAssets } from "shared/ReplicatedAssets";
import { SharedRagdoll } from "shared/SharedRagdoll";

namespace RagdollModule {
	type ConstraintConfig = {
		readonly UpperAngle: number;
		readonly TwistLowerAngle: number;
		readonly TwistUpperAngle: number;
	};
	type ConstraintsConfig = { readonly [k in string]: ConstraintConfig };

	const r6ConstraintsConfig: ConstraintsConfig = {
		Hip: {
			UpperAngle: 60,
			TwistLowerAngle: -45,
			TwistUpperAngle: 45,
		},
		Shoulder: {
			UpperAngle: 80,
			TwistLowerAngle: -60,
			TwistUpperAngle: 20,
		},
		Neck: {
			UpperAngle: 30,
			TwistLowerAngle: -50,
			TwistUpperAngle: 50,
		},
	};
	const r15ConstraintsConfig: ConstraintsConfig = {
		Ankle: {
			UpperAngle: 0,
			TwistLowerAngle: -5,
			TwistUpperAngle: 5,
		},
		Elbow: {
			UpperAngle: 0,
			TwistLowerAngle: 5,
			TwistUpperAngle: 45,
		},

		Hip: {
			UpperAngle: 20,
			TwistLowerAngle: -70,
			TwistUpperAngle: 70,
		},
		Knee: {
			UpperAngle: 0,
			TwistLowerAngle: -45,
			TwistUpperAngle: -5,
		},
		Neck: {
			UpperAngle: 30,
			TwistLowerAngle: -35,
			TwistUpperAngle: 35,
		},
		Shoulder: {
			UpperAngle: 45,
			TwistLowerAngle: -80,
			TwistUpperAngle: 80,
		},
		Waist: {
			UpperAngle: 10,
			TwistLowerAngle: -25,
			TwistUpperAngle: 25,
		},
		Wrist: {
			UpperAngle: 0,
			TwistLowerAngle: -15,
			TwistUpperAngle: 15,
		},
	};

	type Rig = {
		motors: Map<Motor6D, { socket: BallSocketConstraint; collision: NoCollisionConstraint }>;
		animationJoints: Map<AnimationConstraint, boolean>;
		collisions: Map<BasePart, boolean>;
		connections: RBXScriptConnection[];
	};
	const rigs = new Map<Model, Rig>();
	export function createJoints(character: Model) {
		if (rigs.has(character)) return;
		const humanoid = character.WaitForChild("Humanoid") as Humanoid;
		humanoid.BreakJointsOnDeath = false;
		humanoid.RequiresNeck = false;
		const folder = new Instance("Folder");
		folder.Name = "ConstraintsFolder";
		folder.Parent = character;
		const rig: Rig = { motors: new Map(), animationJoints: new Map(), collisions: new Map(), connections: [] };
		rigs.set(character, rig);
		const add = (joint: Instance) => {
			if (!joint.IsA("Motor6D") || rig.motors.has(joint) || !joint.Part0 || !joint.Part1) return;
			const root = joint.Name === "Root" || joint.Name === "RootJoint";
			const name = joint.Name.gsub("^Right%s*", "")[0].gsub("^Left%s*", "")[0];
			const config = (humanoid.RigType === Enum.HumanoidRigType.R6 ? r6ConstraintsConfig : r15ConstraintsConfig)[
				name
			];
			if (!root && !config) return;
			const att0 = new Instance("Attachment", joint.Part0);
			att0.CFrame = joint.C0;
			const att1 = new Instance("Attachment", joint.Part1);
			att1.CFrame = joint.C1;
			const socket = new Instance("BallSocketConstraint");
			socket.Name = joint.Name + " Ragdoll";
			socket.Attachment0 = att0;
			socket.Attachment1 = att1;
			socket.LimitsEnabled = true;
			socket.TwistLimitsEnabled = true;
			socket.UpperAngle = root ? 0 : config.UpperAngle;
			socket.TwistLowerAngle = root ? 0 : config.TwistLowerAngle;
			socket.TwistUpperAngle = root ? 0 : config.TwistUpperAngle;
			socket.Enabled = false;
			socket.Parent = folder;
			const collision = new Instance("NoCollisionConstraint");
			collision.Part0 = joint.Part0;
			collision.Part1 = joint.Part1;
			collision.Enabled = false;
			collision.Parent = folder;
			rig.motors.set(joint, { socket, collision });
			toggleJoints(character, !SharedRagdoll.isPlayerRagdolling(humanoid));
		};
		const watch = (instance: Instance) => {
			// Upgraded avatars already include sockets and collision constraints. Release
			// their animation drivers instead of creating a second set of physical joints.
			if (instance.IsA("AnimationConstraint")) {
				if (instance.Name === "Root" || instance.Name === "RootJoint") return;
				rig.animationJoints.set(instance, instance.Enabled);
				toggleJoints(character, !SharedRagdoll.isPlayerRagdolling(humanoid));
				return;
			}
			if (!instance.IsA("Motor6D")) return;
			add(instance);
			rig.connections.push(instance.GetPropertyChangedSignal("Part0").Connect(() => add(instance)));
			rig.connections.push(instance.GetPropertyChangedSignal("Part1").Connect(() => add(instance)));
		};
		rig.connections.push(character.DescendantAdded.Connect(watch));
		for (const instance of character.GetDescendants()) watch(instance);
		character.Destroying.Once(() => {
			for (const connection of rig.connections) connection.Disconnect();
			rigs.delete(character);
		});
	}
	export function toggleJoints(character: Model, enabled: boolean) {
		const rig = rigs.get(character);
		if (!rig) return;
		const root = character.FindFirstChild("HumanoidRootPart");
		if (!enabled && root?.IsA("BasePart")) {
			if (!rig.collisions.has(root)) rig.collisions.set(root, root.CanCollide);
			root.CanCollide = false;
		}
		for (const [motor, constraint] of rig.motors) {
			if (!motor.Parent) continue;
			motor.Enabled = enabled;
			constraint.socket.Enabled = !enabled;
			constraint.collision.Enabled = !enabled;
			const limb = motor.Part1;
			if (!limb) continue;
			if (!enabled) {
				if (!rig.collisions.has(limb)) rig.collisions.set(limb, limb.CanCollide);
				limb.CanCollide = limb.Name !== "HumanoidRootPart";
			}
		}
		for (const [joint, wasEnabled] of rig.animationJoints) {
			if (!joint.Parent) continue;
			joint.Enabled = enabled && wasEnabled;
			const limb = joint.Part1;
			if (!enabled && limb) {
				if (!rig.collisions.has(limb)) rig.collisions.set(limb, limb.CanCollide);
				limb.CanCollide = limb.Name !== "HumanoidRootPart";
			}
		}
		if (enabled) {
			for (const [part, collidable] of rig.collisions) if (part.Parent) part.CanCollide = collidable;
			rig.collisions.clear();
		}
	}
}

const { isPlayerRagdolling, setPlayerRagdoll } = SharedRagdoll;

function initSounds(): RBXScriptConnection {
	const impacts = ReplicatedAssets.waitForAsset("Effects", "RagdollImpact");

	function init(humanoid: Humanoid, character: Model) {
		function canHit(part: BasePart, hit: BasePart) {
			if (!part?.Parent || !hit?.Parent) return false;
			if (!hit.CanCollide) return false;
			if (hit.IsDescendantOf(character)) return false;
			if (hit.Parent?.FindFirstChildOfClass("Humanoid")) return false;

			return true;
		}

		let debounce = true;
		const debounceTime = 0.25;
		for (const part of character.GetChildren()) {
			if (!part.IsA("BasePart")) continue;

			part.Touched.Connect((hit) => {
				if (!debounce) return;
				if (!isPlayerRagdolling(humanoid)) return;
				if (part.AssemblyLinearVelocity.Magnitude < 5) return;
				if (!canHit(part, hit)) return;

				debounce = false;

				const volume = math.min(part.AssemblyLinearVelocity.Magnitude / 50, 5);
				const impact = impacts.GetChildren()[math.random(0, impacts.GetChildren().size() - 1)].Clone() as Sound;
				impact.Parent = part;
				impact.Volume = volume;
				impact.Play();

				Debris.AddItem(impact, 5);
				task.delay(debounceTime, () => (debounce = true));
			});
		}
	}

	return PlayerWatcher.onHumanoidAdded(init);
}
function initRagdollMain(): RBXScriptConnection {
	return PlayerWatcher.onHumanoidAdded((humanoid, character, player) => {
		humanoid.BreakJointsOnDeath = false;
		humanoid.RequiresNeck = false;

		RagdollModule.createJoints(character);
		setPlayerRagdoll(humanoid, false);

		SharedRagdoll.subscribeToPlayerRagdollChange(humanoid, () =>
			RagdollModule.toggleJoints(character, !isPlayerRagdolling(humanoid)),
		);

		humanoid.Seated.Connect((active) => {
			if (!active) return;
			setPlayerRagdoll(humanoid, false);
		});
		humanoid.Ragdoll.Connect((active) => {
			if (!active) return;
			setPlayerRagdoll(humanoid, true);
		});
		humanoid.Died.Connect(() => {
			humanoid.AutoRotate = false;
			setPlayerRagdoll(humanoid, true);
			humanoid.UnequipTools();
		});
	});
}

export class RagdollController extends HostedService {
	constructor() {
		super();

		this.event.subscribeRegistration(initSounds);
		this.event.subscribe(SharedRagdoll.event.invoked, (player, ragdoll) => {
			const humanoid = player.Character?.FindFirstChild("Humanoid") as Humanoid | undefined;
			if (!humanoid || humanoid.Sit || humanoid.Health <= 0) return;

			setPlayerRagdoll(humanoid, ragdoll);
		});

		this.event.subscribeRegistration(initRagdollMain);
	}
}
