#!/usr/bin/env node
// Validates every host manifest in this repository: JSON parses, versions
// agree, referenced paths exist inside the repo, and skills have frontmatter.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const fail = (msg) => errors.push(msg);

const readJSON = (rel) => {
  try {
    return JSON.parse(readFileSync(join(root, rel), "utf8"));
  } catch (err) {
    fail(`${rel}: ${err.message}`);
    return {};
  }
};

const checkPath = (owner, rel) => {
  if (typeof rel !== "string") return;
  if (rel.startsWith("/") || rel.includes("..") || /^[a-z]+:/i.test(rel)) {
    fail(`${owner}: path must be relative and stay in the repo: ${rel}`);
  } else if (!existsSync(join(root, rel))) {
    fail(`${owner}: missing ${rel}`);
  }
};

const pkg = readJSON("package.json");
const codex = readJSON(".codex-plugin/plugin.json");
const cursor = readJSON(".cursor-plugin/plugin.json");
const codebuddy = readJSON(".codebuddy-plugin/plugin.json");
readJSON(".agents/plugins/marketplace.json");
readJSON(".cursor-plugin/marketplace.json");
const codebuddyMarket = readJSON(".codebuddy-plugin/marketplace.json");

const versions = {
  "package.json": pkg.version,
  ".codex-plugin": codex.version,
  ".cursor-plugin": cursor.version,
  ".codebuddy-plugin": codebuddy.version,
  ".codebuddy-plugin/marketplace": codebuddyMarket.plugins?.[0]?.version,
};
if (new Set(Object.values(versions)).size !== 1) {
  fail(`versions differ: ${JSON.stringify(versions)}`);
}

for (const [owner, m] of [
  [".codex-plugin", codex],
  [".cursor-plugin", cursor],
  [".codebuddy-plugin", codebuddy],
]) {
  if (m.name !== "yuyu") fail(`${owner}: name must be "yuyu"`);
  checkPath(owner, m.skills);
  checkPath(owner, m.logo);
  checkPath(owner, m.interface?.logo);
  checkPath(owner, m.interface?.composerIcon);
  checkPath(owner, m.extensions?.["com.openai"]?.onboardingSkill);
}

// Every ${VAR} in Cursor MCP headers must be declared under variables.
const declared = Object.keys(cursor.variables?.properties ?? {});
for (const match of JSON.stringify(cursor.mcpServers ?? {}).matchAll(/\$\{([A-Za-z0-9_]+)\}/g)) {
  if (!declared.includes(match[1])) fail(`.cursor-plugin: \${${match[1]}} is not declared in variables`);
}

checkPath("package.json dsh.bundle", pkg.dsh?.bundle?.patch);

for (const dir of readdirSync(join(root, "skills"))) {
  const rel = `skills/${dir}/SKILL.md`;
  if (!existsSync(join(root, rel))) {
    fail(`${rel}: missing`);
    continue;
  }
  const fm = readFileSync(join(root, rel), "utf8").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fm) {
    fail(`${rel}: missing frontmatter`);
    continue;
  }
  const name = fm[1].match(/^name:\s*(.+)$/m)?.[1]?.trim();
  if (name !== dir) fail(`${rel}: name "${name}" must match directory "${dir}"`);
  if (!/^description:\s*\S/m.test(fm[1])) fail(`${rel}: missing description`);
}

if (errors.length) {
  for (const e of errors) console.error(`x ${e}`);
  process.exit(1);
}
console.log("ok: manifests, paths and skills are valid");
