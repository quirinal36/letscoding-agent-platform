/**
 * `schema/*.json`에서 TypeScript 산출물을 생성한다.
 *
 * JSON Schema가 유일한 원본이고 `src/generated/`는 생성물이다. 생성 결과는
 * 커밋하며, `src/generated.test.ts`가 커밋된 내용과 재생성 결과를 비교해
 * drift를 막는다. 직접 실행하려면 `pnpm --filter @letscoding/policy-contract
 * run generate`를 사용한다.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";
import { format, resolveConfig } from "prettier";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const schemaDir = join(packageRoot, "schema");
const generatedDir = join(packageRoot, "src", "generated");

const SCHEMA_ID_BASE = "https://schemas.letscoding.kr/agent-platform/";

/** `$id` 접미사와 저장소 안 상대 경로의 대응. */
const SCHEMA_FILES = [
  "shared/policy-id.schema.json",
  "shared/policy-version.schema.json",
  "shared/error-code.schema.json",
  "policy-document.schema.json",
  "current-pointer.schema.json",
] as const;

/** `schemas.ts`가 내보낼 상수 이름. */
const SCHEMA_EXPORT_NAMES: Record<(typeof SCHEMA_FILES)[number], string> = {
  "shared/policy-id.schema.json": "policyIdSchema",
  "shared/policy-version.schema.json": "policyVersionSchema",
  "shared/error-code.schema.json": "policyCheckCodeSchema",
  "policy-document.schema.json": "policyDocumentSchema",
  "current-pointer.schema.json": "currentPointerSchema",
};

const TYPE_TARGETS = [
  {
    schemaFile: "policy-document.schema.json",
    outputFile: "policy-document.ts",
  },
  {
    schemaFile: "current-pointer.schema.json",
    outputFile: "current-pointer.ts",
  },
] as const;

const BANNER = `/**
 * 이 파일은 scripts/generate.ts가 schema/*.json에서 생성했다.
 * 직접 수정하지 말고 schema를 고친 뒤 다시 생성한다.
 */`;

export interface GeneratedFile {
  /** 패키지 루트 기준 상대 경로. */
  readonly path: string;
  readonly content: string;
}

async function readSchemaText(relativePath: string): Promise<string> {
  return readFile(join(schemaDir, relativePath), "utf8");
}

async function formatTypeScript(source: string): Promise<string> {
  const options = await resolveConfig(join(generatedDir, "placeholder.ts"));
  return format(source, { ...options, parser: "typescript" });
}

/**
 * `$id`가 `SCHEMA_ID_BASE`로 시작하는 참조를 네트워크 대신 로컬 파일에서 읽는다.
 */
function createLocalResolver(): {
  order: number;
  canRead: (file: { url: string }) => boolean;
  read: (file: { url: string }) => Promise<string>;
} {
  return {
    order: 1,
    canRead: (file) => file.url.startsWith(SCHEMA_ID_BASE),
    read: async (file) => readSchemaText(file.url.slice(SCHEMA_ID_BASE.length)),
  };
}

async function generateSchemaConstants(): Promise<GeneratedFile> {
  const entries: string[] = [];
  for (const schemaFile of SCHEMA_FILES) {
    const raw = await readSchemaText(schemaFile);
    const parsed: unknown = JSON.parse(raw);
    const exportName = SCHEMA_EXPORT_NAMES[schemaFile];
    entries.push(
      `export const ${exportName}: SchemaObject = ${JSON.stringify(parsed, null, 2)};`,
    );
  }

  const allNames = SCHEMA_FILES.map(
    (schemaFile) => SCHEMA_EXPORT_NAMES[schemaFile],
  );

  const source = [
    BANNER,
    `import type { SchemaObject } from "ajv";`,
    "",
    ...entries,
    "",
    "/** Ajv 인스턴스에 등록할 전체 schema. 참조 대상이 먼저 온다. */",
    `export const allPolicyContractSchemas: readonly SchemaObject[] = [${allNames.join(", ")}];`,
    "",
  ].join("\n");

  return {
    path: "src/generated/schemas.ts",
    content: await formatTypeScript(source),
  };
}

async function generateTypes(): Promise<GeneratedFile[]> {
  const resolver = createLocalResolver();
  const files: GeneratedFile[] = [];

  for (const target of TYPE_TARGETS) {
    const raw = await readSchemaText(target.schemaFile);
    const schema: unknown = JSON.parse(raw);
    const source = await compile(
      schema as Parameters<typeof compile>[0],
      target.schemaFile,
      {
        additionalProperties: false,
        bannerComment: BANNER,
        declareExternallyReferenced: true,
        enableConstEnums: false,
        format: false,
        $refOptions: {
          resolve: { letscoding: resolver },
        },
      },
    );

    files.push({
      path: `src/generated/${target.outputFile}`,
      content: await formatTypeScript(source),
    });
  }

  return files;
}

/** 생성 산출물 전체를 메모리에서 만든다. 테스트가 drift 검사에 재사용한다. */
export async function generateSchemaArtifacts(): Promise<GeneratedFile[]> {
  const [constants, types] = await Promise.all([
    generateSchemaConstants(),
    generateTypes(),
  ]);
  return [constants, ...types];
}

async function main(): Promise<void> {
  const files = await generateSchemaArtifacts();
  for (const file of files) {
    await writeFile(join(packageRoot, file.path), file.content, "utf8");
    process.stdout.write(`generated ${file.path}\n`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
