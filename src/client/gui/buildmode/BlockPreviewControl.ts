import { RunService } from "@rbxts/services";
import { Control } from "engine/client/gui/Control";

const active = new Set<BlockPreviewControl>();
let heartbeat: RBXScriptConnection | undefined;
export class BlockPreviewControl extends Control<ViewportFrame> {
	private block?: BlockModel;
	private source?: BlockModel;
	constructor(gui: ViewportFrame, block?: BlockModel) {
		super(gui);
		this.set(block);
		this.onEnable(() => {
			active.add(this);
			if (!heartbeat)
				heartbeat = RunService.Heartbeat.Connect((dt) => {
					let remaining = 2;
					for (const preview of active) if (preview.render(dt, remaining > 0)) remaining--;
				});
		});
		this.onDisable(() => {
			active.delete(this);
			if (active.size() === 0) {
				heartbeat?.Disconnect();
				heartbeat = undefined;
			}
		});
	}
	private visible(): boolean {
		const position = this.gui.AbsolutePosition;
		const size = this.gui.AbsoluteSize;
		if (size.X <= 0 || size.Y <= 0) return false;
		let ancestor: Instance | undefined = this.gui;
		while (ancestor) {
			if (ancestor.IsA("GuiObject")) {
				if (!ancestor.Visible) return false;
				if (ancestor.ClipsDescendants) {
					const p = ancestor.AbsolutePosition,
						s = ancestor.AbsoluteSize;
					if (
						position.X + size.X <= p.X ||
						position.Y + size.Y <= p.Y ||
						position.X >= p.X + s.X ||
						position.Y >= p.Y + s.Y
					)
						return false;
				}
			} else if (ancestor.IsA("ScreenGui") && !ancestor.Enabled) return false;
			ancestor = ancestor.Parent;
		}
		return true;
	}
	// Return true only when a model clone consumed this frame's shared budget.
	private render(dt: number, allowClone: boolean): boolean {
		if (!this.source || !this.visible()) return false;
		let cloned = false;
		if (!this.block) {
			if (!allowClone) return false;
			const size = this.source.GetExtentsSize();
			this.block = this.source.Clone();
			this.block.PivotTo(new CFrame(0, 0.2, -2 - math.max(size.X, size.Y, size.Z)));
			this.block.Parent = this.gui;
			cloned = true;
		}
		this.block.PivotTo(
			this.block.GetPivot().mul(CFrame.fromEulerAnglesXYZ((math.pi / 3) * dt, (math.pi / 2) * dt, 0)),
		);
		return cloned;
	}
	set(block: BlockModel | undefined) {
		this.gui.ClearAllChildren();
		this.block = undefined;
		this.source = block;
	}
}
