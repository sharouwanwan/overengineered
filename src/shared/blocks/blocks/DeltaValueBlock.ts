import { BlockLogic } from "shared/blockLogic/BlockLogic";
import { Matrix3 } from "shared/blockLogic/Matrix3";

import { BlockCreation } from "shared/blocks/BlockCreation";
import type { BlockLogicArgs, BlockLogicFullBothDefinitions } from "shared/blockLogic/BlockLogic";
import type { BlockBuilder } from "shared/blocks/Block";

const definition = {
	inputOrder: ["value", "tickBased", "reset"],
	input: {
		value: {
			displayName: "Value",
			types: { number: { config: 0 }, vector3: { config: Vector3.zero }, matrix3: { config: Matrix3.zero } },
			group: "signal",
		},
		tickBased: { displayName: "Tick Mode", types: { bool: { config: false } }, connectorHidden: true },
		reset: { displayName: "Reset", types: { bool: { config: false } } },
	},
	output: { result: { displayName: "Result", types: ["number", "vector3", "matrix3"], group: "signal" } },
} satisfies BlockLogicFullBothDefinitions;
class Logic extends BlockLogic<typeof definition> {
	constructor(block: BlockLogicArgs) {
		super(definition, block);
		const previous: (number | undefined)[] = [];
		let previousTickMode: boolean | undefined;
		let previousType: string | undefined;
		this.onAlwaysInputs(({ value, valueType, reset, tickBased }, ctx) => {
			const seed = reset || previousType !== valueType || previousTickMode !== tickBased;
			previousType = valueType;
			previousTickMode = tickBased;
			const step = (n: number, i: number) => {
				if (n !== n || math.abs(n) === math.huge) {
					previous[i] = undefined;
					return 0;
				}
				const old = previous[i];
				previous[i] = n;
				const dt = tickBased ? 1 : ctx.dt;
				return seed || old === undefined || dt !== dt || dt <= 0 || dt >= math.huge ? 0 : (n - old) / dt;
			};
			if (typeIs(value, "number")) this.output.result.set("number", step(value, 0));
			else if (typeIs(value, "Vector3"))
				this.output.result.set("vector3", new Vector3(step(value.X, 0), step(value.Y, 1), step(value.Z, 2)));
			else {
				const result = { ...Matrix3.zero };
				Matrix3.keys.forEach((key, i) => (result[key] = step(value[key], i)));
				this.output.result.set("matrix3", result);
			}
		});
		this.onDisable(() => {
			previousType = undefined;
		});
	}
}
export const DeltaValueBlock = {
	...BlockCreation.defaults,
	id: "deltavalue",
	displayName: "Delta Value",
	description: "Change per second, or change per logic tick when Tick Mode is enabled.",
	logic: { definition, ctor: Logic },
	modelSource: {
		model: BlockCreation.Model.fAutoCreated("DoubleGenericLogicBlockPrefab", "DELTA"),
		category: () => BlockCreation.Categories.memory,
	},
} as const satisfies BlockBuilder;
