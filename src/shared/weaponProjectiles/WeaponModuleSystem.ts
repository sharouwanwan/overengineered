import { RunService, Workspace } from "@rbxts/services";
import { HostedService } from "engine/shared/di/HostedService";
import { BlockManager } from "shared/building/BlockManager";
import { prepareWeaponMarkers } from "shared/weaponProjectiles/WeaponMarkers";
import type { SharedPlots } from "shared/building/SharedPlots";
import type { modifierValue, projectileModifier } from "shared/weaponProjectiles/BaseProjectileLogic";

type weaponMarker = {
	markerInstance: BasePart;
	localFrame: CFrame;
	occupiedWith: {
		module: WeaponModule | undefined;
		block: PlacedBlockData | Block | undefined;
	};
};

type markerName = string;
type uuid = string;
type recalcOut = {
	module: WeaponModule;
	extraModifier?: projectileModifier;
	activeOutputs: weaponMarker[];
};

export class WeaponModule {
	static readonly allModules: Record<uuid, WeaponModule> = {};
	readonly block: Block;
	readonly instance: BlockModel;

	readonly allMarkers = new Map<markerName, weaponMarker>();

	pregeneratedCollection: ModuleCollection = new ModuleCollection(this);
	parentCollection: ModuleCollection = this.pregeneratedCollection;

	constructor(
		placedBlock: PlacedBlockData,
		private readonly blockList: BlockList,
	) {
		this.block = blockList.blocks[placedBlock.id]!;
		this.instance = placedBlock.instance;

		if (RunService.IsServer()) prepareWeaponMarkers(this.instance);
		const fm = (placedBlock.instance.FindFirstChild("moduleMarkers")?.GetChildren() ?? []).filter(
			(p): p is BasePart => p.IsA("BasePart"),
		);
		const configMarkers = new Set();
		for (const [k, v] of pairs(this.block.weaponConfig!.markers)) {
			configMarkers.add(k);
		}

		for (const m of fm) {
			if (!configMarkers.has(m.Name)) throw `Weapon marker "${m.Name}" not found`;
			this.allMarkers.set(m.Name, {
				markerInstance: m,
				localFrame: this.instance.GetPivot().ToObjectSpace(m.CFrame),
				occupiedWith: {
					block: undefined,
					module: undefined,
				},
			});
		}

		if (this.block.weaponConfig) WeaponModule.allModules[placedBlock.uuid] = this;
		this.parentCollection.init();
	}

	getModuleMarkers() {
		const res = [];
		for (const [k, v] of pairs(this.allMarkers)) res.push(v);
		return res;
	}

	update(candidates: readonly Model[]) {
		// Query weapon geometry on this plot only, never scenery or player parts.
		const foundMarkers = this.allMarkers;
		const configMarkers = this.block.weaponConfig!.markers;
		const params = new OverlapParams();
		params.CollisionGroup = "Blocks";
		params.FilterType = Enum.RaycastFilterType.Include;
		params.FilterDescendantsInstances = candidates.filter((m) => m !== this.instance);

		const allCollidedCollections: Set<ModuleCollection> = new Set();
		for (const [k, v] of pairs(configMarkers)) {
			const marker = foundMarkers.get(k);
			if (!marker) continue;
			marker.occupiedWith.block = undefined;
			marker.occupiedWith.module = undefined;
			if (k !== "upgradeMarker" && (v.allowedBlockIds?.size() ?? 0) === 0) continue;
			const touching = Workspace.GetPartsInPart(marker.markerInstance, params);

			let closest = math.huge;
			for (const t of touching) {
				const touchingBlock = BlockManager.getBlockDataByPart(t);

				if (!touchingBlock) continue;
				const mod = WeaponModule.allModules[touchingBlock.uuid];
				if (
					!mod ||
					mod.instance.Parent !== this.instance.Parent ||
					mod.instance.GetAttribute("CombatDestroyed") === true
				)
					continue;
				const config = this.block.weaponConfig!.markers[k];

				//check if the id of the block is the same as allowed for this module
				const upgrade = k === "upgradeMarker" && mod.block.weaponConfig?.type === "UPGRADE";
				if (!upgrade && !config.allowedBlockIds?.includes(mod.block.id)) continue;
				const frame = mod.instance.GetPivot();
				if (
					!upgrade &&
					(marker.markerInstance.CFrame.RightVector.Dot(frame.RightVector) < math.cos(math.rad(5)) ||
						marker.markerInstance.CFrame.UpVector.Dot(frame.UpVector) < math.cos(math.rad(5)))
				)
					continue;
				const distance = frame.Position.sub(marker.markerInstance.Position).Magnitude;
				if (distance >= closest) continue;
				closest = distance;
				marker.occupiedWith.block = touchingBlock;
				marker.occupiedWith.module = mod;
			}
			if (marker.occupiedWith.module && marker.occupiedWith.module.parentCollection !== this.parentCollection)
				allCollidedCollections.add(marker.occupiedWith.module.parentCollection);
		}

		this.parentCollection.combineWithModuleCollections(...allCollidedCollections);
	}
}

export class ModuleCollection {
	readonly modules: Set<WeaponModule> = new Set();
	readonly emitters: Set<WeaponModule> = new Set();
	readonly calculatedOutputs: {
		source: WeaponModule;
		module: WeaponModule;
		outputs: weaponMarker[];
		modifier: projectileModifier;
	}[] = [];

	constructor(readonly mainModule: WeaponModule) {
		this.modules.add(mainModule);
	}

	init() {
		if (this.mainModule.block.weaponConfig!.type === "CORE") this.emitters.add(this.mainModule);
	}

	combineWithModules(...another: WeaponModule[]) {
		const parentCollections = new Set<ModuleCollection>();
		for (const k of another) parentCollections.add(k.parentCollection);

		this.combineWithModuleCollections(...parentCollections);
	}

	combineWithModuleCollections(...collections: ModuleCollection[]) {
		for (const c of collections) {
			if (c === this) continue;
			for (const k of c.modules) {
				k.parentCollection = this;
				this.modules.add(k);
				if (k.block.weaponConfig!.type === "CORE") this.emitters.add(k);
			}
		}
	}

	removeModules(...another: WeaponModule[]) {
		for (const m of another) {
			m.parentCollection = m.pregeneratedCollection;
			this.modules.delete(m);
			this.emitters.delete(m);
		}
	}

	setMarkersVisibility(isVisible: boolean) {
		for (const m of this.modules) {
			for (const o of m.getModuleMarkers()) o.markerInstance.Transparency = isVisible ? 0 : 1;
		}
	}

	recursivePath(
		outputArray: recalcOut[][],
		nextModule: WeaponModule,
		path: recalcOut[] = [],
		budget = { remaining: 4096 },
	): recalcOut[] | undefined {
		if (--budget.remaining < 0 || path.size() >= 128 || outputArray.size() >= 256) return;
		//check if there's a loop
		for (const p of path) if (p.module === nextModule) return;

		const connectedModules: WeaponModule[] = [];
		const activeOutputs: weaponMarker[] = [];

		//get all markers
		for (const [n, e] of pairs(nextModule.allMarkers)) {
			if (e.occupiedWith.module) {
				if (e.occupiedWith.module.block.weaponConfig?.type === "UPGRADE") continue;
				// Compare axes instead of Euler angles, which wrap at +/-180 degrees.
				const marker = e.markerInstance.GetPivot(),
					frame = e.occupiedWith.module.instance.GetPivot(),
					tolerance = math.cos(math.rad(5));
				if (
					marker.RightVector.Dot(frame.RightVector) >= tolerance &&
					marker.UpVector.Dot(frame.UpVector) >= tolerance
				)
					connectedModules.push(e.occupiedWith.module);

				continue;
			}

			if (!e.occupiedWith.block && nextModule.block.weaponConfig!.markers[n].emitsProjectiles) {
				activeOutputs.push(e);
				// print(e);
			}
		}

		const obj: recalcOut = {
			module: nextModule,
			activeOutputs,
		};

		// print(obj.activeOutputs);
		// add modifier because outputs split, i.e. divide output between modules
		if (connectedModules.size() + activeOutputs.size() > 1) {
			const baseModifierValue: modifierValue = {
				value: 1 / (connectedModules.size() + activeOutputs.size()),
				isRelative: true,
			};
			obj.extraModifier = {
				speedModifier: baseModifierValue,
				lifetimeModifier: baseModifierValue,
				heatDamage: baseModifierValue,
				impactDamage: baseModifierValue,
				explosiveDamage: baseModifierValue,
			};
		}

		//if size === 0 then there's only one block
		// therefore just stop iterations on it
		if (path.size() + connectedModules.size() === 0) {
			outputArray.push([obj]);
			return;
		}
		// print(path);
		//just add last module to the path at this point
		path.push(obj);

		//if there are modules attached to the markers
		if (connectedModules.size() === 0) return path;

		for (const e of connectedModules) {
			const p = this.recursivePath(outputArray, e, [...path], budget);
			if (!p) continue;
			outputArray.push(p);
		}
		return;
	}

	static calculateTotalModifier(modifiers: projectileModifier[]): projectileModifier | undefined {
		if (modifiers.size() === 0) return;
		const result: projectileModifier = {};

		const additions: projectileModifier = {},
			multipliers: projectileModifier = {};
		for (const m of modifiers) {
			for (const [k, v] of pairs(m)) {
				if (v.value !== v.value || math.abs(v.value) === math.huge) continue;
				if (v.isRelative) multipliers[k] = { value: (multipliers[k]?.value ?? 1) * v.value };
				else additions[k] = { value: (additions[k]?.value ?? 0) + v.value };
			}
		}
		for (const [k, v] of pairs(additions))
			result[k] = { value: v.value * (multipliers[k]?.value ?? 1), isRelative: false };
		for (const [k, v] of pairs(multipliers)) if (!additions[k]) result[k] = { value: v.value, isRelative: true };
		return result;
	}

	recalc() {
		const paths: recalcOut[][] = [];
		for (const e of this.emitters) this.recursivePath(paths, e);
		// print("paths:", paths);
		this.calculatedOutputs.clear();

		const getUpgrades = (a: WeaponModule): projectileModifier[] => {
			const result: projectileModifier[] = [],
				seen = new Set<WeaponModule>();
			for (const [, marker] of a.allMarkers) {
				const m = marker.occupiedWith.module;
				if (m?.block.weaponConfig?.type === "UPGRADE" && !seen.has(m)) {
					seen.add(m);
					result.push(m.block.weaponConfig.modifier);
				}
			}
			return result;
		};

		for (const path of paths) {
			const buf: projectileModifier[] = [];
			for (const p of path) {
				//if upgrade then do not iterate trough it
				if (p.module.block!.weaponConfig!.type === "UPGRADE") continue;

				// add effect from the block itself
				buf.push(p.module.block.weaponConfig!.modifier);

				// add effects from connected upgrades
				for (const u of getUpgrades(p.module)) buf.push(u);

				//if there are no holes to shoot from then skip
				if (p.activeOutputs.size() === 0) continue;

				//otherwise add modifier
				if (p.extraModifier) buf.push(p.extraModifier);

				// add the block to the list of outputs
				this.calculatedOutputs.push({
					source: path[0].module,
					module: p.module,
					modifier: ModuleCollection.calculateTotalModifier(buf) ?? {},
					outputs: p.activeOutputs,
				});
			}
		}
	}
}

@injectable
export class WeaponModuleSystem extends HostedService {
	private readonly dirty = new Set<Instance>();
	private readonly folders = new Map<Instance, RBXScriptConnection[]>();
	private readonly tracked = new Map<
		Model,
		{ module: WeaponModule; uuid: string; connections: RBXScriptConnection[] }
	>();

	constructor(
		@inject private readonly blockList: BlockList,
		@inject plots: SharedPlots,
	) {
		super();
		// A player's Blocks folder is replaced when they claim a plot. Watch its
		// parent as well as its contents, including folders created after startup.
		for (const plot of plots.plots) {
			this.event.subscribe(plot.instance.ChildAdded, (folder) => this.watchFolder(folder));
			this.event.subscribe(plot.instance.ChildRemoved, (folder) => this.unwatchFolder(folder));
			this.onEnable(() => {
				for (const folder of plot.instance.GetChildren()) this.watchFolder(folder);
			});
		}
		let nextUpdate = 0;
		this.event.subscribe(RunService.Heartbeat, () => {
			if (os.clock() < nextUpdate || this.dirty.size() === 0) return;
			nextUpdate = os.clock() + 0.1;
			for (const folder of [...this.dirty]) this.flush(folder);
		});
		this.onDestroy(() => {
			for (const folder of [...this.folders.keys()]) this.unwatchFolder(folder);
		});
	}

	private forget(model: Model) {
		const tracked = this.tracked.get(model);
		if (!tracked) return;
		for (const connection of tracked.connections) connection.Disconnect();
		if (WeaponModule.allModules[tracked.uuid] === tracked.module) delete WeaponModule.allModules[tracked.uuid];
		this.tracked.delete(model);
	}

	private watchFolder(folder: Instance) {
		if (folder.Name !== "Blocks" || !folder.IsA("Folder") || this.folders.has(folder)) return;
		this.folders.set(folder, [
			folder.ChildAdded.Connect(() => this.dirty.add(folder)),
			folder.ChildRemoved.Connect((child) => {
				if (child.IsA("Model")) this.forget(child);
				this.dirty.add(folder);
			}),
		]);
		this.dirty.add(folder);
	}

	private unwatchFolder(folder: Instance) {
		for (const connection of this.folders.get(folder) ?? []) connection.Disconnect();
		this.folders.delete(folder);
		this.dirty.delete(folder);
		for (const [model] of this.tracked) if (model.Parent === folder || !model.Parent) this.forget(model);
	}

	/** Rebuild only dirty plots; called before firing to avoid a first-shot race. */
	flush(folder: Instance) {
		if (!this.folders.has(folder) || !this.dirty.has(folder)) return;
		this.dirty.delete(folder);
		const modules: WeaponModule[] = [];
		for (const child of folder.GetChildren()) {
			if (!child.IsA("Model") || !child.PrimaryPart) continue;
			const info = BlockManager.getBlockDataByBlockModel(child as BlockModel);
			if (!this.blockList.blocks[info.id]?.weaponConfig || child.GetAttribute("CombatDestroyed") === true) {
				this.forget(child);
				continue;
			}
			let m = this.tracked.get(child)?.module;
			if (!m) {
				m = new WeaponModule(info, this.blockList);
				const primary = child.PrimaryPart;
				const markDirty = () => this.dirty.add(folder);
				this.tracked.set(child, {
					module: m,
					uuid: info.uuid,
					connections: [
						primary.GetPropertyChangedSignal("CFrame").Connect(() => {
							if (primary.Anchored) markDirty();
						}),
						primary.GetPropertyChangedSignal("Size").Connect(markDirty),
						primary.GetPropertyChangedSignal("Anchored").Connect(markDirty),
						child.GetAttributeChangedSignal("CombatDestroyed").Connect(markDirty),
					],
				});
			}
			for (const [, marker] of m.allMarkers)
				marker.localFrame = child.GetPivot().ToObjectSpace(marker.markerInstance.CFrame);
			m.pregeneratedCollection.modules.clear();
			m.pregeneratedCollection.emitters.clear();
			m.pregeneratedCollection.calculatedOutputs.clear();
			m.pregeneratedCollection.modules.add(m);
			m.parentCollection = m.pregeneratedCollection;
			m.parentCollection.init();
			modules.push(m);
		}
		const candidates = modules.map((m) => m.instance);
		for (const m of modules) m.update(candidates);
		for (const collection of new Set(modules.map((m) => m.parentCollection))) collection.recalc();
	}
}
