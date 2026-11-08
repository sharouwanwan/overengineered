import { RunService, Workspace } from "@rbxts/services";
import { InstanceBlockLogic as InstanceBlockLogic } from "shared/blockLogic/BlockLogic";
import { BlockCreation } from "shared/blocks/BlockCreation";
import { RemoteEvents } from "shared/RemoteEvents";
import type { BlockLogicFullBothDefinitions, InstanceBlockLogicArgs } from "shared/blockLogic/BlockLogic";
import type { BlockBuildersWithoutIdAndDefaults, BlockLogicInfo } from "shared/blocks/Block";

const definition = {
	input: {
		explode: {
			displayName: "Explode",
			types: {
				bool: {
					config: false,
					control: {
						config: {
							enabled: true,
							key: "B",
							switch: false,
							reversed: false,
						},
						canBeSwitch: false,
						canBeReversed: false,
					},
				},
			},
		},
		radius: {
			displayName: "Explosion radius",
			types: {
				number: {
					config: 12,
					clamp: {
						showAsSlider: true,
						min: 1,
						max: 12,
					},
				},
			},
		},
		pressure: {
			displayName: "Explosion pressure",
			types: {
				number: {
					config: 2500,
					clamp: {
						showAsSlider: true,
						min: 0,
						max: 2500,
					},
				},
			},
		},
		flammable: {
			displayName: "Flammable",
			types: {
				bool: {
					config: true,
				},
			},
		},
		impact: {
			displayName: "Impact",
			types: {
				bool: {
					config: true,
				},
			},
		},
	},
	output: {},
} satisfies BlockLogicFullBothDefinitions;

type TNTBlock = BlockModel & {
	Part: UnionOperation | BasePart;
};

export type { Logic as TNTBlockLogic };
class Logic extends InstanceBlockLogic<typeof definition, TNTBlock> {
	constructor(block: InstanceBlockLogicArgs) {
		super(definition, block);

		const mainPart = this.instance.Part;

		const radius = this.initializeInputCache("radius");
		const pressure = this.initializeInputCache("pressure");
		const flammable = this.initializeInputCache("flammable");
		const impact = this.initializeInputCache("impact");

		let pendingUntil = 0;
		let resend: (() => void) | undefined;
		let retries = 0;
		let retryAt = 0;
		this.onDisable(() => {
			resend = undefined;
		});
		const explodeTNT = (position = mainPart.Position) => {
			if (mainPart.GetAttribute("ExplosionDetonated") === true || os.clock() < pendingUntil) return;
			pendingUntil = os.clock() + 0.5;
			const request = {
				part: mainPart,
				position,
				time: Workspace.GetServerTimeNow(),
				radius: radius.get(),
				pressure: pressure.get(),
				isFlammable: flammable.get(),
			};
			RemoteEvents.Explode.send(request);
			resend = () => RemoteEvents.Explode.send(request);
			retries = 2;
			retryAt = os.clock() + 0.1;
		};
		this.event.subscribe(mainPart.GetAttributeChangedSignal("ExplosionDetonated"), () => {
			if (mainPart.GetAttribute("ExplosionDetonated") === true) this.disable();
		});

		let previousPosition = mainPart.Position;
		const sweep = new RaycastParams();
		sweep.FilterType = Enum.RaycastFilterType.Exclude;
		sweep.FilterDescendantsInstances = [this.instance.Parent ?? this.instance];
		sweep.RespectCanCollide = true;
		this.event.subscribe(RunService.Heartbeat, () => {
			if (resend && os.clock() >= retryAt) {
				resend();
				if (--retries <= 0) resend = undefined;
				retryAt = os.clock() + 0.1;
			}
			const position = mainPart.Position;
			const travel = position.sub(previousPosition);
			if (
				impact.get() &&
				mainPart.GetAttribute("ExplosionDetonated") !== true &&
				travel.Magnitude > 0.01 &&
				mainPart.AssemblyLinearVelocity.Magnitude > 10
			) {
				const hit = Workspace.Spherecast(
					previousPosition,
					math.max(0.1, math.min(mainPart.Size.X, mainPart.Size.Y, mainPart.Size.Z) / 2),
					travel,
					sweep,
				);
				if (hit) explodeTNT(previousPosition.add(travel.Unit.mul(hit.Distance)));
			}
			previousPosition = position;
		});

		this.on(({ explode }) => {
			if (!explode) return;
			explodeTNT();
		});

		this.event.subscribe(mainPart.Touched, (part) => {
			if (!impact.get()) return;

			if (!part.CanCollide || part.AssemblyRootPart === mainPart.AssemblyRootPart) return;
			const relativeSpeed = mainPart
				.GetVelocityAtPosition(mainPart.Position)
				.sub(part.GetVelocityAtPosition(mainPart.Position)).Magnitude;
			if (relativeSpeed > 10) explodeTNT();
		});
	}
}

const logic: BlockLogicInfo = { definition, ctor: Logic };
const list: BlockBuildersWithoutIdAndDefaults = {
	tnt: {
		displayName: "TNT",
		description: "A box of explosives. DO NOT HIT!",
		limit: 100,
		logic,
	},
	cylindricaltnt: {
		displayName: "Cylindrical TNT",
		description: "Not a boxed version",
		limit: 100,
		logic,
	},
	sphericaltnt: {
		displayName: "Spherical TNT",
		description: "Catch this, anarchid boy!",
		limit: 100,
		logic,
	},
	halfsphericaltnt: {
		displayName: "Half Spherical TNT",
		description: "Had to cut corners. Unfortunately, sphere doesn't have corners.. So we sliced it in half!",
		limit: 100,
		logic,
	},
};
export const TNTBlocks = BlockCreation.arrayFromObject(list);
