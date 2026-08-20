import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const executeFile = promisify(execFile);
const pluginRoot = fileURLToPath(new URL("../", import.meta.url));
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

describe("Lounge Deploy plugin package", () => {
  it("wires one required anonymous MCP with exactly four public tools", async () => {
    const manifest = await readJson(`${pluginRoot}.codex-plugin/plugin.json`);
    const mcp = await readJson(`${pluginRoot}.mcp.json`);
    const server = record(record(record(mcp).mcpServers)["lounge-deploy"]);

    expect(manifest).toMatchObject({
      name: "lounge-deploy",
      version: "0.2.0",
      skills: "./skills/",
      mcpServers: "./.mcp.json",
    });
    expect(server.url).toBe("https://lounge-deploy-mcp.letscoding.kr/mcp");
    expect(server.required).toBe(true);
    expect(server.enabled_tools).toEqual([
      "get_policy",
      "analyze_project",
      "validate_artifact",
      "create_report",
    ]);
    expect(JSON.stringify(mcp)).not.toMatch(/token|authorization|secret/i);
  });

  it("keeps the skill current-policy-driven and fail-closed", async () => {
    const skill = await readFile(
      `${pluginRoot}skills/lounge-deploy/SKILL.md`,
      "utf8",
    );
    const orderedMarkers = [
      "get_policy",
      "analyze_project",
      "scripts/validate-artifact.mjs",
      "Create the ZIP",
      "get_policy` again",
      "validate_artifact",
      "create_report",
    ];
    let previous = -1;
    for (const marker of orderedMarkers) {
      const selected = skill.indexOf(marker, previous + 1);
      expect(selected, marker).toBeGreaterThan(previous);
      previous = selected;
    }

    const normalizedSkill = skill.replace(/\s+/g, " ");
    expect(normalizedSkill).toContain(
      "never use a remembered, bundled, or stale policy",
    );
    expect(normalizedSkill).toContain("Do not hardcode or guess");
    expect(normalizedSkill).toContain("Do not upload, register, publish");
    expect(skill).not.toMatch(/30\s*MB|100\s*MB|500\s+files/i);
    expect(skill).not.toMatch(/maxCompressedBytes|maxUncompressedBytes/);
    expect(skill).not.toContain("upload_to_lounge");
  });

  it("includes optional score/ranking integration without adding a new MCP tool", async () => {
    const skill = await readFile(
      `${pluginRoot}skills/lounge-deploy/SKILL.md`,
      "utf8",
    );

    expect(skill).toContain("Optional Lounge ranking integration");
    expect(skill).toContain("LetscodingRanking.submitScore");
    expect(skill).toContain("rankingSubmitted = false");
    expect(skill).toContain("랭킹 SDK가 로드되지 않았어요");
    expect(skill).toContain("error.message");
    expect(skill).toContain("only when the user asks");
  });

  it("runs the bundled validator without workspace module resolution", async () => {
    const fixture = await mkdtemp(join(tmpdir(), "lounge-plugin-fixture-"));
    try {
      await writeFile(`${fixture}/index.html`, "<!doctype html>", "utf8");
      const result = await executeFile(
        process.execPath,
        [
          `${pluginRoot}skills/lounge-deploy/scripts/validate-artifact.mjs`,
          "--policy",
          `${repositoryRoot}policies/lounge-deploy/history/2026-08-12.2.json`,
          "--directory",
          fixture,
        ],
        {
          cwd: tmpdir(),
          env: { ...process.env, NODE_PATH: "" },
        },
      );
      expect(JSON.parse(result.stdout)).toMatchObject({
        pass: true,
        policy: { id: "lounge-deploy", version: "2026-08-12.2" },
        metadata: { kind: "directory", fileCount: 1 },
      });
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform !== "win32")(
    "keeps the generated validator CLI executable",
    async () => {
      const metadata = await stat(
        `${pluginRoot}runtime/artifact-validator/cli.js`,
      );
      expect(metadata.mode & 0o111).toBe(0o111);
    },
  );
});

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected object");
  }
  return value as Record<string, unknown>;
}
