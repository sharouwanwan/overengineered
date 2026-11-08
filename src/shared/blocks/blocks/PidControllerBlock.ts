import { BlockLogic } from "shared/blockLogic/BlockLogic";
import { PidState } from "shared/blockLogic/PidState";
import { BlockCreation } from "shared/blocks/BlockCreation";
import type { BlockLogicArgs, BlockLogicFullBothDefinitions } from "shared/blockLogic/BlockLogic";
import type { BlockBuilder } from "shared/blocks/Block";

const definition = {
	inputOrder: [
		"target",
		"p",
		"i",
		"d",
		"now",
		"imin",
		"imax",
		"measurementDerivative",
		"filter",
		"limitOutput",
		"outputMin",
		"outputMax",
		"reset",
	],
	input: {
		filter: { displayName: "Derivative filter seconds", types: { number: { config: 0 } }, connectorHidden: true },
		outputMin: { displayName: "Minimum output", types: { number: { config: 0 } }, connectorHidden: true },
		outputMax: { displayName: "Maximum output", types: { number: { config: 0 } }, connectorHidden: true },
		measurementDerivative: {
			displayName: "Derivative on measurement",
			types: { bool: { config: false } },
			connectorHidden: true,
		},
		limitOutput: { displayName: "Limit output", types: { bool: { config: false } }, connectorHidden: true },
		reset: { displayName: "Reset", types: { bool: { config: false } }, connectorHidden: true },

		target: {
			displayName: "Target value",
			types: {
				number: {
					config: 0,
				},
			},
		},
		p: {
			displayName: "P",
			types: {
				number: {
					config: 0,
				},
			},
		},
		i: {
			displayName: "I",
			types: {
				number: {
					config: 0,
				},
			},
		},
		d: {
			displayName: "D",
			types: {
				number: {
					config: 0,
				},
			},
		},
		now: {
			displayName: "Current value",
			types: {
				number: {
					config: 0,
				},
			},
		},
		imin: {
			displayName: "Min integeral border",
			types: {
				number: {
					config: 0,
				},
			},
			connectorHidden: true,
		},
		imax: {
			displayName: "Max integeral border",
			types: {
				number: {
					config: 0,
				},
			},
			connectorHidden: true,
		},
	},
	output: {
		output: {
			displayName: "Output",
			types: ["number"],
		},
		integral: {
			displayName: "integral",
			types: ["number"],
		},
	},
} satisfies BlockLogicFullBothDefinitions;

export type { Logic as PidControllerBlockLogic };
class Logic extends BlockLogic<typeof definition> {
	constructor(block: BlockLogicArgs) {
		super(definition, block);

		const pid = new PidState();
		this.onDisable(() => pid.reset());
		this.onAlwaysInputs((inputs, { dt }) => {
			const result = pid.step(inputs, dt);
			this.output.integral.set("number", result.integral);
			this.output.output.set("number", result.output);
		});
	}
}

export const PidControllerBlock = {
	...BlockCreation.defaults,
	id: "pidcontrollerblock",
	displayName: "Pid Controller",
	description: "Controller: P/I/D - proportional+integral+differential",
	logic: { definition, ctor: Logic },
	modelSource: {
		model: BlockCreation.Model.fAutoCreated("x4GenericLogicBlockPrefab", "PID"),
		category: () => BlockCreation.Categories.other,
	},
} as const satisfies BlockBuilder;
