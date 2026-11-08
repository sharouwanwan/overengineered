const fs = require("fs"),
	vm = require("vm"),
	ts = require("typescript"),
	assert = require("node:assert/strict");
function load(file, modules = {}, globals = {}) {
	const context = {
		exports: {},
		require: (n) => {
			if (!(n in modules)) throw Error(n);
			return modules[n];
		},
		...globals,
	};
	const prelude =
		"Array.prototype.remove=function(i){return this.splice(i,1)[0]}; Array.prototype.clear=function(){this.length=0};";
	vm.runInNewContext(
		prelude +
			ts.transpileModule(fs.readFileSync(file, "utf8").replaceAll(".size()", ".length"), {
				compilerOptions: {
					module: ts.ModuleKind.CommonJS,
					target: ts.ScriptTarget.ES2020,
					experimentalDecorators: true,
				},
			}).outputText,
		context,
	);
	return context.exports;
}
const math = {
	abs: Math.abs,
	max: Math.max,
	min: Math.min,
	exp: Math.exp,
	ceil: Math.ceil,
	huge: Infinity,
	clamp: (x, a, b) => Math.min(b, Math.max(a, x)),
};
class Vec {
	constructor(X = 0, Y = 0, Z = 0) {
		Object.assign(this, { X, Y, Z });
	}
	add(v) {
		return new Vec(this.X + v.X, this.Y + v.Y, this.Z + v.Z);
	}
	sub(v) {
		return new Vec(this.X - v.X, this.Y - v.Y, this.Z - v.Z);
	}
	mul(n) {
		return new Vec(this.X * n, this.Y * n, this.Z * n);
	}
	Dot(v) {
		return this.X * v.X + this.Y * v.Y + this.Z * v.Z;
	}
	get Magnitude() {
		return Math.sqrt(this.Dot(this));
	}
}
Vec.zero = new Vec();
const { Matrix3 } = load("src/shared/blockLogic/Matrix3.ts", {}, { math, Vector3: Vec });
const matrix = Matrix3.rows(new Vec(2, 1, 0), new Vec(0, 3, 1), new Vec(1, 0, 4));
const inverse = Matrix3.inverse(matrix);
assert.ok(inverse);
const product = Matrix3.multiply(matrix, inverse);
for (const key of Matrix3.keys) assert.ok(Math.abs(product[key] - Matrix3.identity[key]) < 1e-10);
assert.equal(Matrix3.inverse(Matrix3.zero), undefined);
assert.equal(Matrix3.inverse(Matrix3.rows(new Vec(1, 2, 3), new Vec(2, 4, 6), new Vec(0, 1, 1))), undefined);
assert.ok(Matrix3.inverse(Matrix3.scale(Matrix3.identity, 1e-12)));
assert.deepEqual(Matrix3.transform(Matrix3.identity, new Vec(3, 4, 5)), new Vec(3, 4, 5));
const typeIs = (v, t) => (t === "table" ? v !== null && typeof v === "object" : typeof v === t);
const { Matrix3Text } = load(
	"src/shared/blockLogic/Matrix3Text.ts",
	{ "@rbxts/services": { HttpService: { JSONDecode: JSON.parse } }, "shared/blockLogic/Matrix3": { Matrix3 } },
	{
		math,
		tostring: String,
		typeIs,
		pcall: (fn) => {
			try {
				return [true, fn()];
			} catch {
				return [false];
			}
		},
	},
);
assert.deepEqual(
	JSON.parse(JSON.stringify(Matrix3Text.parse(Matrix3Text.format(matrix, true)))),
	JSON.parse(JSON.stringify(matrix)),
);
for (const text of [
	"[1,2,3]",
	"[[1,2],[3,4],[5,6]]",
	'[[1,2,3],[4,5,6],[7,8,"9"]]',
	"[[1e999,0,0],[0,1,0],[0,0,1]]",
	'os.execute("anything")',
])
	assert.equal(Matrix3Text.parse(text), undefined);
assert.equal(Matrix3Text.format(Matrix3.identity), "[[1, 0, 0], [0, 1, 0], [0, 0, 1]]");
console.log("Matrix arithmetic, inverse, readable formatting and strict nested-row parsing passed.");
const { TNTFuse } = load("src/shared/blockLogic/TNTFuse.ts", {}, { math });
const fuse = new TNTFuse();
assert.equal(fuse.update(0, true, 2), false);
assert.equal(fuse.update(2, true, 2), true);
fuse.trigger(2, 3);
fuse.trigger(3, 9);
assert.equal(fuse.remaining(4), 1);
assert.equal(fuse.due(4), false);
assert.equal(fuse.due(5), true);
fuse.update(4, false, 2);
assert.equal(fuse.triggered(), false);
assert.equal(fuse.update(5, true, 2), false);
assert.equal(fuse.update(7, true, 2), true);
fuse.trigger(7, 0);
assert.equal(fuse.due(7), true);
fuse.confirm();
assert.equal(fuse.due(8), false);
console.log("TNT arming delay, latched countdown, disarm cancellation and confirmation passed.");
const { NumericalFilter } = load("src/shared/blockLogic/NumericalFilter.ts", {}, { math });
const filter1 = new NumericalFilter(),
	filter2 = new NumericalFilter();
filter1.step(0, 1, 0, true);
filter2.step(0, 1, 0, true);
const once = filter1.step(10, 1, 1, false);
let repeated;
for (let i = 0; i < 100; i++) repeated = filter2.step(10, 1, 0.01, false);
assert.ok(Math.abs(once.low - repeated.low) < 1e-10);
assert.equal(once.low + once.high, 10);
assert.ok(Number.isFinite(filter1.step(NaN, 1, 0.1, false).low));
console.log("Filter timestep invariance and invalid-signal containment passed.");
class InstanceMock {
	constructor(kind) {
		this.kind = kind;
	}
	IsA(kind) {
		return kind === this.kind;
	}
	set Parent(v) {
		this.parent = v;
		v?.children?.push(this);
	}
	get Parent() {
		return this.parent;
	}
}
const root = {},
	marker = {
		children: [],
		IsA: (k) => k === "BasePart",
		FindFirstChild(name) {
			return this.children.find((c) => c.Name === name);
		},
	};
const { prepareWeaponMarkers } = load("src/shared/weaponProjectiles/WeaponMarkers.ts", {}, { Instance: InstanceMock });
const model = { PrimaryPart: root, FindFirstChild: () => ({ GetDescendants: () => [marker] }) };
prepareWeaponMarkers(model, false);
prepareWeaponMarkers(model, false);
assert.equal(marker.children.length, 1);
assert.equal(marker.children[0].Part0, root);
assert.equal(marker.children[0].Part1, marker);
assert.equal(marker.children[0].Enabled, true);
assert.equal(marker.Anchored, false);
assert.equal(marker.CanCollide, false);
assert.equal(marker.Transparency, 1);
console.log("Weapon marker welds are attached, nonphysical and idempotent.");
const events = new Map(),
	spawned = [],
	ended = [],
	damage = [];
let now = 10,
	admin = true,
	valid = true,
	hit;
const heartbeat = {},
	fire = {},
	Players = { PlayerRemoving: {} };
const player = { Parent: Players };
class HostedService {
	constructor() {
		this.event = { subscribe: (signal, fn) => events.set(signal, fn) };
	}
}
const profiles = {
	mgloader: {
		interval: 0.2,
		damage: 18,
		speed: 1000,
		lifetime: 1,
		magazine: 2,
		reload: 1,
		blast: 0,
		laser: false,
		gravity: 0,
	},
	laseremitter: {
		interval: 0.1,
		damage: 5,
		speed: 0,
		lifetime: 0.1,
		magazine: 2,
		reload: 1,
		blast: 0,
		laser: true,
		gravity: 0,
	},
};
const protocol = {
	fire: { invoked: fire },
	spawn: { send: (_, data) => spawned.push(data) },
	hit: { send: (_, data) => ended.push(data) },
};
const modules = {};
function makeCore(id) {
	const attrs = {},
		frame = {
			Position: Vec.zero,
			RightVector: new Vec(1, 0, 0),
			mul() {
				return this;
			},
		};
	const core = {
		Parent: {},
		PrimaryPart: { Anchored: false, AssemblyLinearVelocity: Vec.zero },
		Destroying: { Once() {} },
		GetAttribute: (k) => attrs[k],
		SetAttribute: (k, v) => (attrs[k] = v),
		GetPivot: () => frame,
	};
	core.PrimaryPart.data = { id, uuid: id };
	const module = { instance: core };
	module.parentCollection = {
		calculatedOutputs: [
			{ source: module, module, outputs: [{ markerInstance: {}, localFrame: {} }], modifier: {} },
		],
	};
	modules[id] = module;
	return core;
}
const core = makeCore("mgloader");
const { WeaponController } = load(
	"src/server/network/WeaponController.ts",
	{
		"@rbxts/services": {
			Players,
			RunService: { Heartbeat: heartbeat },
			Workspace: { Gravity: 0, GetServerTimeNow: () => now, Raycast: () => hit },
		},
		"engine/shared/di/HostedService": { HostedService },
		"engine/shared/PlayerRank": { PlayerRank: { isAdmin: () => admin } },
		"server/blocks/ServerBlockLogic": { ServerBlockLogic: { staticIsValidBlock: () => valid } },
		"server/network/CombatDamage": { CombatDamage: { apply: (_, amount) => damage.push(amount), blast() {} } },
		"shared/building/BlockManager": { BlockManager: { getBlockDataByPart: (p) => p.data } },
		"shared/weaponProjectiles/WeaponModuleSystem": { WeaponModule: { allModules: modules } },
		"shared/weaponProjectiles/WeaponProtocol": { WeaponProtocol: protocol, weaponProfiles: profiles },
	},
	{ math, Vector3: Vec, RaycastParams: class {}, injectable: (c) => c, inject: () => {} },
);
new WeaponController({ getPlayerMode: () => "ride" });
const shoot = () => events.get(fire)(player, { core, color: {}, reload: false, baseDamage: 999999 });
admin = false;
shoot();
assert.equal(spawned.length, 0);
admin = true;
valid = false;
shoot();
assert.equal(spawned.length, 0);
valid = true;
shoot();
assert.equal(spawned.length, 1);
shoot();
assert.equal(spawned.length, 1);
assert.equal(core.GetAttribute("WeaponAmmo"), 1);
hit = { Instance: {}, Position: new Vec(-50, 0, 0) };
events.get(heartbeat)(0.1);
events.get(heartbeat)(0.1);
assert.deepEqual(damage, [18]);
assert.equal(ended.length, 1);
now = 10.25;
hit = undefined;
shoot();
assert.equal(core.GetAttribute("WeaponAmmo"), 0);
assert.equal(core.GetAttribute("WeaponReloadAt"), 11.25);
now = 10.5;
shoot();
assert.equal(spawned.length, 2);
now = 11.3;
events.get(heartbeat)(2);
assert.equal(core.GetAttribute("WeaponAmmo"), 2);
assert.equal(ended.length, 2);
const laser = makeCore("laseremitter");
hit = { Instance: {}, Position: new Vec(-3000, 0, 0) };
events.get(fire)(player, { core: laser, color: {}, reload: false });
assert.equal(spawned.at(-1).endpoint.X, -3000);
assert.equal(damage.at(-1), 5);
console.log(
	"Server weapon developer/ownership gates, cooldown, ammo/reload, single swept hit, expiry and laser hit passed.",
);

const memoryAst = ts.createSourceFile(
	"memory.ts",
	fs.readFileSync("src/shared/blocks/blocks/LogicMemoryBlock.ts", "utf8"),
	ts.ScriptTarget.Latest,
	true,
);
const memoryNode = memoryAst.statements.find((s) => ts.isClassDeclaration(s) && s.name.text === "Logic");
class MemoryStub {
	constructor() {
		this.inputs = { defaultValue: 10, defaultValueType: "number", reset: false, set: false };
		this.hooks = [];
		this.output = {
			result: {
				set: (type, value) => {
					this.result = { type, value };
				},
			},
		};
	}
	initializeInputCache(k) {
		return { tryGet: () => this.inputs[k] };
	}
	onk(keys, fn) {
		this.hooks.push({ keys, fn });
	}
	tick() {
		for (const h of this.hooks) if (h.keys.every((k) => k in this.inputs)) h.fn(this.inputs);
	}
}
const memoryContext = { BlockLogic: MemoryStub, definition: {} };
vm.runInNewContext(
	ts.transpileModule(
		ts.createPrinter().printNode(ts.EmitHint.Unspecified, memoryNode, memoryAst) + ";globalThis.Memory=Logic;",
		{ compilerOptions: { target: ts.ScriptTarget.ES2020 } },
	).outputText,
	memoryContext,
);
const memory = new memoryContext.Memory({});
memory.tick();
assert.equal(memory.result.value, 10);
Object.assign(memory.inputs, { set: true, value: 20, valueType: "number" });
memory.tick();
assert.equal(memory.result.value, 20);
Object.assign(memory.inputs, { set: false, defaultValue: 30 });
memory.tick();
assert.equal(memory.result.value, 20);
Object.assign(memory.inputs, { reset: true, set: true });
memory.tick();
assert.equal(memory.result.value, 30);
Object.assign(memory.inputs, { reset: false, set: false });
memory.tick();
assert.equal(memory.result.value, 30);
console.log("Memory initializes without Value, preserves its stored value and gives Reset precedence.");
