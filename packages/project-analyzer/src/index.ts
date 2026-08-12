import {
  checkMessageKo,
  type PolicyCheck,
  type PolicyDocument,
} from "@letscoding/policy-contract";

export const PROJECT_ANALYZER_LIMITS = {
  maxFiles: 2_000,
  maxTotalContentBytes: 512 * 1024,
  maxConfigBytes: 128 * 1024,
  maxPackageJsonBytes: 256 * 1024,
  maxSourceExcerptBytes: 32 * 1024,
} as const;

export const PROJECT_ANALYSIS_CODES = [
  "PROJECT_INPUT_TOO_MANY_FILES",
  "PROJECT_INPUT_TOTAL_CONTENT_TOO_LARGE",
  "PROJECT_INPUT_PATH_INVALID",
  "PROJECT_INPUT_SIZE_INVALID",
  "PROJECT_CONTENT_NOT_ALLOWED",
  "PROJECT_CONTENT_TOO_LARGE",
  "PROJECT_SENSITIVE_FILE_REJECTED",
  "PROJECT_PACKAGE_JSON_INVALID",
  "PROJECT_PACKAGE_MANAGER_AMBIGUOUS",
  "PROJECT_FRAMEWORK_UNSUPPORTED",
  "PROJECT_BUILD_SCRIPT_MISSING",
  "PROJECT_VITE_CONFIG_MISSING",
  "PROJECT_VITE_BASE_MISSING",
  "PROJECT_VITE_BASE_NOT_BUILD_ONLY",
  "PROJECT_NEXT_CONFIG_MISSING",
  "PROJECT_NEXT_OUTPUT_EXPORT_MISSING",
  "PROJECT_NEXT_ASSET_PREFIX_MISSING",
  "PROJECT_NEXT_TRAILING_SLASH_MISSING",
  "PROJECT_NEXT_IMAGES_UNOPTIMIZED_MISSING",
  "PROJECT_NEXT_DYNAMIC_ROUTE_UNRESOLVED",
  "PROJECT_BROWSER_ROUTER_REWRITE_REQUIRED",
  "PROJECT_RUNTIME_ENV_MIGRATION_REQUIRED",
  "PROJECT_EXTERNAL_ORIGIN_REVIEW_REQUIRED",
  "PROJECT_ROOT_ABSOLUTE_ASSET_REVIEW_REQUIRED",
  "PROJECT_GENERIC_STATIC_CHECKLIST_REQUIRED",
] as const;

export type ProjectAnalysisCode = (typeof PROJECT_ANALYSIS_CODES)[number];
export type ProjectFramework =
  "single-html" | "plain-static" | "vite" | "nextjs" | "generic-static";
export type ProjectFindingSeverity =
  "blocker" | "error" | "warning" | "recommendation";

export interface ProjectFileInput {
  readonly path: string;
  readonly sizeBytes: number;
  /**
   * Optional bounded config or source excerpt. Never send .env, lockfile, build
   * output, binary content, or a complete source tree.
   */
  readonly content?: string;
}

export interface ProjectAnalysisInput {
  readonly policy: PolicyDocument;
  readonly files: readonly ProjectFileInput[];
}

export interface ProjectEvidence {
  readonly kind:
    "config-file" | "dependency" | "file-pattern" | "lockfile" | "script";
  readonly file: string;
  readonly detail: string;
}

export interface ProjectFinding {
  readonly code: string;
  readonly policyCode?: string;
  readonly severity: ProjectFindingSeverity;
  readonly message: string;
  readonly files: readonly string[];
  readonly recommendation: string;
}

export interface ProjectChecklistItem {
  readonly id: string;
  readonly required: boolean;
  readonly text: string;
}

export interface ProjectAnalysisResult {
  readonly pass: boolean;
  readonly policy: { readonly id: string; readonly version: string };
  readonly framework: {
    readonly key: ProjectFramework;
    readonly version: string | null;
    readonly confidence: "high" | "medium" | "low";
    readonly evidence: readonly ProjectEvidence[];
  };
  readonly packageManager: "pnpm" | "npm" | "yarn" | "bun" | "unknown";
  readonly build: {
    readonly command: string | null;
    readonly outputDirectory: string | null;
  };
  readonly findings: readonly ProjectFinding[];
  readonly checklist: readonly ProjectChecklistItem[];
  readonly input: {
    readonly fileCount: number;
    readonly inspectedContentFiles: number;
    readonly inspectedContentBytes: number;
  };
}

interface ValidatedFile extends ProjectFileInput {
  readonly normalizedPath: string;
}

interface PackageJsonData {
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly scripts: Readonly<Record<string, string>>;
  readonly packageManager: string | null;
}

interface MutableAnalysis {
  readonly findings: ProjectFinding[];
  readonly evidence: ProjectEvidence[];
}

const CONFIG_BASENAMES = new Set([
  "package.json",
  "vite.config.js",
  "vite.config.mjs",
  "vite.config.ts",
  "vite.config.cjs",
  "next.config.js",
  "next.config.mjs",
  "next.config.ts",
  "next.config.cjs",
  "tsconfig.json",
]);
const SOURCE_EXTENSIONS = new Set([
  "html",
  "htm",
  "css",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "ts",
  "tsx",
]);
const CONTENT_DENY_BASENAMES = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
]);
const LOCKFILES: ReadonlyArray<{
  readonly file: string;
  readonly manager: ProjectAnalysisResult["packageManager"];
}> = [
  { file: "pnpm-lock.yaml", manager: "pnpm" },
  { file: "package-lock.json", manager: "npm" },
  { file: "npm-shrinkwrap.json", manager: "npm" },
  { file: "yarn.lock", manager: "yarn" },
  { file: "bun.lock", manager: "bun" },
  { file: "bun.lockb", manager: "bun" },
];

export function analyzeProject(
  input: ProjectAnalysisInput,
): ProjectAnalysisResult {
  const state: MutableAnalysis = { findings: [], evidence: [] };
  const files = validateInput(input, state);
  const fileMap = new Map(files.map((file) => [file.normalizedPath, file]));
  const packageData = parsePackageJson(fileMap.get("package.json"), state);
  const packageManager = detectPackageManager(files, packageData, state);
  const framework = detectFramework(input.policy, files, packageData, state);
  const build = analyzeBuild(
    framework.key,
    packageManager,
    packageData,
    fileMap,
    state,
    input.policy,
  );
  analyzeCrossCutting(files, state, input.policy);
  if (framework.key === "generic-static") {
    addFinding(
      state,
      "PROJECT_GENERIC_STATIC_CHECKLIST_REQUIRED",
      "recommendation",
      "지원 여부를 확정할 수 없어 일반 정적 배포 점검이 필요합니다.",
      [],
      "서버 런타임 없이 모든 페이지와 자산을 정적 파일로 생성할 수 있는지 확인하세요.",
    );
  }

  const findings = stableFindings(state.findings);
  return {
    pass: !findings.some(
      ({ severity }) => severity === "blocker" || severity === "error",
    ),
    policy: { id: input.policy.id, version: input.policy.version },
    framework: {
      ...framework,
      evidence: stableEvidence(state.evidence),
    },
    packageManager,
    build,
    findings,
    checklist: createChecklist(framework.key, input.policy),
    input: {
      fileCount: input.files.length,
      inspectedContentFiles: files.filter(
        ({ content }) => content !== undefined,
      ).length,
      inspectedContentBytes: files.reduce(
        (total, file) => total + Buffer.byteLength(file.content ?? "", "utf8"),
        0,
      ),
    },
  };
}

function validateInput(
  input: ProjectAnalysisInput,
  state: MutableAnalysis,
): ValidatedFile[] {
  if (input.files.length > PROJECT_ANALYZER_LIMITS.maxFiles) {
    addInputFinding(
      state,
      "PROJECT_INPUT_TOO_MANY_FILES",
      "프로젝트 파일 목록이 허용 개수를 넘었습니다.",
    );
  }
  const files: ValidatedFile[] = [];
  let totalContentBytes = 0;
  for (const file of input.files) {
    const normalizedPath = normalizeProjectPath(file.path);
    if (normalizedPath === null) {
      addInputFinding(
        state,
        "PROJECT_INPUT_PATH_INVALID",
        "프로젝트 파일 경로가 올바르지 않습니다.",
      );
      continue;
    }
    if (!Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 0) {
      addInputFinding(
        state,
        "PROJECT_INPUT_SIZE_INVALID",
        "프로젝트 파일 크기 metadata가 올바르지 않습니다.",
      );
      continue;
    }
    if (file.content !== undefined) {
      const basename = normalizedPath.split("/").at(-1) ?? "";
      if (isSensitivePath(normalizedPath)) {
        addInputFinding(
          state,
          "PROJECT_SENSITIVE_FILE_REJECTED",
          "민감할 수 있는 파일 내용은 분석 입력으로 허용하지 않습니다.",
        );
        continue;
      }
      const maxBytes = allowedContentBytes(normalizedPath, basename);
      if (maxBytes === null || CONTENT_DENY_BASENAMES.has(basename)) {
        addInputFinding(
          state,
          "PROJECT_CONTENT_NOT_ALLOWED",
          "이 파일의 내용은 분석 입력 allowlist에 없습니다.",
        );
        continue;
      }
      const bytes = Buffer.byteLength(file.content, "utf8");
      if (bytes > maxBytes) {
        addInputFinding(
          state,
          "PROJECT_CONTENT_TOO_LARGE",
          "선택한 파일 내용이 파일별 제한을 넘었습니다.",
        );
        continue;
      }
      totalContentBytes += bytes;
    }
    files.push({ ...file, normalizedPath });
  }
  if (totalContentBytes > PROJECT_ANALYZER_LIMITS.maxTotalContentBytes) {
    addInputFinding(
      state,
      "PROJECT_INPUT_TOTAL_CONTENT_TOO_LARGE",
      "분석 입력 내용의 전체 크기가 제한을 넘었습니다.",
    );
  }
  return files.sort((left, right) =>
    left.normalizedPath.localeCompare(right.normalizedPath, "en"),
  );
}

function normalizeProjectPath(path: unknown): string | null {
  if (
    typeof path !== "string" ||
    path.length === 0 ||
    path.startsWith("/") ||
    path.startsWith("\\") ||
    /^[a-z]:[\\/]/i.test(path) ||
    path.includes("\\") ||
    [...path].some((character) => {
      const point = character.codePointAt(0);
      return point !== undefined && (point <= 0x1f || point === 0x7f);
    })
  ) {
    return null;
  }
  const segments = path.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    return null;
  }
  return path;
}

function isSensitivePath(path: string): boolean {
  return path
    .split("/")
    .some((segment) => segment.toLowerCase().startsWith(".env"));
}

function allowedContentBytes(path: string, basename: string): number | null {
  if (basename === "package.json") {
    return PROJECT_ANALYZER_LIMITS.maxPackageJsonBytes;
  }
  if (CONFIG_BASENAMES.has(basename)) {
    return PROJECT_ANALYZER_LIMITS.maxConfigBytes;
  }
  const extension = basename.includes(".")
    ? (basename.split(".").at(-1) ?? "")
    : "";
  if (
    SOURCE_EXTENSIONS.has(extension.toLowerCase()) &&
    /^(src|app|pages|public|styles)\//.test(path)
  ) {
    return PROJECT_ANALYZER_LIMITS.maxSourceExcerptBytes;
  }
  if (path === "index.html")
    return PROJECT_ANALYZER_LIMITS.maxSourceExcerptBytes;
  return null;
}

function parsePackageJson(
  file: ValidatedFile | undefined,
  state: MutableAnalysis,
): PackageJsonData {
  const empty: PackageJsonData = {
    dependencies: {},
    devDependencies: {},
    scripts: {},
    packageManager: null,
  };
  if (file?.content === undefined) return empty;
  try {
    const raw = JSON.parse(file.content) as unknown;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      throw new Error("not an object");
    }
    const object = raw as Readonly<Record<string, unknown>>;
    return {
      dependencies: stringRecord(object.dependencies),
      devDependencies: stringRecord(object.devDependencies),
      scripts: stringRecord(object.scripts),
      packageManager:
        typeof object.packageManager === "string"
          ? object.packageManager
          : null,
    };
  } catch {
    addFinding(
      state,
      "PROJECT_PACKAGE_JSON_INVALID",
      "error",
      "package.json을 구조화 데이터로 읽을 수 없습니다.",
      ["package.json"],
      "유효한 JSON인지 확인하고 다시 분석하세요.",
    );
    return empty;
  }
}

function stringRecord(value: unknown): Readonly<Record<string, string>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function detectPackageManager(
  files: readonly ValidatedFile[],
  packageData: PackageJsonData,
  state: MutableAnalysis,
): ProjectAnalysisResult["packageManager"] {
  const paths = new Set(files.map(({ normalizedPath }) => normalizedPath));
  const detected = LOCKFILES.filter(({ file }) => paths.has(file));
  for (const lock of detected) {
    state.evidence.push({
      kind: "lockfile",
      file: lock.file,
      detail: lock.manager,
    });
  }
  const managers = new Set(detected.map(({ manager }) => manager));
  if (managers.size > 1) {
    addFinding(
      state,
      "PROJECT_PACKAGE_MANAGER_AMBIGUOUS",
      "error",
      "서로 다른 package manager lock 파일이 함께 있습니다.",
      detected.map(({ file }) => file),
      "프로젝트가 실제로 사용하는 lock 파일 하나만 유지하세요.",
    );
  }
  if (detected[0] !== undefined) return detected[0].manager;
  const declared = packageData.packageManager?.split("@")[0];
  return declared === "pnpm" ||
    declared === "npm" ||
    declared === "yarn" ||
    declared === "bun"
    ? declared
    : "unknown";
}

function detectFramework(
  policy: PolicyDocument,
  files: readonly ValidatedFile[],
  packageData: PackageJsonData,
  state: MutableAnalysis,
): Omit<ProjectAnalysisResult["framework"], "evidence"> {
  const paths = new Set(files.map(({ normalizedPath }) => normalizedPath));
  const dependencies = {
    ...packageData.dependencies,
    ...packageData.devDependencies,
  };
  const policyFrameworks = new Map(
    policy.frameworks.map((item) => [item.key, item]),
  );
  const candidates = (["nextjs", "vite"] as const).map((key) => {
    const contract = policyFrameworks.get(key);
    const dependency = contract?.detect.dependencies.find(
      (name) => dependencies[name] !== undefined,
    );
    const config = contract?.detect.configFiles.find((name) => paths.has(name));
    const filePattern =
      key === "nextjs"
        ? files.find(({ normalizedPath }) =>
            /^(app|pages)\//.test(normalizedPath),
          )?.normalizedPath
        : undefined;
    return { key, dependency, config, filePattern };
  });
  const next = candidates[0]!;
  const vite = candidates[1]!;
  const selected =
    next.dependency || next.config || next.filePattern
      ? next
      : vite.dependency || vite.config
        ? vite
        : null;
  if (selected !== null) {
    if (selected.dependency !== undefined) {
      state.evidence.push({
        kind: "dependency",
        file: "package.json",
        detail: selected.dependency,
      });
    }
    if (selected.config !== undefined) {
      state.evidence.push({
        kind: "config-file",
        file: selected.config,
        detail: selected.key,
      });
    }
    if (selected.filePattern !== undefined) {
      state.evidence.push({
        kind: "file-pattern",
        file: selected.filePattern,
        detail: "Next.js route tree",
      });
    }
    const dependencyName = selected.key === "nextjs" ? "next" : "vite";
    return {
      key: selected.key,
      version: dependencies[dependencyName] ?? null,
      confidence:
        selected.dependency !== undefined && selected.config !== undefined
          ? "high"
          : "medium",
    };
  }
  const htmlFiles = files.filter(({ normalizedPath }) =>
    /(^|\/)index\.html?$/i.test(normalizedPath),
  );
  const sourceLike = files.filter(({ normalizedPath }) => {
    const extension = normalizedPath.split(".").at(-1)?.toLowerCase() ?? "";
    return SOURCE_EXTENSIONS.has(extension);
  });
  if (paths.has("index.html") && files.length === 1) {
    state.evidence.push({
      kind: "file-pattern",
      file: "index.html",
      detail: "single HTML",
    });
    return { key: "single-html", version: null, confidence: "high" };
  }
  if (htmlFiles.length > 0 && sourceLike.length === files.length) {
    state.evidence.push({
      kind: "file-pattern",
      file: htmlFiles[0]!.normalizedPath,
      detail: "plain static entry",
    });
    return { key: "plain-static", version: null, confidence: "high" };
  }
  addFinding(
    state,
    "PROJECT_FRAMEWORK_UNSUPPORTED",
    "warning",
    "지원 프레임워크를 확정적으로 감지하지 못했습니다.",
    [],
    "generic static checklist로 서버 기능과 출력 폴더를 직접 확인하세요.",
  );
  return { key: "generic-static", version: null, confidence: "low" };
}

function analyzeBuild(
  framework: ProjectFramework,
  manager: ProjectAnalysisResult["packageManager"],
  packageData: PackageJsonData,
  files: ReadonlyMap<string, ValidatedFile>,
  state: MutableAnalysis,
  policy: PolicyDocument,
): ProjectAnalysisResult["build"] {
  if (framework === "single-html" || framework === "plain-static") {
    return { command: null, outputDirectory: "." };
  }
  const commandPrefix = manager === "unknown" ? "npm" : manager;
  const command =
    packageData.scripts.build === undefined
      ? null
      : commandPrefix === "npm"
        ? "npm run build"
        : `${commandPrefix} build`;
  if (command === null) {
    addFinding(
      state,
      "PROJECT_BUILD_SCRIPT_MISSING",
      "error",
      "package.json에 build script가 없습니다.",
      ["package.json"],
      "정적 출력물을 만드는 build script를 추가하세요.",
    );
  } else {
    state.evidence.push({
      kind: "script",
      file: "package.json",
      detail: "build",
    });
  }
  if (framework === "vite") {
    const config = findConfig(files, "vite.config.");
    analyzeVite(config, state, policy);
    return {
      command,
      outputDirectory: detectViteOutDir(config?.content) ?? "dist",
    };
  }
  if (framework === "nextjs") {
    const config = findConfig(files, "next.config.");
    analyzeNext(config, files, state, policy);
    return { command, outputDirectory: "out" };
  }
  return { command, outputDirectory: null };
}

function findConfig(
  files: ReadonlyMap<string, ValidatedFile>,
  prefix: string,
): ValidatedFile | undefined {
  return [...files.values()].find(({ normalizedPath }) =>
    normalizedPath.startsWith(prefix),
  );
}

function analyzeVite(
  config: ValidatedFile | undefined,
  state: MutableAnalysis,
  policy: PolicyDocument,
): void {
  if (config?.content === undefined) {
    addFinding(
      state,
      "PROJECT_VITE_CONFIG_MISSING",
      "error",
      "Vite build 설정 내용을 확인할 수 없습니다.",
      config === undefined ? [] : [config.normalizedPath],
      "vite.config를 제한된 설정 입력으로 제공하세요.",
    );
    return;
  }
  const content = stripComments(config.content);
  const hasRelativeBase = /\bbase\s*:[^,}\n]{0,160}["']\.\/["']/.test(content);
  const buildOnly =
    /command\s*={2,3}\s*["']build["']|command\s*!={1,2}\s*["']serve["']|isBuild/.test(
      content,
    );
  if (!hasRelativeBase) {
    addPolicyFinding(
      state,
      policy,
      "LD_VITE_ASSET_PREFIX_UNEXPECTED",
      "error",
      [config.normalizedPath],
      'build에서만 `base: "./"`를 적용하세요.',
      "PROJECT_VITE_BASE_MISSING",
    );
  } else if (!buildOnly) {
    addFinding(
      state,
      "PROJECT_VITE_BASE_NOT_BUILD_ONLY",
      "recommendation",
      "Vite relative base가 build 전용인지 확인되지 않습니다.",
      [config.normalizedPath],
      "개발 서버 동작을 유지하도록 command가 build일 때만 relative base를 적용하세요.",
    );
  }
}

function detectViteOutDir(content: string | undefined): string | null {
  if (content === undefined) return null;
  return (
    stripComments(content).match(/\boutDir\s*:\s*["']([^"']+)["']/)?.[1] ?? null
  );
}

function analyzeNext(
  config: ValidatedFile | undefined,
  files: ReadonlyMap<string, ValidatedFile>,
  state: MutableAnalysis,
  policy: PolicyDocument,
): void {
  if (config?.content === undefined) {
    addFinding(
      state,
      "PROJECT_NEXT_CONFIG_MISSING",
      "error",
      "Next.js build 설정 내용을 확인할 수 없습니다.",
      config === undefined ? [] : [config.normalizedPath],
      "next.config를 제한된 설정 입력으로 제공하세요.",
    );
  } else {
    const content = stripComments(config.content);
    const checks: ReadonlyArray<[ProjectAnalysisCode, RegExp, string]> = [
      [
        "PROJECT_NEXT_OUTPUT_EXPORT_MISSING",
        /\boutput\s*:\s*["']export["']/,
        '정적 build에 `output: "export"`를 적용하세요.',
      ],
      [
        "PROJECT_NEXT_ASSET_PREFIX_MISSING",
        /\bassetPrefix\s*:\s*["']\.["']/,
        '정적 build에 `assetPrefix: "."`를 적용하세요.',
      ],
      [
        "PROJECT_NEXT_TRAILING_SLASH_MISSING",
        /\btrailingSlash\s*:\s*true\b/,
        "정적 build에 `trailingSlash: true`를 적용하세요.",
      ],
      [
        "PROJECT_NEXT_IMAGES_UNOPTIMIZED_MISSING",
        /\bunoptimized\s*:\s*true\b/,
        "정적 build에 `images.unoptimized: true`를 적용하세요.",
      ],
    ];
    for (const [code, pattern, recommendation] of checks) {
      if (!pattern.test(content)) {
        addPolicyFinding(
          state,
          policy,
          "LD_NEXT_ASSET_PREFIX_UNEXPECTED",
          "error",
          [config.normalizedPath],
          recommendation,
          code,
        );
      }
    }
    if (/\b(?:redirects|rewrites|headers)\s*\(/.test(content)) {
      addPolicyFinding(
        state,
        policy,
        "LD_NEXT_SERVER_RUNTIME_REQUIRED",
        "blocker",
        [config.normalizedPath],
        "runtime redirect/rewrite/header 의존을 제거하거나 정적 대안을 설계하세요.",
      );
    }
  }
  const allFiles = [...files.values()];
  for (const file of allFiles) {
    const path = file.normalizedPath;
    const content =
      file.content === undefined ? "" : stripComments(file.content);
    if (
      /^(pages\/api\/|app\/api\/|app\/.+\/route\.(?:js|ts)$)/.test(path) ||
      /\bgetServerSideProps\b|["']use server["']|\bcookies\s*\(|\bheaders\s*\(/.test(
        content,
      )
    ) {
      addPolicyFinding(
        state,
        policy,
        "LD_NEXT_SERVER_RUNTIME_REQUIRED",
        "blocker",
        [path],
        "서버 기능을 가짜로 대체하지 말고 정적 데이터 또는 외부 API 설계를 확인하세요.",
      );
    }
    if (
      /\[[^/]+\]/.test(path) &&
      !/\bgenerateStaticParams\b|\bgetStaticPaths\b/.test(content)
    ) {
      addFinding(
        state,
        "PROJECT_NEXT_DYNAMIC_ROUTE_UNRESOLVED",
        "blocker",
        "동적 route의 모든 경로를 build 시점에 생성한다는 근거가 없습니다.",
        [path],
        "generateStaticParams/getStaticPaths로 모든 경로를 열거하거나 정적 route로 바꾸세요.",
      );
    }
    if (/\brevalidate\s*(?:=|:)\s*(?!false\b)/.test(content)) {
      addPolicyFinding(
        state,
        policy,
        "LD_NEXT_SERVER_RUNTIME_REQUIRED",
        "blocker",
        [path],
        "ISR 대신 완전한 정적 생성을 사용하세요.",
      );
    }
  }
}

function analyzeCrossCutting(
  files: readonly ValidatedFile[],
  state: MutableAnalysis,
  policy: PolicyDocument,
): void {
  for (const file of files) {
    if (file.content === undefined) continue;
    const content = stripComments(file.content);
    if (/\bBrowserRouter\b|createBrowserRouter\s*\(/.test(content)) {
      addFinding(
        state,
        "PROJECT_BROWSER_ROUTER_REWRITE_REQUIRED",
        "warning",
        "BrowserRouter가 서버 rewrite에 의존할 수 있습니다.",
        [file.normalizedPath],
        "HashRouter 또는 라운지 하위 경로에서 동작하는 정적 routing을 검토하세요.",
      );
    }
    if (/\bprocess\.env\b|\bimport\.meta\.env\b/.test(content)) {
      addFinding(
        state,
        "PROJECT_RUNTIME_ENV_MIGRATION_REQUIRED",
        "recommendation",
        "build-time 환경변수 참조가 있습니다.",
        [file.normalizedPath],
        `배포본은 ${policy.runtimeEnv.browserObject}의 공개값을 우선 읽는 어댑터를 사용하세요.`,
      );
    }
    if (/https?:\/\//.test(content)) {
      addPolicyFinding(
        state,
        policy,
        "LD_EXTERNAL_ORIGIN_REVIEW_REQUIRED",
        "warning",
        [file.normalizedPath],
        "외부 API/CDN의 CORS와 라운지 CSP 허용 여부를 실제 플레이 경로에서 확인하세요.",
      );
    }
    if (
      /(?:src|href)\s*=\s*["']\/(?!\/)|url\(\s*["']?\/(?!\/)|fetch\(\s*["']\/(?!\/)/.test(
        content,
      )
    ) {
      addPolicyFinding(
        state,
        policy,
        policy.assetPaths.disallowRootAbsolute.code,
        "warning",
        [file.normalizedPath],
        "로컬 자산이면 `./` 상대 경로로 바꾸고, 의도된 라운지 API면 사유를 확인하세요.",
      );
    }
  }
}

function createChecklist(
  framework: ProjectFramework,
  policy: PolicyDocument,
): readonly ProjectChecklistItem[] {
  const common: ProjectChecklistItem[] = [
    {
      id: "fetch-policy-before-work",
      required: true,
      text: "작업 시작 전에 활성 정책을 조회하고 version을 기록한다.",
    },
    {
      id: "build-output-only",
      required: true,
      text: "소스 트리가 아니라 정적 출력물 내용만 패키징한다.",
    },
    {
      id: "root-index",
      required: true,
      text: "정규화된 ZIP 루트에 index.html이 있는지 확인한다.",
    },
    {
      id: "runtime-env",
      required: true,
      text: `${policy.runtimeEnv.attachmentFilename ?? ".env"}는 ZIP과 분리하고 공개값은 ${policy.runtimeEnv.browserObject}에서 읽는다.`,
    },
    {
      id: "validate-final-policy",
      required: true,
      text: "ZIP 직전에 정책을 다시 조회하고 최종 활성 version으로 검증한다.",
    },
  ];
  if (framework === "vite") {
    common.splice(2, 0, {
      id: "vite-relative-base",
      required: true,
      text: "Vite build에서만 relative base를 사용하고 실제 출력 폴더를 확인한다.",
    });
  }
  if (framework === "nextjs") {
    common.splice(2, 0, {
      id: "next-static-export",
      required: true,
      text: "Next.js static export 설정과 서버 기능 부재를 확인한다.",
    });
  }
  if (framework === "generic-static") {
    common.splice(2, 0, {
      id: "generic-static-runtime",
      required: true,
      text: "서버 런타임 없이 모든 기능이 정적 파일만으로 동작하는지 확인한다.",
    });
  }
  return common;
}

function addPolicyFinding(
  state: MutableAnalysis,
  policy: PolicyDocument,
  policyCode: string,
  severity: ProjectFindingSeverity,
  files: readonly string[],
  recommendation: string,
  fallbackCode?: ProjectAnalysisCode,
): void {
  const check = policy.checks.find(({ code }) => code === policyCode);
  if (check === undefined) {
    addFinding(
      state,
      fallbackCode ?? "PROJECT_FRAMEWORK_UNSUPPORTED",
      severity,
      "현재 정책에 필요한 검사 코드가 없습니다.",
      files,
      recommendation,
    );
    return;
  }
  state.findings.push({
    code: fallbackCode ?? check.code,
    ...(fallbackCode === undefined ? {} : { policyCode: check.code }),
    severity,
    message: policyMessage(check),
    files: [...files].sort(),
    recommendation,
  });
}

function policyMessage(check: PolicyCheck): string {
  return checkMessageKo(check.titleKey) ?? "정책 검사가 실패했습니다.";
}

function addInputFinding(
  state: MutableAnalysis,
  code: ProjectAnalysisCode,
  message: string,
): void {
  addFinding(
    state,
    code,
    "error",
    message,
    [],
    "허용된 metadata만 제한 안에서 다시 제공하세요.",
  );
}

function addFinding(
  state: MutableAnalysis,
  code: string,
  severity: ProjectFindingSeverity,
  message: string,
  files: readonly string[],
  recommendation: string,
): void {
  state.findings.push({
    code,
    severity,
    message,
    files: [...files].sort(),
    recommendation,
  });
}

function stableFindings(findings: readonly ProjectFinding[]): ProjectFinding[] {
  const severityOrder: Readonly<Record<ProjectFindingSeverity, number>> = {
    blocker: 0,
    error: 1,
    warning: 2,
    recommendation: 3,
  };
  return [...findings].sort(
    (left, right) =>
      severityOrder[left.severity] - severityOrder[right.severity] ||
      left.code.localeCompare(right.code, "en") ||
      JSON.stringify(left.files).localeCompare(
        JSON.stringify(right.files),
        "en",
      ),
  );
}

function stableEvidence(
  evidence: readonly ProjectEvidence[],
): ProjectEvidence[] {
  return [...evidence].sort(
    (left, right) =>
      left.kind.localeCompare(right.kind, "en") ||
      left.file.localeCompare(right.file, "en") ||
      left.detail.localeCompare(right.detail, "en"),
  );
}

function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|\s)\/\/.*$/gm, "$1");
}
