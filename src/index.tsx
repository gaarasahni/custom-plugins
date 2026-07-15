import { before, after } from "@vendetta/patcher";
import { findByName, findByProps } from "@vendetta/metro";
import { findInReactTree } from "@vendetta/utils";

const patches: (() => void)[] = [];

export default {
    onLoad: () => {
        const GuildIcon = findByName("GuildIcon");
        const StatusSize = findByProps("getStatusSize");
        const DisplayBanner = findByName("DisplayBanner", false);
        const AvatarUtils = findByProps("getAvatarDecorationURL", "default");
        const RowManager = findByName("RowManager");

        if (GuildIcon) {
            patches.push(
                before("render", GuildIcon.prototype, function (this: any) {
                    if (this?.props) this.props.animate = true;
                })
            );
        }

        if (StatusSize) {
            patches.push(
                before("type", StatusSize.default, (args: any[]) => {
                    const [props] = args;
                    if (props) props.animate = true;
                })
            );
        }

        if (DisplayBanner) {
            patches.push(
                after("default", DisplayBanner, (args: any[], ret: any) => {
                    const pressable = findInReactTree(
                        ret,
                        (n: any) => n?.accessibilityRole === "image" && n?.onPress != null
                    );
                    const banner = findInReactTree(
                        pressable,
                        (n: any) => n?.type?.name === "ProfileBanner"
                    );
                    if (
                        banner &&
                        banner.key?.endsWith("-false") &&
                        banner.props?.bannerSource?.uri?.indexOf("/a_") > -1
                    ) {
                        pressable.onPress();
                    }
                })
            );
        }

        if (AvatarUtils) {
            patches.push(
                before("getAvatarDecorationURL", AvatarUtils, (args: any[]) => {
                    const [props] = args;
                    if (props) props.canAnimate = true;
                })
            );
            patches.push(
                before("getUserAvatarURL", AvatarUtils, (args: any[]) => {
                    args[1] = true;
                })
            );
            patches.push(
                before("getGuildMemberAvatarURLSimple", AvatarUtils, (args: any[]) => {
                    const [props] = args;
                    if (props) props.canAnimate = true;
                })
            );
        }

        if (RowManager) {
            patches.push(
                after("generate", RowManager.prototype, (args: any[], ret: any) => {
                    const [row] = args;
                    if (row?.rowType !== 1) return;
                    const { message } = ret ?? {};
                    if (message?.avatarURL?.indexOf("a_") > -1) {
                        message.avatarURL = message.avatarURL.replace(".webp", ".gif");
                    }
                })
            );
        }
    },
    onUnload: () => {
        for (const unpatch of patches) unpatch?.();
        patches.length = 0;
    },
};
