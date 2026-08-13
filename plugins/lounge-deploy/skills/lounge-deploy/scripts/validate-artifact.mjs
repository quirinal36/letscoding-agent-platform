#!/usr/bin/env node

import { runArtifactValidatorCli } from "../../../runtime/artifact-validator/cli.js";

process.exitCode = await runArtifactValidatorCli(process.argv.slice(2));
