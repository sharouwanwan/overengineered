import { C2SRemoteEvent, S2CRemoteEvent } from "engine/shared/event/PERemoteEvent";
export type WeaponProfile = {
	interval: number;
	damage: number;
	speed: number;
	lifetime: number;
	magazine: number;
	reload: number;
	blast: number;
	laser: boolean;
	gravity: number;
};
export const weaponProfiles: Readonly<Record<string, WeaponProfile | undefined>> = {
	mgloader: {
		interval: 0.12,
		damage: 18,
		speed: 1000,
		lifetime: 4,
		magazine: 40,
		reload: 2,
		blast: 0,
		laser: false,
		gravity: 1,
	},
	cannonbreech: {
		interval: 1.5,
		damage: 120,
		speed: 700,
		lifetime: 8,
		magazine: 1,
		reload: 1.5,
		blast: 8,
		laser: false,
		gravity: 1,
	},
	plasmagun: {
		interval: 0.4,
		damage: 45,
		speed: 250,
		lifetime: 5,
		magazine: 12,
		reload: 2.5,
		blast: 3,
		laser: false,
		gravity: 0,
	},
	laseremitter: {
		interval: 0.1,
		damage: 5,
		speed: 0,
		lifetime: 0.1,
		magazine: 60,
		reload: 2,
		blast: 0,
		laser: true,
		gravity: 0,
	},
};
export type ShotVisual = {
	id: number;
	position: Vector3;
	velocity: Vector3;
	gravity: Vector3;
	lifetime: number;
	color: Color3;
	time: number;
	endpoint?: Vector3;
};
export const WeaponProtocol = {
	fire: new C2SRemoteEvent<{ core: Model; color: Color3; reload: boolean }>("weapon_fire"),
	spawn: new S2CRemoteEvent<ShotVisual>("weapon_spawn"),
	hit: new S2CRemoteEvent<{ id: number; position: Vector3 }>("weapon_hit"),
};
