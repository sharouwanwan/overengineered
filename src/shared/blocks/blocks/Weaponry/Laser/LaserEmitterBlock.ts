import { BlockCreation } from "shared/blocks/BlockCreation";
import { ModularWeaponLogic, modularWeaponDefinition } from "shared/weaponProjectiles/ModularWeaponLogic";
import type { BlockBuilder } from "shared/blocks/Block";

const definition = modularWeaponDefinition;
export type { Logic as LaserEmitterBlockLogic };
class Logic extends ModularWeaponLogic {}

export const LaserEmitterBlock = {
	...BlockCreation.defaults,
	id: "laseremitter",
	displayName: "Laser Emitter",
	description: "",

	weaponConfig: {
		type: "CORE",
		modifier: {
			speedModifier: {
				value: 10,
			},
		},
		markers: {
			inputMarker: {
				allowedBlockIds: [],
			},
			marker1: {
				emitsProjectiles: true,
				allowedBlockIds: ["laserlens"],
			},
		},
	},

	logic: { definition, ctor: Logic },
} as const satisfies BlockBuilder;
