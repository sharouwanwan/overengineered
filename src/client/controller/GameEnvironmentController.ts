import { RunService, Workspace } from "@rbxts/services";
import { LocalPlayerController } from "client/controller/LocalPlayerController";
import { LocalPlayer } from "engine/client/LocalPlayer";
import { HostedService } from "engine/shared/di/HostedService";
import { Physics } from "shared/Physics";
import type { PlayModeController } from "client/modes/PlayModeController";
import type { PlayerDataStorage } from "client/PlayerDataStorage";
import type { SharedPlot } from "shared/building/SharedPlot";

@injectable
export class GameEnvironmentController extends HostedService {
	constructor(@inject playerData: PlayerDataStorage, @inject plot: SharedPlot, @inject mode: PlayModeController) {
		super();

		let roots: BasePart[] = [];
		let nextRefresh = 0;
		this.event.subscribe(RunService.PreSimulation, (dt) => {
			const playerHeight = LocalPlayerController.getPlayerRelativeHeight();
			const gravity = Physics.GetGravityOnHeight(playerHeight);

			Workspace.AirDensity = Physics.GetAirDensityOnHeight(playerHeight);
			Workspace.Gravity = gravity;

			let wind = playerData.config.get().physics.windVelocity;
			if ((wind.X !== 0 || wind.Z !== 0) && mode.get() === "ride") {
				wind = wind.apply((c) => math.clamp(c, -10000, 10000));
				const max = wind.div(10);
				Workspace.GlobalWind = max;
				if (!playerData.config.get().physics.simplified_aerodynamics) return;

				if (os.clock() >= nextRefresh) {
					nextRefresh = os.clock() + 0.5;
					const unique = new Set<BasePart>();
					for (const block of plot.getBlocks())
						for (const part of block.GetDescendants()) {
							if (part.IsA("BasePart") && part.AssemblyRootPart && !part.AssemblyRootPart.Anchored)
								unique.add(part.AssemblyRootPart);
						}
					roots = [...unique];
				}
				const apply = (part: BasePart) => {
					if (!part.Parent || part.Anchored) return;
					const delta = max.sub(part.AssemblyLinearVelocity);
					const density = Physics.GetAirDensityModifierOnHeight(
						Physics.LocalHeight.fromGlobal(part.Position.Y),
					);
					const change = new Vector3(delta.X, 0, delta.Z).mul(1 - math.exp(-math.max(0, dt) * density * 0.1));
					part.ApplyImpulse(change.mul(part.AssemblyMass));
				};
				for (const root of roots) if (root.AssemblyRootPart === root) apply(root);
				const playerPart = LocalPlayer.humanoid.get()?.RootPart;
				if (playerPart && !roots.includes(playerPart.AssemblyRootPart ?? playerPart)) apply(playerPart);
			} else Workspace.GlobalWind = Vector3.zero;
		});
	}
}
