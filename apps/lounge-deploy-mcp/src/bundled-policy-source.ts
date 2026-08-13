import type { PolicySource } from "@letscoding/policy-contract";

import { POLICY_BUNDLE_FILES } from "./generated/policy-bundle.js";

export function createBundledPolicySource(): PolicySource {
  return {
    readText(relativePath) {
      return Promise.resolve(POLICY_BUNDLE_FILES[relativePath] ?? null);
    },
  };
}
