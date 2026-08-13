import { execFile } from "node:child_process";
import {
  cp,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import {
  artifactValidationPolicyFromDocument,
  type ArtifactManifestFile,
} from "@letscoding/artifact-validator";
import { createZipFixture } from "@letscoding/artifact-validator/fixtures";
import { inspectArtifact } from "@letscoding/artifact-validator/node";
import {
  createAnalyzeProjectHandler,
  createBundledPolicySource,
  createGetPolicyHandler,
  createReport,
  createValidateArtifactHandler,
  type AnalyzeProjectData,
  type CreateReportData,
  type GetPolicyData,
  type ToolExecutionContext,
  type ValidateArtifactData,
} from "@letscoding/lounge-deploy-mcp";
import { parsePolicyDocument } from "@letscoding/policy-contract";
import { projectContentByteLimit } from "@letscoding/project-analyzer";

const executeFile = promisify(execFile);
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const fixturesRoot = fileURLToPath(new URL("../fixtures/", import.meta.url));
const requireFromE2e = createRequire(import.meta.url);

export const E2E_CONTEXT: ToolExecutionContext = {
  requestId: "plugin-e2e",
  signal: new AbortController().signal,
};

export interface JourneyScenario {
  readonly fixture: "single-html" | "plain-static" | "vite" | "next";
  readonly expectedFramework:
    "single-html" | "plain-static" | "vite" | "nextjs";
  readonly outputDirectory: "." | "dist" | "out";
  readonly build?: {
    readonly binary: "vite" | "next";
    readonly args: readonly string[];
    readonly label: string;
  };
}

export interface JourneyResult {
  readonly initialPolicy: GetPolicyData;
  readonly finalPolicy: GetPolicyData;
  readonly analysis: AnalyzeProjectData;
  readonly validation: ValidateArtifactData;
  readonly report: CreateReportData;
  readonly zipPath: string;
  readonly manifestPaths: readonly string[];
}

export async function runJourney(
  scenario: JourneyScenario,
): Promise<JourneyResult> {
  const root = await mkdtemp(join(packageRoot, ".tmp-e2e-"));
  try {
    await cp(join(fixturesRoot, scenario.fixture), root, { recursive: true });
    const getPolicy = createGetPolicyHandler({
      sourceForPolicy: (policyId) =>
        policyId === "lounge-deploy" ? createBundledPolicySource() : null,
    });
    const initialPolicy = await getPolicy(
      { policyId: "lounge-deploy" },
      E2E_CONTEXT,
    );
    const analyze = createAnalyzeProjectHandler({ getPolicy });
    const projectFiles = await projectFileInputs(root);
    const analysis = await analyze(
      {
        policyId: "lounge-deploy",
        version: initialPolicy.version,
        files: projectFiles,
      },
      E2E_CONTEXT,
    );
    if (!analysis.result.pass) {
      throw new Error(
        `analysis failed: ${JSON.stringify(analysis.result.findings)}`,
      );
    }

    const commands: Array<{
      sequence: number;
      command: string;
      purpose: string;
    }> = [];
    if (scenario.build !== undefined) {
      await runBuild(root, scenario.build.binary, scenario.build.args);
      commands.push({
        sequence: commands.length + 1,
        command: scenario.build.label,
        purpose: "정적 산출물 생성",
      });
    }

    const outputRoot = resolve(root, scenario.outputDirectory);
    const finalPolicy = await getPolicy(
      { policyId: "lounge-deploy" },
      E2E_CONTEXT,
    );
    const parsed = parsePolicyDocument(finalPolicy.policy);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.issues));
    const validationPolicy = artifactValidationPolicyFromDocument(parsed.value);
    const directoryResult = await inspectArtifact({
      kind: "directory",
      inputPath: outputRoot,
      policy: validationPolicy,
    });
    if (!directoryResult.pass) {
      throw new Error(
        `directory validation failed: ${JSON.stringify(directoryResult)}`,
      );
    }
    commands.push({
      sequence: commands.length + 1,
      command: "validate-artifact --directory <output>",
      purpose: "출력 폴더 로컬 검사",
    });

    const zipPath = join(root, `${scenario.fixture}.zip`);
    await writeFile(zipPath, await zipFromDirectory(outputRoot));
    const zipResult = await inspectArtifact({
      kind: "zip",
      inputPath: zipPath,
      policy: validationPolicy,
    });
    if (
      !zipResult.pass ||
      zipResult.manifest === null ||
      zipResult.validation === null
    ) {
      throw new Error(`ZIP validation failed: ${JSON.stringify(zipResult)}`);
    }
    commands.push({
      sequence: commands.length + 1,
      command: "validate-artifact --zip <artifact>",
      purpose: "최종 ZIP 로컬 검사",
    });

    const validate = createValidateArtifactHandler({ getPolicy });
    const validation = await validate(
      validationInput(finalPolicy.version, zipResult),
      E2E_CONTEXT,
    );
    const report = createReport({
      policyId: "lounge-deploy",
      policyVersion: finalPolicy.version,
      analysis,
      validation,
      clientContext: {
        changedFiles: [],
        commands,
        outputDirectory: scenario.outputDirectory,
        zipPath,
        verifiedFeatures: [`${scenario.fixture} 정적 산출물 build 및 구조`],
        externalOrigins: [],
        runtimeEnvNames: [],
        remainingLimitations: ["실제 Lounge 등록·공개는 수행하지 않음"],
      },
    });
    return {
      initialPolicy,
      finalPolicy,
      analysis,
      validation,
      report,
      zipPath,
      manifestPaths: zipResult.manifest.files.map(({ path }) => path),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function runBuild(
  cwd: string,
  binary: "vite" | "next",
  args: readonly string[],
): Promise<void> {
  const cli = join(
    dirname(requireFromE2e.resolve(`${binary}/package.json`)),
    ...(binary === "vite" ? ["bin", "vite.js"] : ["dist", "bin", "next"]),
  );
  await executeFile(process.execPath, [cli, ...args], {
    cwd,
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
    timeout: 120_000,
  });
}

async function projectFileInputs(root: string) {
  const paths = await filesUnder(root);
  return Promise.all(
    paths.map(async (path) => {
      const absolute = join(root, ...path.split("/"));
      const bytes = await readFile(absolute);
      const limit = projectContentByteLimit(path);
      return {
        path,
        sizeBytes: bytes.length,
        ...(limit === null
          ? {}
          : { content: bytes.subarray(0, limit).toString("utf8") }),
      };
    }),
  );
}

async function zipFromDirectory(root: string): Promise<Buffer> {
  const paths = await filesUnder(root);
  return createZipFixture(
    await Promise.all(
      paths.map(async (path) => ({
        name: path,
        contents: await readFile(join(root, ...path.split("/"))),
        method: "deflate" as const,
      })),
    ),
  );
}

async function filesUnder(root: string): Promise<string[]> {
  const files: string[] = [];
  async function visit(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if ([".next", "dist", "out"].includes(entry.name)) continue;
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile())
        files.push(relative(root, absolute).split(sep).join("/"));
    }
  }
  await visit(root);
  return files.sort();
}

function validationInput(
  policyVersion: string,
  inspection: Awaited<ReturnType<typeof inspectArtifact>>,
) {
  const manifest = inspection.manifest;
  const local = inspection.validation;
  if (
    manifest === null ||
    local === null ||
    inspection.metadata.artifactSha256 === null ||
    inspection.metadata.uncompressedBytes === null
  ) {
    throw new Error("complete ZIP inspection required");
  }
  return {
    policyId: "lounge-deploy",
    policyVersion,
    manifest: {
      kind: "zip" as const,
      compressedBytes: manifest.compressedBytes ?? 0,
      uncompressedBytes: inspection.metadata.uncompressedBytes,
      fileCount: manifest.files.length,
      artifactSha256: inspection.metadata.artifactSha256,
      files: manifest.files as ArtifactManifestFile[],
    },
    localValidation: {
      pass: local.pass,
      policyVersion,
      artifactSha256: inspection.metadata.artifactSha256,
      fileSetSha256: local.summary.hashes.fileSetSha256,
      fileCount: manifest.files.length,
      totalUncompressedBytes: inspection.metadata.uncompressedBytes,
      codes: [...local.errors, ...local.warnings].map(({ code }) => code),
    },
  };
}
