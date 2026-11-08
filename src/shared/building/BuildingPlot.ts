import { HttpService } from "@rbxts/services";
import { validPayload } from "engine/shared/event/RemoteValidation";
import { ArgsSignal } from "engine/shared/event/Signal";
import { BB } from "engine/shared/fixes/BB";
import { JSON } from "engine/shared/fixes/Json";
import { Objects } from "engine/shared/fixes/Objects";
import { Operation } from "engine/shared/Operation";
import { BlockManager } from "shared/building/BlockManager";
import { ReadonlyPlot } from "shared/building/ReadonlyPlot";
import { SharedBuilding } from "shared/building/SharedBuilding";

const err = (message: string): ErrorResponse => ({ success: false, message });
const success: SuccessResponse = { success: true };

/** Building on a plot. */
@injectable
export class BuildingPlot extends ReadonlyPlot {
	private readonly blockCounts = new Map<BlockId, number>();
	private readonly blockIds = new Map<Instance, BlockId>();
	getBlockCount(id: BlockId): number {
		return this.blockCounts.get(id) ?? 0;
	}
	readonly multiPlaceOperation = new Operation(this.multiPlace.bind(this));
	readonly placeOperation = new Operation(this.place.bind(this));
	readonly deleteOperation = new Operation(this.delete.bind(this));
	readonly editOperation = new Operation(this.edit.bind(this));

	private readonly _blockPlaced = new ArgsSignal<[block: BlockModel]>();
	readonly blockPlaced = this._blockPlaced.asReadonly();

	private readonly _blockDestroyed = new ArgsSignal<[block: BlockModel]>();
	readonly blockDestroyed = this._blockDestroyed.asReadonly();

	private readonly _blockEdited = new ArgsSignal<[req: EditBlockRequest]>();
	readonly blockEdited = this._blockEdited.asReadonly();

	constructor(
		instance: Folder,
		origin: CFrame,
		boundingBox: BB,
		@inject private readonly blockList: BlockList,
	) {
		super(instance, origin, boundingBox);
		const add = (child: Instance) => {
			if (!child.IsA("Model") || this.blockIds.has(child)) return;
			const id = BlockManager.manager.id.get(child as BlockModel);
			this.blockIds.set(child, id);
			this.blockCounts.set(id, this.getBlockCount(id) + 1);
		};
		for (const child of instance.GetChildren()) add(child);
		instance.ChildAdded.Connect(add);
		instance.ChildRemoved.Connect((child) => {
			const id = this.blockIds.get(child);
			if (id === undefined) return;
			this.blockIds.delete(child);
			this.blockCounts.set(id, math.max(0, this.getBlockCount(id) - 1));
		});
	}

	initializeTimeBasedDelay() {
		const addDelay = (signal: ReadonlyArgsSignal<[]>) => {
			let lastWait = 0;
			signal.Connect(() => {
				const now = time();
				if (now - lastWait > 1) {
					lastWait = now;
					task.wait();
				}
			});
		};

		addDelay(this.blockPlaced);
		addDelay(this.blockDestroyed);
		addDelay(this.blockEdited);
	}

	initializeDelay(placeDelay: number, deleteDelay: number, editDelay: number) {
		const addDelay = (signal: ReadonlyArgsSignal<[]>, count: number) => {
			let i = 0;
			signal.Connect(() => {
				i++;
				if (i >= count) {
					i = 0;
					task.wait();
				}
			});
		};

		addDelay(this.blockPlaced, placeDelay);
		addDelay(this.blockDestroyed, deleteDelay);
		addDelay(this.blockEdited, editDelay);
	}

	cloneBlocks(): Instance {
		return this.instance.Clone();
	}
	isInside(block: BlockModel): boolean {
		return this.boundingBox.isBBInside(BB.fromModel(block));
	}

	unparent(): void {
		this.instance.Parent = undefined;
	}
	destroy(): void {
		this.instance.Destroy();
	}

	private multiPlace(data: readonly PlaceBlockRequest[]): MultiBuildResponse {
		const placed: BlockModel[] = [];
		for (const block of data) {
			const placedBlock = this.placeOperation.execute(block);
			if (!placedBlock.success) {
				return placedBlock;
			}

			if (placedBlock.model) {
				placed.push(placedBlock.model);
			}
		}

		return { success: true, models: placed };
	}

	private place(data: PlaceBlockRequest): BuildResponse {
		const block = this.blockList.blocks[data.id];
		if (!block) {
			return { success: false, message: `Unknown block id ${data.id}` };
		}

		const placed = this.getBlockCount(data.id);
		if (placed >= block.limit && (game.PrivateServerOwnerId === 0 || block.limit === 1)) {
			return err(
				`Type limit exceeded for ${data.id}.${block.limit !== 1 ? " Maybe you should play on a private server?" : ""}`,
			);
		}

		const uuid = data.uuid ?? (HttpService.GenerateGUID(false) as BlockUuid);
		if (this.tryGetBlock(uuid)) {
			throw `Block with uuid ${uuid} already exists`;
		}

		// Create a new instance of the building model
		const model = block.model.Clone();
		BlockManager.manager.id.set(model, data.id);

		model.PivotTo(data.location);

		if (data.config && Objects.size(data.config) !== 0) {
			BlockManager.manager.config.set(model, data.config);
		}
		BlockManager.manager.customData.set(model, data.customData);
		BlockManager.manager.welds.set(model, data.welds);

		BlockManager.manager.scale.set(model, data.scale);
		BlockManager.manager.uuid.set(model, uuid);
		BlockManager.manager.collidable.set(model, data.collidable);
		if (data.collidable === false) {
			SharedBuilding.recollide(model, false);
		}

		model.Name = uuid;

		SharedBuilding.paint([model], data.color, data.material, true);
		this.blockIds.set(model, data.id);
		this.blockCounts.set(data.id, this.getBlockCount(data.id) + 1);
		model.Parent = this.instance;

		// scaling has to be updated after parenting so the weld offset is updated
		if (data.scale) {
			SharedBuilding.scale(model, block.model, data.scale);
		}

		this._blockPlaced.Fire(model);
		return { success: true, model: model };
	}
	private delete(blocks: readonly BlockModel[] | "all"): Response {
		if (blocks !== "all" && blocks.size() === 0) {
			return success;
		}

		if (blocks === "all") {
			blocks = this.getBlocks();
			for (const block of blocks) {
				const id = this.blockIds.get(block);
				if (id !== undefined) {
					this.blockIds.delete(block);
					this.blockCounts.set(id, math.max(0, this.getBlockCount(id) - 1));
				}
				block.Destroy();
				this._blockDestroyed.Fire(block);
			}
		} else {
			const connections = SharedBuilding.getBlocksConnectedByLogicToMulti(
				this.getBlockDatas(),
				blocks.mapToSet(BlockManager.manager.uuid.get),
			);
			for (const [, c] of connections) {
				for (const [otherblock, connectionName] of c) {
					this.logicDisconnect({
						inputBlock: otherblock.instance,
						inputConnection: connectionName,
					});
				}
			}

			for (const block of blocks) {
				const id = this.blockIds.get(block);
				if (id !== undefined) {
					this.blockIds.delete(block);
					this.blockCounts.set(id, math.max(0, this.getBlockCount(id) - 1));
				}
				block.Destroy();
				this._blockDestroyed.Fire(block);
			}
		}

		return success;
	}
	private edit(blocks: EditBlocksRequest["blocks"]): Response {
		if (blocks.size() === 0) {
			return success;
		}

		for (const { instance, position, scale } of blocks) {
			const origInstance = this.blockList.blocks[BlockManager.manager.id.get(instance)]!.model;

			const bb = BB.fromModel(origInstance)
				.withCenter(position ?? instance.GetPivot())
				.withSize((s) => s.mul(scale ?? BlockManager.manager.scale.get(instance) ?? Vector3.zero));

			if (!this.boundingBox.isBBInside(bb)) {
				return err("Invalid edit");
			}
		}

		for (const req of blocks) {
			const { instance, position, scale } = req;
			if (position) instance.PivotTo(position);
			if (scale) {
				SharedBuilding.scale(
					instance,
					this.blockList.blocks[BlockManager.manager.id.get(instance)]!.model,
					scale,
				);
				BlockManager.manager.scale.set(instance, scale);
			}

			this._blockEdited.Fire(req);
		}

		return success;
	}

	logicConnect(request: Omit<LogicConnectRequest, "plot">): Response {
		const config = BlockManager.manager.config.get(request.inputBlock) ?? {};
		const outputInfo = BlockManager.manager.uuid.get(request.outputBlock);

		const newConfig: typeof config = {
			...config,
			[request.inputConnection]: {
				type: "wire",
				config: {
					prevConfig: config[request.inputConnection],
					blockUuid: outputInfo,
					connectionName: request.outputConnection,
				},
			},
		};

		BlockManager.manager.config.set(request.inputBlock, newConfig);
		return success;
	}
	logicDisconnect({ inputBlock, inputConnection }: Omit<LogicDisconnectRequest, "plot">): Response {
		const config = { ...BlockManager.manager.config.get(inputBlock) };
		const cfg = config[inputConnection];
		if (cfg.type === "wire") {
			// either set it to the previous config, or delete the key by setting it to nil
			if (!cfg.config.prevConfig || cfg.config.prevConfig.type === "wire") {
				delete config[inputConnection];
			} else {
				config[inputConnection] = cfg.config.prevConfig;
			}
		}

		BlockManager.manager.config.set(inputBlock, config);
		return success;
	}
	paintBlocks({ blocks, color, material }: Omit<PaintBlocksRequest, "plot">): Response {
		if (blocks !== "all" && blocks.size() === 0) {
			return success;
		}

		blocks = blocks === "all" ? this.getBlocks() : blocks;
		SharedBuilding.paint(blocks, color, material, false);
		return success;
	}
	updateConfig(configs: ConfigUpdateRequest["configs"]): Response {
		for (const config of configs) {
			const decoded = JSON.deserialize(config.scfg);
			if (!typeIs(decoded, "table") || !validPayload(decoded)) return err("Invalid configuration");
			BlockManager.manager.config.set(config.block, decoded as PlacedBlockData["config"]);
		}

		return success;
	}
	updateCustomData(datas: CustomDataUpdateRequest["datas"]): Response {
		for (const data of datas) {
			const decoded = JSON.deserialize(data.sdata);
			if (!typeIs(decoded, "table") || !validPayload(decoded)) return err("Invalid custom data");
			BlockManager.manager.customData.set(data.block, decoded as PlacedBlockData["customData"]);
		}

		return success;
	}
	resetConfig(blocks: readonly BlockModel[]): Response {
		for (const block of blocks) {
			BlockManager.manager.config.set(block, undefined);
		}

		return success;
	}
	weld(datas: WeldRequest["datas"]): Response {
		for (const data of datas) {
			const thisBlock = this.getBlock(data.thisUuid);
			SharedBuilding.applyWelds(thisBlock, this, [data]);

			const welds =
				BlockManager.manager.welds.get(thisBlock)?.filter((c) => {
					return !(
						c.otherUuid === data.otherUuid &&
						c.thisPart.sequenceEquals(data.thisPart) &&
						c.otherPart.sequenceEquals(data.otherPart)
					);
				}) ?? [];

			welds.push({
				thisPart: data.thisPart,
				otherPart: data.otherPart,
				otherUuid: data.otherUuid,
				welded: data.welded,
			});
			BlockManager.manager.welds.set(thisBlock, welds);
		}

		return success;
	}
	recollide(datas: RecollideRequest["datas"]): Response {
		for (const { uuid, enabled } of datas) {
			const block = this.getBlock(uuid);
			SharedBuilding.recollide(block, enabled);
			BlockManager.manager.collidable.set(block, enabled);
		}

		return success;
	}
}
