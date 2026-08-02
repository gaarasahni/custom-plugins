# custom-plugins

My own plugins for Vendetta/Revenge/Shiggycord-family Discord mods.

## How to install

Paste a plugin's install link into Settings → Plugins → (add/install plugin)
in Shiggycord, Revenge, Bunny, or any Vendetta-family client.

## Plugins List

- **FriendsInServer** — Adds a settings page button that lists which members
  of the current server are on your friends list.
  [Install Link](https://gaarasahni.github.io/custom-plugins/FriendsInServer/)

- **AlwaysAnimate** — Always animates guild icons and avatars, instead of
  only animating on hover.
  [Install Link](https://gaarasahni.github.io/custom-plugins/AlwaysAnimate/)

## Building it yourself

Plugins are built with [esbuild](https://esbuild.github.io/) via a single
script that bundles every plugin under `plugins/*/src/index.tsx` into
`dist/<PluginName>/`, complete with a `manifest.json` (including a SHA-256
`hash` of the built bundle, which Vendetta-family loaders require to verify
plugin integrity).

```bash
pnpm install
pnpm build
```

This produces a `dist/` folder with every plugin's built bundle + manifest,
plus a top-level `dist/plugins.json` index.

## Adding a new plugin

1. Create `plugins/YourPluginName/manifest.json` and
   `plugins/YourPluginName/src/index.tsx`.
2. Import Discord internals via `@vendetta/metro`, `@vendetta/metro/common`,
   `@vendetta/patcher`, `@vendetta/utils`, etc. — same as any Vendetta-family
   plugin. The build script rewrites these into the runtime `vendetta`
   global automatically, so you don't need to worry about how they resolve.
3. Run `pnpm build` and confirm `dist/YourPluginName/` looks right.
4. Push to `main` — the GitHub Actions workflow builds and deploys
   automatically to GitHub Pages.

## Hosting

Deployed via GitHub Actions to the `gh-pages` branch, served at:

```
https://gaarasahni.github.io/custom-plugins/
```

Each plugin lives at its own path under that root, e.g.
`https://gaarasahni.github.io/custom-plugins/FriendsInServer/`.
