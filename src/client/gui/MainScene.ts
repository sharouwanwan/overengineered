import { SettingsPopup } from "client/gui/popup/SettingsPopup";
import { UpdatesPopup } from "client/gui/popup/UpdatesPopup";
import { Scene } from "client/gui/Scene";
import { Action } from "engine/client/Action";
import { Element } from "engine/shared/Element";
import { UPDATE_REVISION } from "shared/data/UpdateHistory";
import type { MainScreenLayout } from "client/gui/MainScreenLayout";
import type { PopupController } from "client/gui/PopupController";
import type { PlayerDataStorage } from "client/PlayerDataStorage";

@injectable
export class MainScene extends Scene {
	readonly openSettingsAction: Action;

	constructor(
		@inject mainScreen: MainScreenLayout,
		@inject popupController: PopupController,
		@inject playerData: PlayerDataStorage,
	) {
		super();
		const updates = this.parent(mainScreen.top.main.addButton("Updates", { text: "UPD", width: 50 }));
		updates.subscribeVisibilityFrom({ main_enabled: this.enabledState });
		updates.instance.ClipsDescendants = false;
		const badge = Element.create("TextLabel", {
			Name: "Unread",
			Text: "!",
			Font: Enum.Font.GothamBold,
			TextSize: 11,
			TextColor3: Color3.fromRGB(255, 255, 255),
			BackgroundColor3: Color3.fromRGB(226, 83, 53),
			BorderSizePixel: 0,
			AnchorPoint: new Vector2(0.5, 0.5),
			Position: new UDim2(1, -1, 0, 1),
			Size: UDim2.fromOffset(14, 14),
			ZIndex: updates.instance.ZIndex + 2,
			Parent: updates.instance,
		});
		Element.create("UICorner", { CornerRadius: new UDim(1, 0), Parent: badge });
		this.event.subscribeObservable(
			playerData.data,
			(data) => (badge.Visible = (data.data.lastReadUpdate ?? 0) < UPDATE_REVISION),
			true,
			true,
		);
		updates.addButtonAction(() => {
			popupController.showPopup(new UpdatesPopup());
			playerData.sendPlayerDataValue("lastReadUpdate", UPDATE_REVISION);
		});

		this.openSettingsAction = this.parent(new Action(() => popupController.showPopup(new SettingsPopup())));
		this.parent(mainScreen.top.main.addButton("Settings", { iconId: 18626485941 })) //
			.subscribeToAction(this.openSettingsAction)
			.subscribeVisibilityFrom({ main_enabled: this.enabledState });
	}
}
