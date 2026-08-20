import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("release contracts", () => {
  it("keeps canonical Vercel routes wired to API functions", async () => {
    const config = JSON.parse(
      await read("apps/lounge-deploy-mcp/vercel.json"),
    ) as { rewrites: Array<{ source: string; destination: string }> };
    expect(config.rewrites).toEqual([
      {
        source: "/.well-known/openai-apps-challenge",
        destination: "/api/openai-apps-challenge",
      },
      { source: "/mcp", destination: "/api/mcp" },
      { source: "/health", destination: "/api/health" },
      { source: "/ready", destination: "/api/ready" },
    ]);
  });

  it("runs required CI for PRs, merge queue and main", async () => {
    const workflow = await read(".github/workflows/ci.yml");
    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("merge_group:");
    expect(workflow).toContain("Dependency audit / high+");
    expect(workflow).toContain("pnpm verify:policy-change");
    expect(workflow).toContain("pnpm release:bundle");
    expect(workflow).toContain("actions/upload-artifact@v7");
  });

  it("stages, smokes and promotes one verified production deployment", async () => {
    const workflow = await read(".github/workflows/deploy-mcp.yml");
    const skipDomain = workflow.indexOf("--prod --skip-domain");
    const candidateSmoke = workflow.indexOf(
      "Smoke the production artifact before traffic",
    );
    const promote = workflow.indexOf("vercel@58.9.5 promote");
    expect(skipDomain).toBeGreaterThan(-1);
    expect(candidateSmoke).toBeGreaterThan(skipDomain);
    expect(promote).toBeGreaterThan(candidateSmoke);
    expect(workflow).toContain("ref: ${{ needs.verify.outputs.revision }}");
    expect(workflow).toContain("environment:\n      name: production");
  });

  it("publishes support/privacy/terms URLs without enabling upload", async () => {
    const manifest = JSON.parse(
      await read("plugins/lounge-deploy/.codex-plugin/plugin.json"),
    ) as {
      interface: { privacyPolicyURL: string; termsOfServiceURL: string };
    };
    expect(manifest.interface.privacyPolicyURL).toMatch(/^https:\/\//);
    expect(manifest.interface.termsOfServiceURL).toMatch(/^https:\/\//);
    expect(await read("SUPPORT.md")).toContain("does not register, upload");
    expect(JSON.stringify(manifest)).not.toContain("upload_to_lounge");
  });
});

function read(path: string): Promise<string> {
  return readFile(`${root}${path}`, "utf8");
}
