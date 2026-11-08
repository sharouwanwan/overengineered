import { BlockCreation } from "shared/blocks/BlockCreation";
import { CannonBases } from "shared/blocks/blocks/Weaponry/Cannon/CannonBases";
import { ModularWeaponLogic, modularWeaponDefinition } from "shared/weaponProjectiles/ModularWeaponLogic";
import type { BlockBuilder } from "shared/blocks/Block";

const definition = modularWeaponDefinition;
export type { Logic as CannonBreechBlockLogic };
class Logic extends ModularWeaponLogic {}

export const CannonBreech = {
	...BlockCreation.defaults,
	id: "cannonbreech",
	displayName: "Cannon Breech",
	description: "Attach a matching cannon base in front, then optional barrels. Hold Fire in Ride mode.",

	weaponConfig: {
		type: "CORE",
		modifier: {
			speedModifier: {
				value: 1,
			},
		},
		markers: {
			output1: {
				emitsProjectiles: false,
				allowedBlockIds: [...CannonBases.map((v) => v.id)],
			},
		},
	},

	logic: { definition, ctor: Logic },
} as const satisfies BlockBuilder;
