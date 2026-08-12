import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

export interface ZipFixtureEntry {
  readonly name: string;
  readonly contents?: string | Uint8Array;
  readonly method?: "store" | "deflate";
  readonly utf8?: boolean;
}

export interface ZipFixtureMutation {
  readonly diskNumber?: number;
  readonly forceZip64Marker?: boolean;
  readonly centralDirectoryOffsetDelta?: number;
  readonly declaredUncompressedBytes?: number;
  readonly localNameOverride?: string;
  readonly truncateBytes?: number;
}

/**
 * Small deterministic ZIP writer used for security regression fixtures.
 * It intentionally supports mutations that normal archive tools will not emit.
 */
export function createZipFixture(
  entries: readonly ZipFixtureEntry[],
  mutation: ZipFixtureMutation = {},
): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let localOffset = 0;

  entries.forEach((entry, index) => {
    const contents =
      typeof entry.contents === "string"
        ? Buffer.from(entry.contents)
        : Buffer.from(entry.contents ?? new Uint8Array());
    const method = entry.method === "deflate" ? 8 : 0;
    const compressed = method === 8 ? deflateRawSync(contents) : contents;
    const useUtf8 =
      entry.utf8 ??
      [...entry.name].some((character) => character.codePointAt(0)! > 0x7f);
    const flags = useUtf8 ? 0x0800 : 0;
    const centralName = Buffer.from(entry.name, useUtf8 ? "utf8" : "ascii");
    const localNameText =
      index === 0 && mutation.localNameOverride !== undefined
        ? mutation.localNameOverride
        : entry.name;
    const localName = Buffer.from(localNameText, useUtf8 ? "utf8" : "ascii");
    const entryCrc = crc32(contents);
    const declaredUncompressed =
      index === 0 && mutation.declaredUncompressedBytes !== undefined
        ? mutation.declaredUncompressedBytes
        : contents.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(entryCrc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(declaredUncompressed, 22);
    local.writeUInt16LE(localName.length, 26);
    localParts.push(local, localName, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(entryCrc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(declaredUncompressed, 24);
    central.writeUInt16LE(centralName.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centralParts.push(central, centralName);
    localOffset += local.length + localName.length + compressed.length;
  });

  const centralOffset = localOffset;
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(mutation.diskNumber ?? 0, 4);
  eocd.writeUInt16LE(mutation.diskNumber ?? 0, 6);
  eocd.writeUInt16LE(
    mutation.forceZip64Marker === true ? 0xffff : entries.length,
    8,
  );
  eocd.writeUInt16LE(
    mutation.forceZip64Marker === true ? 0xffff : entries.length,
    10,
  );
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(
    centralOffset + (mutation.centralDirectoryOffsetDelta ?? 0),
    16,
  );
  const complete = Buffer.concat([...localParts, central, eocd]);
  const truncateBytes = mutation.truncateBytes ?? 0;
  return truncateBytes === 0
    ? complete
    : complete.subarray(0, Math.max(0, complete.length - truncateBytes));
}

/** Generate the documented normal and hostile artifact fixture catalog. */
export async function generateArtifactSecurityFixtures(
  outputDirectory: string,
): Promise<readonly string[]> {
  await mkdir(outputDirectory, { recursive: true });
  const fixtures: Readonly<Record<string, Buffer>> = {
    "valid-single-html.zip": createZipFixture([
      { name: "index.html", contents: "<!doctype html>" },
    ]),
    "valid-static.zip": createZipFixture([
      { name: "index.html", contents: "<!doctype html>" },
      { name: "assets/app.css", contents: "body{}", method: "deflate" },
      { name: "assets/app.js", contents: "export{}", method: "deflate" },
    ]),
    "valid-vite.zip": createZipFixture([
      { name: "index.html", contents: '<script src="./assets/app.js">' },
      { name: "assets/app.js", contents: "export{}", method: "deflate" },
    ]),
    "valid-next.zip": createZipFixture([
      { name: "index.html", contents: '<script src="./_next/app.js">' },
      { name: "_next/app.js", contents: "self.webpackChunk=[]" },
    ]),
    "valid-utf8.zip": createZipFixture([
      { name: "index.html", contents: "<!doctype html>" },
      { name: "assets/한글.txt", contents: "정상" },
    ]),
    "invalid-wrapper.zip": createZipFixture([
      { name: "dist/index.html", contents: "<!doctype html>" },
    ]),
    "invalid-missing-root.zip": createZipFixture([
      { name: "app.html", contents: "<!doctype html>" },
    ]),
    "invalid-backslash.zip": createZipFixture([
      { name: "index.html", contents: "<!doctype html>" },
      { name: "assets\\app.js", contents: "export{}" },
    ]),
    "invalid-traversal.zip": createZipFixture([
      { name: "index.html", contents: "<!doctype html>" },
      { name: "../escape.js", contents: "export{}" },
    ]),
    "invalid-absolute.zip": createZipFixture([
      { name: "index.html", contents: "<!doctype html>" },
      { name: "/absolute.js", contents: "export{}" },
    ]),
    "invalid-url-character.zip": createZipFixture([
      { name: "index.html", contents: "<!doctype html>" },
      { name: "assets/app%20.js", contents: "export{}" },
    ]),
    "invalid-env.zip": createZipFixture([
      { name: "index.html", contents: "<!doctype html>" },
      { name: ".env.production", contents: "SECRET=redacted" },
    ]),
    "invalid-runtime-config.zip": createZipFixture([
      { name: "index.html", contents: "<!doctype html>" },
      { name: "nested/RUNTIME-CONFIG.JS", contents: "window.x=1" },
    ]),
    "invalid-extension.zip": createZipFixture([
      { name: "index.html", contents: "<!doctype html>" },
      { name: "assets/program.exe", contents: "MZ" },
    ]),
    "invalid-central-directory.zip": createZipFixture(
      [{ name: "index.html", contents: "<!doctype html>" }],
      { centralDirectoryOffsetDelta: 1 },
    ),
    "invalid-local-name.zip": createZipFixture(
      [{ name: "index.html", contents: "<!doctype html>" }],
      { localNameOverride: "other.html" },
    ),
    "invalid-multidisk.zip": createZipFixture(
      [{ name: "index.html", contents: "<!doctype html>" }],
      { diskNumber: 1 },
    ),
    "invalid-zip64.zip": createZipFixture(
      [{ name: "index.html", contents: "<!doctype html>" }],
      { forceZip64Marker: true },
    ),
    "invalid-truncated.zip": createZipFixture(
      [{ name: "index.html", contents: "<!doctype html>" }],
      { truncateBytes: 8 },
    ),
  };
  const written: string[] = [];
  for (const [name, bytes] of Object.entries(fixtures)) {
    const path = join(outputDirectory, name);
    await writeFile(path, bytes);
    written.push(path);
  }
  return written.sort();
}
