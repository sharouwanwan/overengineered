import { JSON } from "engine/shared/fixes/Json";
import { Objects } from "engine/shared/fixes/Objects";
import { BlockManager } from "shared/building/BlockManager";
import { current, getVersion } from "shared/building/SaveMigrations";
import { Serializer } from "shared/Serializer";
import type { BuildingPlot } from "shared/building/BuildingPlot";
import type { ReadonlyPlot } from "shared/building/ReadonlyPlot";

import type {
	LatestSerializedBlock,
	LatestSerializedBlocks,
	SerializedBlocks,
	SerializedBlockBase,
} from "shared/building/SaveMigrations";
export type { LatestSerializedBlock, LatestSerializedBlocks } from "shared/building/SaveMigrations";

namespace Filter {
	const white = Color3.fromRGB(255, 255, 255);
	const plastic = Enum.Material.Plastic;

	export function deleteDefaultValues(block: Writable<ReplaceWith<LatestSerializedBlock, { config?: {} }>>) {
		if (block.color?.color === white && block.color.alpha === 1) {
			delete block.color;
		}
		if (block.material === plastic) {
			delete block.material;
		}
		if (block.config && Objects.size(block.config) === 0) {
			delete block.config;
		}
		if (block.connections && Objects.size(block.connections) === 0) {
			delete block.connections;
		}
	}

	export function cleanup(blocks: Map<BlockUuid, Writable<LatestSerializedBlock>>) {
		for (const [, v] of blocks) {
			if (!v.welds) continue;

			const weldCopy: BlockWeld[] = [];
			for (const weld of v.welds) {
				if (weld.welded) {
					continue;
				}
				if (!blocks.has(weld.otherUuid)) {
					continue;
				}

				weldCopy.push(weld);
			}

			v.welds = weldCopy;
		}
	}
}

const read = {
	blockV3: (block: BlockModel, buildingCenter: CFrame): LatestSerializedBlock => {
		const data: LatestSerializedBlock = {
			...BlockManager.getBlockDataByBlockModel(block),
			location: buildingCenter.ToObjectSpace(block.GetPivot()),
			["instance" as never]: undefined,
		};
		Filter.deleteDefaultValues(data);

		return data;
	},
} as const;
const place = {
	blocksOnPlot: (plot: BuildingPlot, data: readonly LatestSerializedBlock[]) => {
		const deserializedData = data.map((blockData) =>
			BlocksSerializer.serializedBlockToPlaceRequest(blockData, plot.origin),
		);

		const response = plot.multiPlaceOperation.execute(deserializedData);
		if (!response.success) {
			throw `Could not place blocks: ${response.message}`;
		}
	},
} as const;

/** Methods to save and load buildings */
export namespace BlocksSerializer {
	export type JsonSerializedBlocks = SerializedBlocks<JsonBlock>;
	type JsonBlock = ReplaceWith<
		Omit<LatestSerializedBlock, "location" | "color" | "material" | "scale">,
		{
			readonly loc: SerializedCFrame;
			readonly mat: SerializedEnum | undefined;
			readonly col: SerializedColor | undefined;
			readonly scl: string | undefined;
			readonly wld: string | undefined;
			readonly cld: boolean | undefined;
		}
	>;

	export const latestVersion = current.version;

	export function serializeBlockToObject(plot: ReadonlyPlot, block: BlockModel): LatestSerializedBlock {
		return read.blockV3(block, plot.origin);
	}
	export function serializeToObject(plot: ReadonlyPlot): SerializedBlocks<LatestSerializedBlock> {
		return {
			version: current.version,
			blocks: plot.getBlocks().map((block) => serializeBlockToObject(plot, block)),
		};
	}

	export function objectToJson(slot: LatestSerializedBlocks): JsonSerializedBlocks {
		const fix = (block: LatestSerializedBlock): JsonBlock => {
			return {
				id: block.id,
				uuid: block.uuid,
				config: block.config,
				customData: block.customData,
				connections: block.connections,

				loc: Serializer.CFrameSerializer.serialize(block.location),
				col: block.color && Serializer.Color4Serializer.serialize(block.color),
				mat: block.material && Serializer.EnumMaterialSerializer.serialize(block.material),
				scl: block.scale && JSON.serialize(block.scale),
				wld: block.welds && JSON.serialize(block.welds),
				cld: block.collidable,
			};
		};

		return {
			version: slot.version,
			blocks: slot.blocks.map(fix),
		};
	}

	export function upgradeSave(data: SerializedBlocks<SerializedBlockBase>, blockList: BlockList) {
		const version = data.version;
		for (let i = version + 1; i <= current.version; i++) {
			const version = getVersion(i);
			if (!version) continue;
			if (!("upgradeFrom" in version)) continue;

			data = version.upgradeFrom(data as never, blockList);
			$log(`Upgrading a slot to savev${version.version}`);
		}

		return data;
	}

	export function jsonToObject(slot: JsonSerializedBlocks): LatestSerializedBlocks {
		const fix = (block: JsonBlock): LatestSerializedBlock => {
			return {
				id: block.id,
				uuid: block.uuid,
				config: block.config,
				customData: block.customData,
				connections: block.connections,

				location: Serializer.CFrameSerializer.deserialize(block.loc),
				color: block.col ? Serializer.Color4Serializer.deserialize(block.col) : undefined,
				material: block.mat ? Serializer.EnumMaterialSerializer.deserialize(block.mat) : undefined,
				scale: block.scl ? JSON.deserialize(block.scl) : undefined,
				welds: block.wld ? JSON.deserialize(block.wld) : undefined,
				collidable: block.cld,
			};
		};

		return {
			version: slot.version,
			blocks: slot.blocks.map(fix),
		};
	}
	export function deserializeFromObject(
		data: SerializedBlocks<SerializedBlockBase>,
		plot: BuildingPlot,
		blockList: BlockList,
	): number {
		if (data.version === undefined) {
			throw "Corrupted slot data";
		}
		if (data.version > latestVersion) {
			throw "Trying to load a slot with an unknown version (loaded from testing?)";
		}

		$log(`Loading a slot using savev${data.version}`);

		data = upgradeSave(data, blockList);
		Filter.cleanup(
			data.blocks.mapToMap((b) =>
				$tuple((b as LatestSerializedBlock).uuid, b as Writable<LatestSerializedBlock>),
			),
		);
		place.blocksOnPlot(plot, data.blocks as readonly LatestSerializedBlock[]);
		return data.blocks.size();
	}

	export function serializedBlockToPlaceRequest(
		blockData: LatestSerializedBlock,
		buildingCenter: CFrame,
	): PlaceBlockRequest {
		return {
			id: blockData.id,
			location: buildingCenter.ToWorldSpace(blockData.location),

			color: blockData.color ?? { color: Color3.fromRGB(255, 255, 255), alpha: 1 },
			material: blockData.material ?? Enum.Material.Plastic,
			config: blockData.config,
			customData: blockData.customData,
			uuid: blockData.uuid,
			scale: blockData.scale,
			welds: blockData.welds,
			collidable: blockData.collidable,
		};
	}
}
