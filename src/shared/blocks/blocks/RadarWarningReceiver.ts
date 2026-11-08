import { Players, RunService } from "@rbxts/services";
import { InstanceBlockLogic as InstanceBlockLogic } from "shared/blockLogic/BlockLogic";
import { RadarTargetMemory } from "shared/blockLogic/RadarTargetMemory";
import { radialFields, radialContains } from "shared/blockLogic/RadialRadarGeometry";
import { sectionFields, sectionFrame, coneContainsSphere } from "shared/blockLogic/SectionRadarGeometry";
import { BlockCreation } from "shared/blocks/BlockCreation";
import { SharedPlots } from "shared/building/SharedPlots";
import { CustomRemotes } from "shared/Remotes";
import { TagUtils } from "shared/utils/TagUtils";
import type { BlockLogicFullBothDefinitions, InstanceBlockLogicArgs } from "shared/blockLogic/BlockLogic";
import type { BlockBuilder } from "shared/blocks/Block";

const definition = {
	input: {
		holdLostTarget: {
			displayName: "Hold Lost Target",
			tooltip:
				"Retain last known emitter positions in empty output slots. Target count still reports current contacts. Cleared when disabled.",
			types: { bool: { config: false } },
		},
		relativePositioning: {
			displayName: "Object-Relative Output",
			tooltip: "Returns coordinates relative to this block instead of relative to global grid",
			types: {
				bool: {
					config: true,
				},
			},
		},
	},
	output: {
		targetsAmount: {
			displayName: "Locked Targets Amount",
			types: ["number"],
		},
		target1: {
			displayName: "Target 1 Offset",
			types: ["vector3"],
		},
		target2: {
			displayName: "Target 2 Offset",
			types: ["vector3"],
		},
		target3: {
			displayName: "Target 3 Offset",
			types: ["vector3"],
		},
		target4: {
			displayName: "Target 4 Offset",
			types: ["vector3"],
		},
	},
} satisfies BlockLogicFullBothDefinitions;

const ownDetectablesSet = new Set<BasePart>();

if (RunService.IsClient()) {
	const p = Players.LocalPlayer;
	CustomRemotes.modes.set.sent.Connect(({ mode }) => {
		if (mode === "ride") {
			const blocks = SharedPlots.instance.getPlotComponentByOwnerID(p.UserId).getBlocks();

			for (const b of blocks) {
				if (!b.PrimaryPart) continue;
				ownDetectablesSet.add(b.PrimaryPart);
			}
			return;
		}

		ownDetectablesSet.clear();
	});
}

export type { Logic as RadarWarningReceiverBlockLogic };
@injectable
class Logic extends InstanceBlockLogic<typeof definition> {
	constructor(block: InstanceBlockLogicArgs) {
		super(definition, block);

		const detectedSet = new Set<BasePart | UnionOperation | MeshPart>();
		const outputs = [this.output.target1, this.output.target2, this.output.target3, this.output.target4];

		const memories = outputs.map(() => new RadarTargetMemory());
		const hold = this.initializeInputCache("holdLostTarget");
		const isRelative = this.initializeInputCache("relativePositioning");
		this.event.subscribe(RunService.Stepped, () => {
			const origin = this.instance.GetPivot();
			const roots: BasePart[] = [];
			for (const part of detectedSet) {
				if (!part.Parent) {
					detectedSet.delete(part);
					continue;
				}
				const model = part.Parent;
				if (model.IsA("Model") && model.PrimaryPart) roots.push(model.PrimaryPart);
			}
			for (const [model, field] of sectionFields) {
				if (!field.enabled || !model.PrimaryPart || model === this.instance) continue;
				if (
					coneContainsSphere(
						sectionFrame(model).PointToObjectSpace(origin.Position),
						0,
						field.length,
						field.radius,
					)
				)
					roots.push(model.PrimaryPart);
			}
			for (const [model, field] of radialFields) {
				if (!field.enabled || !model.PrimaryPart || model === this.instance) continue;
				if (radialContains(origin.Position.sub(model.PrimaryPart.Position), field.radius))
					roots.push(model.PrimaryPart);
			}
			roots.sort((a, b) => a.Position.sub(origin.Position).Magnitude < b.Position.sub(origin.Position).Magnitude);
			for (let i = 0; i < outputs.size(); i++) {
				const position = memories[i].update(roots[i]?.Position, hold.get());
				outputs[i].set(
					"vector3",
					position
						? isRelative.get()
							? origin.PointToObjectSpace(position)
							: position.sub(origin.Position)
						: Vector3.zero,
				);
			}
			this.output.targetsAmount.set("number", roots.size());
		});
		this.onDisable(() => {
			detectedSet.clear();
			for (let i = 0; i < outputs.size(); i++) {
				memories[i].clear();
				outputs[i].set("vector3", Vector3.zero);
			}
			this.output.targetsAmount.set("number", 0);
		});

		this.event.subscribe(block.instance.PrimaryPart!.Touched, (part) => {
			if (!part.HasTag(TagUtils.allTags.SPECIAL_RADARVIEW)) return;
			detectedSet.add(part);
		});

		this.event.subscribe(block.instance.PrimaryPart!.TouchEnded, (part) => {
			if (!part.HasTag(TagUtils.allTags.SPECIAL_RADARVIEW)) return;
			detectedSet.delete(part);
		});
	}
}

export const RadarWarningReceiver = {
	...BlockCreation.defaults,
	id: "radarwarningreceiver",
	displayName: "Radar Warning Receiver",
	description: "Returns the positions of the radars that can be tracking the block.",
	search: {
		aliases: ["rwr"],
	},
	logic: { definition, ctor: Logic },
} as const satisfies BlockBuilder;
