import { constants as fsConstants, type Stats } from "node:fs";
import { lstat, open, readdir, realpath, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative, resolve, sep } from "node:path";
import { createInflateRaw } from "node:zlib";

import {
  validateArtifact,
  type ArtifactKind,
  type ArtifactManifest,
  type ArtifactManifestFile,
  type ArtifactValidationPolicy,
  type ArtifactValidationResult,
  type WarningWaiver,
} from "./index.js";

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const LOCAL_FILE_HEADER_SIGNATURE = 0x04034b50;
const EOCD_MIN_BYTES = 22;
const MAX_ZIP_COMMENT_BYTES = 0xffff;
const MAX_ENTRY_NAME_BYTES = 4096;
const MAX_ENTRY_METADATA_BYTES = 1024 * 1024;
const GENERAL_PURPOSE_ENCRYPTED = 0x0001;
const GENERAL_PURPOSE_DATA_DESCRIPTOR = 0x0008;
const GENERAL_PURPOSE_UTF8 = 0x0800;
const GENERAL_PURPOSE_STRONG_ENCRYPTION = 0x0040;

export const ARTIFACT_INSPECTION_CODES = [
  "ARTIFACT_INPUT_NOT_FOUND",
  "ARTIFACT_INPUT_TYPE_INVALID",
  "ARTIFACT_INPUT_CHANGED",
  "ARTIFACT_DIRECTORY_SYMLINK",
  "ARTIFACT_DIRECTORY_SPECIAL_FILE",
  "ARTIFACT_DIRECTORY_OUTSIDE_ROOT",
  "ZIP_EOCD_MISSING",
  "ZIP_EOCD_INVALID",
  "ZIP_MULTIDISK_UNSUPPORTED",
  "ZIP64_UNSUPPORTED",
  "ZIP_CENTRAL_DIRECTORY_INVALID",
  "ZIP_ENTRY_LIMIT_EXCEEDED",
  "ZIP_ENTRY_METADATA_TOO_LARGE",
  "ZIP_FILENAME_ENCODING_UNSUPPORTED",
  "ZIP_ENCRYPTION_UNSUPPORTED",
  "ZIP_COMPRESSION_UNSUPPORTED",
  "ZIP_LOCAL_HEADER_INVALID",
  "ZIP_ENTRY_NAME_MISMATCH",
  "ZIP_ENTRY_SIZE_MISMATCH",
  "ZIP_CRC_MISMATCH",
  "ZIP_INFLATE_LIMIT_EXCEEDED",
  "ZIP_CORRUPT_DATA",
] as const;

export type ArtifactInspectionCode = (typeof ARTIFACT_INSPECTION_CODES)[number];

export interface ArtifactInspectionFinding {
  readonly code: ArtifactInspectionCode;
  readonly message: string;
  /** Entry index is safe to return; the potentially sensitive path is not. */
  readonly entryIndex?: number;
  /** Central policy rule corresponding to the low-level parser failure. */
  readonly policyRule?: {
    readonly code: string;
    readonly severity: "error" | "warning";
    readonly message: string;
  };
}

export interface ArtifactMetadata {
  readonly kind: ArtifactKind;
  readonly sourceSha256: string | null;
  readonly compressedBytes: number | null;
  readonly uncompressedBytes: number | null;
  readonly fileCount: number;
  readonly artifactSha256: string | null;
}

export interface ArtifactInspectionResult {
  readonly pass: boolean;
  readonly policy: { readonly id: string; readonly version: string };
  readonly manifest: ArtifactManifest | null;
  readonly metadata: ArtifactMetadata;
  readonly inspectionErrors: readonly ArtifactInspectionFinding[];
  readonly validation: ArtifactValidationResult | null;
}

export interface InspectArtifactOptions {
  readonly kind: ArtifactKind;
  readonly inputPath: string;
  readonly policy: ArtifactValidationPolicy;
  readonly warningWaivers?: readonly WarningWaiver[];
}

interface ZipDirectoryEntry {
  readonly name: string;
  readonly nameBytes: Buffer;
  readonly flags: number;
  readonly method: number;
  readonly crc32: number;
  readonly compressedBytes: number;
  readonly uncompressedBytes: number;
  readonly localHeaderOffset: number;
  readonly directory: boolean;
}

interface ZipDirectory {
  readonly entries: readonly ZipDirectoryEntry[];
  readonly fileSize: number;
}

interface HashedEntry {
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly crc32: number;
}

export async function inspectArtifact(
  options: InspectArtifactOptions,
): Promise<ArtifactInspectionResult> {
  try {
    return options.kind === "zip"
      ? await inspectZip(options)
      : await inspectDirectory(options);
  } catch (error) {
    if (error instanceof InspectionError) {
      return inspectionFailure(options, error.findings, error.metadata);
    }
    throw error;
  }
}

async function inspectZip(
  options: InspectArtifactOptions,
): Promise<ArtifactInspectionResult> {
  const absolutePath = resolve(options.inputPath);
  const inputStat = await safeStat(absolutePath);
  if (inputStat === null) {
    throw inspectionError("ARTIFACT_INPUT_NOT_FOUND");
  }
  if (!inputStat.isFile()) {
    throw inspectionError("ARTIFACT_INPUT_TYPE_INVALID");
  }

  const compressedBytes = inputStat.size;
  if (compressedBytes > options.policy.limits.maxCompressedBytes) {
    const manifest: ArtifactManifest = {
      kind: "zip",
      compressedBytes,
      files: [],
    };
    return validatedResult(options, manifest, null, null);
  }

  const handle = await open(absolutePath, "r");
  try {
    const directory = await readZipDirectory(
      handle,
      compressedBytes,
      options.policy.limits.maxEntries ?? options.policy.limits.maxFiles,
    );
    let actualTotal = 0;
    let declaredTotal = 0;
    const files: ArtifactManifestFile[] = [];

    for (const [entryIndex, entry] of directory.entries.entries()) {
      if (entry.directory) continue;
      declaredTotal = safeAdd(declaredTotal, entry.uncompressedBytes);
      if (declaredTotal > options.policy.limits.maxUncompressedBytes) {
        throw inspectionError("ZIP_INFLATE_LIMIT_EXCEEDED", entryIndex, {
          kind: "zip",
          compressedBytes,
          uncompressedBytes: declaredTotal,
          fileCount: files.length,
        });
      }
      const remaining =
        options.policy.limits.maxUncompressedBytes - actualTotal;
      const hashed = await hashZipEntry(
        handle,
        directory.fileSize,
        entry,
        entryIndex,
        remaining,
      );
      actualTotal = safeAdd(actualTotal, hashed.sizeBytes);
      files.push({
        path: entry.name,
        sizeBytes: hashed.sizeBytes,
        sha256: hashed.sha256,
      });
    }

    const sourceSha256 = await hashOpenFile(handle);
    const afterStat = await handle.stat();
    if (!sameFileSnapshot(inputStat, afterStat)) {
      throw inspectionError("ARTIFACT_INPUT_CHANGED");
    }
    const manifest: ArtifactManifest = {
      kind: "zip",
      compressedBytes,
      files,
    };
    return validatedResult(options, manifest, sourceSha256, actualTotal);
  } finally {
    await handle.close();
  }
}

async function inspectDirectory(
  options: InspectArtifactOptions,
): Promise<ArtifactInspectionResult> {
  const absoluteRoot = resolve(options.inputPath);
  const rootStat = await safeStat(absoluteRoot);
  if (rootStat === null) {
    throw inspectionError("ARTIFACT_INPUT_NOT_FOUND");
  }
  if (!rootStat.isDirectory()) {
    throw inspectionError("ARTIFACT_INPUT_TYPE_INVALID");
  }
  const canonicalRoot = await realpath(absoluteRoot);
  const candidates = await collectDirectoryFiles(
    absoluteRoot,
    canonicalRoot,
    options.policy.limits.maxFiles,
  );
  const files: ArtifactManifestFile[] = [];
  let total = 0;

  for (const candidate of candidates) {
    total = safeAdd(total, candidate.size);
    if (total > options.policy.limits.maxUncompressedBytes) {
      throw inspectionError("ZIP_INFLATE_LIMIT_EXCEEDED", candidate.index, {
        kind: "directory",
        compressedBytes: null,
        uncompressedBytes: total,
        fileCount: files.length,
      });
    }
    const digest = await hashDirectoryFile(candidate.absolutePath, candidate);
    files.push({
      path: candidate.relativePath,
      sizeBytes: candidate.size,
      sha256: digest,
    });
  }

  const manifest: ArtifactManifest = { kind: "directory", files };
  return validatedResult(options, manifest, null, total);
}

interface DirectoryCandidate {
  readonly index: number;
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly size: number;
  readonly dev: number;
  readonly ino: number;
}

async function collectDirectoryFiles(
  root: string,
  canonicalRoot: string,
  maxFiles: number,
): Promise<readonly DirectoryCandidate[]> {
  const files: DirectoryCandidate[] = [];

  async function visit(directory: string): Promise<void> {
    const entries = (await readdir(directory, { withFileTypes: true })).sort(
      (left, right) => left.name.localeCompare(right.name, "en"),
    );
    for (const entry of entries) {
      const absolutePath = join(directory, entry.name);
      const entryStat = await lstat(absolutePath);
      if (entryStat.isSymbolicLink()) {
        throw inspectionError("ARTIFACT_DIRECTORY_SYMLINK", files.length);
      }
      if (entryStat.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entryStat.isFile()) {
        throw inspectionError("ARTIFACT_DIRECTORY_SPECIAL_FILE", files.length);
      }
      const canonical = await realpath(absolutePath);
      if (!isInside(canonicalRoot, canonical)) {
        throw inspectionError("ARTIFACT_DIRECTORY_OUTSIDE_ROOT", files.length);
      }
      const fileStat = await stat(absolutePath);
      files.push({
        index: files.length,
        absolutePath,
        relativePath: relative(root, absolutePath).split(sep).join("/"),
        size: fileStat.size,
        dev: fileStat.dev,
        ino: fileStat.ino,
      });
      if (files.length > maxFiles) {
        throw inspectionError("ZIP_ENTRY_LIMIT_EXCEEDED", files.length - 1, {
          kind: "directory",
          compressedBytes: null,
          uncompressedBytes: null,
          fileCount: files.length,
        });
      }
    }
  }

  await visit(root);
  return files;
}

async function hashDirectoryFile(
  path: string,
  snapshot: DirectoryCandidate,
): Promise<string> {
  const noFollow = process.platform === "win32" ? 0 : fsConstants.O_NOFOLLOW;
  const handle = await open(path, fsConstants.O_RDONLY | noFollow);
  try {
    const current = await handle.stat();
    if (
      !current.isFile() ||
      current.size !== snapshot.size ||
      current.dev !== snapshot.dev ||
      current.ino !== snapshot.ino
    ) {
      throw inspectionError("ARTIFACT_INPUT_CHANGED", snapshot.index);
    }
    const hash = createHash("sha256");
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      hash.update(chunk);
    }
    const after = await handle.stat();
    if (!sameFileSnapshot(current, after)) {
      throw inspectionError("ARTIFACT_INPUT_CHANGED", snapshot.index);
    }
    return hash.digest("hex");
  } finally {
    await handle.close();
  }
}

async function readZipDirectory(
  handle: Awaited<ReturnType<typeof open>>,
  fileSize: number,
  maxFiles: number,
): Promise<ZipDirectory> {
  const tailLength = Math.min(fileSize, EOCD_MIN_BYTES + MAX_ZIP_COMMENT_BYTES);
  if (tailLength < EOCD_MIN_BYTES) throw inspectionError("ZIP_EOCD_MISSING");
  const tail = Buffer.allocUnsafe(tailLength);
  await readExactly(handle, tail, fileSize - tailLength);
  const eocdOffsetInTail = findEocd(tail);
  if (eocdOffsetInTail < 0) throw inspectionError("ZIP_EOCD_MISSING");
  const eocdOffset = fileSize - tailLength + eocdOffsetInTail;
  const commentLength = tail.readUInt16LE(eocdOffsetInTail + 20);
  if (eocdOffset + EOCD_MIN_BYTES + commentLength !== fileSize) {
    throw inspectionError("ZIP_EOCD_INVALID");
  }

  const diskNumber = tail.readUInt16LE(eocdOffsetInTail + 4);
  const centralDisk = tail.readUInt16LE(eocdOffsetInTail + 6);
  const entriesOnDisk = tail.readUInt16LE(eocdOffsetInTail + 8);
  const totalEntries = tail.readUInt16LE(eocdOffsetInTail + 10);
  const centralBytes = tail.readUInt32LE(eocdOffsetInTail + 12);
  const centralOffset = tail.readUInt32LE(eocdOffsetInTail + 16);

  if (
    entriesOnDisk === 0xffff ||
    totalEntries === 0xffff ||
    centralBytes === 0xffffffff ||
    centralOffset === 0xffffffff
  ) {
    throw inspectionError("ZIP64_UNSUPPORTED");
  }
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw inspectionError("ZIP_MULTIDISK_UNSUPPORTED");
  }
  if (totalEntries > maxFiles) {
    throw inspectionError("ZIP_ENTRY_LIMIT_EXCEEDED", undefined, {
      kind: "zip",
      compressedBytes: fileSize,
      uncompressedBytes: null,
      fileCount: totalEntries,
    });
  }
  if (
    centralOffset > eocdOffset ||
    centralBytes > eocdOffset - centralOffset ||
    centralOffset + centralBytes !== eocdOffset
  ) {
    throw inspectionError("ZIP_CENTRAL_DIRECTORY_INVALID");
  }

  const entries: ZipDirectoryEntry[] = [];
  let offset = centralOffset;
  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    const fixed = Buffer.allocUnsafe(46);
    await readExactly(handle, fixed, offset);
    if (fixed.readUInt32LE(0) !== CENTRAL_DIRECTORY_SIGNATURE) {
      throw inspectionError("ZIP_CENTRAL_DIRECTORY_INVALID", entryIndex);
    }
    const flags = fixed.readUInt16LE(8);
    const method = fixed.readUInt16LE(10);
    const crc = fixed.readUInt32LE(16);
    const compressedBytes = fixed.readUInt32LE(20);
    const uncompressedBytes = fixed.readUInt32LE(24);
    const nameLength = fixed.readUInt16LE(28);
    const extraLength = fixed.readUInt16LE(30);
    const entryCommentLength = fixed.readUInt16LE(32);
    const diskStart = fixed.readUInt16LE(34);
    const localHeaderOffset = fixed.readUInt32LE(42);
    const variableLength = nameLength + extraLength + entryCommentLength;

    if (
      compressedBytes === 0xffffffff ||
      uncompressedBytes === 0xffffffff ||
      localHeaderOffset === 0xffffffff ||
      diskStart === 0xffff
    ) {
      throw inspectionError("ZIP64_UNSUPPORTED", entryIndex);
    }
    if (diskStart !== 0) {
      throw inspectionError("ZIP_MULTIDISK_UNSUPPORTED", entryIndex);
    }
    if (nameLength === 0 || nameLength > MAX_ENTRY_NAME_BYTES) {
      throw inspectionError("ZIP_ENTRY_METADATA_TOO_LARGE", entryIndex);
    }
    if (variableLength > MAX_ENTRY_METADATA_BYTES) {
      throw inspectionError("ZIP_ENTRY_METADATA_TOO_LARGE", entryIndex);
    }
    if (offset + 46 + variableLength > centralOffset + centralBytes) {
      throw inspectionError("ZIP_CENTRAL_DIRECTORY_INVALID", entryIndex);
    }
    const nameBytes = Buffer.allocUnsafe(nameLength);
    await readExactly(handle, nameBytes, offset + 46);
    const name = decodeEntryName(nameBytes, flags, entryIndex);
    validateEntryFlagsAndMethod(flags, method, entryIndex);
    entries.push({
      name,
      nameBytes,
      flags,
      method,
      crc32: crc,
      compressedBytes,
      uncompressedBytes,
      localHeaderOffset,
      directory: name.endsWith("/"),
    });
    offset += 46 + variableLength;
  }
  if (offset !== centralOffset + centralBytes) {
    throw inspectionError("ZIP_CENTRAL_DIRECTORY_INVALID");
  }
  return { entries, fileSize };
}

async function hashZipEntry(
  handle: Awaited<ReturnType<typeof open>>,
  fileSize: number,
  entry: ZipDirectoryEntry,
  entryIndex: number,
  maxOutputBytes: number,
): Promise<HashedEntry> {
  const header = Buffer.allocUnsafe(30);
  await readExactly(handle, header, entry.localHeaderOffset);
  if (header.readUInt32LE(0) !== LOCAL_FILE_HEADER_SIGNATURE) {
    throw inspectionError("ZIP_LOCAL_HEADER_INVALID", entryIndex);
  }
  const localFlags = header.readUInt16LE(6);
  const localMethod = header.readUInt16LE(8);
  const localNameLength = header.readUInt16LE(26);
  const localExtraLength = header.readUInt16LE(28);
  if (localFlags !== entry.flags || localMethod !== entry.method) {
    throw inspectionError("ZIP_LOCAL_HEADER_INVALID", entryIndex);
  }
  if (localNameLength > MAX_ENTRY_NAME_BYTES) {
    throw inspectionError("ZIP_ENTRY_METADATA_TOO_LARGE", entryIndex);
  }
  const localName = Buffer.allocUnsafe(localNameLength);
  await readExactly(handle, localName, entry.localHeaderOffset + 30);
  if (!localName.equals(entry.nameBytes)) {
    throw inspectionError("ZIP_ENTRY_NAME_MISMATCH", entryIndex);
  }
  const dataStart =
    entry.localHeaderOffset + 30 + localNameLength + localExtraLength;
  const dataEnd = dataStart + entry.compressedBytes;
  if (dataStart < 0 || dataEnd > fileSize || dataEnd < dataStart) {
    throw inspectionError("ZIP_LOCAL_HEADER_INVALID", entryIndex);
  }
  if (entry.uncompressedBytes > maxOutputBytes) {
    throw inspectionError("ZIP_INFLATE_LIMIT_EXCEEDED", entryIndex);
  }
  if (
    (entry.flags & GENERAL_PURPOSE_DATA_DESCRIPTOR) === 0 &&
    (header.readUInt32LE(18) !== entry.compressedBytes ||
      header.readUInt32LE(22) !== entry.uncompressedBytes)
  ) {
    throw inspectionError("ZIP_ENTRY_SIZE_MISMATCH", entryIndex);
  }

  const hash = createHash("sha256");
  if (entry.compressedBytes === 0) {
    if (entry.uncompressedBytes !== 0) {
      throw inspectionError("ZIP_ENTRY_SIZE_MISMATCH", entryIndex);
    }
    if (entry.crc32 !== 0) {
      throw inspectionError("ZIP_CRC_MISMATCH", entryIndex);
    }
    return { sizeBytes: 0, sha256: hash.digest("hex"), crc32: 0 };
  }

  const compressedStream = handle.createReadStream({
    start: dataStart,
    end: dataEnd - 1,
    autoClose: false,
  });
  const output =
    entry.method === 8
      ? compressedStream.pipe(createInflateRaw())
      : compressedStream;
  let size = 0;
  let crc = 0;
  try {
    for await (const rawChunk of output) {
      const chunk = Buffer.isBuffer(rawChunk)
        ? rawChunk
        : Buffer.from(rawChunk as Uint8Array);
      size = safeAdd(size, chunk.length);
      if (size > maxOutputBytes) {
        output.destroy();
        throw inspectionError("ZIP_INFLATE_LIMIT_EXCEEDED", entryIndex);
      }
      hash.update(chunk);
      crc = updateCrc32(crc, chunk);
    }
  } catch (error) {
    if (error instanceof InspectionError) throw error;
    throw inspectionError("ZIP_CORRUPT_DATA", entryIndex);
  }
  if (size !== entry.uncompressedBytes) {
    throw inspectionError("ZIP_ENTRY_SIZE_MISMATCH", entryIndex);
  }
  if (crc !== entry.crc32) {
    throw inspectionError("ZIP_CRC_MISMATCH", entryIndex);
  }
  return { sizeBytes: size, sha256: hash.digest("hex"), crc32: crc };
}

function validatedResult(
  options: InspectArtifactOptions,
  manifest: ArtifactManifest,
  sourceSha256: string | null,
  uncompressedBytes: number | null,
): ArtifactInspectionResult {
  const validation = validateArtifact({
    policy: options.policy,
    manifest,
    ...(options.warningWaivers === undefined
      ? {}
      : { warningWaivers: options.warningWaivers }),
  });
  return {
    pass: validation.pass,
    policy: validation.policy,
    manifest,
    metadata: {
      kind: options.kind,
      sourceSha256,
      compressedBytes:
        manifest.kind === "zip" ? (manifest.compressedBytes ?? null) : null,
      uncompressedBytes,
      fileCount: manifest.files.length,
      artifactSha256: sourceSha256 ?? validation.summary.hashes.fileSetSha256,
    },
    inspectionErrors: [],
    validation,
  };
}

function inspectionFailure(
  options: InspectArtifactOptions,
  findings: readonly ArtifactInspectionFinding[],
  partial?: PartialMetadata,
): ArtifactInspectionResult {
  return {
    pass: false,
    policy: { id: options.policy.id, version: options.policy.version },
    manifest: null,
    metadata: {
      kind: partial?.kind ?? options.kind,
      sourceSha256: null,
      compressedBytes: partial?.compressedBytes ?? null,
      uncompressedBytes: partial?.uncompressedBytes ?? null,
      fileCount: partial?.fileCount ?? 0,
      artifactSha256: null,
    },
    inspectionErrors: findings.map((finding) =>
      attachPolicyRule(finding, options.policy),
    ),
    validation: null,
  };
}

function attachPolicyRule(
  finding: ArtifactInspectionFinding,
  policy: ArtifactValidationPolicy,
): ArtifactInspectionFinding {
  const policyRule = inspectionPolicyRule(finding.code, policy);
  return policyRule === undefined ? finding : { ...finding, policyRule };
}

function inspectionPolicyRule(
  code: ArtifactInspectionCode,
  policy: ArtifactValidationPolicy,
) {
  if (code === "ZIP_ENTRY_LIMIT_EXCEEDED") {
    return policy.inspection?.tooManyEntries;
  }
  if (code === "ZIP_ENTRY_SIZE_MISMATCH" || code === "ZIP_CRC_MISMATCH") {
    return policy.inspection?.invalidEntrySize;
  }
  if (code === "ZIP_INFLATE_LIMIT_EXCEEDED") {
    return policy.rules["uncompressed-size-exceeded"];
  }
  return code.startsWith("ZIP") ? policy.inspection?.invalidFormat : undefined;
}

interface PartialMetadata {
  readonly kind: ArtifactKind;
  readonly compressedBytes: number | null;
  readonly uncompressedBytes: number | null;
  readonly fileCount: number;
}

class InspectionError extends Error {
  readonly findings: readonly ArtifactInspectionFinding[];
  readonly metadata?: PartialMetadata;

  constructor(finding: ArtifactInspectionFinding, metadata?: PartialMetadata) {
    super(finding.message);
    this.name = "InspectionError";
    this.findings = [finding];
    if (metadata !== undefined) this.metadata = metadata;
  }
}

function inspectionError(
  code: ArtifactInspectionCode,
  entryIndex?: number,
  metadata?: PartialMetadata,
): InspectionError {
  const finding: ArtifactInspectionFinding = {
    code,
    message: INSPECTION_MESSAGES[code],
    ...(entryIndex === undefined ? {} : { entryIndex }),
  };
  return new InspectionError(finding, metadata);
}

const INSPECTION_MESSAGES: Readonly<Record<ArtifactInspectionCode, string>> = {
  ARTIFACT_INPUT_NOT_FOUND: "검사할 artifact를 찾을 수 없습니다.",
  ARTIFACT_INPUT_TYPE_INVALID: "검사 대상 종류가 요청과 일치하지 않습니다.",
  ARTIFACT_INPUT_CHANGED: "검사 중 artifact가 변경되었습니다.",
  ARTIFACT_DIRECTORY_SYMLINK: "출력 폴더에 심볼릭 링크가 있습니다.",
  ARTIFACT_DIRECTORY_SPECIAL_FILE:
    "출력 폴더에 일반 파일이 아닌 항목이 있습니다.",
  ARTIFACT_DIRECTORY_OUTSIDE_ROOT: "출력 폴더 바깥을 가리키는 항목이 있습니다.",
  ZIP_EOCD_MISSING: "ZIP end-of-central-directory를 찾을 수 없습니다.",
  ZIP_EOCD_INVALID: "ZIP end-of-central-directory가 올바르지 않습니다.",
  ZIP_MULTIDISK_UNSUPPORTED: "multi-disk ZIP은 지원하지 않습니다.",
  ZIP64_UNSUPPORTED: "1차 출시에서는 ZIP64를 지원하지 않습니다.",
  ZIP_CENTRAL_DIRECTORY_INVALID: "ZIP central directory가 손상되었습니다.",
  ZIP_ENTRY_LIMIT_EXCEEDED: "항목 수 제한을 넘겨 ZIP 검사를 중단했습니다.",
  ZIP_ENTRY_METADATA_TOO_LARGE: "ZIP 항목 metadata가 안전 제한을 넘었습니다.",
  ZIP_FILENAME_ENCODING_UNSUPPORTED:
    "ZIP 파일명 인코딩을 안전하게 해석할 수 없습니다.",
  ZIP_ENCRYPTION_UNSUPPORTED: "암호화된 ZIP 항목은 지원하지 않습니다.",
  ZIP_COMPRESSION_UNSUPPORTED: "지원하지 않는 ZIP 압축 방식입니다.",
  ZIP_LOCAL_HEADER_INVALID: "ZIP local file header가 올바르지 않습니다.",
  ZIP_ENTRY_NAME_MISMATCH: "ZIP central/local entry name이 일치하지 않습니다.",
  ZIP_ENTRY_SIZE_MISMATCH:
    "ZIP entry 크기 metadata와 실제 결과가 일치하지 않습니다.",
  ZIP_CRC_MISMATCH: "ZIP entry CRC가 실제 내용과 일치하지 않습니다.",
  ZIP_INFLATE_LIMIT_EXCEEDED: "압축 해제 크기 제한을 넘겨 즉시 중단했습니다.",
  ZIP_CORRUPT_DATA: "ZIP 압축 데이터가 손상되었습니다.",
};

function validateEntryFlagsAndMethod(
  flags: number,
  method: number,
  entryIndex: number,
): void {
  if (
    (flags & GENERAL_PURPOSE_ENCRYPTED) !== 0 ||
    (flags & GENERAL_PURPOSE_STRONG_ENCRYPTION) !== 0
  ) {
    throw inspectionError("ZIP_ENCRYPTION_UNSUPPORTED", entryIndex);
  }
  if (method !== 0 && method !== 8) {
    throw inspectionError("ZIP_COMPRESSION_UNSUPPORTED", entryIndex);
  }
}

function decodeEntryName(
  bytes: Buffer,
  flags: number,
  entryIndex: number,
): string {
  if ((flags & GENERAL_PURPOSE_UTF8) !== 0) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw inspectionError("ZIP_FILENAME_ENCODING_UNSUPPORTED", entryIndex);
    }
  }
  if (bytes.some((byte) => byte > 0x7f)) {
    throw inspectionError("ZIP_FILENAME_ENCODING_UNSUPPORTED", entryIndex);
  }
  return bytes.toString("ascii");
}

function findEocd(buffer: Buffer): number {
  for (let offset = buffer.length - EOCD_MIN_BYTES; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

async function readExactly(
  handle: Awaited<ReturnType<typeof open>>,
  buffer: Buffer,
  position: number,
): Promise<void> {
  if (position < 0) throw inspectionError("ZIP_CENTRAL_DIRECTORY_INVALID");
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(
      buffer,
      offset,
      buffer.length - offset,
      position + offset,
    );
    if (bytesRead === 0) {
      throw inspectionError("ZIP_CENTRAL_DIRECTORY_INVALID");
    }
    offset += bytesRead;
  }
}

async function hashOpenFile(
  handle: Awaited<ReturnType<typeof open>>,
): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of handle.createReadStream({
    start: 0,
    autoClose: false,
  })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function safeStat(path: string): Promise<Stats | null> {
  try {
    return await lstat(path);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return null;
    throw error;
  }
}

function isNodeError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { readonly code?: unknown }).code === code
  );
}

function sameFileSnapshot(left: Stats, right: Stats): boolean {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs
  );
}

function isInside(root: string, candidate: string): boolean {
  const path = relative(root, candidate);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

function safeAdd(left: number, right: number): number {
  const result = left + right;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw inspectionError("ZIP_ENTRY_SIZE_MISMATCH");
  }
  return result;
}

const CRC_TABLE = createCrcTable();

function updateCrc32(previous: number, bytes: Buffer): number {
  let crc = (previous ^ 0xffffffff) >>> 0;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value =
        (value & 1) === 1 ? (0xedb88320 ^ (value >>> 1)) >>> 0 : value >>> 1;
    }
    table[index] = value;
  }
  return table;
}
