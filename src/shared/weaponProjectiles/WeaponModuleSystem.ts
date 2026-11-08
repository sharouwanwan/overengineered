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

	update() {
		//get all colided marker touches with
		//iterate through the touched parts
		//	if occupiedWithBlock !== undefined
		//	if a block
		//	if the same type
		//	set module
		const foundMarkers = this.allMarkers;
		const configMarkers = this.block.weaponConfig!.markers;
		const params = new OverlapParams();
		params.CollisionGroup = "Blocks";
		params.FilterType = Enum.RaycastFilterType.Exclude;
		params.AddToFilter(this.instance);
		if (this.instance.PrimaryPart) params.AddToFilter(this.instance.PrimaryPart);

		const allCollidedCollections: Set<ModuleCollection> = new Set();
		for (const [k, v] of pairs(configMarkers)) {
			const marker = foundMarkers.get(k)!;
			const touching = Workspace.GetPartsInPart(marker.markerInstance, params);

			marker.occupiedWith.block = undefined;
			marker.occupiedWith.module = undefined;

			for (const t of touching) {
				const touchingBlock = BlockManager.getBlockDataByPart(t); //get the first one

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
				marker.occupiedWith.block = touchingBlock;
				marker.occupiedWith.module = mod;

				if (marker.occupiedWith.module.parentCollection !== this.parentCollection)
					allCollidedCollections.add(marker.occupiedWith.module.parentCollection);

				break;
			}
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
	constructor(@inject blockList: BlockList, @inject plots: SharedPlots) {
		super();

		const dirty = new Set<Instance>();
		let nextUpdate = 0;
		for (const p of plots.plots) {
			const folder = p.instance.FindFirstChild("Blocks");
			if (!folder) continue;
			dirty.add(folder);
			this.event.subscribe(folder.ChildAdded, () => dirty.add(folder));
			this.event.subscribe(folder.ChildRemoved, () => dirty.add(folder));
		}
		this.event.subscribe(RunService.Heartbeat, () => {
			if (os.clock() < nextUpdate || dirty.size() === 0) return;
			nextUpdate = os.clock() + 0.1;
			for (const folder of dirty) {
				const modules: WeaponModule[] = [];
				for (const [id, m] of pairs(WeaponModule.allModules))
					if (!m.instance.Parent) delete WeaponModule.allModules[id];
				for (const child of folder.GetChildren()) {
					if (!child.IsA("Model")) continue;
					const info = BlockManager.getBlockDataByBlockModel(child as BlockModel);
					if (!blockList.blocks[info.id]?.weaponConfig || !child.FindFirstChild("moduleMarkers")) continue;
					let m = WeaponModule.allModules[info.uuid];
					if (!m) {
						m = new WeaponModule(info, blockList);
						const primary = child.PrimaryPart;
						const connection = primary?.GetPropertyChangedSignal("CFrame").Connect(() => {
							if (primary.Anchored) dirty.add(folder);
						});
						const resized = primary?.GetPropertyChangedSignal("Size").Connect(() => {
							if (primary.Anchored) dirty.add(folder);
						});
						const broken = child
							.GetAttributeChangedSignal("CombatDestroyed")
							.Connect(() => dirty.add(folder));
						child.Destroying.Once(() => {
							connection?.Disconnect();
							resized?.Disconnect();
							broken.Disconnect();
						});
					}
					if (child.PrimaryPart?.Anchored)
						for (const [, marker] of m.allMarkers)
							marker.localFrame = child.GetPivot().ToObjectSpace(marker.markerInstance.CFrame);
					m.pregeneratedCollection.modules.clear();
					m.pregeneratedCollection.emitters.clear();
					m.pregeneratedCollection.modules.add(m);
					m.parentCollection = m.pregeneratedCollection;
					m.parentCollection.init();
					modules.push(m);
				}
				for (const m of modules) m.update();
				const collections = new Set(modules.map((m) => m.parentCollection));
				for (const c of collections) c.recalc();
			}
			dirty.clear();
		});
	}
}
