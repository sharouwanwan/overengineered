type Pose = { frame: CFrame; size: Vector3 };
type Snapshot = { time: number; parts: Map<BasePart, Pose> };
/** Short, bounded history of active block colliders; never rewinds live physics. */
export class CombatHistory {
	private snapshots: Snapshot[] = [];
	record(time: number, parts: readonly BasePart[]) {
		const poses = new Map<BasePart, Pose>();
		for (const part of parts) {
			if (poses.size() >= 10000) break;
			if (part.Parent) poses.set(part, { frame: part.CFrame, size: part.Size });
		}
		this.snapshots.push({ time, parts: poses });
		while (this.snapshots.size() > 12) this.snapshots.shift();
	}
	at(time: number): ReadonlyMap<BasePart, Pose> | undefined {
		let best: Snapshot | undefined;
		for (const snapshot of this.snapshots)
			if (!best || math.abs(snapshot.time - time) < math.abs(best.time - time)) best = snapshot;
		return best && math.abs(best.time - time) <= 0.1 ? best.parts : undefined;
	}
	static intersects(pose: Pose, center: Vector3, radius: number): boolean {
		const point = pose.frame.PointToObjectSpace(center);
		const half = pose.size.div(2);
		const closest = new Vector3(
			math.clamp(point.X, -half.X, half.X),
			math.clamp(point.Y, -half.Y, half.Y),
			math.clamp(point.Z, -half.Z, half.Z),
		);
		const delta = point.sub(closest);
		return delta.Dot(delta) <= radius * radius;
	}
}
