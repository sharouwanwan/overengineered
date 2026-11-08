import { Players, RunService } from "@rbxts/services";
import { t } from "engine/shared/t";
import { InstanceBlockLogic as InstanceBlockLogic } from "shared/blockLogic/BlockLogic";
import { inferEnumLogicType } from "shared/blockLogic/BlockLogicTypes";
import { BlockSynchronizer } from "shared/blockLogic/BlockSynchronizer";
import { scheduleRadar } from "shared/blockLogic/RadarScheduler";
import { RadarTargetMemory } from "shared/blockLogic/RadarTargetMemory";
import { radialFields, radialContains } from "shared/blockLogic/RadialRadarGeometry";
import { sectionFields, sectionFrame, coneContainsSphere } from "shared/blockLogic/SectionRadarGeometry";
import { radarBuildTargets } from "shared/blockLogic/SectionRadarTargets";
import { BlockCreation } from "shared/blocks/BlockCreation";
import type { BlockLogicFullBothDefinitions, InstanceBlockLogicArgs } from "shared/blockLogic/BlockLogic";
import type { BlockBuilder } from "shared/blocks/Block";

const definition = {
	inputOrder: [
		"maxDistance",
		"detectionSize",
		"visibility",
		"detectSelf",
		"relativePositioning",
		"minimalDistance",
		"detectPlayers",
		"holdLostTarget",
		"selection",
	],
	input: {
		selection: {
			displayName: "Target Selection",
			types: {
				enum: inferEnumLogicType({
					config: "any",
					elementOrder: ["any", "nearest", "farthest"],
					elements: {
						any: { displayName: "Any", tooltip: "Keep any valid contact; no distance priority." },
						nearest: { displayName: "Nearest" },
						farthest: { displayName: "Farthest" },
					},
				}),
			},
		},
		detectPlayers: {
			displayName: "Detect Players",
			tooltip: "Also detect living players whose character root is inside the detection area.",
			types: { bool: { config: false } },
		},
		holdLostTarget: {
			displayName: "Hold Lost Target",
			tooltip:
				"Keep the last known world position when contact is lost. Offset still follows this radar. Cleared when disabled.",
			types: { bool: { config: false } },
		},
		maxDistance: {
			displayName: "Max Distance",
			tooltip: "Returns coordinates relative to this block instead of relative to global grid",
			unit: "Studs",
			types: {
				number: {
					config: 100,
					clamp: {
						showAsSlider: true,
						min: 1,
						max: 2048,
					},
				},
			},
		},
		detectionSize: {
			displayName: "Detection Area Size",
			types: {
				number: {
					config: 1,
					clamp: {
						showAsSlider: true,
						min: 1,
						max: 5,
					},
				},
			},
		},
		visibility: {
			displayName: "Detection Area Visibility",
			types: {
				bool: {
					config: false,
				},
			},
		},
		detectSelf: {
			displayName: "Detect Self",
			types: {
				bool: {
					config: true,
				},
			},
			connectorHidden: true,
		},
		relativePositioning: {
			displayName: "Object-Relative Output",
			types: {
				bool: {
					config: true,
				},
			},
		},
		minimalDistance: {
			displayName: "Minimal Detection Distance",
			types: {
				number: {
					config: 5,
					clamp: {
						showAsSlider: true,
						min: 0,
						max: 2048,
					},
				},
			},
		},
	},
	output: {
		distance: {
			displayName: "Offset",
			types: ["vector3"],
		},
	},
} satisfies BlockLogicFullBothDefinitions;

const definitionRadial = {
	...definition,
	input: {
		...definition.input,
		detectionSize: { ...definition.input.detectionSize, configHidden: true, connectorHidden: true },
		maxDistance: {
			...definition.input.maxDistance,
			displayName: "Detection Diameter",
			tooltip:
				"Full width, not radius. For range feedback wire 2 * (Offset magnitude + margin). Reach is half this value.",
			types: {
				number: {
					...definition.input.maxDistance.types.number,
					clamp: {
						...definition.input.maxDistance.types.number.clamp,
						max: 15000,
					},
				},
			},
		},
	},
} satisfies BlockLogicFullBothDefinitions;

type radarBlock = BlockModel & {
	RadarView: BasePart | UnionOperation | MeshPart;
};

const radialSync = new BlockSynchronizer(
	"b_radial_field",
	t.interface({
		block: t.instance("Model").nominal("blockModel").as<BlockModel>(),
		radius: t.number,
		enabled: t.boolean,
	}),
	({ block, radius, enabled }) => {
		if (!radialFields.has(block)) block.Destroying.Once(() => radialFields.delete(block));
		radialFields.set(block, { radius: math.clamp(radius, 0.5, 7500), enabled });
		const view = block.FindFirstChild("RadarView");
		if (view?.IsA("BasePart")) {
			view.Transparency = 1;
			view.CastShadow = false;
			view.CanTouch = false;
			view.Size = new Vector3(0.1, 0.1, 0.1);
		}
	},
);
class RadialRadarLogic extends InstanceBlockLogic<typeof definitionRadial, radarBlock> {
	constructor(block: InstanceBlockLogicArgs) {
		super(definitionRadial, block);
		const view = this.instance.RadarView;
		view.Transparency = 1;
		view.CastShadow = false;
		view.CanTouch = false;
		view.Size = new Vector3(0.1, 0.1, 0.1);
		const outline = new Instance("WireframeHandleAdornment");
		outline.Name = "RadialRadarOutline";
		outline.Adornee = this.instance.PrimaryPart;
		outline.Color3 = view.Color;
		outline.Thickness = 1;
		outline.Transparency = 0.25;
		outline.Visible = false;
		outline.Parent = this.instance;
		this.onDestroy(() => outline.Destroy());
		let radius = 50,
			minimum = 5,
			visible = false,
			detectOwn = true,
			players = false,
			relative = true,
			hold = false;
		let farthest = false,
			anyTarget = true;
		this.onk(["selection"], ({ selection }) => {
			farthest = selection === "farthest";
			anyTarget = selection === "any";
			candidates = undefined;
			best = undefined;
			target = undefined;
		});
		let target: BasePart | undefined, best: BasePart | undefined;
		let targetSphere = 0,
			bestSphere = 0,
			bestDistance = farthest ? -1 : math.huge,
			index = 0;
		let candidates: readonly Model[] | undefined;
		const memory = new RadarTargetMemory();
		const invalidate = () => {
			candidates = undefined;
			target = undefined;
		};
		const publish = (enabled: boolean) => radialSync.send({ block: this.instance, radius, enabled });
		let dirty = true,
			nextVisual = 0;
		this.onk(["maxDistance"], ({ maxDistance }) => {
			radius = maxDistance / 2;
			dirty = true;
			radialFields.set(this.instance, { radius, enabled: this.isEnabled() });
		});
		this.event.subscribe(RunService.Heartbeat, () => {
			if (!dirty || os.clock() < nextVisual) return;
			dirty = false;
			nextVisual = os.clock() + 0.1;
			outline.Clear();
			const xy: Vector3[] = [],
				xz: Vector3[] = [],
				yz: Vector3[] = [];
			for (let i = 0; i < 48; i++) {
				const angle = (i * math.pi * 2) / 48,
					a = math.cos(angle) * radius,
					b = math.sin(angle) * radius;
				xy.push(new Vector3(a, b, 0));
				xz.push(new Vector3(a, 0, b));
				yz.push(new Vector3(0, a, b));
			}
			outline.AddPath(xy, true);
			outline.AddPath(xz, true);
			outline.AddPath(yz, true);
			publish(this.isEnabled());
		});
		this.onk(["minimalDistance", "detectSelf", "detectPlayers"], (values) => {
			minimum = values.minimalDistance;
			detectOwn = values.detectSelf;
			players = values.detectPlayers;
			invalidate();
		});
		this.onk(["relativePositioning", "holdLostTarget"], (values) => {
			relative = values.relativePositioning;
			hold = values.holdLostTarget;
		});
		this.onk(["visibility"], (values) => {
			visible = values.visibility;
			outline.Visible = visible && this.isEnabled();
		});
		this.event.subscribeRegistration(() =>
			scheduleRadar(() => {
				const origin = this.instance.PrimaryPart!.Position;
				const consider = (part: BasePart, sphere: number) => {
					const delta = part.Position.sub(origin),
						distance = delta.Dot(delta);
					if (
						distance < minimum * minimum ||
						(anyTarget
							? best !== undefined
							: farthest
								? distance <= bestDistance
								: distance >= bestDistance) ||
						!radialContains(delta, radius, sphere)
					)
						return;
					best = part;
					bestSphere = sphere;
					bestDistance = distance;
				};
				if (!candidates) {
					candidates = radarBuildTargets(this.instance);
					index = 0;
					best = undefined;
				}
				const previousBest = best;
				best = undefined;
				bestDistance = farthest ? -1 : math.huge;
				if (previousBest?.Parent) consider(previousBest, bestSphere);
				if (players)
					for (const player of Players.GetPlayers()) {
						if (!detectOwn && RunService.IsClient() && player === Players.LocalPlayer) continue;
						const character = player.Character,
							humanoid = character?.FindFirstChildOfClass("Humanoid"),
							root = character?.FindFirstChild("HumanoidRootPart");
						if (humanoid && humanoid.Health > 0 && root?.IsA("BasePart")) consider(root, 0);
					}
				const start = os.clock();
				let checked = 0;
				while (index < candidates.size() && !(anyTarget && best) && checked++ < 256) {
					const model = candidates[index++],
						root = model.PrimaryPart;
					if (model === this.instance || !root?.Parent || !model.Parent || model.Parent.Name !== "Blocks")
						continue;
					if (!detectOwn && model.Parent === this.instance.Parent) continue;
					consider(root, root.Size.Magnitude / 2);
					if (os.clock() - start >= 0.002) break;
				}
				if (best || index >= candidates.size()) {
					target = best;
					targetSphere = bestSphere;
				}
				if ((anyTarget && best) || index >= candidates.size()) candidates = undefined;
				return candidates !== undefined;
			}),
		);
		this.onTicc(() => {
			const origin = this.instance.GetPivot();
			if (target?.Parent) {
				const delta = target.Position.sub(this.instance.PrimaryPart!.Position);
				if (delta.Dot(delta) < minimum * minimum || !radialContains(delta, radius, targetSphere))
					target = undefined;
			}
			const position = memory.update(target?.Parent ? target.Position : undefined, hold);
			this.output.distance.set(
				"vector3",
				position
					? relative
						? origin.PointToObjectSpace(position)
						: position.sub(origin.Position)
					: Vector3.zero,
			);
		});
		this.event.subscribe(RunService.Heartbeat, () => {
			if (view.Parent) view.PivotTo(this.instance.GetPivot());
		});
		this.onEnable(() => {
			invalidate();
			publish(true);
			outline.Visible = visible;
		});
		this.onDisable(() => {
			invalidate();
			memory.clear();
			publish(false);
			outline.Visible = false;
			this.output.distance.set("vector3", Vector3.zero);
		});
	}
}

const sectionDefinition = {
	...definition,
	inputOrder: [...definition.inputOrder, "coneAngle"],
	input: {
		...definition.input,
		maxDistance: {
			...definition.input.maxDistance,
			tooltip: "Detection length along the cone axis.",
			types: { number: { config: 100, clamp: { showAsSlider: true, min: 1, max: 15000 } } },
		},
		minimalDistance: {
			...definition.input.minimalDistance,
			types: { number: { config: 5, clamp: { showAsSlider: true, min: 0, max: 15000 } } },
		},
		coneAngle: {
			displayName: "Cone Angle (degrees)",
			tooltip: "Full field of view. Zero retains legacy width wiring.",
			types: { number: { config: 5, clamp: { showAsSlider: true, min: 0, max: 120 } } },
		},
		detectionSize: { ...definition.input.detectionSize, configHidden: true, connectorHidden: true },
	},
} satisfies BlockLogicFullBothDefinitions;
const sectionSync = new BlockSynchronizer(
	"b_section_field",
	t.interface({
		block: t.instance("Model").nominal("blockModel").as<BlockModel>(),
		length: t.number,
		radius: t.number,
		enabled: t.boolean,
	}),
	({ block, length, radius, enabled }) => {
		if (!sectionFields.has(block)) block.Destroying.Once(() => sectionFields.delete(block));
		sectionFields.set(block, {
			length: math.clamp(length, 1, 15000),
			radius: math.clamp(radius, 0, 71000),
			enabled,
		});
	},
);
class RadarSectionLogic extends InstanceBlockLogic<typeof sectionDefinition, radarBlock> {
	constructor(block: InstanceBlockLogicArgs) {
		super(sectionDefinition, block);
		const view = this.instance.RadarView;
		view.CanTouch = false;
		view.Transparency = 1;
		view.Size = new Vector3(0.1, 0.1, 0.1);
		const outline = new Instance("WireframeHandleAdornment");
		outline.Adornee = this.instance.PrimaryPart;
		outline.Color3 = view.Color;
		outline.Thickness = 1;
		outline.Transparency = 0.25;
		outline.Visible = false;
		outline.Parent = this.instance;
		this.onDestroy(() => outline.Destroy());
		let length = 100,
			radius = 100 * math.tan(math.rad(2.5)),
			minimum = 5,
			visible = false,
			relative = true,
			detectOwn = true,
			players = false,
			hold = false;
		let farthest = false,
			anyTarget = true;
		this.onk(["selection"], ({ selection }) => {
			farthest = selection === "farthest";
			anyTarget = selection === "any";
			candidates = undefined;
			best = undefined;
			target = undefined;
		});
		let target: BasePart | undefined;
		let candidates: readonly Model[] | undefined;
		let index = 0;
		let best: BasePart | undefined;
		let bestDistance = farthest ? -1 : math.huge;
		let frame = sectionFrame(this.instance);
		const memory = new RadarTargetMemory();
		const invalidate = () => {
			candidates = undefined;
			target = undefined;
		};
		const publish = (enabled: boolean) => sectionSync.send({ block: this.instance, length, radius, enabled });
		let dirty = true,
			nextVisual = 0;
		const redraw = () => {
			outline.Clear();
			const rim: Vector3[] = [];
			for (let i = 0; i < 32; i++) {
				const angle = (i * math.pi) / 16;
				const point = new Vector3(radius * math.cos(angle), length + 0.4, radius * math.sin(angle));
				rim.push(point);
				if (i % 4 === 0) outline.AddLine(new Vector3(0, 0.4, 0), point);
			}
			outline.AddPath(rim, true);
		};
		this.event.subscribe(RunService.Heartbeat, () => {
			if (!dirty || os.clock() < nextVisual) return;
			dirty = false;
			nextVisual = os.clock() + 0.1;
			redraw();
			publish(this.isEnabled());
		});
		this.onk(["maxDistance", "coneAngle", "detectionSize"], (values) => {
			length = values.maxDistance;
			radius =
				values.coneAngle > 0
					? length * math.tan(math.rad(values.coneAngle / 2))
					: values.detectionSize * (values.detectionSize - math.sqrt(1 / 3)) * 5;
			// Preserve acquisition and update local geometry immediately; coalesce preview/network work.
			dirty = true;
			sectionFields.set(this.instance, { length, radius, enabled: this.isEnabled() });
		});
		this.onk(["minimalDistance", "detectSelf", "detectPlayers"], (values) => {
			minimum = values.minimalDistance;
			detectOwn = values.detectSelf;
			players = values.detectPlayers;
			invalidate();
		});
		this.onk(["relativePositioning", "holdLostTarget"], (values) => {
			relative = values.relativePositioning;
			hold = values.holdLostTarget;
		});
		this.onk(["visibility"], (values) => {
			visible = values.visibility;
			outline.Visible = visible && this.isEnabled();
		});
		this.event.subscribeRegistration(() =>
			scheduleRadar(() => {
				frame = sectionFrame(this.instance);
				const consider = (part: BasePart, sphere: number) => {
					const point = frame.PointToObjectSpace(part.Position);
					const delta = part.Position.sub(frame.Position);
					const distance = delta.Dot(delta);
					if (
						distance < minimum * minimum ||
						(anyTarget
							? best !== undefined
							: farthest
								? distance <= bestDistance
								: distance >= bestDistance) ||
						!coneContainsSphere(point, sphere, length, radius)
					)
						return;
					bestDistance = distance;
					best = part;
				};
				if (candidates) {
					const previousBest = best;
					best = undefined;
					bestDistance = farthest ? -1 : math.huge;
					if (previousBest?.Parent) consider(previousBest, previousBest.Size.Magnitude / 2);
				}
				if (!candidates) {
					candidates = radarBuildTargets(this.instance);
					index = 0;
					best = undefined;
					bestDistance = farthest ? -1 : math.huge;
					frame = sectionFrame(this.instance);
					if (players)
						for (const player of Players.GetPlayers()) {
							if (!detectOwn && RunService.IsClient() && player === Players.LocalPlayer) continue;
							const character = player.Character,
								humanoid = character?.FindFirstChildOfClass("Humanoid"),
								root = character?.FindFirstChild("HumanoidRootPart");
							if (humanoid && humanoid.Health > 0 && root?.IsA("BasePart")) consider(root, 0);
						}
				}
				const start = os.clock();
				let checked = 0;
				while (index < candidates.size() && !(anyTarget && best) && checked++ < 256) {
					const model = candidates[index++];
					const root = model.PrimaryPart;
					if (model === this.instance || !model.Parent || model.Parent.Name !== "Blocks" || !root?.Parent)
						continue;
					if (!detectOwn && model.Parent === this.instance.Parent) continue;
					consider(root, root.Size.Magnitude / 2);
					if (os.clock() - start >= 0.002) break;
				}
				if (best || index >= candidates.size()) target = best;
				if ((anyTarget && best) || index >= candidates.size()) candidates = undefined;
				return candidates !== undefined;
			}),
		);
		this.onTicc(() => {
			if (
				target?.Parent &&
				!coneContainsSphere(
					sectionFrame(this.instance).PointToObjectSpace(target.Position),
					target.Size.Magnitude / 2,
					length,
					radius,
				)
			)
				target = undefined;
			const position = memory.update(target?.Parent ? target.Position : undefined, hold),
				origin = this.instance.GetPivot();
			this.output.distance.set(
				"vector3",
				position
					? relative
						? origin.PointToObjectSpace(position)
						: position.sub(origin.Position)
					: Vector3.zero,
			);
		});
		this.event.subscribe(RunService.Heartbeat, () => {
			if (view.Parent) view.PivotTo(this.instance.GetPivot());
		});
		this.onEnable(() => {
			invalidate();
			publish(true);
			outline.Visible = visible;
		});
		this.onDisable(() => {
			invalidate();
			memory.clear();
			publish(false);
			outline.Visible = false;
			this.output.distance.set("vector3", Vector3.zero);
		});
	}
}

export const RadarBlocks = [
	{
		...BlockCreation.defaults,
		id: "radarsection",
		displayName: "Radar Section",
		description: "Detects a build or optional player in its cone, with Any/Nearest/Farthest selection.",

		logic: { definition: sectionDefinition, ctor: RadarSectionLogic },
	},
	{
		...BlockCreation.defaults,
		id: "radialradar",
		displayName: "Radial Radar",
		description: "Detects a build or optional player in its sphere, with Any/Nearest/Farthest selection.",

		logic: { definition: definitionRadial, ctor: RadialRadarLogic },
	},
] as const satisfies BlockBuilder[];
