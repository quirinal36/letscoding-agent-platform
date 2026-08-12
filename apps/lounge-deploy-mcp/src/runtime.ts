import { createLoungeDeployHttpHandler } from "./http.js";
import { loadMcpConfig } from "./config.js";

export const loungeDeployHttpHandler = createLoungeDeployHttpHandler({
  config: loadMcpConfig(),
  readinessProbes: [
    {
      name: "policy-bundle",
      // #9 replaces this scaffold probe with policy bundle integrity loading.
      async check() {
        return true;
      },
    },
  ],
});
