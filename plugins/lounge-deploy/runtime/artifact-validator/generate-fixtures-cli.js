#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { generateArtifactSecurityFixtures } from "./fixture-generator.js";
const invokedPath = process.argv[1];
if (invokedPath !== undefined &&
    import.meta.url === pathToFileURL(invokedPath).href) {
    const output = resolve(process.argv[2] ?? "../../tests/fixtures/artifacts/generated");
    await generateArtifactSecurityFixtures(output);
}
//# sourceMappingURL=generate-fixtures-cli.js.map