import { BlockCreation } from "shared/blocks/BlockCreation";
import { MachineGunAmmoBlocks } from "shared/blocks/blocks/Weaponry/Machinegun/MachineGunAmmoBlocks";
import { MachineGunBarrels } from "shared/blocks/blocks/Weaponry/Machinegun/MachineGunBarrels";
import { MachineGunMuzzleBrakes } from "shared/blocks/blocks/Weaponry/Machinegun/MachineGunMuzzleBrakes";
import { ModularWeaponLogic, modularWeaponDefinition } from "shared/weaponProjectiles/ModularWeaponLogic";
import type { BlockBuilder } from "shared/blocks/Block";

const definition = modularWeaponDefinition;
export type { Logic as MachineGunLoaderBlockLogic };
class Logic extends ModularWeaponLogic {}

export const MachineGunLoader = {
	...BlockCreation.defaults,
	id: "mgloader",
	displayName: "Machine Gun Loader",
	description: "",

	weaponConfig: {
		type: "CORE",
		modifier: {
			speedModifier: {
				value: 1000,
			},
		},
		markers: {
			output1: {
				emitsProjectiles: true,
				allowedBlockIds: [...MachineGunBarrels, ...MachineGunMuzzleBrakes, ...MachineGunAmmoBlocks].map(
					(v) => v.id,
				),
			},
			upgradeMarker: {},
		},
	},

	logic: { definition, ctor: Logic },
} as const satisfies BlockBuilder;
