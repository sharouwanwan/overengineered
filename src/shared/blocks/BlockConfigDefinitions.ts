import { Matrix3 } from "shared/blockLogic/Matrix3";
import type { BlockLogicFullInputDef } from "shared/blockLogic/BlockLogic";

export const BlockConfigDefinitions = {
	matrix3: { matrix3: { config: Matrix3.identity } },
	any: {
		bool: { config: false as boolean },
		number: { config: 0 as number },
		vector3: { config: Vector3.zero },
		string: { config: "" as string },
		byte: { config: 0 as number },
		color: { config: new Color3(0, 0, 0) },
		sound: { config: { id: "" as string } },
		matrix3: { config: Matrix3.identity },
	},
	number: {
		number: { config: 0 as number },
	},
	string: {
		string: { config: "" as string },
	},
	bool: {
		bool: { config: false as boolean },
	},
	byte: {
		byte: { config: 0 as number },
	},
	vector3: {
		vector3: { config: new Vector3(0, 0, 0) },
	},
	color: {
		color: { config: new Color3(0, 0, 0) },
	},
} as const satisfies { readonly [k in string]: BlockLogicFullInputDef["types"] };
