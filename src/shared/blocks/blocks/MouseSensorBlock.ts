import { Players, RunService, UserInputService, Workspace } from "@rbxts/services";
import { BlockLogic } from "shared/blockLogic/BlockLogic";
import { BlockCreation } from "shared/blocks/BlockCreation";
import { GameDefinitions } from "shared/data/GameDefinitions";
import type { BlockLogicArgs, BlockLogicFullBothDefinitions } from "shared/blockLogic/BlockLogic";
import type { BlockBuilder } from "shared/blocks/Block";

const definition = {
	outputOrder: ["position", "angle", "direction", "angle3d", "position3d", "leftClick", "middleClick", "rightClick"],
	input: {},
	output: {
		leftClick: { displayName: "Left Click", types: ["bool"] },
		middleClick: { displayName: "Middle Click", types: ["bool"] },
		rightClick: { displayName: "Right Click", types: ["bool"] },
		position: {
			displayName: "Position",
			unit: "Vector2 0-1",
			types: ["vector3"],
		},
		angle: {
			displayName: "Angle around the center",
			unit: "Degrees",
			types: ["number"],
		},
		direction: {
			displayName: "3D Direction",
			unit: "Vector3 unit",
			types: ["vector3"],
		},
		angle3d: {
			displayName: "3D Angle of direction",
			unit: "Radians",
			types: ["vector3"],
		},
		position3d: {
			displayName: "3D Position",
			unit: "Vector3 Global position",
			types: ["vector3"],
		},
	},
} satisfies BlockLogicFullBothDefinitions;

export type { Logic as MouseSensorBlockLogic };
class Logic extends BlockLogic<typeof definition> {
	constructor(block: BlockLogicArgs) {
		super(definition, block);

		let wheel = 0;
		const setButton = (input: InputObject, pressed: boolean) => {
			if (input.UserInputType === Enum.UserInputType.MouseButton1) this.output.leftClick.set("bool", pressed);
			if (input.UserInputType === Enum.UserInputType.MouseButton2) this.output.rightClick.set("bool", pressed);
			if (input.UserInputType === Enum.UserInputType.MouseButton3) this.output.middleClick.set("bool", pressed);
		};
		const release = () => {
			this.output.leftClick.set("bool", false);
			this.output.middleClick.set("bool", false);
			this.output.rightClick.set("bool", false);
		};
		this.event.subscribe(UserInputService.InputBegan, (input, processed) => {
			if (!processed && !UserInputService.GetFocusedTextBox()) setButton(input, true);
		});
		this.event.subscribe(UserInputService.InputEnded, (input) => setButton(input, false));
		this.event.subscribe(UserInputService.WindowFocusReleased, release);
		this.onDisable(release);
		this.onEnable(release);

		if (RunService.IsClient()) {
			this.event.subscribe(UserInputService.InputChanged, (input) => {
				if (input.UserInputType === Enum.UserInputType.MouseWheel) {
					wheel = input.Position.Z;
				}
			});
		}

		this.event.subscribe(RunService.PostSimulation, () => {
			const mousePos = UserInputService.GetMouseLocation();
			const relaPos = mousePos.div(Workspace.CurrentCamera!.ViewportSize);

			this.output.position.set("vector3", new Vector3(relaPos.X, relaPos.Y, wheel));
			wheel = 0;

			this.output.angle.set("number", math.deg(math.atan2(-(relaPos.Y - 0.5), relaPos.X - 0.5)));

			const camera = Workspace.CurrentCamera;
			if (camera) {
				const ray = camera.ViewportPointToRay(mousePos.X, mousePos.Y);
				const [x, y, z] = CFrame.lookAt(Vector3.zero, ray.Direction).ToOrientation();

				this.output.direction.set("vector3", ray.Direction);
				this.output.angle3d.set("vector3", new Vector3(x, y, z));
				this.output.position3d.set(
					"vector3",
					Players.LocalPlayer.GetMouse()!.Hit.Position.sub(new Vector3(0, GameDefinitions.HEIGHT_OFFSET, 0)),
				);
			}
		});
	}
}

export const MouseSensorBlock = {
	...BlockCreation.defaults,
	id: "mousesensor",
	displayName: "Mouse Sensor",
	description: "Returns some data about the mouse cursor",

	logic: { definition, ctor: Logic },
} as const satisfies BlockBuilder;
