import { Workspace } from "@rbxts/services";
import { SharedPlots } from "shared/building/SharedPlots";
// Only registered building containers are enumerated. Never scan the world/map.
const containers = new Map<Instance, readonly RBXScriptConnection[]>();
let dirty = true;
let cached: readonly Model[] = [];
function register(container: Instance): void {
	if (containers.has(container)) return;
	dirty = true;
	const changed = () => {
		dirty = true;
	};
	const connections = [container.ChildAdded.Connect(changed), container.ChildRemoved.Connect(changed)];
	connections.push(
		container.Destroying.Connect(() => {
			for (const connection of connections) connection.Disconnect();
			containers.delete(container);
			dirty = true;
		}),
	);
	containers.set(container, connections);
}
export function radarBuildTargets(radar: Model): readonly Model[] {
	for (const plot of SharedPlots.instance?.plots ?? []) {
		const container = plot.instance.FindFirstChild("Blocks");
		if (container) register(container);
	}
	// Includes machines such as the spawn vehicle, whose logic also uses build blocks.
	if (radar.Parent?.Name === "Blocks") register(radar.Parent);
	if (dirty) {
		const blocks: Model[] = [];
		for (const [container] of containers) {
			if (!container.IsDescendantOf(Workspace)) continue;
			for (const child of container.GetChildren()) if (child.IsA("Model")) blocks.push(child);
		}
		cached = blocks;
		dirty = false;
	}
	return cached;
}
