import { access, readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(projectRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if ([".git", "node_modules"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(path));
    else files.push(path);
  }
  return files;
}

const referenced = [
  manifest.background.service_worker,
  manifest.action.default_popup,
  ...Object.values(manifest.icons),
  ...manifest.content_scripts.flatMap((entry) => [...entry.js, ...(entry.css || [])])
];

for (const path of referenced) await access(join(projectRoot, path));

const files = await walk(projectRoot);
for (const path of files.filter((value) => value.endsWith(".js") || value.endsWith(".cjs") || value.endsWith(".mjs"))) {
  execFileSync(process.execPath, ["--check", path], { stdio: "pipe" });
}

if (manifest.manifest_version !== 3) throw new Error("Manifest V3 is required");
if (!manifest.host_permissions.every((value) => value.startsWith("https://"))) throw new Error("Only HTTPS host permissions are allowed");

console.log(`Validated manifest and ${files.length} project files.`);
