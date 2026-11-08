const fs = require("fs");
const vm = require("vm");
const ts = require("typescript");
const assert = require("node:assert/strict");
function load(file, modules, globals = {}) {
	const context = {
		exports: {},
		require: (name) => {
			if (!(name in modules)) throw Error(name);
			return modules[name];
		},
		...globals,
	};
	vm.runInNewContext(
		"Array.prototype.remove = function(i) { return this.splice(i, 1)[0]; }; String.prototype.sub = function(start, end) { return this.slice(start - 1, end); };\n" +
			ts.transpileModule(fs.readFileSync(file, "utf8").replaceAll(".size()", ".length"), {
				compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
			}).outputText,
		context,
	);
	return context.exports;
}
const scheduled = [];
let attempts = 0;
let failing = true;
const { Db } = load(
	"src/engine/server/Database.ts",
	{
		"engine/server/backend/DatabaseBackend": { formatDatabaseBackendKeys: (keys) => keys.join("_") },
		"engine/shared/fixes/Objects": { Objects: { entriesArray: Object.entries } },
		"engine/shared/Throttler": {
			Throttler: {
				retryOnFail(count, delay, fn) {
					for (let i = 0; i < count; i++) {
						try {
							return { success: true, message: fn() };
						} catch {}
					}
					return { success: false, error_message: "offline" };
				},
			},
		},
	},
	{
		game: { BindToClose() {} },
		task: {
			spawn() {},
			wait() {},
			delay(seconds, fn) {
				scheduled.push(fn);
			},
		},
		os: { time: () => 100 },
		$err() {},
		$debug() {},
		$log() {},
	},
);
const db = new Db(
	{
		SetAsync() {
			attempts++;
			if (failing) throw Error("offline");
		},
	},
	() => ({}),
	(x) => x,
	(x) => x,
);
db.set([1], { build: "latest" });
assert.throws(() => db.save([1]));
assert.equal(db.loadedUnsavedEntries().length, 1);
db.free([1]);
assert.equal(db.loadedUnsavedEntries().length, 1);
failing = false;
db.save([1]);
assert.equal(attempts, 4);
assert.equal(db.loadedUnsavedEntries().length, 0);
const workspace = {};
const { ServerBlockLogic } = load("src/server/blocks/ServerBlockLogic.ts", {
	"@rbxts/services": { Workspace: workspace },
	"shared/building/SharedPlots": { SharedPlots: { staticTryGetPlotByOwnerID: () => ({}) } },
});
const foreign = { Anchored: true, AssemblyRootPart: { Anchored: true }, IsDescendantOf: (x) => x === workspace };
assert.notEqual(
	ServerBlockLogic.staticIsValidBlockNamed(foreign, { UserId: 1 }, { getPlayerMode: () => "ride" }),
	undefined,
);
console.log("Persistence retry, dirty-cache retention, and foreign-block regression checks passed.");

// A failed extraction must never rename the live asset directory.
let renamed = false;
const fakeProcess = {};
vm.runInNewContext(fs.readFileSync("scripts/save-assets.js", "utf8"), {
	__dirname: require("path").resolve("scripts"),
	process: fakeProcess,
	console: { log() {}, error() {} },
	require(name) {
		if (name === "path") return require("path");
		if (name === "child_process") return { spawnSync: () => ({ status: 1 }) };
		if (name === "fs")
			return {
				mkdtempSync: (p) => p + "test",
				cpSync() {},
				readFileSync: () => JSON.stringify({ game: {} }),
				writeFileSync() {},
				renameSync() {
					renamed = true;
				},
			};
		throw Error(name);
	},
});
assert.equal(renamed, false);
assert.equal(fakeProcess.exitCode, 1);
console.log("Failed asset export preserves live assets.");

const before = attempts;
for (let i = 0; i < 100; i++) db.set([2], { version: i });
assert.equal(attempts, before);
for (const fn of scheduled.splice(0)) fn();
assert.equal(attempts, before + 1);
assert.equal(db.get([2]).version, 99);
console.log("100 updates coalesce into one write.");

// Simulate backend yield points synchronously to exercise cache replacement races.
let racingDb;
racingDb = new Db(
	{
		GetAsync() {
			racingDb.set([3], { version: 2 });
			return { version: 1 };
		},
		SetAsync() {},
		RemoveAsync() {
			racingDb.set([3], { version: 3 });
		},
	},
	() => ({}),
	(x) => x,
	(x) => x,
);
assert.equal(racingDb.get([3]).version, 2);
racingDb.delete([3]);
assert.equal(racingDb.get([3]).version, 3);
console.log("Reads and deletes preserve concurrent newer updates.");

let now = 0;
const typeIs = (v, t) =>
	t === "table"
		? v !== null && typeof v === "object" && !v.__type
		: t === "boolean" || t === "string" || t === "number"
			? typeof v === t
			: v?.__type === t;
const runtime = {
	typeIs,
	typeOf: (v) => v?.__type || typeof v,
	math: { abs: Math.abs, huge: Infinity },
	os: { clock: () => now },
	pairs: (v) => Object.entries(v).map(([k, child]) => [Array.isArray(v) ? Number(k) + 1 : k, child]),
};
const validation = load(
	"src/engine/shared/event/RemoteValidation.ts",
	{ "@rbxts/services": { RunService: { IsServer: () => false } } },
	runtime,
);
for (const invalid of [NaN, Infinity, -Infinity, { n: NaN }, "x".repeat(2 * 1024 * 1024 + 1)])
	assert.equal(validation.validPayload(invalid), false);
const cyclic = {};
cyclic.self = cyclic;
assert.equal(validation.validPayload(cyclic), false);
let deep = {};
for (let i = 0; i < 40; i++) deep = { deep };
assert.equal(validation.validPayload(deep), false);
assert.equal(validation.validPayload({ a: 1, b: "hello", c: true }), true);
const player = {};
for (let i = 0; i < 512; i++) assert.equal(validation.acceptRemote(player, {}), true);
assert.equal(validation.acceptRemote(player, {}), false);
now = 1;
assert.equal(validation.acceptRemote(player, {}), true);
const { validRequest } = load(
	"src/shared/remotes/RequestValidation.ts",
	{
		"engine/shared/event/RemoteValidation": validation,
		"shared/config/PlayerConfig": {
			PlayerConfigDefinition: {
				autoLoad: { config: true },
				uiScale: { config: 1, min: 0.5, max: 1.5 },
				graphics: { config: { localShadows: true } },
			},
		},
	},
	{ ...runtime, Enum: { Material: "Material" } },
);
assert.equal(validRequest("player_updsettings", { autoLoad: true, graphics: { localShadows: false } }), true);
for (const value of [{ autoLoad: "yes" }, { unknown: true }, { uiScale: 100 }, { graphics: { localShadows: 5 } }])
	assert.equal(validRequest("player_updsettings", value), false);
assert.equal(validRequest("slots_load", { index: 1 }), true);
assert.equal(validRequest("slots_load", { index: 1.5 }), false);
assert.equal(validRequest("building_place", undefined), false);
assert.equal(validRequest("md_set", { mode: "invalid" }), false);
const plot = { __type: "Instance" };
assert.equal(
	validRequest("building_paint", { plot, blocks: "all", color: { color: { __type: "Color3" }, alpha: 0.5 } }),
	true,
);
assert.equal(validRequest("building_paint", { plot, blocks: "all", color: "invalid" }), false);
console.log("Remote payload bounds, rate limits, and request schemas passed.");

assert.equal(validRequest("building_place", { plot, blocks: [{ id: "cube", location: { __type: "CFrame" } }] }), true);
assert.equal(validRequest("building_place", { plot, blocks: [{ id: "cube", location: "invalid" }] }), false);
assert.equal(validRequest("building_delete", { plot, blocks: [plot] }), true);
assert.equal(validRequest("building_delete", { plot, blocks: { bad: plot } }), false);
assert.equal(validation.validPayload({ __type: "NumberRange", Min: 0, Max: 1 }), true);
assert.equal(validation.validPayload({ __type: "NumberRange", Min: 0, Max: Infinity }), false);
const heavyPlayer = {};
for (let i = 0; i < 4; i++) assert.equal(validation.acceptRemote(heavyPlayer, "x".repeat(2 * 1024 * 1024)), true);
assert.equal(validation.acceptRemote(heavyPlayer, "x"), false);

for (const verifyOnly of [true, false]) {
	const moves = [];
	const simulated = { argv: verifyOnly ? ["--verify-only"] : [] };
	vm.runInNewContext(fs.readFileSync("scripts/save-assets.js", "utf8"), {
		__dirname: require("path").resolve("scripts"),
		process: simulated,
		console: { log() {}, error() {} },
		require(name) {
			if (name === "path") return require("path");
			if (name === "child_process") return { spawnSync: () => ({ status: 0 }) };
			if (name === "fs")
				return {
					mkdtempSync: (p) => p + "test",
					cpSync() {},
					readFileSync: () => JSON.stringify({ game: {} }),
					writeFileSync() {},
					renameSync(from, to) {
						moves.push([from, to]);
						if (moves.length === 2) throw Error("replace failed");
					},
				};
			throw Error(name);
		},
	});
	if (verifyOnly) {
		assert.equal(moves.length, 0);
		assert.equal(simulated.exitCode, undefined);
	} else {
		assert.equal(moves.length, 3);
		assert.equal(moves[2][0], moves[0][1]);
		assert.equal(moves[2][1], moves[0][0]);
		assert.equal(simulated.exitCode, 1);
	}
}
console.log("Asset verification avoids live writes; replacement failures restore backups.");

const { PidState } = load(
	"src/shared/blockLogic/PidState.ts",
	{},
	{
		math: {
			min: Math.min,
			max: Math.max,
			abs: Math.abs,
			huge: Infinity,
			clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
		},
	},
);
const pidInputs = {
	p: 1,
	i: 0,
	d: 1,
	target: 10,
	now: 0,
	imin: -100,
	imax: 100,
	filter: 0,
	outputMin: -5,
	outputMax: 5,
	measurementDerivative: false,
	limitOutput: false,
	reset: false,
};
const pid = new PidState();
assert.equal(pid.step(pidInputs, 0).output, 0);
assert.equal(pid.step(pidInputs, 0.1).output, 10);
assert.equal(pid.step({ ...pidInputs, target: 11 }, 0.1).output, 21);
pid.reset();
assert.equal(pid.step({ ...pidInputs, limitOutput: true }, 0.1).output, 5);
assert.equal(pid.step({ ...pidInputs, reset: true }, 0.1).output, 0);
assert.ok(Number.isFinite(pid.step({ ...pidInputs, imin: 100, imax: -100 }, 0.1).output));
assert.equal(pid.step({ ...pidInputs, target: Infinity }, 0.1).output, 0);
console.log("PID first-tick, derivative, saturation, reset, and invalid-number checks passed.");

// Additional PID options must preserve stable defaults and remain finite after stalls.
pid.reset();
const measured = { ...pidInputs, measurementDerivative: true };
assert.equal(pid.step(measured, 0.1).output, 10);
assert.equal(pid.step({ ...measured, target: 20 }, 0.1).output, 20);
pid.reset();
const limited = { ...pidInputs, p: 0, i: 10, d: 0, limitOutput: true };
for (let i = 0; i < 100; i++) pid.step(limited, 0.1);
assert.equal(pid.step(limited, 0.1).integral, 0);
assert.equal(pid.step({ ...pidInputs, target: 20 }, 2).output, 20);

let radarTime = 0,
	heartbeat,
	radarDisconnected = false;
const { scheduleRadar } = load(
	"src/shared/blockLogic/RadarScheduler.ts",
	{
		"@rbxts/services": {
			RunService: {
				Heartbeat: {
					Connect(fn) {
						heartbeat = fn;
						return {
							Disconnect() {
								radarDisconnected = true;
							},
						};
					},
				},
			},
		},
	},
	{ os: { clock: () => radarTime }, math: { random: () => 0 }, warn() {} },
);
const radarRuns = Array(20).fill(0);
const radarSubscriptions = radarRuns.map((_, i) => scheduleRadar(() => radarRuns[i]++));
heartbeat();
assert.equal(
	radarRuns.reduce((a, b) => a + b),
	8,
);
heartbeat();
heartbeat();
assert.ok(radarRuns.every((v) => v === 1));
heartbeat();
assert.ok(radarRuns.every((v) => v === 1));
radarTime = 0.11;
heartbeat();
assert.equal(
	radarRuns.reduce((a, b) => a + b),
	28,
);
for (const subscription of radarSubscriptions) subscription.Disconnect();
assert.equal(radarDisconnected, true);

class TestVector {
	constructor(X, Y, Z) {
		Object.assign(this, { X, Y, Z });
	}
	div(n) {
		return new TestVector(this.X / n, this.Y / n, this.Z / n);
	}
	sub(v) {
		return new TestVector(this.X - v.X, this.Y - v.Y, this.Z - v.Z);
	}
	Dot(v) {
		return this.X * v.X + this.Y * v.Y + this.Z * v.Z;
	}
}
class SizedMap extends Map {
	get length() {
		return this.size;
	}
}
const { CombatHistory } = load(
	"src/server/network/CombatHistory.ts",
	{},
	{
		Map: SizedMap,
		Vector3: TestVector,
		math: { abs: Math.abs, clamp: (v, min, max) => Math.max(min, Math.min(max, v)) },
	},
);
const history = new CombatHistory();
const pose = { frame: { PointToObjectSpace: (v) => v }, size: new TestVector(2, 2, 2) };
assert.equal(CombatHistory.intersects(pose, new TestVector(2, 0, 0), 1), true);
assert.equal(CombatHistory.intersects(pose, new TestVector(3, 0, 0), 1), false);
const target = { Parent: {}, CFrame: pose.frame, Size: pose.size };
history.record(1, [target]);
assert.equal(history.at(1).has(target), true);
assert.equal(history.at(0.5), undefined);
for (let i = 0; i < 20; i++) history.record(2 + i * 0.1, [target]);
assert.equal(history.at(1), undefined);
assert.equal(history.at(3.9).has(target), true);
console.log("PID options, bounded radar scheduling, and combat-history regressions passed.");

// Drive the actual TNT logic with deterministic contact and heartbeat signals.
let tntTime = 0,
	tntConfirmed = false;
const tntEvents = new Map(),
	tntRequests = [];
const contactSignal = {},
	heartbeatSignal = {},
	confirmationSignal = {};
class TestLogic {
	constructor(def, block) {
		this.instance = block.instance;
		this.definition = def;
		this.output=Object.fromEntries(Object.keys(def.output).map(key => [key, {set(){}}]));
		this.enabled = true;
		this.disableCallbacks = [];
		this.event = { subscribe: (signal, fn) => tntEvents.set(signal, fn) };
	}
	initializeInputCache(key) {
		const get=()=>({radius:12,pressure:2500,flammable:true,impact:true})[key];return {get,tryGet:get};
	}
	on(fn) {
		this.inputChanged = fn;
	}
	onDisable(fn) {
		this.disableCallbacks.push(fn);
	}
	disable() {
		this.enabled = false;
		for (const fn of this.disableCallbacks) fn();
	}
}
const stationaryPosition = { sub: () => ({ Magnitude: 0 }) };
const explosivePart = {
	Parent: {},
	Position: stationaryPosition,
	Size: { X: 1, Y: 1, Z: 1 },
	AssemblyRootPart: {},
	AssemblyLinearVelocity: { Magnitude: 0 },
	Touched: contactSignal,
	GetAttribute: () => tntConfirmed,
	GetAttributeChangedSignal: () => confirmationSignal,
	GetVelocityAtPosition: () => ({ sub: () => ({ Magnitude: 20 }) }),
};
const { TNTBlocks } = load(
	"src/shared/blocks/blocks/grouped/TNTBlocks.ts",
	{
		"@rbxts/services": {
			RunService: { Heartbeat: heartbeatSignal },
			Workspace: { GetServerTimeNow: () => tntTime },
		},
		"shared/blockLogic/BlockLogic": { InstanceBlockLogic: TestLogic },
		"shared/building/BlockManager":{BlockManager:{}},
		"shared/blocks/BlockCreation": { BlockCreation: { arrayFromObject: Object.values } },
		"shared/RemoteEvents": { RemoteEvents: { Explode: { send: (request) => tntRequests.push(request) } } },
	},
	{
		os: { clock: () => tntTime },
		RaycastParams: class {},OverlapParams:class {},
		Enum: { RaycastFilterType: { Exclude: 0 } },
		math: { max: Math.max, min: Math.min },
	},
);
// The Studio block registry requires unique wire IDs across both directions.
// A collision aborts server startup before GAME_LOADED can be published.
for (const block of TNTBlocks) {
	const { input, output } = block.logic.definition;
	assert.deepEqual(Object.keys(input).sort(), ["explode", "flammable", "impact", "pressure", "radius"]);
	assert.equal(Object.keys(output).length, 0);
	for (const key of Object.keys(output)) {
		assert.equal(Object.hasOwn(input, key), false, `TNT input/output wire ID collision: ${key}`);
	}
}
const tntLogic = new TNTBlocks[0].logic.ctor({ instance: { Part: explosivePart, Parent: {} } });
tntEvents.get(heartbeatSignal)();
tntEvents.get(contactSignal)({ CanCollide: true, AssemblyRootPart: {}, GetVelocityAtPosition() {} });
assert.equal(tntRequests.length, 1); // stationary explosive hit by moving target
assert.equal(tntLogic.enabled, true); // wait for authoritative confirmation
tntEvents.get(contactSignal)({ CanCollide: true, AssemblyRootPart: {}, GetVelocityAtPosition() {} });
assert.equal(tntRequests.length, 1);
tntTime = 0.11;
tntEvents.get(heartbeatSignal)();
tntTime = 0.22;
tntEvents.get(heartbeatSignal)();
assert.equal(tntRequests.length, 3);
assert.equal(tntRequests[0], tntRequests[2]); // retries retain original impact time/position
tntConfirmed = true;
tntEvents.get(confirmationSignal)();
assert.equal(tntLogic.enabled, false);
console.log("TNT relative impact, bounded retries, and server-confirmation lifecycle passed.");

const {ServerPartUtils} = load('src/server/plots/ServerPartUtils.ts', {
 'shared/service/CustomDebrisService':{CustomDebrisService:{}},
 'shared/utils/PartUtils':{PartUtils:{applyToAllDescendantsOfType:(_type,model,fn)=>model.parts.forEach(fn)}},
 'shared/utils/TagUtils':{TagUtils:{allTags:{}}}
});
let ownershipAssignments=0;
const assembly={CanSetNetworkOwnership:()=>[true],SetNetworkOwner(){ownershipAssignments++;}};
const assignedAssemblies=new Set();
ServerPartUtils.switchDescendantsNetworkOwner({parts:[{AssemblyRootPart:assembly},{AssemblyRootPart:assembly}]},{},assignedAssemblies);
ServerPartUtils.switchDescendantsNetworkOwner({parts:[{AssemblyRootPart:assembly}]},{},assignedAssemblies);
assert.equal(ownershipAssignments,1);
console.log('Vehicle ownership is assigned once per assembly.');


const radarHelpers = load('src/shared/blockLogic/RadarTargetMemory.ts',{});
const memory = new radarHelpers.RadarTargetMemory();
const lastPosition={X:0,Y:12,Z:0};
assert.equal(memory.update(undefined,true),undefined);
assert.equal(memory.update(lastPosition,false),lastPosition);
assert.equal(memory.update(undefined,true),lastPosition);
assert.equal(memory.update(undefined,false),undefined);
memory.update(lastPosition,true);memory.clear();assert.equal(memory.update(undefined,true),undefined);
assert.equal(radarHelpers.radarContainsPlayer(0,50,0,100,4,false),true);
assert.equal(radarHelpers.radarContainsPlayer(0,-1,0,100,4,false),false);
assert.equal(radarHelpers.radarContainsPlayer(3,50,0,100,4,false),false);
assert.equal(radarHelpers.radarContainsPlayer(0,101,0,100,4,false),false);
assert.equal(radarHelpers.radarContainsPlayer(50,0,0,100,100,true),true);
assert.equal(radarHelpers.radarContainsPlayer(51,0,0,100,100,true),false);
console.log('Radar hold/release/reset and player cone/sphere bounds passed.');

const radarSource = ts.createSourceFile('radar.ts',fs.readFileSync('src/shared/blocks/blocks/RadarSectionBlock.ts','utf8'),ts.ScriptTarget.Latest,true);
const radarPrinter = ts.createPrinter();
const radarDeclarations=radarSource.statements.filter(s=>ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>['definition','definitionRadial','sectionDefinition'].includes(d.name.getText(radarSource))));
const radarDefinitionContext={inferEnumLogicType:v=>v};
vm.runInNewContext(ts.transpileModule(radarDeclarations.map(s=>radarPrinter.printNode(ts.EmitHint.Unspecified,s,radarSource)).join('\n')+'\nglobalThis.definitions=[definition,definitionRadial,sectionDefinition];',{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,radarDefinitionContext);
for(const def of radarDefinitionContext.definitions){
 assert.deepEqual(Array.from(def.inputOrder).sort(),Object.keys(def.input).sort());
 assert.equal(def.input.detectPlayers.types.bool.config,false);
 assert.equal(def.input.holdLostTarget.types.bool.config,false);
}
assert.equal(radarDefinitionContext.definitions[0].input.maxDistance.types.number.clamp.max,2048);
assert.equal(radarDefinitionContext.definitions[1].input.maxDistance.types.number.clamp.max,15000);
assert.equal(radarDefinitionContext.definitions[2].input.maxDistance.types.number.clamp.max,15000);
assert.equal(radarDefinitionContext.definitions[2].input.coneAngle.types.number.clamp.max,120);
console.log('Radar input validation, full Section range and cone angle passed.');

const {coneContainsSphere}=load('src/shared/blockLogic/SectionRadarGeometry.ts',{}, {math:{sqrt:Math.sqrt,min:Math.min,max:Math.max,clamp:(n,a,b)=>Math.max(a,Math.min(b,n))}});
const coneRadius=40960*Math.tan(5*Math.PI/360);
assert.equal(coneContainsSphere({X:0,Y:40000,Z:0},1,40960,coneRadius),true);
assert.equal(coneContainsSphere({X:0,Y:41000,Z:0},1,40960,coneRadius),false);
assert.equal(coneContainsSphere({X:2000,Y:40000,Z:0},1,40960,coneRadius),false);
assert.equal(coneContainsSphere({X:0,Y:-10,Z:0},1,40960,coneRadius),false);
const signal=()=>{const callbacks=[];return {Connect(fn){callbacks.push(fn);return {Disconnect(){}};},fire(){callbacks.forEach(fn=>fn());}};};
let buildEnumerations=0;
const buildA={IsA:t=>t==='Model'},buildB={IsA:t=>t==='Model'};
const buildChildren=[buildA];
const buildFolder={Name:'Blocks',ChildAdded:signal(),ChildRemoved:signal(),Destroying:signal(),IsDescendantOf:()=>true,GetChildren(){buildEnumerations++;return buildChildren;}};
const world={GetChildren(){throw Error('World parts must never be enumerated');},GetDescendants(){throw Error('World parts must never be enumerated');}};
const {radarBuildTargets}=load('src/shared/blockLogic/SectionRadarTargets.ts',{'@rbxts/services':{Workspace:world},'shared/building/SharedPlots':{SharedPlots:{instance:{plots:[{instance:{FindFirstChild:name=>name==='Blocks'?buildFolder:undefined}}]}}}});
assert.equal(radarBuildTargets({Parent:buildFolder})[0],buildA);
radarBuildTargets({Parent:buildFolder});assert.equal(buildEnumerations,1);
buildChildren.push(buildB);buildFolder.ChildAdded.fire();
assert.equal(radarBuildTargets({Parent:buildFolder}).length,2);assert.equal(buildEnumerations,2);
buildChildren.shift();buildFolder.ChildRemoved.fire();
assert.equal(radarBuildTargets({Parent:buildFolder})[0],buildB);
console.log('Finite-cone math (including legacy long ranges) and build-only candidate registry passed.');

const searchContext={exports:{}};
vm.runInNewContext(`
String.prototype.fullLower=function(){return this.toLowerCase();};
String.prototype.gsub=function(pattern,replacement){
 if(pattern==='[%p%s]+')return [this.replace(/[\\p{P}\\p{S}\\s]+/gu,replacement)];
 return [this.split(pattern).join(replacement)];
};
String.prototype.find=function(query,start,plain){if(!plain)throw Error('Search must be literal');const n=this.indexOf(query,(start||1)-1);return n<0?[]:[n+1];};
Array.prototype.any=Array.prototype.some;Array.prototype.all=Array.prototype.every;
`+ts.transpileModule(fs.readFileSync('src/client/gui/buildmode/BlockSearch.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText+`
const norm=exports.normalizeBlockSearch;
const fields=['Hollow Quarter Cylinder','hollowcylinderquarter','tube','pipe'].map(norm);
globalThis.results=['hollow','quarter hollow','hollow quarter','holl quar','1/4 pipe','[hollow]','unknown ball'].map(q=>{q=norm(q);return exports.blockSearchScore(fields,q,q.split(' '));});
`,searchContext);
for(let i=0;i<6;i++)assert.notEqual(searchContext.results[i],undefined);
assert.equal(searchContext.results[6],undefined);
console.log('Search word order, partial words, fractions, aliases and literal punctuation passed.');

// Exercise preview scheduling: no eager clones, at most two visible clones/frame.
let previewFrame, previewClones=0, previewDisconnected=false;
class PreviewControlStub {
 constructor(gui){this.gui=gui;this.enableHooks=[];this.disableHooks=[];}
 onEnable(fn){this.enableHooks.push(fn);} onDisable(fn){this.disableHooks.push(fn);}
 enable(){this.enableHooks.forEach(fn=>fn());} disable(){this.disableHooks.forEach(fn=>fn());}
}
class PreviewFrame {mul(){return this;}}
PreviewFrame.fromEulerAnglesXYZ=()=>new PreviewFrame();
const {BlockPreviewControl}=load('src/client/gui/buildmode/BlockPreviewControl.ts',{
 '@rbxts/services':{RunService:{Heartbeat:{Connect:fn=>{previewFrame=fn;return {Disconnect(){previewDisconnected=true;}};}}}},
 'engine/client/gui/Control':{Control:PreviewControlStub}
},{CFrame:PreviewFrame,math:{max:Math.max,pi:Math.PI},Set:class extends Set {get length(){return this.size;}}});
const clippingParent={Visible:true,ClipsDescendants:true,AbsolutePosition:{X:0,Y:0},AbsoluteSize:{X:300,Y:300},IsA:type=>type==='GuiObject'};
const previewSource={GetExtentsSize:()=>({X:2,Y:2,Z:2}),Clone(){previewClones++;return {PivotTo(){},GetPivot:()=>new PreviewFrame()};}};
const previewControls=Array.from({length:12},(_,i)=>new BlockPreviewControl({Visible:true,AbsolutePosition:{X:0,Y:i<4?i*60:1000},AbsoluteSize:{X:50,Y:50},Parent:clippingParent,IsA:type=>type==='GuiObject',ClearAllChildren(){}},previewSource));
previewControls.forEach(c=>c.enable());
assert.equal(previewClones,0);previewFrame(1/60);assert.equal(previewClones,2);previewFrame(1/60);assert.equal(previewClones,4);previewFrame(1/60);assert.equal(previewClones,4);
previewControls.forEach(c=>c.disable());assert.equal(previewDisconnected,true);
console.log('Visible-only previews obey two-clones/frame budget and disconnect when closed.');

// Extra radar/PID inputs must not exhaust the wiring tool's seven legacy slots.
const layoutVector=class {constructor(X,Y,Z){Object.assign(this,{X,Y,Z});} mul(v){return new layoutVector(this.X*v.X,this.Y*v.Y,this.Z*v.Z);}};
layoutVector.zero=new layoutVector(0,0,0);
const {wireMarkerOffset}=load('src/client/tools/WireMarkerLayout.ts',{}, {Vector3:layoutVector,math:{max:Math.max,cos:Math.cos,sin:Math.sin,floor:Math.floor,pi:Math.PI}});
const layoutSize=new layoutVector(2,2,2);
const legacySlots=[[-.75,0,0],[.75,0,0],[0,0,-.75],[0,0,.75],[0,-.75,0],[0,.75,0],[0,0,0]];
legacySlots.forEach((expected,i)=>assert.deepEqual(Object.values(wireMarkerOffset(layoutSize,i)),expected));
const layoutPositions=new Set();
for(let index=0;index<40;index++){
 const position=wireMarkerOffset(layoutSize,index).mul(new layoutVector(1,1,1));
 assert.ok(Object.values(position).every(Number.isFinite));
 layoutPositions.add(JSON.stringify(position));
}
assert.equal(layoutPositions.size,40);
for(const definition of radarDefinitionContext.definitions){
 const count=Object.values(definition.input).filter(input=>!input.connectorHidden).length+Object.keys(definition.output).length;
 for(let i=0;i<count;i++)assert.ok(wireMarkerOffset(layoutSize,i));
}
console.log('Wiring layout preserves legacy positions and supports all radar inputs plus 40 distinct slots.');

const {canEquipBackMount,BACK_MOUNT_EQUIP_DISTANCE}=load('src/shared/blocks/BackMountRange.ts',{});
let mountDistance=5, mountHealth=100;
const mountRoot={IsA:type=>type==='BasePart',Position:{sub:()=>({Magnitude:mountDistance})}};
const mountHumanoid={get Health(){return mountHealth;}};
const mountPlayer={Character:{FindFirstChildOfClass:()=>mountHumanoid,FindFirstChild:()=>mountRoot}};
const mountPart={Position:{}};
assert.equal(BACK_MOUNT_EQUIP_DISTANCE,5);
assert.equal(canEquipBackMount(mountPlayer,mountPart),true);
mountDistance=5.01;assert.equal(canEquipBackMount(mountPlayer,mountPart),false);
mountDistance=100;assert.equal(canEquipBackMount(mountPlayer,mountPart),false);
mountDistance=0;assert.equal(canEquipBackMount(mountPlayer,mountPart),true);
mountHealth=0;assert.equal(canEquipBackMount(mountPlayer,mountPart),false);
assert.equal(canEquipBackMount({},mountPart),false);
let continuingScans=0;
const continuation=scheduleRadar(()=>{continuingScans++;return continuingScans<3;});
radarTime=1;heartbeat();assert.equal(continuingScans,1);
radarTime=1.016;heartbeat();assert.equal(continuingScans,2);
radarTime=1.032;heartbeat();assert.equal(continuingScans,3);
radarTime=1.048;heartbeat();assert.equal(continuingScans,3);
continuation.Disconnect();
console.log('Backmount five-stud/living-character boundary and next-frame partial radar scans passed.');

let equipRequest, equipUpdates=0;
const {BackMountBlockServerLogic}=load('src/server/blocks/logic/BackMountBlockServerLogic.ts',{
 'server/blocks/ServerBlockLogic':{ServerBlockLogic:class {}},
 'server/plots/ServerPartUtils':{ServerPartUtils:{switchDescendantsNetworkOwner(){}}},
 'shared/blocks/BackMountRange':{canEquipBackMount}
},{injectable:target=>target,inject(){},CFrame:class {},Vector3:layoutVector});
const equipTorso={Size:{Z:1}};
mountHumanoid.RootPart=equipTorso;
mountPlayer.Character.FindFirstChild=name=>name==='Humanoid'?mountHumanoid:mountRoot;
mountHealth=100;
new BackMountBlockServerLogic({events:{weldMountUpdate:{invoked:{Connect:fn=>equipRequest=fn}},updateLogic:{send(){equipUpdates++;}}}},{});
const equipBlock={mainPart:mountPart,PlayerWeldConstraint:{}};
const equipData={block:equipBlock,weldedState:true,owner:mountPlayer,connectToRootPart:true};
mountDistance=20;equipRequest(mountPlayer,equipData);assert.equal(equipBlock.PlayerWeldConstraint.Part1,undefined);assert.equal(equipUpdates,0);
mountDistance=5;equipRequest(mountPlayer,equipData);assert.equal(equipBlock.PlayerWeldConstraint.Part1,equipTorso);assert.equal(equipUpdates,1);
equipRequest(mountPlayer,equipData);assert.equal(equipBlock.PlayerWeldConstraint.Part1,equipTorso);assert.equal(equipUpdates,1);
mountDistance=20;equipRequest(mountPlayer,{...equipData,weldedState:false});assert.equal(equipBlock.PlayerWeldConstraint.Part1,undefined);
console.log('Server rejects distant equips, accepts nearby equips, ignores duplicate attaches and permits detach.');

// Exercise the actual radial logic with far build/player targets and no physical overlap queries.
class RadialVector {
 constructor(X,Y,Z){Object.assign(this,{X,Y,Z});}
 sub(v){return new RadialVector(this.X-v.X,this.Y-v.Y,this.Z-v.Z);}
 Dot(v){return this.X*v.X+this.Y*v.Y+this.Z*v.Z;}
 get Magnitude(){return Math.sqrt(this.Dot(this));}
}
RadialVector.zero=new RadialVector(0,0,0);
const {radialContains}=load('src/shared/blockLogic/RadialRadarGeometry.ts',{});
assert.equal(radialContains(new RadialVector(10240,0,0),10240),true);
assert.equal(radialContains(new RadialVector(10241,0,0),10240),false);
let radialScan,radialOutput,radialCandidates=[],radialPlayers=[];
class RadialLogicStub {
 constructor(def,args){this.instance=args.instance;this.hooks=[];this.enables=[];this.disables=[];this.output={distance:{set:(_,value)=>radialOutput=value}};this.event={subscribeRegistration:fn=>fn(),subscribe(){}};}
 onk(keys,fn){this.hooks.push({keys,fn});} onDestroy(){} onEnable(fn){this.enables.push(fn);} onDisable(fn){this.disables.push(fn);} onTicc(fn){this.tick=fn;} isEnabled(){return true;}
 change(values){for(const hook of this.hooks)if(hook.keys.every(key=>key in values))hook.fn(values);}
}
const radialAst=ts.createSourceFile('radar.ts',fs.readFileSync('src/shared/blocks/blocks/RadarSectionBlock.ts','utf8'),ts.ScriptTarget.Latest,true);
const radialNodes=radialAst.statements.filter(s=>(ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>['definition','definitionRadial','hideRadarView','liveRadarContact'].includes(d.name.getText(radialAst))))||(ts.isClassDeclaration(s)&&s.name.text==='RadialRadarLogic'));
const radialContext={inferEnumLogicType:v=>v,InstanceBlockLogic:RadialLogicStub,Vector3:RadialVector,Instance:class {Clear(){} AddPath(){} Destroy(){}},math:{pi:Math.PI,cos:Math.cos,sin:Math.sin,huge:Infinity},os:{clock:()=>0},radialSync:{send(){}},radialFields:new Map(),radialContains,RadarTargetMemory:radarHelpers.RadarTargetMemory,scheduleRadar:fn=>{radialScan=fn;return {Disconnect(){}};},radarBuildTargets:()=>radialCandidates,RunService:{IsClient:()=>true,Heartbeat:{}},Players:{GetPlayers:()=>radialPlayers}};
vm.runInNewContext(ts.transpileModule(radialNodes.map(s=>radarPrinter.printNode(ts.EmitHint.Unspecified,s,radialAst)).join('\n').replaceAll('.size()','.length')+'\nglobalThis.Radial=RadialRadarLogic;', {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,radialContext);
const radialFolder={Name:'Blocks'},radialOrigin=RadialVector.zero;
const radialInstance={Parent:radialFolder,PrimaryPart:{Position:radialOrigin},RadarView:{Color:{},IsA:()=>true},FindFirstChild(name){return this[name];},GetPivot:()=>({Position:radialOrigin,PointToObjectSpace:p=>p.sub(radialOrigin)})};
const radialLogic=new radialContext.Radial({instance:radialInstance});
radialLogic.change({maxDistance:15000});
const farRoot={Parent:{},Position:new RadialVector(7000,0,0),Size:new RadialVector(2,2,2)};
radialCandidates=[{Parent:radialFolder,PrimaryPart:farRoot}];
radialScan();radialLogic.tick();assert.equal(radialOutput.X,7000);
farRoot.Position=new RadialVector(8000,0,0);radialLogic.tick();assert.equal(radialOutput,RadialVector.zero);
farRoot.Position=new RadialVector(7000,0,0);radialScan();radialLogic.change({relativePositioning:false,holdLostTarget:true});radialLogic.tick();
farRoot.Position=new RadialVector(8000,0,0);radialLogic.tick();assert.equal(radialOutput.X,7000);
radialLogic.disables.forEach(fn=>fn());assert.equal(radialOutput,RadialVector.zero);
radialLogic.change({minimalDistance:5,detectSelf:false,detectPlayers:false});radialScan();radialLogic.tick();assert.equal(radialOutput,RadialVector.zero);
radialCandidates=[];const playerRoot={Parent:{FindFirstChildOfClass:()=>({Health:100})},IsA:()=>true,Position:new RadialVector(6000,0,0)};
radialPlayers=[{Character:{FindFirstChildOfClass:()=>({Health:100}),FindFirstChild:()=>playerRoot}}];
radialLogic.change({minimalDistance:5,detectSelf:false,detectPlayers:true});radialScan();radialLogic.tick();assert.equal(radialOutput.X,6000);
assert.equal(radialInstance.RadarView.Size.X,0.1);
console.log('Actual radial logic detects far builds/players, respects radius/self filter, holds lost targets and resets on disable.');

radialLogic.change({relativePositioning:false,holdLostTarget:false});radialPlayers=[];
radialCandidates=[{Parent:{Name:'Blocks'},PrimaryPart:{Parent:{},Position:new RadialVector(300,0,0),Size:new RadialVector(2,2,2)}},{Parent:{Name:'Blocks'},PrimaryPart:{Parent:{},Position:new RadialVector(450,0,0),Size:new RadialVector(2,2,2)}}];
radialLogic.change({maxDistance:1000});radialScan();radialLogic.tick();assert.equal(radialOutput.X,300);
radialLogic.change({maxDistance:660});radialLogic.tick();assert.equal(radialOutput.X,300);
radialLogic.change({maxDistance:1000});radialLogic.change({selection:'farthest'});radialScan();radialLogic.tick();assert.equal(radialOutput.X,450);
const {NumericalFilter}=load('src/shared/blockLogic/NumericalFilter.ts',{}, {math:{abs:Math.abs,huge:Infinity,exp:Math.exp}});
const f=new NumericalFilter();assert.equal(f.step(5,1,.1,false).low,5);assert.equal(f.step(5,1,.1,false).high,0);const filtered=f.step(10,1,.1,false);assert.ok(filtered.low>5&&filtered.low<10);assert.equal(filtered.low+filtered.high,10);assert.equal(f.step(10,1,.1,true).high,0);
console.log('Radar range feedback, farthest selection and numerical filter checks passed.');

require("./pvp-regression-tests.js");

// Any uses discovery order, while Nearest and Farthest explicitly rank contacts.
radialCandidates.reverse();radialLogic.change({selection:'any'});radialScan();radialLogic.tick();assert.equal(radialOutput.X,450);
radialLogic.change({selection:'nearest'});radialScan();radialLogic.tick();assert.equal(radialOutput.X,300);
const sectionNodes=radialAst.statements.filter(s=>(ts.isVariableStatement(s)&&s.declarationList.declarations.some(d=>['definition','sectionDefinition','hideRadarView','liveRadarContact'].includes(d.name.getText(radialAst))))||(ts.isClassDeclaration(s)&&s.name.text==='RadarSectionLogic'));
const sectionContext={...radialContext,sectionSync:{send(){}},sectionFields:new Map(),sectionFrame:()=>({Position:RadialVector.zero,PointToObjectSpace:p=>p}),coneContainsSphere,math:{...radialContext.math,tan:Math.tan,rad:n=>n*Math.PI/180,sqrt:Math.sqrt}};
vm.runInNewContext(ts.transpileModule(sectionNodes.map(s=>radarPrinter.printNode(ts.EmitHint.Unspecified,s,radialAst)).join('\n').replaceAll('.size()','.length')+'\nglobalThis.Section=RadarSectionLogic;', {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,sectionContext);
const sectionLogic=new sectionContext.Section({instance:radialInstance});
radialCandidates=[{Parent:radialFolder,PrimaryPart:{Parent:{},Position:new RadialVector(0,300,0),Size:new RadialVector(2,2,2)}}];
sectionLogic.change({maxDistance:1000,coneAngle:30,detectionSize:1});radialScan();sectionLogic.tick();assert.equal(radialOutput.Y,300);
for(let i=0;i<20;i++){sectionLogic.change({maxDistance:radialOutput.Magnitude+30,coneAngle:30,detectionSize:1});sectionLogic.tick();assert.equal(radialOutput.Y,300);}
sectionLogic.change({maxDistance:200,coneAngle:30,detectionSize:1});sectionLogic.tick();assert.equal(radialOutput,RadialVector.zero);
console.log('Any/Nearest/Farthest ordering and actual Section range-feedback loop passed.');

require("./radar-feedback-tests.js");
