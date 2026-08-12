import { createLoungeDeployHttpHandler } from "./http.js";
import { loadMcpConfig } from "./config.js";
import { createValidateArtifactHandler } from "./artifact-validation.js";
import { createBundledPolicySource } from "./bundled-policy-source.js";
import {
  createGetPolicyHandler,
  verifyActivePolicy,
} from "./policy-repository.js";

const policySource = createBundledPolicySource();
const getPolicy = createGetPolicyHandler({
  sourceForPolicy: (policyId) =>
    policyId === "lounge-deploy" ? policySource : null,
});

export const loungeDeployHttpHandler = createLoungeDeployHttpHandler({
  config: loadMcpConfig(),
  handlers: {
    get_policy: getPolicy,
    validate_artifact: createValidateArtifactHandler({ getPolicy }),
  },
  readinessProbes: [
    {
      name: "policy-bundle",
      async check(signal) {
        return verifyActivePolicy(policySource, "lounge-deploy", signal);
      },
    },
  ],
});
