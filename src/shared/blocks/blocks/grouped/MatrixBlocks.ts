import { CalculatableBlockLogic } from "shared/blockLogic/BlockLogic";
import { Matrix3 } from "shared/blockLogic/Matrix3";
import { BlockConfigDefinitions } from "shared/blocks/BlockConfigDefinitions";
import { BlockCreation } from "shared/blocks/BlockCreation";
import type {
	BlockLogicBothDefinitions,
	BlockLogicArgs,
	AllInputKeysToObject,
	AllOutputKeysToObject,
	BlockLogicFullBothDefinitions,
} from "shared/blockLogic/BlockLogic";
import type { BlockLogicValueResults } from "shared/blockLogic/BlockLogicValueStorage";
import type { BlockLogicInfo, BlockBuildersWithoutIdAndDefaults } from "shared/blocks/Block";
type CalcFunc<TDef extends BlockLogicBothDefinitions> = (
	inputs: AllInputKeysToObject<TDef["input"]>,
	block: AutoCalculatableBlock<TDef>,
) => AllOutputKeysToObject<TDef["output"]> | BlockLogicValueResults;

class AutoCalculatableBlock<TDef extends BlockLogicBothDefinitions> extends CalculatableBlockLogic<TDef> {
	constructor(
		definition: TDef,
		args: BlockLogicArgs,
		private readonly calcfunc: CalcFunc<TDef>,
	) {
		super(definition, args);
	}

	protected override calculate(
		inputs: AllInputKeysToObject<TDef["input"]>,
	): AllOutputKeysToObject<TDef["output"]> | BlockLogicValueResults {
		return this.calcfunc(inputs, this);
	}
}
const logic = <TDef extends BlockLogicFullBothDefinitions>(definition: TDef, calcfunc: CalcFunc<TDef>) => {
	class ctor extends AutoCalculatableBlock<TDef> {
		constructor(args: BlockLogicArgs) {
			super(definition, args, calcfunc);
		}
	}

	return { definition, ctor } satisfies BlockLogicInfo;
};

export const MatrixBlocks = BlockCreation.arrayFromObject({
	matrix3fromrows: {
		displayName: "Matrix From Rows",
		description: "Construct a 3x3 matrix from three row vectors.",
		modelSource: {
			model: BlockCreation.Model.fAutoCreated("TripleGenericLogicBlockPrefab", "Matrix From Rows"),
			category: () => BlockCreation.Categories.converterVector,
		},
		logic: logic(
			{
				input: {
					row1: { displayName: "row1", types: BlockConfigDefinitions.vector3 },
					row2: { displayName: "row2", types: BlockConfigDefinitions.vector3 },
					row3: { displayName: "row3", types: BlockConfigDefinitions.vector3 },
				},
				output: { result: { displayName: "result", types: ["matrix3"] } },
			},
			({ row1, row2, row3 }) => ({ result: { type: "matrix3", value: Matrix3.rows(row1, row2, row3) } }),
		),
	},
	matrix3torows: {
		displayName: "Matrix To Rows",
		description: "Split a matrix into its three row vectors.",
		modelSource: {
			model: BlockCreation.Model.fAutoCreated("TripleGenericLogicBlockPrefab", "Matrix To Rows"),
			category: () => BlockCreation.Categories.converterVector,
		},
		logic: logic(
			{
				input: { a: { displayName: "A", types: BlockConfigDefinitions.matrix3 } },
				output: {
					row1: { displayName: "row1", types: ["vector3"] },
					row2: { displayName: "row2", types: ["vector3"] },
					row3: { displayName: "row3", types: ["vector3"] },
				},
			},
			({ a }) => ({
				row1: { type: "vector3", value: new Vector3(a.m11, a.m12, a.m13) },
				row2: { type: "vector3", value: new Vector3(a.m21, a.m22, a.m23) },
				row3: { type: "vector3", value: new Vector3(a.m31, a.m32, a.m33) },
			}),
		),
	},
	matrix3add: {
		displayName: "Matrix Add",
		description: "Operate on two 3x3 matrices. Multiplication applies B first, then A.",
		modelSource: {
			model: BlockCreation.Model.fAutoCreated("TripleGenericLogicBlockPrefab", "Matrix Add"),
			category: () => BlockCreation.Categories.converterVector,
		},
		logic: logic(
			{
				input: {
					a: { displayName: "A", types: BlockConfigDefinitions.matrix3 },
					b: { displayName: "B", types: BlockConfigDefinitions.matrix3 },
				},
				output: { result: { displayName: "result", types: ["matrix3"] } },
			},
			({ a, b }) => ({ result: { type: "matrix3", value: Matrix3.add(a, b) } }),
		),
	},
	matrix3subtract: {
		displayName: "Matrix Subtract",
		description: "Operate on two 3x3 matrices. Multiplication applies B first, then A.",
		modelSource: {
			model: BlockCreation.Model.fAutoCreated("TripleGenericLogicBlockPrefab", "Matrix Subtract"),
			category: () => BlockCreation.Categories.converterVector,
		},
		logic: logic(
			{
				input: {
					a: { displayName: "A", types: BlockConfigDefinitions.matrix3 },
					b: { displayName: "B", types: BlockConfigDefinitions.matrix3 },
				},
				output: { result: { displayName: "result", types: ["matrix3"] } },
			},
			({ a, b }) => ({ result: { type: "matrix3", value: Matrix3.add(a, b, -1) } }),
		),
	},
	matrix3multiply: {
		displayName: "Matrix Multiply",
		description: "Operate on two 3x3 matrices. Multiplication applies B first, then A.",
		modelSource: {
			model: BlockCreation.Model.fAutoCreated("TripleGenericLogicBlockPrefab", "Matrix Multiply"),
			category: () => BlockCreation.Categories.converterVector,
		},
		logic: logic(
			{
				input: {
					a: { displayName: "A", types: BlockConfigDefinitions.matrix3 },
					b: { displayName: "B", types: BlockConfigDefinitions.matrix3 },
				},
				output: { result: { displayName: "result", types: ["matrix3"] } },
			},
			({ a, b }) => ({ result: { type: "matrix3", value: Matrix3.multiply(a, b) } }),
		),
	},
	matrix3scale: {
		displayName: "Matrix Scale",
		description: "Multiply every entry by a scalar.",
		modelSource: {
			model: BlockCreation.Model.fAutoCreated("TripleGenericLogicBlockPrefab", "Matrix Scale"),
			category: () => BlockCreation.Categories.converterVector,
		},
		logic: logic(
			{
				input: {
					a: { displayName: "A", types: BlockConfigDefinitions.matrix3 },
					scale: { displayName: "Scale", types: { number: { config: 1 } } },
				},
				output: { result: { displayName: "result", types: ["matrix3"] } },
			},
			({ a, scale }) => ({ result: { type: "matrix3", value: Matrix3.scale(a, scale) } }),
		),
	},
	matrix3vector: {
		displayName: "Matrix Transform Vector",
		description: "Multiply a column vector by a 3x3 matrix.",
		modelSource: {
			model: BlockCreation.Model.fAutoCreated("TripleGenericLogicBlockPrefab", "Matrix Transform Vector"),
			category: () => BlockCreation.Categories.converterVector,
		},
		logic: logic(
			{
				input: {
					a: { displayName: "A", types: BlockConfigDefinitions.matrix3 },
					vector: { displayName: "vector", types: BlockConfigDefinitions.vector3 },
				},
				output: { result: { displayName: "result", types: ["vector3"] } },
			},
			({ a, vector }) => ({ result: { type: "vector3", value: Matrix3.transform(a, vector) } }),
		),
	},
	matrix3transpose: {
		displayName: "Matrix Transpose",
		description: "Calculate the transpose of a 3x3 matrix.",
		modelSource: {
			model: BlockCreation.Model.fAutoCreated("TripleGenericLogicBlockPrefab", "Matrix Transpose"),
			category: () => BlockCreation.Categories.converterVector,
		},
		logic: logic(
			{
				input: { a: { displayName: "A", types: BlockConfigDefinitions.matrix3 } },
				output: { result: { displayName: "result", types: ["matrix3"] } },
			},
			({ a }) => ({ result: { type: "matrix3", value: Matrix3.transpose(a) } }),
		),
	},
	matrix3determinant: {
		displayName: "Matrix Determinant",
		description: "Calculate the determinant of a 3x3 matrix.",
		modelSource: {
			model: BlockCreation.Model.fAutoCreated("TripleGenericLogicBlockPrefab", "Matrix Determinant"),
			category: () => BlockCreation.Categories.converterVector,
		},
		logic: logic(
			{
				input: { a: { displayName: "A", types: BlockConfigDefinitions.matrix3 } },
				output: { result: { displayName: "result", types: ["number"] } },
			},
			({ a }) => ({ result: { type: "number", value: Matrix3.determinant(a) } }),
		),
	},
	matrix3inverse: {
		displayName: "Matrix Inverse",
		description: "Invert a 3x3 matrix. Singular or nearly singular matrices return zero and Valid=false.",
		modelSource: {
			model: BlockCreation.Model.fAutoCreated("TripleGenericLogicBlockPrefab", "Matrix Inverse"),
			category: () => BlockCreation.Categories.converterVector,
		},
		logic: logic(
			{
				input: { a: { displayName: "A", types: BlockConfigDefinitions.matrix3 } },
				output: {
					result: { displayName: "result", types: ["matrix3"] },
					valid: { displayName: "valid", types: ["bool"] },
				},
			},
			({ a }) => {
				const inv = Matrix3.inverse(a);
				return {
					result: { type: "matrix3", value: inv ?? Matrix3.zero },
					valid: { type: "bool", value: inv !== undefined },
				};
			},
		),
	},
} satisfies BlockBuildersWithoutIdAndDefaults);
