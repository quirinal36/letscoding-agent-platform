import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compareModels,
  normalizeModels,
  refreshModels,
} from "../../../scripts/refresh-gadia-models.mjs";

const model = {
  id: "plexus/test",
  label: "Test",
  tools: true,
  context_window: 100,
};
const list = (data) => ({ object: "list", data });
const directories = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true })),
  );
});

async function baseline() {
  const directory = await mkdtemp(join(tmpdir(), "gadia-models-"));
  directories.push(directory);
  const content = JSON.stringify({
    updated_at: "2026-11-06",
    models: normalizeModels(list([model])),
  });
  await writeFile(join(directory, "gadia-models.json"), content);
  return { directory, content };
}

describe("Gadia model refresh", () => {
  it("ignores ordering and volatile fields, but detects additions, removals and capabilities", () => {
    const before = normalizeModels(list([model, { id: "plexus/removed" }]));
    const after = normalizeModels(
      list([{ id: "plexus/added" }, { ...model, tools: false }]),
    );
    expect(compareModels(before, after)).toEqual({
      added: ["plexus/added"],
      removed: ["plexus/removed"],
      changed: [
        {
          id: model.id,
          changes: [{ field: "tools", before: true, after: false }],
        },
      ],
    });
    expect(
      normalizeModels(
        list([
          { id: "plexus/removed", created: 12 },
          { ...model, created: 9 },
        ]),
      ),
    ).toEqual(before);
  });

  it.each(
    [
      [],
      [model, model],
      [{ id: "" }],
      [{ ...model, tools: "yes" }],
      [{ ...model, context_window: -1 }],
    ].map((models) => ({ models })),
  )(
    "rejects an invalid list without treating it as model removals: $models",
    ({ models }) => {
      expect(() => normalizeModels(list(models))).toThrow();
    },
  );

  it("keeps the baseline on HTTP or malformed-response failure", async () => {
    const { directory, content } = await baseline();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: false, status: 401 });
    await expect(
      refreshModels(directory, "test-secret-not-listed"),
    ).rejects.toThrow("GADIA_HTTP_401");
    fetch.mockResolvedValue({ ok: true, json: async () => list([]) });
    await expect(
      refreshModels(directory, "test-secret-not-listed"),
    ).rejects.toThrow("GADIA_INVALID_MODEL_LIST");
    expect(await readFile(join(directory, "gadia-models.json"), "utf8")).toBe(
      content,
    );
  });

  it("does not rewrite unchanged baseline and writes a safe catalog when models change", async () => {
    const { directory, content } = await baseline();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue({ ok: true, json: async () => list([model]) });
    expect(
      (await refreshModels(directory, "test-secret-not-listed")).status,
    ).toBe("unchanged");
    expect(await readFile(join(directory, "gadia-models.json"), "utf8")).toBe(
      content,
    );
    fetch.mockResolvedValue({
      ok: true,
      json: async () =>
        list([{ ...model, label: "<script>|`\n", vision: true }]),
    });
    expect(
      (await refreshModels(directory, "test-secret-not-listed")).status,
    ).toBe("changed");
    const saved = JSON.parse(
      await readFile(join(directory, "gadia-models.json"), "utf8"),
    );
    expect(saved.models[0].vision).toBe(true);
    const catalog = await readFile(join(directory, "gadia-models.md"), "utf8");
    expect(catalog).toContain("&lt;script&gt;&#124;&#96;");
    expect(catalog).not.toContain("<script>");
    const second = await refreshModels(directory, "test-secret-not-listed");
    expect(second.status).toBe("unchanged");
  });

  it("rejects an echoed credential before writing files", async () => {
    const { directory, content } = await baseline();
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => list([{ ...model, label: "test-secret-not-listed" }]),
    });
    await expect(
      refreshModels(directory, "test-secret-not-listed"),
    ).rejects.toThrow("GADIA_RESPONSE_CONTAINS_CREDENTIAL");
    expect(await readFile(join(directory, "gadia-models.json"), "utf8")).toBe(
      content,
    );
  });
});
