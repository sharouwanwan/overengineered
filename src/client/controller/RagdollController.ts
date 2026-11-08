import { ContextActionService, UserInputService } from "@rbxts/services";
import { InputController } from "engine/client/InputController";
import { LocalPlayer } from "engine/client/LocalPlayer";
import { Component } from "engine/shared/component/Component";
import { ComponentEvents } from "engine/shared/component/ComponentEvents";
import { HostedService } from "engine/shared/di/HostedService";
import { Keys } from "engine/shared/fixes/Keys";
import { SharedRagdoll } from "shared/SharedRagdoll";
import type { PlayerDataStorage } from "client/PlayerDataStorage";
import type { ReadonlyObservableValue } from "engine/shared/event/ObservableValue";

const { isPlayerRagdolling } = SharedRagdoll;
function initAutoRagdoll(event: ComponentEvents, humanoid: Humanoid, enabled: ReadonlyObservableValue<boolean>) {
	let prevSpeed: number | undefined;

	event.loop(0, () => {
		if (!enabled.get()) return;
		if (!humanoid.RootPart) return;
		if (humanoid.Sit) return;
		if (isPlayerRagdolling(humanoid)) return;

		const state = humanoid.GetState();
		if (
			state === Enum.HumanoidStateType.Physics ||
			state === Enum.HumanoidStateType.GettingUp ||
			state === Enum.HumanoidStateType.Jumping
		) {
			prevSpeed = undefined;
			return;
		}

		const newspeed = humanoid.RootPart.AssemblyLinearVelocity.Magnitude;
		if (prevSpeed === undefined) {
			prevSpeed = newspeed;
			return;
		}

		const diff = math.abs(newspeed - prevSpeed);
		prevSpeed = newspeed;

		const difference = state === Enum.HumanoidStateType.Landed ? 100 : 50;
		if (diff < difference) return;

		$trace("Ragdolled with a diff of", diff);
		SharedRagdoll.event.send(true);
	});
}
function initRagdollUp(
	event: ComponentEvents,
	humanoid: Humanoid,
	autoRecoveryByTimer: ReadonlyObservableValue<boolean>,
	autoRecoveryByMoving: ReadonlyObservableValue<boolean>,
) {
	const player = LocalPlayer.player;

	const character = humanoid.Parent;
	if (!character) return;

	let generation = 0;
	let animateScript: LocalScript | undefined;
	let animateWasEnabled = false;
	const restoreAnimation = () => {
		if (animateScript?.Parent) animateScript.Enabled = animateWasEnabled;
		animateScript = undefined;
	};
	const stopAnimations = () => {
		const animator = humanoid.FindFirstChildOfClass("Animator");
		if (animator) for (const track of animator.GetPlayingAnimationTracks()) track.Stop(0);
	};
	const animator = humanoid.FindFirstChildOfClass("Animator");
	if (animator)
		event.subscribe(animator.AnimationPlayed, (track) => {
			if (isPlayerRagdolling(humanoid)) track.Stop(0);
		});
	event.state.onDisable(() => {
		generation++;
		ContextActionService.UnbindAction("ragdoll_autoRecovery");
		if (humanoid.Health > 0) restoreAnimation();
	});
	const getUpTime = 4;
	const actionName = "ragdoll_autoRecovery";
	const applyState = () => {
		const currentGeneration = ++generation;
		ContextActionService.UnbindAction(actionName);
		if (humanoid.Parent !== player.Character || humanoid.Health <= 0) return;
		if (isPlayerRagdolling(humanoid)) {
			const animate = character.FindFirstChild("Animate");
			if (!animateScript && animate?.IsA("LocalScript")) {
				animateScript = animate;
				animateWasEnabled = animate.Enabled;
				animate.Enabled = false;
			}
			stopAnimations();
			humanoid.SetStateEnabled("GettingUp", false);
			humanoid.SetStateEnabled("Swimming", false);
			humanoid.SetStateEnabled("Seated", false);
			humanoid.ChangeState("Physics");

			if (humanoid.GetState() !== Enum.HumanoidStateType.Dead && humanoid.Health > 0) {
				task.spawn(() => {
					const unragdollIfSlow = () => {
						if (generation !== currentGeneration || !humanoid.Parent || humanoid.Health <= 0) return true;
						if (!humanoid.RootPart) return;
						if (!isPlayerRagdolling(humanoid)) return;

						if (humanoid.RootPart.AssemblyLinearVelocity.Magnitude < 10) {
							SharedRagdoll.event.send(false);
							ContextActionService.UnbindAction(actionName);

							return true;
						}
					};

					task.wait(getUpTime);
					if (generation !== currentGeneration || !humanoid.Parent) return;

					if (autoRecoveryByTimer.get() && unragdollIfSlow()) return;

					if (autoRecoveryByMoving.get()) {
						ContextActionService.UnbindAction(actionName);
						ContextActionService.BindActionAtPriority(
							actionName,
							() => {
								task.spawn(() => SharedRagdoll.event.send(false));

								ContextActionService.UnbindAction(actionName);
								return Enum.ContextActionResult.Pass;
							},
							false,
							2000 + 1,
							...Enum.PlayerActions.GetEnumItems(),
						);
					}

					if (autoRecoveryByTimer.get()) {
						while (task.wait()) {
							if (unragdollIfSlow()) {
								break;
							}
						}
					}
				});
			}
		} else {
			restoreAnimation();
			humanoid.SetStateEnabled("GettingUp", true);
			humanoid.ChangeState("GettingUp");
			humanoid.SetStateEnabled("Swimming", true);
			humanoid.SetStateEnabled("Seated", true);

			const character = player.Character;
			if (character && !(character.WaitForChild("Humanoid") as Humanoid).Sit) {
				character.PivotTo(character.GetPivot().add(new Vector3(0, 2, 0)));
			}
		}

		humanoid.AutoRotate = !isPlayerRagdolling(humanoid);
	};
	event.subscribeRegistration(() => SharedRagdoll.subscribeToPlayerRagdollChange(humanoid, applyState));
	event.onEnable(() => {
		if (isPlayerRagdolling(humanoid)) applyState();
	});
}
function initRagdollKey(event: ComponentEvents, key: ReadonlyObservableValue<{ triggerKey: KeyCode | undefined }>) {
	const actionName = "ragdoll";

	function bind(key: KeyCode, func: () => void) {
		ContextActionService.BindAction(
			actionName,
			(name, state, input) => {
				if (state === Enum.UserInputState.Begin && !UserInputService.GetFocusedTextBox()) {
					func();
				}

				return Enum.ContextActionResult.Pass;
			},
			InputController.inputType.get() === "Touch",
			Keys.Keys[key],
		);

		ContextActionService.SetDescription(actionName, "funny falling");
		ContextActionService.SetImage(actionName, "rbxassetid://110824406341723");
		ContextActionService.SetPosition(actionName, new UDim2(0, 150, 0, 50));
	}
	function unbind() {
		ContextActionService.UnbindAction(actionName);
	}

	let can = true;
	const rebind = () => {
		const { triggerKey } = key.get();
		can = true;

		unbind();
		if (!triggerKey) return;

		bind(triggerKey, () => {
			if (!can) return;

			const humanoid = LocalPlayer.humanoid.get();
			if (!humanoid || humanoid.Sit || humanoid.Health <= 0) return;

			const ragdolling = isPlayerRagdolling(humanoid);
			can = false;
			task.delay(1, () => (can = true));
			task.spawn(() => SharedRagdoll.event.send(!ragdolling));
		});
	};

	event.subscribeObservable(key, rebind);
	event.subscribeObservable(InputController.inputType, rebind);
	event.onEnable(rebind);
	event.state.onDisable(unbind);
}

@injectable
export class RagdollController extends HostedService {
	constructor(@inject playerDataStorage: PlayerDataStorage) {
		super();

		initRagdollKey(
			this.event,
			playerDataStorage.config.createBased((c) => c.ragdoll),
		);
		this.event.subscribeObservable(
			LocalPlayer.humanoid,
			(humanoid) => {
				if (!humanoid) return;

				task.defer(() => {
					const character = LocalPlayer.character.get();
					if (!character || humanoid.Parent !== character) return;

					const component = new Component();
					const event = new ComponentEvents(component);

					initRagdollUp(
						event,
						humanoid,
						playerDataStorage.config.createBased((c) => c.ragdoll.autoRecovery),
						playerDataStorage.config.createBased((c) => c.ragdoll.autoRecoveryByMoving),
					);
					initAutoRagdoll(
						event,
						humanoid,
						playerDataStorage.config.createBased((c) => c.ragdoll.autoFall),
					);

					this.parent(component);
					humanoid.Died.Once(() => component.disable());
					event.subscribe(character.GetPropertyChangedSignal("Parent"), () => {
						if (character.Parent) return;
						component.destroy();
					});

					component.enable();
				});
			},
			true,
		);
	}
}
