(function (plugin, patcher, metro, utils) {
    "use strict";

    var GuildIcon = metro.findByName("GuildIcon");
    var StatusSize = metro.findByProps("getStatusSize");
    var DisplayBanner = metro.findByName("DisplayBanner", false);
    var AvatarUtils = metro.findByProps("getAvatarDecorationURL", "default");
    var RowManager = metro.findByName("RowManager");

    var patches = [];

    function onLoad() {
        if (GuildIcon) {
            patches.push(
                patcher.before("render", GuildIcon.prototype, function () {
                    if (this && this.props) this.props.animate = true;
                })
            );
        }

        if (StatusSize) {
            patches.push(
                patcher.before("type", StatusSize.default, function (args) {
                    var props = args[0];
                    if (props) props.animate = true;
                })
            );
        }

        if (DisplayBanner) {
            patches.push(
                patcher.after("default", DisplayBanner, function (args, ret) {
                    var pressable = utils.findInReactTree(ret, function (n) {
                        return n && n.accessibilityRole === "image" && n.onPress != null;
                    });
                    var banner = utils.findInReactTree(pressable, function (n) {
                        return n && n.type && n.type.name === "ProfileBanner";
                    });
                    if (
                        banner &&
                        banner.key &&
                        banner.key.endsWith("-false") &&
                        banner.props &&
                        banner.props.bannerSource &&
                        banner.props.bannerSource.uri &&
                        banner.props.bannerSource.uri.indexOf("/a_") > -1
                    ) {
                        pressable.onPress();
                    }
                })
            );
        }

        if (AvatarUtils) {
            patches.push(
                patcher.before("getAvatarDecorationURL", AvatarUtils, function (args) {
                    var props = args[0];
                    if (props) props.canAnimate = true;
                })
            );
            patches.push(
                patcher.before("getUserAvatarURL", AvatarUtils, function (args) {
                    args[1] = true;
                })
            );
            patches.push(
                patcher.before("getGuildMemberAvatarURLSimple", AvatarUtils, function (args) {
                    var props = args[0];
                    if (props) props.canAnimate = true;
                })
            );
        }

        if (RowManager) {
            patches.push(
                patcher.after("generate", RowManager.prototype, function (args, ret) {
                    var row = args[0];
                    if (!row || row.rowType !== 1) return;
                    var message = ret && ret.message;
                    if (message && message.avatarURL && message.avatarURL.indexOf("a_") > -1) {
                        message.avatarURL = message.avatarURL.replace(".webp", ".gif");
                    }
                })
            );
        }
    }

    function onUnload() {
        for (var i = 0; i < patches.length; i++) {
            if (patches[i]) patches[i]();
        }
        patches.length = 0;
    }

    plugin.onLoad = onLoad;
    plugin.onUnload = onUnload;
    return plugin;
})({}, vendetta.patcher, vendetta.metro, vendetta.utils);
