import { BlockLogic } from "shared/blockLogic/BlockLogic";
import { inferEnumLogicType } from "shared/blockLogic/BlockLogicTypes";
import { Matrix3 } from "shared/blockLogic/Matrix3";
import { NumericalFilter } from "shared/blockLogic/NumericalFilter";
import { BlockCreation } from "shared/blocks/BlockCreation";
import type { BlockLogicArgs, BlockLogicFullBothDefinitions } from "shared/blockLogic/BlockLogic";
import type { BlockBuilder } from "shared/blocks/Block";

const definition = {
	inputOrder: ["value", "timeConstant", "mode", "tickBased", "reset"],
	input: {
		value: {
			displayName: "Value",
			types: { number: { config: 0 }, vector3: { config: Vector3.zero }, matrix3: { config: Matrix3.zero } },
			group: "signal",
		},
		timeConstant: {
			displayName: "Time Constant",
			tooltip: "Time constant in seconds, or logic ticks when Tick Mode is enabled.",
			types: { number: { config: 0.2, clamp: { min: 0, max: 3600, showAsSlider: false } } },
		},
		mode: {
			displayName: "Mode",
			types: {
				enum: inferEnumLogicType({
					config: "low",
					elementOrder: ["low", "high"],
					elements: { low: { displayName: "Low-pass" }, high: { displayName: "High-pass" } },
				}),
			},
		},
		tickBased: { displayName: "Tick Mode", types: { bool: { config: false } }, connectorHidden: true },
		reset: { displayName: "Reset", types: { bool: { config: false } } },
	},
	output: { result: { displayName: "Result", types: ["number", "vector3", "matrix3"], group: "signal" } },
} satisfies BlockLogicFullBothDefinitions;
class Logic extends BlockLogic<typeof definition> {
	constructor(block: BlockLogicArgs) {
		super(definition, block);
		const filters = Matrix3.keys.map(() => new NumericalFilter());
		let previousType: string | undefined;
		this.onAlwaysInputs(({ value, valueType, timeConstant, mode, reset, tickBased }, ctx) => {
			const seed = reset || previousType !== valueType;
			previousType = valueType;
			const step = (n: number, i: number) => {
				const result = filters[i].step(n, timeConstant, tickBased ? 1 : ctx.dt, seed);
				return mode === "low" ? result.low : result.high;
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
export const NumericalFilterBlock = {
	...BlockCreation.defaults,
	id: "numericalfilter",
	displayName: "Numerical Filter",
	description: "Low-pass smoothing or high-pass filtering with a time constant in seconds or logic ticks.",
	logic: { definition, ctor: Logic },
	modelSource: {
		model: BlockCreation.Model.fAutoCreated("DoubleGenericLogicBlockPrefab", "FILTER"),
		category: () => BlockCreation.Categories.memory,
	},
} as const satisfies BlockBuilder;
