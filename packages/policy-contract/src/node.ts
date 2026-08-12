/**
 * Node.js 파일 시스템용 {@link PolicySource} 구현.
 *
 * 핵심 계약 모듈은 `node:fs`에 의존하지 않는다. 파일 시스템에서 정책을 읽는
 * 쪽만 이 진입점을 사용한다.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PolicySource } from "./bundle.js";

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * `policies/<id>/` 디렉터리를 읽는 source를 만든다.
 *
 * @param policyDirectory 정책 디렉터리의 절대 또는 상대 경로.
 */
export function createFileSystemPolicySource(
  policyDirectory: string,
): PolicySource {
  return {
    async readText(relativePath: string): Promise<string | null> {
      const absolutePath = join(policyDirectory, ...relativePath.split("/"));
      try {
        return await readFile(absolutePath, "utf8");
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }
    },
  };
}
