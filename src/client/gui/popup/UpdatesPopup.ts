import { Control } from "engine/client/gui/Control";
import { Element } from "engine/shared/Element";
import { UPDATE_HISTORY } from "shared/data/UpdateHistory";
import type { Theme } from "client/Theme";

export class UpdatesPopup extends Control<Frame> {
	constructor() {
		const gui = Element.create("Frame", {
			Name: "Updates",
			AnchorPoint: new Vector2(0.5, 0.5),
			Position: UDim2.fromScale(0.5, 0.5),
			Size: UDim2.fromScale(0.9, 0.85),
			BorderSizePixel: 0,
		});
		super(gui);
		Element.create("UISizeConstraint", { MaxSize: new Vector2(980, 780), Parent: gui });
		Element.create("UICorner", { CornerRadius: new UDim(0, 10), Parent: gui });
		Element.create("TextLabel", {
			Text: "UPDATES",
			Font: Enum.Font.GothamBold,
			TextSize: 24,
			TextColor3: Color3.fromRGB(240, 245, 255),
			BackgroundTransparency: 1,
			TextXAlignment: Enum.TextXAlignment.Left,
			Position: UDim2.fromOffset(24, 12),
			Size: new UDim2(1, -210, 0, 42),
			Parent: gui,
		});
		const close = this.parent(
			new Control(
				Element.create("TextButton", {
					Text: "X",
					Font: Enum.Font.GothamBold,
					TextSize: 20,
					TextColor3: Color3.fromRGB(255, 255, 255),
					Position: new UDim2(1, -54, 0, 12),
					Size: UDim2.fromOffset(40, 40),
					Parent: gui,
				}),
			).addButtonAction(() => this.hide()),
		);
		const scroll = Element.create("ScrollingFrame", {
			BackgroundTransparency: 1,
			BorderSizePixel: 0,
			Position: UDim2.fromOffset(24, 64),
			Size: new UDim2(1, -48, 1, -84),
			CanvasSize: new UDim2(),
			AutomaticCanvasSize: Enum.AutomaticSize.Y,
			ScrollBarThickness: 5,
			Parent: gui,
		});
		Element.create("UIListLayout", {
			Padding: new UDim(0, 12),
			SortOrder: Enum.SortOrder.LayoutOrder,
			Parent: scroll,
		});
		const labels: TextLabel[] = [];
		let textSize = 18;
		const sizeButtons: Control<TextButton>[] = [];
		for (const [caption, offset, step] of [
			["A-", -150, -2],
			["A+", -102, 2],
		] as const) {
			const button = this.parent(
				new Control(
					Element.create("TextButton", {
						Text: caption,
						Font: Enum.Font.GothamBold,
						TextSize: 17,
						TextColor3: Color3.fromRGB(245, 245, 245),
						Position: new UDim2(1, offset, 0, 12),
						Size: UDim2.fromOffset(40, 40),
						Parent: gui,
					}),
				).addButtonAction(() => {
					textSize = math.clamp(textSize + step, 16, 26);
					for (const label of labels) label.TextSize = textSize;
				}),
			);
			sizeButtons.push(button);
		}
		for (let i = 0; i < UPDATE_HISTORY.size(); i++) {
			const entry = UPDATE_HISTORY[i];
			const label = Element.create("TextLabel", {
				LayoutOrder: i,
				Text: `<b>${entry.title}</b>\n<font size="14">${entry.date}</font>\n\n${entry.items.map((item) => `• ${item}`).join("\n")}\n`,
				RichText: true,
				Font: Enum.Font.Gotham,
				TextSize: textSize,
				TextColor3: Color3.fromRGB(225, 231, 241),
				TextWrapped: true,
				TextXAlignment: Enum.TextXAlignment.Left,
				TextYAlignment: Enum.TextYAlignment.Top,
				BackgroundTransparency: 1,
				Size: new UDim2(1, -12, 0, 0),
				AutomaticSize: Enum.AutomaticSize.Y,
				Parent: scroll,
			});
			labels.push(label);
		}
		this.$onInjectAuto((theme: Theme) => {
			this.event.subscribeObservable(
				theme.get("backgroundSecondary"),
				(color) => (gui.BackgroundColor3 = color),
				true,
				true,
			);
			close.themeButton(theme, "buttonClose");
			for (const button of sizeButtons) button.themeButton(theme, "buttonNormal");
		});
		this.onDisable(() => this.destroy());
	}
}
