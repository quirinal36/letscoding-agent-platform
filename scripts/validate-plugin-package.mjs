import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve("plugins/lounge-deploy");
const manifest = await json(".codex-plugin/plugin.json");
const mcp = await json(".mcp.json");
const marketplace = JSON.parse(
  await readFile(resolve(".agents/plugins/marketplace.json"), "utf8"),
);
const skill = await text("skills/lounge-deploy/SKILL.md");
const openai = await text("skills/lounge-deploy/agents/openai.yaml");
const encoded = JSON.stringify({ manifest, mcp, marketplace });
const errors = [];

if (manifest.name !== "lounge-deploy") errors.push("PLUGIN_NAME_INVALID");
if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) {
  errors.push("PLUGIN_VERSION_INVALID");
}
if (manifest.skills !== "./skills/" || manifest.mcpServers !== "./.mcp.json") {
  errors.push("PLUGIN_PATH_CONTRACT_INVALID");
}
if (!Array.isArray(manifest.interface?.defaultPrompt)) {
  errors.push("PLUGIN_PROMPTS_MISSING");
}
const server = mcp.mcpServers?.["lounge-deploy"];
const tools = [
  "get_policy",
  "analyze_project",
  "validate_artifact",
  "create_report",
];
if (
  server?.required !== true ||
  server?.url !== "https://lounge-deploy-mcp.letscoding.kr/mcp" ||
  JSON.stringify(server?.enabled_tools) !== JSON.stringify(tools)
) {
  errors.push("PLUGIN_MCP_CONTRACT_INVALID");
}
if (/token|authorization|secret/i.test(JSON.stringify(mcp))) {
  errors.push("PLUGIN_CREDENTIAL_NOT_ALLOWED");
}
if (!/^---\nname: lounge-deploy\ndescription: .+\n---/m.test(skill)) {
  errors.push("PLUGIN_SKILL_FRONTMATTER_INVALID");
}
const ordered = [
  "get_policy",
  "analyze_project",
  "scripts/validate-artifact.mjs",
  "Create the ZIP",
  "get_policy` again",
  "validate_artifact",
  "create_report",
];
let offset = -1;
for (const marker of ordered) {
  offset = skill.indexOf(marker, offset + 1);
  if (offset === -1) errors.push(`PLUGIN_SKILL_STEP_MISSING:${marker}`);
}
if (!openai.includes("$lounge-deploy") || !openai.includes(server?.url ?? "")) {
  errors.push("PLUGIN_AGENT_METADATA_INVALID");
}
if (!encoded.includes('"path":"./plugins/lounge-deploy"')) {
  errors.push("PLUGIN_MARKETPLACE_ENTRY_MISSING");
}
if (encoded.includes("[TODO:")) errors.push("PLUGIN_TODO_REMAINS");

if (errors.length > 0) {
  process.stderr.write(`${errors.join("\n")}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Plugin package validation passed.\n");
}

async function json(relativePath) {
  return JSON.parse(await text(relativePath));
}

function text(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}
