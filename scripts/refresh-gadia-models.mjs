import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

const endpoint = "https://api.gadia.ai/v1/models";
const fields = {
  label: "string",
  provider: "string",
  tier: "string",
  band: "string",
  context_window: "number",
  tools: "boolean",
  vision: "boolean",
  output_modality: "string",
};

export function normalizeModels(body) {
  if (
    body?.object !== "list" ||
    !Array.isArray(body.data) ||
    !body.data.length
  ) {
    throw new Error("GADIA_INVALID_MODEL_LIST");
  }
  const ids = new Set();
  return body.data
    .map((model) => {
      if (
        !model ||
        typeof model.id !== "string" ||
        !model.id.trim() ||
        ids.has(model.id)
      ) {
        throw new Error("GADIA_INVALID_MODEL_ID");
      }
      ids.add(model.id);
      const normalized = { id: model.id };
      for (const [field, type] of Object.entries(fields)) {
        const value = model[field] ?? null;
        if (
          value !== null &&
          (typeof value !== type ||
            (type === "number" && (!Number.isSafeInteger(value) || value <= 0)))
        ) {
          throw new Error("GADIA_INVALID_MODEL_FIELD");
        }
        normalized[field] = value;
      }
      return normalized;
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function compareModels(previous, current) {
  const before = new Map(previous.map((model) => [model.id, model]));
  const after = new Map(current.map((model) => [model.id, model]));
  return {
    added: current.filter((model) => !before.has(model.id)).map((m) => m.id),
    removed: previous.filter((model) => !after.has(model.id)).map((m) => m.id),
    changed: current.flatMap((model) => {
      const old = before.get(model.id);
      if (!old) return [];
      const changes = Object.keys(fields)
        .filter((field) => old[field] !== model[field])
        .map((field) => ({ field, before: old[field], after: model[field] }));
      return changes.length ? [{ id: model.id, changes }] : [];
    }),
  };
}

function cell(value) {
  if (value === null) return "미공개";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\\", "&#92;")
    .replaceAll("|", "&#124;")
    .replaceAll("`", "&#96;")
    .replace(/[\r\n]/g, " ");
}

function renderCatalog(snapshot) {
  const rows = snapshot.models.map(
    (model) =>
      `| ${[model.id, ...Object.keys(fields).map((field) => model[field])].map(cell).join(" | ")} |`,
  );
  return [
    "# Gadia API 최신 모델 목록",
    "",
    "이 파일은 `scripts/refresh-gadia-models.mjs`가 생성한다. 직접 수정하지 않는다.",
    "",
    `목록 갱신 시각: ${snapshot.updated_at} · 항목 수: ${snapshot.models.length}`,
    "",
    `조회: \`${endpoint}\`. 변경이 없으면 파일을 다시 쓰지 않으며, 매 실행의 확인 시각과 결과는 로컬 작업 로그에 기록한다.`,
    "",
    "지원 표기는 API 메타데이터이며 실제 생성·도구·이미지 기능의 검증 결과가 아니다. 별칭의 미공개 필드는 미지원이라는 뜻이 아니다.",
    "",
    "| ID | 이름 | 제공사 | 티어 | 등급 | 컨텍스트(토큰) | 도구 | 비전 | 출력 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
}

async function writeAtomic(path, content) {
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

export async function refreshModels(directory, key) {
  if (!key) throw new Error("GADIA_API_KEY_MISSING");
  const snapshotPath = resolve(directory, "gadia-models.json");
  // 기존 기준 파일이 손상되면 초기화하지 않고 중단해 변경 이력을 보존한다.
  const previous = JSON.parse(await readFile(snapshotPath, "utf8"));
  const before = normalizeModels({ object: "list", data: previous.models });
  const response = await globalThis.fetch(endpoint, {
    headers: { Authorization: `Bearer ${key}` },
    redirect: "error",
    signal: globalThis.AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`GADIA_HTTP_${response.status}`);
  const models = normalizeModels(await response.json());
  if (JSON.stringify(models).includes(key)) {
    throw new Error("GADIA_RESPONSE_CONTAINS_CREDENTIAL");
  }
  const diff = compareModels(before, models);
  const changed = Object.values(diff).some((items) => items.length > 0);
  const checkedAt = new Date().toISOString();
  const snapshot = changed ? { updated_at: checkedAt, models } : previous;
  const catalogPath = resolve(directory, "gadia-models.md");
  const catalog = renderCatalog(snapshot);
  let oldCatalog;
  try {
    oldCatalog = await readFile(catalogPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (catalog !== oldCatalog) await writeAtomic(catalogPath, catalog);
  if (changed) {
    await writeAtomic(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  }
  return {
    checked_at: checkedAt,
    status: changed ? "changed" : "unchanged",
    ...diff,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const key = parseEnv(
      await readFile(resolve(root, ".env.local"), "utf8"),
    ).GADIA_API_KEY;
    const result = await refreshModels(resolve(root, "docs/studio"), key);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    // 네트워크 오류나 인증 응답의 원문에 비밀값이 포함될 수 있어 정해진 코드만 출력한다.
    const code = /^GADIA_[A-Z_0-9]+$/.test(error.message)
      ? error.message
      : "GADIA_REFRESH_FAILED";
    process.stderr.write(`${new Date().toISOString()} ${code}\n`);
    process.exitCode = 1;
  }
}
