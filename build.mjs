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
import { join, relative } from "path";
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

  /**
   * esbuild's IIFE format, when built with no `globalName`, computes the
   * entry's default export as a local variable inside the IIFE but never
   * exposes it anywhere — the whole bundle just runs and discards its
   * result. Vendetta-family loaders, however, expect the fetched script to
   * evaluate (via `eval`) to the plugin object itself, meaning the final
   * statement in the file must be a `return <exports>` inside the IIFE.
   *
   * We can't reference esbuild's own minified export variable directly
   * (its name isn't stable across builds/minification), so instead we
   * build a tiny synthetic entry that imports the real plugin file and
   * assigns its default export to `globalThis.__pluginExport` — a name
   * esbuild will never rename, since it's a property access, not a
   * declared identifier. A `footer` then reads it back off `globalThis`
   * and returns it, immediately deleting the temporary global so nothing
   * leaks.
   */
  const wrapperEntry = join(outDir, "__entry.mjs");
  const relEntry = "./" + relative(outDir, entry).replace(/\\/g, "/");
  writeFileSync(
    wrapperEntry,
    `import __plugin from ${JSON.stringify(relEntry)};\n` +
      `globalThis.__pluginExport = __plugin;\n`
  );

  const buildOptions = {
    entryPoints: [wrapperEntry],
    bundle: true,
    minify: true,
    format: "iife",
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

  rmSync(wrapperEntry, { force: true });

  /**
   * esbuild's IIFE output ends in a fixed, predictable closing pattern:
   * `...;})();` (optionally with a trailing newline). Vendetta-family
   * loaders expect the fetched script to evaluate to the plugin object,
   * which requires the LAST statement inside the IIFE to be a `return`
   * — appending a return after the IIFE closes (e.g. via esbuild's
   * `footer`) produces a top-level `return` outside any function, which
   * is a SyntaxError. So instead we splice `return globalThis.__pluginExport;`
   * in immediately before the closing `})();`, keeping it inside the
   * function body where a return is valid, and delete the temporary
   * global afterward so nothing leaks into the client runtime.
   */
  let built = readFileSync(outFile, "utf-8").trimEnd();
  if (!built.endsWith("})();")) {
    throw new Error(
      `Unexpected esbuild IIFE output shape for "${folder}" — expected the ` +
        `bundle to end with "})();" so a return statement could be spliced ` +
        `in before it, but it ended with: ${JSON.stringify(built.slice(-40))}`
    );
  }
  built = built.slice(0, -"})();".length) +
    "var __r=globalThis.__pluginExport;delete globalThis.__pluginExport;return __r;" +
    "})();";
  writeFileSync(outFile, built);

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
