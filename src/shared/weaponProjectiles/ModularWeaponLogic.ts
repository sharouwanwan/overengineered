import { Workspace } from "@rbxts/services";
import { InstanceBlockLogic } from "shared/blockLogic/BlockLogic";
import { BlockConfigDefinitions } from "shared/blocks/BlockConfigDefinitions";
import { Colors } from "shared/Colors";
import { WeaponProtocol, weaponProfiles } from "shared/weaponProjectiles/WeaponProtocol";
import type { BlockLogicFullBothDefinitions, InstanceBlockLogicArgs } from "shared/blockLogic/BlockLogic";
export const modularWeaponDefinition = {
	input: {
		projectileColor: { displayName: "Projectile Color", types: { color: { config: Colors.pink } } },
		fireTrigger: {
			displayName: "Fire",
			types: {
				bool: {
					config: false,
					control: {
						config: { enabled: true, key: "F", switch: false, reversed: false },
						canBeReversed: false,
						canBeSwitch: false,
					},
				},
			},
		},
		reload: { displayName: "Reload", types: BlockConfigDefinitions.bool },
	},
	output: {
		ready: { displayName: "Ready", types: ["bool"] },
		ammo: { displayName: "Ammo", types: ["number"] },
		reloading: { displayName: "Reloading", types: ["bool"] },
	},
} satisfies BlockLogicFullBothDefinitions;
export class ModularWeaponLogic extends InstanceBlockLogic<typeof modularWeaponDefinition> {
	constructor(block: InstanceBlockLogicArgs) {
		super(modularWeaponDefinition, block);
		const profile = weaponProfiles[this.instance.GetAttribute("id") as string];
		let nextRequest = 0,
			wasReload = false;
		this.onAlwaysInputs(({ fireTrigger, projectileColor, reload }) => {
			const now = Workspace.GetServerTimeNow();
			const readyAt = (this.instance.GetAttribute("WeaponReadyAt") as number | undefined) ?? 0;
			const reloadAt = (this.instance.GetAttribute("WeaponReloadAt") as number | undefined) ?? 0;
			const ammo = (this.instance.GetAttribute("WeaponAmmo") as number | undefined) ?? profile?.magazine ?? 0;
			this.output.ready.set("bool", now >= readyAt && now >= reloadAt && ammo > 0);
			this.output.reloading.set("bool", now < reloadAt);
			this.output.ammo.set("number", ammo);
			if ((reload && !wasReload) || (fireTrigger && now >= nextRequest)) {
				WeaponProtocol.fire.send({ core: this.instance, color: projectileColor, reload });
				nextRequest = now + (profile?.interval ?? 0.1);
			}
			wasReload = reload;
		});
	}
}
