import { build, context } from "esbuild";
import {
  readdirSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  rmSync,
} from "fs";
import { join } from "path";
import { createHash } from "crypto";

const PLUGINS_DIR = "plugins";
const DIST_DIR = "dist";
const watch = process.argv.includes("--watch");

/**
 * Vendetta/Revenge/Shiggycord inject a global `vendetta` object at runtime
 * (plus React/ReactNative via vendetta.metro.common) — there's no real npm
 * package behind `@vendetta/*` or "react" inside the Discord client.
 *
 * Marking them "external" would leave `require("@vendetta/metro")` calls in
 * the output, which crashes because there is no CommonJS `require` in the
 * Discord/Hermes runtime. Instead, this esbuild plugin rewrites every
 * `@vendetta/*` (and react/react-native) import into a reference to the
 * matching property on the global `vendetta` object, so the bundle reads
 * globals directly instead of trying to `require()` them.
 */
const vendettaGlobalMap = {
  "@vendetta": "vendetta",
  "@vendetta/metro": "vendetta.metro",
  "@vendetta/metro/common": "vendetta.metro.common",
  "@vendetta/patcher": "vendetta.patcher",
  "@vendetta/utils": "vendetta.utils",
  "@vendetta/ui": "vendetta.ui",
  "@vendetta/ui/components": "vendetta.ui.components",
  "@vendetta/ui/toasts": "vendetta.ui.toasts",
  "@vendetta/ui/alerts": "vendetta.ui.alerts",
  "@vendetta/plugin": "vendetta.plugin",
  "@vendetta/storage": "vendetta.storage",
  "@vendetta/assets": "vendetta.ui.assets",
  react: "vendetta.metro.common.React",
  "react-native": "vendetta.metro.common.ReactNative",
};

const vendettaGlobalsPlugin = {
  name: "vendetta-globals",
  setup(pluginBuild) {
    for (const importPath of Object.keys(vendettaGlobalMap)) {
      const escaped = importPath.replace(/[/]/g, "\\/");
      const filter = new RegExp(`^${escaped}$`);
      pluginBuild.onResolve({ filter }, (args) => ({
        path: args.path,
        namespace: "vendetta-global",
      }));
    }
    pluginBuild.onLoad({ filter: /.*/, namespace: "vendetta-global" }, (args) => {
      const globalExpr = vendettaGlobalMap[args.path];
      return {
        contents: `module.exports = ${globalExpr};`,
        loader: "js",
      };
    });
  },
};

if (existsSync(DIST_DIR)) rmSync(DIST_DIR, { recursive: true, force: true });
mkdirSync(DIST_DIR, { recursive: true });

const pluginFolders = readdirSync(PLUGINS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

if (pluginFolders.length === 0) {
  console.error(`No plugin folders found under ${PLUGINS_DIR}/`);
  process.exit(1);
}

const index = [];

for (const folder of pluginFolders) {
  const pluginPath = join(PLUGINS_DIR, folder);
  const manifestPath = join(pluginPath, "manifest.json");
  const entryTsx = join(pluginPath, "src", "index.tsx");
  const entryTs = join(pluginPath, "src", "index.ts");

  if (!existsSync(manifestPath)) {
    console.warn(`Skipping "${folder}": no manifest.json found`);
    continue;
  }

  const entry = existsSync(entryTsx) ? entryTsx : existsSync(entryTs) ? entryTs : null;
  if (!entry) {
    console.warn(`Skipping "${folder}": no src/index.tsx or src/index.ts found`);
    continue;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const outDir = join(DIST_DIR, folder);
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, "index.js");

  const buildOptions = {
    entryPoints: [entry],
    bundle: true,
    minify: true,
    format: "iife",
    globalName: "plugin",
    target: "esnext",
    outfile: outFile,
    plugins: [vendettaGlobalsPlugin],
    jsx: "transform",
    jsxFactory: "vendetta.metro.common.React.createElement",
    jsxFragment: "vendetta.metro.common.React.Fragment",
    logLevel: "info",
  };

  if (watch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    console.log(`Watching "${folder}"...`);
  } else {
    await build(buildOptions);
  }

  /**
   * Vendetta/Revenge/Shiggycord-family loaders verify plugin integrity by
   * SHA-256-hashing the fetched bundle and comparing it against a `hash`
   * field in manifest.json. Without a correct hash (or with none at all),
   * some loader versions silently reject the plugin and report it as a
   * failed fetch, even though the file downloaded fine.
   *
   * The hash must be computed AFTER the bundle is built, since it has to
   * match the exact bytes of the built index.js — so we write a modified
   * copy of the manifest into dist/ rather than copying the source
   * manifest.json verbatim.
   */
  const builtJs = readFileSync(outFile);
  const hash = createHash("sha256").update(builtJs).digest("hex");
  const deployedManifest = { ...manifest, main: "index.js", hash };
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(deployedManifest));

  index.push({
    id: manifest.id ?? folder,
    name: manifest.name ?? folder,
    description: manifest.description ?? "",
    authors: manifest.authors ?? [],
    version: manifest.version ?? "1.0.0",
    path: `${folder}/`,
  });

  console.log(`Built "${folder}" -> ${outDir} (hash: ${hash.slice(0, 12)}...)`);
}

writeFileSync(join(DIST_DIR, "plugins.json"), JSON.stringify(index, null, 2));

if (!watch) {
  console.log(`\nDone. Built ${index.length} plugin(s) into ${DIST_DIR}/`);
}
