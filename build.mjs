import { readFile, writeFile, readdir, mkdir, rm } from "fs/promises";
import { existsSync } from "fs";
import { createHash } from "crypto";
import { rollup } from "rollup";
import esbuild from "rollup-plugin-esbuild";
import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";

const PLUGINS_DIR = "./plugins";
const DIST_DIR = "./dist";

/**
 * Maps @vendetta/* import paths to runtime global expressions.
 * Rollup's IIFE format uses this to:
 *   1. Mark the import as external (not bundled)
 *   2. Pass the global expression as a parameter to the IIFE call
 *
 * This matches the official vendetta-mod/plugin-template convention exactly,
 * producing output like:
 *   (function(patcher, metro, ...) { ... })(vendetta.patcher, vendetta.metro, ...)
 *
 * The loader evaluates this IIFE and reads .default from its return value to
 * get the plugin object — which is why Rollup's `exports: "named"` format is
 * required: it wraps the default export in { default: pluginObject, __esModule: true }.
 */
function globals(id) {
  if (id.startsWith("@vendetta")) {
    // @vendetta → vendetta, @vendetta/metro → vendetta.metro, etc.
    return id.substring(1).replace(/\//g, ".");
  }
  const map = {
    react: "vendetta.metro.common.React",
    "react-native": "vendetta.metro.common.ReactNative",
  };
  return map[id] ?? null;
}

const rollupPlugins = [
  nodeResolve(),
  commonjs(),
  esbuild({
    minify: true,
    target: "esnext",
    jsx: "transform",
    jsxFactory: "vendetta.metro.common.React.createElement",
    jsxFragment: "vendetta.metro.common.React.Fragment",
    tsconfig: false,
  }),
];

if (existsSync(DIST_DIR)) await rm(DIST_DIR, { recursive: true, force: true });
await mkdir(DIST_DIR, { recursive: true });

const pluginFolders = (await readdir(PLUGINS_DIR, { withFileTypes: true }))
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

if (pluginFolders.length === 0) {
  console.error(`No plugin folders found under ${PLUGINS_DIR}/`);
  process.exit(1);
}

for (const plug of pluginFolders) {
  const manifestPath = `${PLUGINS_DIR}/${plug}/manifest.json`;
  if (!existsSync(manifestPath)) {
    console.warn(`Skipping "${plug}": no manifest.json found`);
    continue;
  }

  const manifest = JSON.parse(await readFile(manifestPath, "utf-8"));
  const outDir = `${DIST_DIR}/${plug}`;
  const outFile = `${outDir}/index.js`;

  await mkdir(outDir, { recursive: true });

  try {
    const bundle = await rollup({
      input: `${PLUGINS_DIR}/${plug}/${manifest.main}`,
      onwarn: () => {},
      plugins: rollupPlugins,
      external: (id) => globals(id) !== null,
    });

    await bundle.write({
      file: outFile,
      globals,
      format: "iife",
      compact: true,
      exports: "named",
    });

    await bundle.close();

    /**
     * Compute SHA-256 of the built bundle and write it into the deployed
     * manifest. Vendetta-family loaders verify plugin integrity by hashing
     * the fetched JS and comparing against manifest.hash — without a matching
     * hash, the plugin silently fails to install or load.
     * Also overwrite manifest.main with "index.js" (the built output path),
     * regardless of what the source manifest says.
     */
    const toHash = await readFile(outFile);
    manifest.hash = createHash("sha256").update(toHash).digest("hex");
    manifest.main = "index.js";
    await writeFile(`${outDir}/manifest.json`, JSON.stringify(manifest));

    console.log(`Built "${manifest.name}" (hash: ${manifest.hash.slice(0, 12)}...)`);
  } catch (e) {
    console.error(`Failed to build "${plug}":`, e);
    process.exit(1);
  }
}

console.log(`\nDone. Built ${pluginFolders.length} plugin(s) to ${DIST_DIR}/`);
