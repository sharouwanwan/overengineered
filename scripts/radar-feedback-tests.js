// Exercise the production block evaluator/storage with an actual cyclic radar circuit.
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");
const assert = require("node:assert/strict");
Array.prototype.mapToMap = function (fn) {
	return new Map(this.map(fn));
};
const math = {
	...Math,
	huge: Infinity,
	pi: Math.PI,
	sqrt: Math.sqrt,
	min: Math.min,
	max: Math.max,
	cos: Math.cos,
	sin: Math.sin,
	tan: Math.tan,
	rad: (n) => (n * Math.PI) / 180,
	clamp: (n, min, max) => Math.min(max, Math.max(min, n)),
};
const globals = {
	math,
	tostring: String,
	pairs: Object.entries,
	typeIs: (v, t) => typeof v === t,
	asMap: (o) => ({
		keys: () => Object.keys(o),
		any: () => Object.keys(o).length > 0,
		map: (fn) => Object.entries(o).map(([k, v]) => fn(k, v)),
	}),
	asObject: (values) => Object.fromEntries([...values].map((v) => [v, true])),
	$tuple: (...v) => v,
};
function evaluate(source, modules = {}, extra = {}) {
	const context = {
		...globals,
		exports: {},
		require: (name) => {
			assert.ok(name in modules, `Missing module ${name}`);
			return modules[name];
		},
		...extra,
	};
	vm.runInNewContext(
		"Array.prototype.mapToMap = function(fn) { return new Map(this.map(fn)); };\n" +
			ts.transpileModule(source.replaceAll(".size()", ".length"), {
				compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
			}).outputText,
		context,
	);
	return context.exports;
}
const read = (name) => fs.readFileSync(name, "utf8");
class Signal {
	callbacks = [];
	Connect(fn) {
		this.callbacks.push(fn);
		return { Disconnect: () => this.callbacks.splice(this.callbacks.indexOf(fn), 1) };
	}
	Fire(...args) {
		for (const fn of this.callbacks) fn(...args);
	}
}
class Component {
	event = { subscribeRegistration: (fn) => fn(), subscribe: (event, fn) => event.Connect(fn) };
	isEnabled() {
		return true;
	}
	onDestroy() {}
	onEnable() {}
	onDisable() {}
}
const storage = evaluate(read("src/shared/blockLogic/BlockLogicValueStorage.ts"), {
	"engine/shared/fixes/MathUtils": { MathUtils: { clamp: math.clamp } },
	"engine/shared/fixes/String.propmacro": {},
});
const runtime = evaluate(read("src/shared/blockLogic/BlockLogic.ts"), {
	"engine/shared/component/Component": { Component },
	"engine/shared/component/ComponentInstance": { ComponentInstance: { init() {} } },
	"engine/shared/event/Signal": { ArgsSignal: Signal },
	"engine/shared/fixes/Objects": {
		Objects: {
			keys: Object.keys,
			mapValues: (o, fn) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fn(k, v)])),
		},
	},
	"shared/blockLogic/BlockLogicValueStorage": storage,
	"shared/RemoteEvents": {},
	"shared/utils/PartUtils": { PartUtils: { applyToAllDescendantsOfType() {} } },
});
class Vector {
	constructor(X, Y, Z) {
		Object.assign(this, { X, Y, Z });
	}
	sub(v) {
		return new Vector(this.X - v.X, this.Y - v.Y, this.Z - v.Z);
	}
	Dot(v) {
		return this.X * v.X + this.Y * v.Y + this.Z * v.Z;
	}
	get Magnitude() {
		return Math.sqrt(this.Dot(this));
	}
}
Vector.zero = new Vector(0, 0, 0);
const geometry = evaluate(read("src/shared/blockLogic/SectionRadarGeometry.ts"));
const radialGeometry = evaluate(read("src/shared/blockLogic/RadialRadarGeometry.ts"));
const memory = evaluate(read("src/shared/blockLogic/RadarTargetMemory.ts"));
const source = ts.createSourceFile(
	"radar.ts",
	read("src/shared/blocks/blocks/RadarSectionBlock.ts"),
	ts.ScriptTarget.Latest,
	true,
);
const printer = ts.createPrinter();
const names = ["definition", "definitionRadial", "sectionDefinition", "hideRadarView", "liveRadarContact"];
const nodes = source.statements.filter(
	(s) =>
		ts.isClassDeclaration(s) ||
		(ts.isVariableStatement(s) &&
			s.declarationList.declarations.some((d) => names.includes(d.name.getText(source)))),
);
let candidates = [],
	scan,
	time = 0,
	publishes = 0;
let heartbeat = new Signal();
const outlines = [];
const radar = evaluate(
	nodes.map((s) => printer.printNode(ts.EmitHint.Unspecified, s, source)).join("\n") +
		"\nexports.Section = RadarSectionLogic; exports.Radial = RadialRadarLogic;",
	{},
	{
		InstanceBlockLogic: runtime.InstanceBlockLogic,
		inferEnumLogicType: (v) => v,
		Vector3: Vector,
		Instance: class {
			redraws = 0;
			constructor() {
				outlines.push(this);
			}
			Clear() {
				this.redraws++;
			}
			AddPath() {}
			AddLine() {}
		},
		os: { clock: () => time },
		RunService: { Heartbeat: { Connect: (fn) => heartbeat.Connect(fn) }, IsClient: () => true },
		Players: { GetPlayers: () => [] },
		scheduleRadar: (fn) => {
			scan = fn;
			return { Disconnect() {} };
		},
		radarBuildTargets: () => candidates,
		sectionFrame: (model) => ({
			Position: model.PrimaryPart.Position,
			PointToObjectSpace: (p) => p.sub(model.PrimaryPart.Position),
		}),
		coneContainsSphere: geometry.coneContainsSphere,
		radialContains: radialGeometry.radialContains,
		RadarTargetMemory: memory.RadarTargetMemory,
		sectionFields: geometry.sectionFields,
		radialFields: radialGeometry.radialFields,
		sectionSync: { send: () => publishes++ },
		radialSync: { send: () => publishes++ },
	},
);
const input = (type) => ({ types: { [type]: {} } });
class Calculation extends runtime.CalculatableBlockLogic {
	constructor(inputs, type, fn) {
		super({ input: inputs, output: { result: { types: [type] } } }, {});
		this.fn = fn;
		this.type = type;
	}
	calculate(values) {
		return { result: { type: this.type, value: this.fn(values) } };
	}
}
// Same lazy input-cache mechanism as the in-game multiplexer, including unused branches.
class Mux extends runtime.BlockLogic {
	constructor() {
		super(
			{
				input: { value: input("bool"), zero: input("number"), tracked: input("number") },
				output: { result: { types: ["number"] } },
			},
			{},
		);
		this.onkRecalcInputsAny(["value", "zero", "tracked"], (values) => {
			const value = values.value ? values.zero : values.tracked;
			if (value === undefined) this.output.result.unset();
			else this.output.result.set("number", value);
		});
	}
}
function constant(block, key, type, value) {
	const s = new storage.LogicValueStorageContainer({ [type]: {} });
	s.set(type, value);
	block.replaceInput(key, s);
}
function wire(block, key, output, port = "result") {
	block.replaceInput(key, new storage.BlockBackedInputLogicValueStorage(block.definition.input[key], output, port));
}
for (const kind of ["Section", "Radial"]) {
	for (const hold of [false, true]) {
		heartbeat = new Signal();
		const folder = { Name: "Blocks" };
		const instance = {
			Parent: folder,
			PrimaryPart: { Position: Vector.zero },
			RadarView: { IsA: () => true, Color: {} },
			GetPivot() {
				return {
					Position: this.PrimaryPart.Position,
					PointToObjectSpace: (p) => p.sub(this.PrimaryPart.Position),
				};
			},
			FindFirstChild(name) {
				return this[name];
			},
		};
		const logic = new radar[kind]({ instance });
		const outline = outlines[outlines.length - 1];
		for (const [key, def] of Object.entries(logic.definition.input)) {
			const [type, value] = Object.entries(def.types)[0];
			constant(logic, key, type, value.config);
		}
		constant(logic, "holdLostTarget", "bool", hold);
		constant(logic, "visibility", "bool", true);
		const magnitude = new Calculation({ value: input("vector3") }, "number", (v) => v.value.Magnitude);
		wire(magnitude, "value", logic, "distance");
		const allowance = new Calculation(
			{ value: input("number") },
			"number",
			(v) => (v.value + 30) * (kind === "Radial" ? 2 : 1),
		);
		wire(allowance, "value", magnitude);
		const isZero = new Calculation({ value: input("number") }, "bool", (v) => v.value === 0);
		wire(isZero, "value", magnitude);
		const mux = new Mux();
		wire(mux, "value", isZero);
		wire(mux, "tracked", allowance);
		constant(mux, "zero", "number", 15000);
		wire(logic, "maxDistance", mux);
		const root = { Parent: {}, Position: new Vector(0, 300, 0), Size: new Vector(2, 2, 2) };
		candidates = [{ Parent: folder, PrimaryPart: root }];
		const fields = kind === "Section" ? geometry.sectionFields : radialGeometry.radialFields;
		let tick = 0;
		const step = () => {
			const ctx = { tick: ++tick, dt: 1 / 60 };
			time += ctx.dt;
			logic.ticc(ctx);
			return logic.getOutputValue(ctx, "distance").value;
		};
		step();
		const firstField = fields.get(instance);
		assert.equal(
			firstField.length ?? firstField.radius,
			kind === "Section" ? 15000 : 7500,
			`${kind} feedback starts at full search range on the first tick`,
		);
		scan();
		assert.equal(step().Y, 300, `${kind} acquires through the feedback circuit`);
		const sendsBefore = publishes;
		for (let i = 1; i <= 120; i++) {
			root.Position = new Vector(0, 300 + i * 2, 0);
			const value = step();
			assert.equal(value.Y, root.Position.Y, `${kind} tracks moving contact every logic tick (hold=${hold})`);
			if (i % 6 === 0) scan();
			heartbeat.Fire();
		}
		const field = fields.get(instance);
		assert.ok(
			Math.abs((field.length ?? field.radius) - (root.Position.Y + 30)) <= 2,
			`${kind} range follows within one tick`,
		);
		assert.ok(outline.redraws >= 119, `${kind} visible preview follows each changed frame`);
		assert.ok(publishes - sendsBefore <= 21, `${kind} remote updates remain capped at 10 Hz`);
		const other = { Parent: {}, Position: new Vector(0, 200, 0), Size: new Vector(2, 2, 2) };
		candidates.unshift({ Parent: folder, PrimaryPart: other });
		scan();
		assert.equal(step().Y, root.Position.Y, `${kind} Any retains a valid contact despite candidate reordering`);
		candidates.shift();
		constant(logic, "visibility", "bool", false);
		step();
		const drawsBefore = outline.redraws;
		root.Position = new Vector(0, 550, 0);
		step();
		step();
		heartbeat.Fire();
		assert.equal(outline.redraws, drawsBefore, `${kind} hidden previews do no redraw work`);
		// Moving out of the cone/radius must preserve the last point only when Hold is on.
		root.Position = new Vector(5000, 0, 0);
		assert.equal(step().Magnitude === 0, !hold);
		for (let i = 0; i < 4; i++) step();
		const lostField = fields.get(instance);
		assert.equal(
			(lostField.length ?? lostField.radius) === (kind === "Section" ? 15000 : 7500),
			!hold,
			`${kind}: held nonzero Offset intentionally prevents the mux's zero branch`,
		);
		constant(logic, "holdLostTarget", "bool", false);
		constant(logic, "selection", "enum", "nearest");
		constant(logic, "maxDistance", "number", 15000);
		step();
		const misses = Array.from({ length: 600 }, () => ({
			Parent: folder,
			PrimaryPart: {
				Parent: {},
				Position: new Vector(20000, 0, 0),
				Size: new Vector(2, 2, 2),
			},
		}));
		root.Position = new Vector(0, 4000, 0);
		candidates = [...misses, { Parent: folder, PrimaryPart: root }];
		assert.equal(scan(), true, `${kind} large acquisition is split into bounded batches`);
		constant(logic, "maxDistance", "number", 14000);
		step();
		assert.equal(scan(), true);
		constant(logic, "maxDistance", "number", 13000);
		step();
		assert.equal(scan(), false, `${kind} changing range does not restart partial acquisition`);
		assert.equal(step().Y, 4000);
	}
}
delete Array.prototype.mapToMap;
console.log(
	"Radar cyclic feedback, held/lost targets, Any retention, bounded acquisition and frame-rate previews passed.",
);
