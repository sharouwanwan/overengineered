import { BlockLogic } from "shared/blockLogic/BlockLogic";
import { inferEnumLogicType } from "shared/blockLogic/BlockLogicTypes";
import { NumericalFilter } from "shared/blockLogic/NumericalFilter";
import { BlockCreation } from "shared/blocks/BlockCreation";
import type { BlockLogicArgs, BlockLogicFullBothDefinitions } from "shared/blockLogic/BlockLogic";
import type { BlockBuilder } from "shared/blocks/Block";

const definition = {
	inputOrder: ["value", "timeConstant", "mode", "reset"],
	input: {
		value: {
			displayName: "Value",
			types: { number: { config: 0 }, vector3: { config: Vector3.zero } },
			group: "signal",
		},
		timeConstant: {
			displayName: "Time Constant",
			unit: "Seconds",
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
		reset: { displayName: "Reset", types: { bool: { config: false } } },
	},
	output: { result: { displayName: "Result", types: ["number", "vector3"], group: "signal" } },
} satisfies BlockLogicFullBothDefinitions;
class Logic extends BlockLogic<typeof definition> {
	constructor(block: BlockLogicArgs) {
		super(definition, block);
		const filters = [new NumericalFilter(), new NumericalFilter(), new NumericalFilter()];
		let previousType: string | undefined;
		this.onAlwaysInputs(({ value, valueType, timeConstant, mode, reset }, ctx) => {
			const seed = reset || previousType !== valueType;
			previousType = valueType;
			const step = (n: number, i: number) => {
				const result = filters[i].step(n, timeConstant, ctx.dt, seed);
				return mode === "low" ? result.low : result.high;
			};
			if (typeIs(value, "number")) this.output.result.set("number", step(value, 0));
			else this.output.result.set("vector3", new Vector3(step(value.X, 0), step(value.Y, 1), step(value.Z, 2)));
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
	description: "Low-pass smoothing or high-pass filtering with a time constant in seconds.",
	logic: { definition, ctor: Logic },
	modelSource: {
		model: BlockCreation.Model.fAutoCreated("DoubleGenericLogicBlockPrefab", "FILTER"),
		category: () => BlockCreation.Categories.memory,
	},
} as const satisfies BlockBuilder;
