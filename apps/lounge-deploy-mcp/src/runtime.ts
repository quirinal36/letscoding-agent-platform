import { createLoungeDeployHttpHandler } from "./http.js";
import { loadMcpConfig } from "./config.js";
import { createBundledPolicySource } from "./bundled-policy-source.js";
import {
  createGetPolicyHandler,
  verifyActivePolicy,
} from "./policy-repository.js";

const policySource = createBundledPolicySource();

export const loungeDeployHttpHandler = createLoungeDeployHttpHandler({
  config: loadMcpConfig(),
  handlers: {
    get_policy: createGetPolicyHandler({
      sourceForPolicy: (policyId) =>
        policyId === "lounge-deploy" ? policySource : null,
    }),
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
