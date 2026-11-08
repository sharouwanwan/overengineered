import { ConfigControlBase } from "client/gui/configControls/ConfigControlBase";
import { TextBoxControl } from "engine/client/gui/TextBoxControl";
import { Matrix3Text } from "shared/blockLogic/Matrix3Text";
import type { ConfigControlStringDefinition } from "client/gui/configControls/ConfigControlString";
import type { Matrix3 } from "shared/blockLogic/Matrix3";
export class ConfigControlMatrix3 extends ConfigControlBase<ConfigControlStringDefinition, Matrix3> {
	constructor(gui: ConfigControlStringDefinition, name: string) {
		super(gui, name);
		this.setDescription(undefined);
		gui.AutomaticSize = Enum.AutomaticSize.Y;
		gui.Size = new UDim2(gui.Size.X, new UDim(0, 0));
		const layout = gui.FindFirstChildOfClass("UIListLayout");
		if (layout) {
			layout.FillDirection = Enum.FillDirection.Vertical;
			layout.Padding = new UDim(0, 8);
		}
		const data = this.parts.TitleLabel.Parent;
		if (data?.IsA("GuiObject")) {
			data.AutomaticSize = Enum.AutomaticSize.Y;
			data.Size = new UDim2(1, 0, 0, 24);
			data.FindFirstChildOfClass("UIFlexItem")?.Destroy();
		}
		this.parts.TitleLabel.AutomaticSize = Enum.AutomaticSize.Y;
		this.parts.TitleLabel.Size = new UDim2(1, 0, 0, 24);
		if (this.parts.DescriptionLabel) {
			this.parts.DescriptionLabel.TextWrapped = true;
			this.parts.DescriptionLabel.Size = new UDim2(1, 0, 0, 0);
			this.parts.DescriptionLabel.AutomaticSize = Enum.AutomaticSize.Y;
		}
		gui.Buttons.AutomaticSize = Enum.AutomaticSize.None;
		gui.Buttons.FindFirstChildOfClass("UIFlexItem")?.Destroy();
		gui.Buttons.FindFirstChildOfClass("UIListLayout")?.Destroy();
		gui.Buttons.AnchorPoint = Vector2.zero;
		gui.Buttons.Position = UDim2.fromOffset(0, 30);
		gui.Buttons.Size = new UDim2(1, 0, 0, 90);
		const box = gui.Buttons.TextBox;
		box.AnchorPoint = Vector2.zero;
		box.Position = UDim2.fromOffset(0, 0);
		box.Size = UDim2.fromScale(1, 1);
		box.MultiLine = true;
		box.TextWrapped = true;
		box.TextScaled = false;
		box.ClearTextOnFocus = false;
		box.TextSize = 16;
		box.Font = Enum.Font.Code;
		box.TextXAlignment = Enum.TextXAlignment.Left;
		box.TextYAlignment = Enum.TextYAlignment.Top;
		box.PlaceholderText = "[[1,0,0],[0,1,0],[0,0,1]]";
		const padding = box.FindFirstChildOfClass("UIPadding") ?? new Instance("UIPadding");
		padding.PaddingTop = new UDim(0, 8);
		padding.PaddingLeft = new UDim(0, 8);
		padding.PaddingRight = new UDim(0, 8);
		padding.PaddingBottom = new UDim(0, 8);
		padding.Parent = box;
		const resize = () => {
			const height = math.clamp(box.TextBounds.Y + 20, 88, 260);
			gui.Buttons.Size = new UDim2(1, 0, 0, height);
		};
		this.event.subscribe(box.GetPropertyChangedSignal("TextBounds"), resize);
		resize();
		const control = this.parent(new TextBoxControl(box));
		this.valueChanged(() => {
			const value = this.multi();
			control.text.set(value ? Matrix3Text.format(value, true) : "");
		});
		this.event.subscribe(control.submitted, (text) => {
			const matrix = Matrix3Text.parse(text);
			if (!matrix) {
				this.setDescription("Use three rows of three numbers: [[1,0,0],[0,1,0],[0,0,1]]");
				return;
			}
			this.setDescription(undefined);
			this.submit(this.multiMap(() => matrix));
			control.text.set(Matrix3Text.format(matrix, true));
		});
	}
}
