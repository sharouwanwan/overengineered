import { CustomDebrisService } from "shared/service/CustomDebrisService";
import { PartUtils } from "shared/utils/PartUtils";
import { TagUtils } from "shared/utils/TagUtils";

/** Methods to edit block part information */
export namespace ServerPartUtils {
	export function switchDescendantsAnchor(model: Instance, isAnchored: boolean) {
		PartUtils.applyToAllDescendantsOfType("BasePart", model, (part) => {
			if (part.HasTag(TagUtils.allTags.ANCHORED)) return;
			part.Anchored = isAnchored;
		});
	}

	export function switchDescendantsAero(model: Instance, enabled: boolean) {
		PartUtils.applyToAllDescendantsOfType("BasePart", model, (part) => {
			part.EnableFluidForces = enabled;
		});
	}

	export function switchDescendantsNetworkOwner(
		model: Instance,
		owner: Player | undefined,
		assigned = new Set<BasePart>(),
	) {
		PartUtils.applyToAllDescendantsOfType("BasePart", model, (part) => {
			const root = part.AssemblyRootPart ?? part;
			if (assigned.has(root) || !root.CanSetNetworkOwnership()[0]) return;
			assigned.add(root);
			root.SetNetworkOwner(owner);
		});
	}

	export function BreakJoints(part: BasePart) {
		PartUtils.BreakJoints(part);

		if (part.IsA("VehicleSeat")) return;

		CustomDebrisService.set(part, math.random(20, 60));
	}
}
