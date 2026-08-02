# FriendsInServer

A Shiggycord/Vendetta-family plugin. Adds a button to its own settings page
that lists which members of the server you're currently in are also on your
friends list.

I couldn't find an existing plugin that does exactly this, so this is written
from scratch against the documented Vendetta-family plugin API
(`@vendetta/metro`, `@vendetta/metro/common`). I checked it compiles cleanly
with TypeScript's JSX checker against that API surface, but I can't run it
inside Discord myself, so treat it as a solid first draft rather than a
guaranteed-working download — see "If it doesn't work" below.

## What it does

1. Open any server in Discord.
2. Settings → Plugins → FriendsInServer → tap **Check friends in this server**.
3. It reads the server's member list and cross-checks it against your
   friends list, then shows the names inline.

Nothing runs automatically in the background — it only looks anything up
when you tap the button.

## Building it

Shiggycord (like Vendetta/Revenge) loads plugins as a built JS bundle plus a
`manifest.json`, fetched from a URL you host — it doesn't load raw
`.tsx` files directly. The standard way to build one is:

```bash
git clone https://github.com/vendetta-mod/plugin-template friends-in-server
cd friends-in-server
# replace the generated src/index.tsx with the index.tsx from this plugin,
# and manifest.json with the one from this plugin
pnpm install
pnpm build
```

That produces a `dist/` folder with the built bundle + manifest.

## Hosting it

Push the `dist/` output to a GitHub repo and enable GitHub Pages for it
(same pattern other Vendetta plugin devs use). You'll end up with a URL like:

```
https://YOUR_USERNAME.github.io/REPO_NAME/
```

## Installing it in Shiggycord

Settings → Plugins → (add/install plugin) → paste that URL.

## If it doesn't work

The one part of this plugin that depends on Discord's *undocumented*
internals — not the documented plugin API — is the store lookups near the
top of `index.tsx` (`RelationshipStore`, `GuildMemberStore`,
`SelectedGuildStore`, `UserStore`). Those are found by guessing at method
names (`findByProps("isFriend", "getRelationships")` etc.), and Discord can
rename these without warning between app updates.

If the button shows "Couldn't find one of Discord's internal stores" or
just returns nobody when it should find friends, that's the thing to fix.
The Shiggycord/Vendetta community uses a live debug console for exactly
this — search "vendetta-debug" — which lets you run JavaScript inside the
Discord app itself and inspect what a store actually looks like right now,
so you can correct the `findByProps` calls to match.

If you hit that and get stuck, paste the error (or what the debug console
shows for those stores) back to me and I'll help fix the lookup.
