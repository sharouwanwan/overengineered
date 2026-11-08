import { finite } from "engine/shared/event/RemoteValidation";
import { PlayerConfigDefinition } from "shared/config/PlayerConfig";
const record = (value: unknown): value is Record<string, unknown> => typeIs(value, "table");
const text = (value: unknown): value is string => typeIs(value, "string") && value.size() <= 65536;
const instance = (value: unknown): value is Instance => typeIs(value, "Instance");
const integer = (value: unknown) => finite(value) && value % 1 === 0;
const optional = (value: unknown, check: (value: unknown) => boolean) => value === undefined || check(value);
const array = (value: unknown, check: (value: unknown) => boolean) => {
	if (!record(value)) return false;
	let count = 0;
	for (const [key, item] of pairs(value)) {
		if (!integer(key) || (key as unknown as number) < 1 || !check(item) || ++count > 10000) return false;
	}
	return count === (value as unknown as unknown[]).size();
};
const vector = (v: unknown) => typeIs(v, "Vector3") && v.X > 0 && v.Y > 0 && v.Z > 0;
const boolean = (v: unknown) => typeIs(v, "boolean");
const color = (v: unknown) => record(v) && typeIs(v.color, "Color3") && finite(v.alpha) && v.alpha >= 0 && v.alpha <= 1;
const sameShape = (value: unknown, template: unknown): boolean => {
	if (!typeIs(template, "table")) return typeOf(value) === typeOf(template);
	if (!record(value)) return false;
	for (const [key, child] of pairs(value)) {
		const expected = (template as Record<string, unknown>)[key];
		if (expected === undefined || !sameShape(child, expected)) return false;
	}
	return true;
};
const settings = (value: unknown): boolean => {
	if (!record(value)) return false;
	for (const [key, child] of pairs(value)) {
		const definition = (PlayerConfigDefinition as Record<string, { config: unknown; min?: number; max?: number }>)[
			key
		];
		if (!definition || !sameShape(child, definition.config)) return false;
		if (
			finite(child) &&
			((definition.min !== undefined && child < definition.min) ||
				(definition.max !== undefined && child > definition.max))
		)
			return false;
	}
	return true;
};
const modifier = (v: unknown): boolean => {
	if (!record(v)) return false;
	for (const [key, value] of pairs(v)) {
		if (
			key !== "heatDamage" &&
			key !== "impactDamage" &&
			key !== "explosiveDamage" &&
			key !== "speedModifier" &&
			key !== "lifetimeModifier"
		)
			return false;
		if (!record(value) || !finite(value.value) || !optional(value.isRelative, boolean)) return false;
	}
	return true;
};
const frame = (v: unknown) => typeIs(v, "CFrame");

/** Validate operation shapes before accessing caller-supplied properties. */
export function validRequest(name: string, arg: unknown): boolean {
	if (name === "player_fetchdata" || name === "player_init" || name === "player_loaded") return arg === undefined;
	if (name === "player_updsettings") return settings(arg);
	if (name === "player_upddata")
		return (
			record(arg) &&
			(arg.key === "lastJoin" || arg.key === "lastLaunchedVersion" || arg.key === "warnings") &&
			finite(arg.value)
		);
	if (name === "player_init_admin") return integer(arg);
	if (name === "gui_settings_isolation" || name === "ragdoll_trigger") return boolean(arg);
	if (name === "gui_settings_updateblacklist") return array(arg, integer);
	if (name === "integrity_violation") return text(arg);
	if (name === "mdr_seat" || name === "b_fetchBlocks") return arg === undefined;
	if (name === "adm_setsw") return record(arg) && text(arg.name) && boolean(arg.value);
	if (name === "pl_achs_adm_reset") return array(arg, text);
	if (name === "pl_achs_adm_set") {
		if (!record(arg)) return false;
		for (const [key, value] of pairs(arg))
			if (
				!text(key) ||
				!record(value) ||
				!optional(value.completed, boolean) ||
				!optional(value.completionDateUnix, finite) ||
				!optional(value.progress, finite)
			)
				return false;
		return true;
	}
	if (name === "block_damage")
		return (
			record(arg) &&
			instance(arg.block) &&
			record(arg.damage) &&
			optional(arg.damage.heatDamage, finite) &&
			optional(arg.damage.impactDamage, finite) &&
			optional(arg.damage.explosiveDamage, finite)
		);
	if (name === "md_set")
		return record(arg) && (arg.mode === "build" || arg.mode === "ride") && optional(arg.pos, text);

	if (name === "burn" || name === "impact_break") return array(arg, (v) => instance(v) && v.IsA("BasePart"));
	if (name === "explode")
		return (
			record(arg) && instance(arg.part) && finite(arg.radius) && finite(arg.pressure) && boolean(arg.isFlammable)
		);
	if (name === "b_button_click") return instance(arg) && arg.IsA("Model");
	if (name === "b_radio_transmitter_send") return record(arg) && finite(arg.frequency) && text(arg.valueType);
	if (name === "projectile_damage")
		return (
			record(arg) && instance(arg.part) && finite(arg.damage) && arg.damage >= 0 && array(arg.modifiers, modifier)
		);
	if (name === "shell_spawn" || name === "bullet_spawn" || name === "plasma_spawn")
		return (
			record(arg) &&
			typeIs(arg.startPosition, "Vector3") &&
			typeIs(arg.baseVelocity, "Vector3") &&
			finite(arg.baseDamage) &&
			arg.baseDamage >= 0 &&
			modifier(arg.modifier) &&
			optional(arg.color, (v) => typeIs(v, "Color3"))
		);
	if (name === "laser_destroy") return record(arg) && instance(arg.originPart);
	if (name === "laser_spawn")
		return (
			record(arg) &&
			instance(arg.originPart) &&
			instance(arg.owner) &&
			typeIs(arg.color, "Color3") &&
			finite(arg.baseDamage) &&
			arg.baseDamage >= 0 &&
			modifier(arg.modifier)
		);
	if (name === "b_camera_update") return record(arg) && instance(arg.block) && boolean(arg.enabled);
	if (name === "b_disconnectblock_disconnect" || name === "b_propellantblock_disconnect")
		return record(arg) && instance(arg.block);
	if (name === "bracedshard_init") return record(arg) && instance(arg.block) && finite(arg.angle);
	if (name === "sevensegmentdisplay_update") return record(arg) && instance(arg.block) && finite(arg.code);
	if (name === "sync_gyro") return record(arg) && instance(arg.block) && frame(arg.constraint_cframe);
	if (name === "backmount_weld")
		return (
			record(arg) &&
			instance(arg.block) &&
			instance(arg.owner) &&
			boolean(arg.weldedState) &&
			boolean(arg.connectToRootPart)
		);
	if (name === "beacon_update" || name === "leddisplay_fill")
		return (
			record(arg) &&
			instance(arg.block) &&
			typeIs(arg.color, "Color3") &&
			(name !== "leddisplay_fill" ||
				array(arg.frames, (row) =>
					array(row, (v) => instance(v) && v.IsA("Frame") && v.IsDescendantOf(arg.block as Instance)),
				))
		);
	if (name === "leddisplay_prepare") return record(arg) && instance(arg.block) && typeIs(arg.baseColor, "Color3");
	if (name === "leddisplay_update")
		return (
			record(arg) &&
			instance(arg.block) &&
			array(arg.changes, (v) => {
				if (!typeIs(v, "table")) return false;
				const pair = v as unknown as unknown[];
				const target = pair[0];
				return (
					pair.size() === 2 &&
					instance(target) &&
					target.IsA("Frame") &&
					target.IsDescendantOf(arg.block as Instance) &&
					typeIs(pair[1], "Color3")
				);
			})
		);
	if (name.sub(1, 6) === "slots_") {
		if (!record(arg)) return false;
		if (name === "slots_loadFromHistory") return text(arg.databaseId) && text(arg.historyId);
		if (!integer(arg.index)) return false;
		if (name !== "slots_save") return true;
		return (
			typeIs(arg.save, "boolean") &&
			optional(arg.name, text) &&
			optional(arg.color, text) &&
			optional(arg.order, finite) &&
			optional(arg.touchControls, record)
		);
	}
	if (name.sub(1, 9) !== "building_") return true;
	if (!record(arg) || !instance(arg.plot)) return false;
	switch (name) {
		case "building_place":
			return array(
				arg.blocks,
				(b) =>
					record(b) &&
					text(b.id) &&
					frame(b.location) &&
					optional(b.scale, vector) &&
					optional(b.uuid, text) &&
					optional(b.config, record),
			);
		case "building_edit":
			return array(
				arg.blocks,
				(b) => record(b) && instance(b.instance) && optional(b.position, frame) && optional(b.scale, vector),
			);
		case "building_delete":
			return arg.blocks === "all" || array(arg.blocks, instance);
		case "building_paint":
			if (
				!optional(arg.color, color) ||
				!optional(arg.material, (v) => typeIs(v, "EnumItem") && v.EnumType === Enum.Material)
			)
				return false;
			return arg.blocks === "all" || array(arg.blocks, instance);
		case "building_resetcfg":
			return array(arg.blocks, instance);
		case "building_lconnect":
			return (
				instance(arg.inputBlock) &&
				instance(arg.outputBlock) &&
				text(arg.inputConnection) &&
				text(arg.outputConnection)
			);
		case "building_ldisconnect":
			return instance(arg.inputBlock) && text(arg.inputConnection);
		case "building_updatecfg":
			return array(arg.configs, (b) => record(b) && instance(b.block) && text(b.scfg));
		case "building_updatecdt":
			return array(arg.datas, (b) => record(b) && instance(b.block) && text(b.sdata));
		case "building_recollide":
			return array(arg.datas, (b) => record(b) && text(b.uuid) && typeIs(b.enabled, "boolean"));
		case "building_weld":
			return array(
				arg.datas,
				(b) =>
					record(b) &&
					text(b.thisUuid) &&
					text(b.otherUuid) &&
					array(b.thisPart, text) &&
					array(b.otherPart, text) &&
					typeIs(b.welded, "boolean"),
			);
	}
	return false;
}
