import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { generateSchemaArtifacts } from "../scripts/generate.js";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("생성물 drift", () => {
  it("커밋된 src/generated는 schema에서 다시 생성한 결과와 같다", async () => {
    const generated = await generateSchemaArtifacts();

    for (const file of generated) {
      const committed = await readFile(join(packageRoot, file.path), "utf8");
      expect(committed, `${file.path}를 다시 생성해야 한다`).toBe(file.content);
    }
  }, 60_000);
});
