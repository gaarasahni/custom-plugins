import { findByProps } from "@vendetta/metro";
import { React, ReactNative } from "@vendetta/metro/common";

const { View, Text, ScrollView, Pressable } = ReactNative;

/**
 * Discord's internal Flux stores.
 *
 * These prop-name lookups are the one part of this plugin that can
 * break silently after a Discord update, because they depend on
 * Discord's own (unofficial, unversioned) internals rather than a
 * documented API. If "Check friends in this server" stops finding
 * anyone, this is the first place to look — see the README for how
 * to use the Vendetta debug console to re-discover the right names.
 */
const RelationshipStore = findByProps("isFriend", "getRelationships");
const GuildMemberStore = findByProps("getMembers", "getMember");
const SelectedGuildStore = findByProps("getGuildId", "getLastSelectedGuildId");
const UserStore = findByProps("getUser", "getCurrentUser");

function getCurrentGuildId(): string | null {
  try {
    return SelectedGuildStore?.getGuildId?.() ?? null;
  } catch {
    return null;
  }
}

function getGuildMemberIds(guildId: string): string[] {
  // Different Discord builds have returned this as an array of member
  // objects ({ userId } or { id }) or as an array of plain id strings.
  // We defensively handle all three so a minor internal shape change
  // doesn't break the whole plugin.
  const raw = GuildMemberStore?.getMembers?.(guildId) ?? [];
  return raw
    .map((entry: any) =>
      typeof entry === "string" ? entry : entry?.userId ?? entry?.id ?? null
    )
    .filter(Boolean);
}

function Settings() {
  const [friends, setFriends] = React.useState<string[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const checkFriends = () => {
    setError(null);
    setFriends(null);

    try {
      const guildId = getCurrentGuildId();
      if (!guildId) {
        setError("Open a server first, then come back and tap the button.");
        return;
      }

      if (!RelationshipStore || !GuildMemberStore || !UserStore) {
        setError(
          "Couldn't find one of Discord's internal stores. This plugin may need an update — see the README."
        );
        return;
      }

      const memberIds = getGuildMemberIds(guildId);
      const friendIds = memberIds.filter((id) => RelationshipStore.isFriend(id));

      const names = friendIds.map((id) => {
        const user = UserStore.getUser(id);
        return user?.globalName || user?.username || id;
      });

      setFriends(names);
    } catch (e: any) {
      setError("Something went wrong: " + (e?.message ?? String(e)));
    }
  };

  return (
    <View style={{ padding: 16 }}>
      <Pressable
        onPress={checkFriends}
        style={{
          backgroundColor: "#5865F2",
          borderRadius: 8,
          padding: 12,
          marginBottom: 12,
        }}
      >
        <Text style={{ color: "white", textAlign: "center", fontWeight: "600" }}>
          Check friends in this server
        </Text>
      </Pressable>

      {error && (
        <Text style={{ color: "#f04747", marginBottom: 8 }}>{error}</Text>
      )}

      {friends && (
        <Text style={{ color: "white", marginBottom: 8, fontWeight: "600" }}>
          {friends.length
            ? `${friends.length} friend(s) in this server:`
            : "None of your friends are in this server."}
        </Text>
      )}

      {friends && friends.length > 0 && (
        <ScrollView>
          {friends.map((name, i) => (
            <Text key={i} style={{ color: "#dcddde", paddingVertical: 2 }}>
              • {name}
            </Text>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export default {
  onLoad() {},
  onUnload() {},
  settings: Settings,
};
