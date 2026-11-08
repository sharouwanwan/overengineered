import { CollectionService, Workspace } from "@rbxts/services";
import { InstanceBlockLogic } from "shared/blockLogic/BlockLogic";
import { scheduleRadar } from "shared/blockLogic/RadarScheduler";
import { BlockCreation } from "shared/blocks/BlockCreation";
import type { BlockLogicFullBothDefinitions, InstanceBlockLogicArgs } from "shared/blockLogic/BlockLogic";
import type { BlockBuilder } from "shared/blocks/Block";

const definition = {
	input: {
		detectionradius: {
			displayName: "Detection Radius",
			types: {
				number: {
					config: 20,
					clamp: {
						showAsSlider: true,
						min: 1,
						max: 300,
						step: 1,
					},
				},
			},
		},
	},
	output: {
		detected: {
			displayName: "Detected",
			types: ["bool"],
		},
	},
} satisfies BlockLogicFullBothDefinitions;

export type { Logic as FireSensorBlockLogic };
@injectable
class Logic extends InstanceBlockLogic<typeof definition> {
	constructor(block: InstanceBlockLogicArgs) {
		super(definition, block);

		const detectionRadiusCache = this.initializeInputCache("detectionradius");

		this.event.subscribeRegistration(() =>
			scheduleRadar(() => {
				const radius = detectionRadiusCache.get();
				let found = false;
				for (const part of CollectionService.GetTagged("ActiveFire")) {
					if (!part.IsA("BasePart") || !part.Parent) continue;
					const expires = part.GetAttribute("BurnUntil");
					if (!typeIs(expires, "number") || expires <= Workspace.GetServerTimeNow()) continue;
					if (part.Position.sub(this.instance.GetPivot().Position).Magnitude <= radius) {
						found = true;
						break;
					}
				}
				this.output.detected.set("bool", found);
			}),
		);
	}
}

export const FireSensorBlock = {
	...BlockCreation.defaults,
	id: "firesensor",
	displayName: "Fire Sensor",
	description: "Returns true if fire got detected",

	logic: { definition, ctor: Logic },
} as const satisfies BlockBuilder;
