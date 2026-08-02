import { findByName, findByProps } from "@vendetta/metro";
import { before, after } from "@vendetta/patcher";
import { findInReactTree } from "@vendetta/utils";

const GuildIcon = findByName("GuildIcon");
const StatusSize = findByProps("getStatusSize");
const DisplayBanner = findByName("DisplayBanner", false);
const AvatarUtils = findByProps("getAvatarDecorationURL", "default");
const RowManager = findByName("RowManager");

const patches: Array<() => void> = [];

function onLoad() {
  if (GuildIcon) {
    patches.push(
      before("render", GuildIcon.prototype, (args: any) => {
        if (args?.[0]) args[0].animate = true;
      })
    );
  }

  if (StatusSize) {
    patches.push(
      before("type", StatusSize.default, (args: any) => {
        const props = args[0];
        if (props) props.animate = true;
      })
    );
  }

  if (DisplayBanner) {
    patches.push(
      after("default", DisplayBanner, (_args: any, ret: any) => {
        const pressable = findInReactTree(
          ret,
          (n: any) => n && n.accessibilityRole === "image" && n.onPress != null
        );
        const banner = findInReactTree(
          pressable,
          (n: any) => n && n.type && n.type.name === "ProfileBanner"
        );
        if (
          banner &&
          banner.key &&
          banner.key.endsWith("-false") &&
          banner.props?.bannerSource?.uri?.includes("/a_")
        ) {
          pressable.onPress();
        }
      })
    );
  }

  if (AvatarUtils) {
    patches.push(
      before("getAvatarDecorationURL", AvatarUtils, (args: any) => {
        const props = args[0];
        if (props) props.canAnimate = true;
      })
    );
    patches.push(
      before("getUserAvatarURL", AvatarUtils, (args: any) => {
        args[1] = true;
      })
    );
    patches.push(
      before("getGuildMemberAvatarURLSimple", AvatarUtils, (args: any) => {
        const props = args[0];
        if (props) props.canAnimate = true;
      })
    );
  }

  if (RowManager) {
    patches.push(
      after("generate", RowManager.prototype, (args: any, ret: any) => {
        const row = args[0];
        if (!row || row.rowType !== 1) return;
        const message = ret?.message;
        if (message?.avatarURL?.includes("a_")) {
          message.avatarURL = message.avatarURL.replace(".webp", ".gif");
        }
      })
    );
  }
}

function onUnload() {
  for (const unpatch of patches) unpatch?.();
  patches.length = 0;
}

export default { onLoad, onUnload };
