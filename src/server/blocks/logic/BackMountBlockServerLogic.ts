import { ServerBlockLogic } from "server/blocks/ServerBlockLogic";
import { ServerPartUtils } from "server/plots/ServerPartUtils";
import { canEquipBackMount } from "shared/blocks/BackMountRange";
import type { PlayModeController } from "server/modes/PlayModeController";
import type { BackMountBlockLogic } from "shared/blocks/blocks/BackMountBlock";

@injectable
export class BackMountBlockServerLogic extends ServerBlockLogic<typeof BackMountBlockLogic> {
	constructor(logic: typeof BackMountBlockLogic, @inject playModeController: PlayModeController) {
		super(logic, playModeController);

		const getPlayerTorso = (p: Player, connectToRootPart: boolean) => {
			const humanoid = p.Character?.FindFirstChild("Humanoid") as Humanoid | undefined;
			if (!humanoid) return;

			if (connectToRootPart) {
				return humanoid.RootPart;
			}

			switch (humanoid.RigType) {
				case Enum.HumanoidRigType.R6:
					return humanoid.Parent?.FindFirstChild("Torso") as BasePart;
				case Enum.HumanoidRigType.R15:
					return humanoid.Parent?.FindFirstChild("UpperTorso") as BasePart;
			}

			return;
		};

		const isAlreadyWelded = (w: Motor6D) => w.Part1 !== undefined;
		logic.events.weldMountUpdate.invoked.Connect((player, data) => {
			if (!player) return;
			const isWeldRequest = data.weldedState;
			// The key and proximity prompt may both request the same attachment.
			if (isWeldRequest && isAlreadyWelded(data.block.PlayerWeldConstraint)) return;

			//weld if unwelded
			if (isWeldRequest) {
				const torso = getPlayerTorso(player, data.connectToRootPart ?? false);
				if (!torso || !canEquipBackMount(player, data.block.mainPart)) return;
				data.block.PlayerWeldConstraint.C0 = new CFrame(new Vector3(0, 0, -torso.Size.Z));
				data.block.PlayerWeldConstraint.Part1 = torso;
				ServerPartUtils.switchDescendantsNetworkOwner(data.block, player);

				// update logic
				logic.events.updateLogic.send("everyone", {
					block: data.block,
					weldedTo: player,
				});
				return;
			}

			//unweld otherwise
			data.block.PlayerWeldConstraint.Part1 = undefined;
			ServerPartUtils.switchDescendantsNetworkOwner(data.block, data.owner);

			logic.events.updateLogic.send("everyone", {
				block: data.block,
				weldedTo: undefined,
			});
		});
	}
}
