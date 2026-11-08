import { BlockCreation } from "shared/blocks/BlockCreation";
import { ModularWeaponLogic, modularWeaponDefinition } from "shared/weaponProjectiles/ModularWeaponLogic";
import type { BlockBuilder } from "shared/blocks/Block";

const definition = modularWeaponDefinition;
export type { Logic as PlasmaGunBlockLogic };
class Logic extends ModularWeaponLogic {}

export const PlasmaGunBlock = {
	...BlockCreation.defaults,
	id: "plasmagun",
	displayName: "Plasma Gun",
	description: "",

	weaponConfig: {
		type: "CORE",
		modifier: {
			speedModifier: {
				value: 250,
			},
		},
		markers: {
			output1: {
				emitsProjectiles: true,
				allowedBlockIds: ["plasmagunbarrel", "plasmaseparatormuzzle", "plasmashotgunmuzzle"],
			},
		},
	},

	logic: { definition, ctor: Logic },
} as const satisfies BlockBuilder;
