/**
 * 이 파일은 scripts/generate.ts가 schema/*.json에서 생성했다.
 * 직접 수정하지 말고 schema를 고친 뒤 다시 생성한다.
 */
import type { SchemaObject } from "ajv";

export const policyIdSchema: SchemaObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.letscoding.kr/agent-platform/shared/policy-id.schema.json",
  title: "PolicyId",
  description: "정책 식별자. policies/<id>/ 디렉터리 이름과 반드시 일치한다.",
  type: "string",
  pattern: "^[a-z][a-z0-9-]{2,31}$",
};
export const policyVersionSchema: SchemaObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.letscoding.kr/agent-platform/shared/policy-version.schema.json",
  title: "PolicyVersion",
  description:
    "발행일과 그날의 발행 순번으로 이루어진 불변 버전. 예: 2026-08-12.3. 이 pattern은 달력에 존재하지 않는 날짜를 거르지 못하므로 파서가 추가로 검사한다.",
  type: "string",
  pattern:
    "^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])\\.([1-9][0-9]*)$",
};
export const policyCheckCodeSchema: SchemaObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
  title: "PolicyCheckCode",
  description:
    "사용자 작품 판정에 사용하는 안정적 오류 코드. 한번 발행한 코드는 재사용·개명·의미 변경을 하지 않는다.",
  type: "string",
  pattern: "^LD_[A-Z0-9]+(_[A-Z0-9]+)*$",
  maxLength: 48,
};
export const policyDocumentSchema: SchemaObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.letscoding.kr/agent-platform/policy-document.schema.json",
  title: "PolicyDocument",
  description:
    "발행된 Lounge Deploy 정책 스냅샷 하나의 계약. 발행 후에는 수정하지 않는다.",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "id",
    "version",
    "effectiveAt",
    "changeReason",
    "zip",
    "files",
    "assetPaths",
    "runtimeEnv",
    "frameworks",
    "checks",
    "guide",
  ],
  properties: {
    schemaVersion: {
      description: "정책 계약의 major 버전. 비호환 변경에서만 올린다.",
      const: 1,
    },
    id: {
      $ref: "https://schemas.letscoding.kr/agent-platform/shared/policy-id.schema.json",
    },
    version: {
      $ref: "https://schemas.letscoding.kr/agent-platform/shared/policy-version.schema.json",
    },
    effectiveAt: {
      description:
        "정책 시행 시각(UTC). 버전 문자열의 날짜는 발행일 표기이며 시행 시각이 아니다.",
      type: "string",
      format: "date-time",
    },
    changeReason: {
      description: "감사 기록에 남는 변경 사유.",
      type: "string",
      minLength: 1,
      maxLength: 500,
    },
    governance: {
      title: "PolicyGovernance",
      description: "정책 발행의 책임자와 승인 기록.",
      type: "object",
      additionalProperties: false,
      required: ["owner", "approver", "publishedAt"],
      properties: {
        owner: {
          type: "string",
          pattern: "^@[A-Za-z0-9][A-Za-z0-9-]{0,38}$",
        },
        approver: {
          type: "string",
          pattern: "^@[A-Za-z0-9][A-Za-z0-9-]{0,38}$",
        },
        publishedAt: {
          type: "string",
          format: "date-time",
        },
      },
    },
    source: {
      title: "PolicySourceProvenance",
      description: "정책을 이관한 원본 저장소, 기준 commit과 파일별 digest.",
      type: "object",
      additionalProperties: false,
      required: ["repository", "commit", "synchronizedAt", "files"],
      properties: {
        repository: {
          type: "string",
          format: "uri",
        },
        commit: {
          type: "string",
          pattern: "^[a-f0-9]{40}$",
        },
        synchronizedAt: {
          type: "string",
          format: "date-time",
        },
        files: {
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: {
            title: "PolicySourceFile",
            type: "object",
            additionalProperties: false,
            required: ["path", "sha256"],
            properties: {
              path: {
                type: "string",
                minLength: 1,
              },
              sha256: {
                type: "string",
                pattern: "^[a-f0-9]{64}$",
              },
            },
          },
        },
      },
    },
    zip: {
      title: "PolicyZipLimits",
      description: "제출 ZIP의 크기와 구조 제한.",
      type: "object",
      additionalProperties: false,
      required: [
        "maxCompressedBytes",
        "maxUncompressedBytes",
        "maxFiles",
        "requireRootIndexHtml",
        "codes",
      ],
      properties: {
        maxCompressedBytes: {
          type: "integer",
          minimum: 1,
        },
        maxUncompressedBytes: {
          type: "integer",
          minimum: 1,
        },
        maxEntries: {
          type: "integer",
          minimum: 1,
        },
        maxFiles: {
          type: "integer",
          minimum: 1,
        },
        maxPathLength: {
          type: "integer",
          minimum: 1,
        },
        requireForwardSlashes: {
          type: "boolean",
        },
        requireRootIndexHtml: {
          description: "ZIP 최상위에 index.html이 있어야 하는지 여부.",
          type: "boolean",
        },
        allowSingleWrapperDirectory: {
          description:
            "단일 wrapper 폴더를 제거한 뒤의 루트를 허용하는지 여부.",
          type: "boolean",
        },
        allowZip64: {
          type: "boolean",
        },
        allowMultiDisk: {
          type: "boolean",
        },
        codes: {
          title: "PolicyZipCodes",
          type: "object",
          additionalProperties: false,
          required: [
            "compressedTooLarge",
            "uncompressedTooLarge",
            "tooManyFiles",
            "missingRootIndexHtml",
          ],
          properties: {
            compressedTooLarge: {
              $ref: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
            },
            uncompressedTooLarge: {
              $ref: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
            },
            tooManyFiles: {
              $ref: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
            },
            missingRootIndexHtml: {
              $ref: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
            },
            invalidFormat: {
              $ref: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
            },
            tooManyEntries: {
              $ref: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
            },
            pathTooLong: {
              $ref: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
            },
            mixedWrapperRoots: {
              $ref: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
            },
            invalidEntrySize: {
              $ref: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
            },
          },
        },
      },
    },
    files: {
      title: "PolicyFileRules",
      description: "확장자, 파일명, 경로 형태 규칙.",
      type: "object",
      additionalProperties: false,
      required: [
        "allowedExtensions",
        "blockedFilenames",
        "blockedPathRules",
        "codes",
      ],
      properties: {
        codes: {
          title: "PolicyFileCodes",
          type: "object",
          additionalProperties: false,
          required: ["extensionNotAllowed"],
          properties: {
            extensionNotAllowed: {
              $ref: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
            },
          },
        },
        allowedExtensions: {
          description: "허용 확장자 allowlist. 소문자 비교를 전제한다.",
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: {
            type: "string",
            pattern: "^\\.[a-z0-9]+(\\.[a-z0-9]+)*$",
          },
        },
        blockedFilenames: {
          description: "차단 파일명. 정규식 대신 고정된 비교 방식만 사용한다.",
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: {
            title: "PolicyBlockedFilename",
            type: "object",
            additionalProperties: false,
            required: ["match", "value", "code"],
            properties: {
              match: {
                description: "value를 파일명과 비교하는 방식.",
                enum: ["exact", "prefix", "suffix"],
              },
              scope: {
                description:
                  "basename만 비교할지 경로의 모든 세그먼트를 비교할지 지정한다. 생략 시 basename이다.",
                enum: ["basename", "path-segment"],
              },
              caseSensitive: {
                description: "대소문자를 구분하는지 여부. 생략 시 false다.",
                type: "boolean",
              },
              value: {
                type: "string",
                minLength: 1,
              },
              code: {
                $ref: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
              },
            },
          },
        },
        blockedPathRules: {
          description:
            "차단 경로 규칙. 정책은 규칙 종류만 선언하고 해석은 검증기 코드가 담당한다.",
          type: "array",
          minItems: 1,
          uniqueItems: true,
          items: {
            title: "PolicyBlockedPathRule",
            type: "object",
            additionalProperties: false,
            required: ["kind", "code"],
            properties: {
              kind: {
                enum: [
                  "absolute-path",
                  "parent-traversal",
                  "backslash-separator",
                  "control-character",
                  "url-reinterpret",
                  "non-normalized",
                ],
              },
              code: {
                $ref: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
              },
            },
          },
        },
      },
    },
    assetPaths: {
      title: "PolicyAssetPathRules",
      description: "빌드 산출물의 정적 자산 경로 규칙.",
      type: "object",
      additionalProperties: false,
      required: ["disallowRootAbsolute"],
      properties: {
        disallowRootAbsolute: {
          title: "PolicyRootAbsoluteAssetRule",
          description: "HTML/CSS/JS에 남은 루트 절대 자산 경로 처리 규칙.",
          type: "object",
          additionalProperties: false,
          required: ["enabled", "code"],
          properties: {
            enabled: {
              type: "boolean",
            },
            code: {
              $ref: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
            },
          },
        },
      },
    },
    runtimeEnv: {
      title: "PolicyRuntimeEnvRule",
      description:
        "공개 런타임 값 전달 규칙. 차단 자체는 files.blockedFilenames가 담당한다.",
      type: "object",
      additionalProperties: false,
      required: [
        "attachSeparately",
        "browserObject",
        "forbidBundledSecrets",
        "guideAnchor",
      ],
      properties: {
        attachSeparately: {
          description: ".env를 ZIP에 넣지 않고 별도로 첨부하는지 여부.",
          type: "boolean",
        },
        browserObject: {
          type: "string",
          pattern: "^window\\.[A-Za-z_$][A-Za-z0-9_$]*$",
        },
        attachmentFilename: {
          description: "등록 화면에서 별도로 첨부하는 파일명.",
          type: "string",
          minLength: 1,
        },
        maxBytes: {
          type: "integer",
          minimum: 1,
        },
        maxKeys: {
          type: "integer",
          minimum: 1,
        },
        keyPattern: {
          type: "string",
          minLength: 1,
        },
        reservedGeneratedFilename: {
          type: "string",
          minLength: 1,
        },
        forbidBundledSecrets: {
          type: "boolean",
        },
        guideAnchor: {
          type: "string",
          pattern: "^[a-z0-9]+(-[a-z0-9]+)*$",
        },
      },
    },
    frameworks: {
      description: "지원 프레임워크별 감지 힌트와 추가 검사.",
      type: "array",
      minItems: 1,
      items: {
        title: "PolicyFramework",
        type: "object",
        additionalProperties: false,
        required: [
          "key",
          "detect",
          "expectedAssetPrefix",
          "guideAnchor",
          "checks",
        ],
        properties: {
          key: {
            enum: ["nextjs", "vite", "plain-html"],
          },
          detect: {
            title: "PolicyFrameworkDetection",
            description:
              "감지 입력 데이터. 감지 알고리즘 자체는 이 계약의 범위가 아니다.",
            type: "object",
            additionalProperties: false,
            required: ["configFiles", "dependencies"],
            properties: {
              configFiles: {
                type: "array",
                uniqueItems: true,
                items: {
                  type: "string",
                  minLength: 1,
                },
              },
              dependencies: {
                type: "array",
                uniqueItems: true,
                items: {
                  type: "string",
                  minLength: 1,
                },
              },
            },
          },
          expectedAssetPrefix: {
            description: "정적 자산의 기대 상대 경로 접두사. 해당 없으면 null.",
            type: ["string", "null"],
            pattern: "^\\./",
          },
          artifactKinds: {
            description:
              "이 프레임워크에서 1차 에이전트가 만들 수 있는 업로드 산출물.",
            type: "array",
            minItems: 1,
            uniqueItems: true,
            items: {
              enum: ["single-html", "zip"],
            },
          },
          guideAnchor: {
            type: "string",
            pattern: "^[a-z0-9]+(-[a-z0-9]+)*$",
          },
          checks: {
            description:
              "이 프레임워크에서 추가로 적용하는 checks[].code 참조.",
            type: "array",
            uniqueItems: true,
            items: {
              $ref: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
            },
          },
        },
      },
    },
    checks: {
      description:
        "오류 코드 카탈로그. 다른 절의 code 값은 모두 여기에 존재해야 한다.",
      type: "array",
      minItems: 1,
      items: {
        title: "PolicyCheck",
        type: "object",
        additionalProperties: false,
        required: [
          "code",
          "severity",
          "waivable",
          "appliesTo",
          "titleKey",
          "guideAnchor",
        ],
        properties: {
          code: {
            $ref: "https://schemas.letscoding.kr/agent-platform/shared/error-code.schema.json",
          },
          severity: {
            enum: ["error", "warning"],
          },
          waivable: {
            description:
              "사용자가 사유를 확인한 뒤 해제할 수 있는지 여부. severity가 error면 false여야 한다.",
            type: "boolean",
          },
          appliesTo: {
            enum: ["zip", "output-dir", "project"],
          },
          titleKey: {
            description:
              "표시 문구 자원의 키. 사람이 읽는 문장은 정책에 넣지 않는다.",
            type: "string",
            pattern: "^[a-z][a-zA-Z0-9]*(\\.[a-z][a-zA-Z0-9]*)+$",
          },
          guideAnchor: {
            type: "string",
            pattern: "^[a-z0-9]+(-[a-z0-9]+)*$",
          },
        },
        if: {
          properties: {
            severity: {
              const: "error",
            },
          },
          required: ["severity"],
        },
        then: {
          properties: {
            waivable: {
              const: false,
            },
          },
        },
      },
    },
    guide: {
      title: "PolicyGuideReference",
      description: "같은 버전으로 발행한 사람용 Markdown 가이드 참조.",
      type: "object",
      additionalProperties: false,
      required: ["path", "sha256"],
      properties: {
        path: {
          type: "string",
          pattern: "^history/[^/]+\\.md$",
        },
        sha256: {
          type: "string",
          pattern: "^[a-f0-9]{64}$",
        },
      },
    },
  },
};
export const currentPointerSchema: SchemaObject = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://schemas.letscoding.kr/agent-platform/current-pointer.schema.json",
  title: "CurrentPointer",
  description:
    "활성 정책 스냅샷을 가리키는 포인터. 정책 규칙 값을 복제하지 않고, 스냅샷 경로는 history/<version>.json 규약으로 파생한다.",
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "policyId", "version", "activatedAt"],
  properties: {
    schemaVersion: {
      const: 1,
    },
    policyId: {
      $ref: "https://schemas.letscoding.kr/agent-platform/shared/policy-id.schema.json",
    },
    version: {
      $ref: "https://schemas.letscoding.kr/agent-platform/shared/policy-version.schema.json",
    },
    activatedAt: {
      description: "이 버전을 활성화한 시각(UTC).",
      type: "string",
      format: "date-time",
    },
  },
};

/** Ajv 인스턴스에 등록할 전체 schema. 참조 대상이 먼저 온다. */
export const allPolicyContractSchemas: readonly SchemaObject[] = [
  policyIdSchema,
  policyVersionSchema,
  policyCheckCodeSchema,
  policyDocumentSchema,
  currentPointerSchema,
];
