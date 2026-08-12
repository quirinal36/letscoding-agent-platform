import type { IncomingMessage, ServerResponse } from "node:http";

import { loungeDeployHttpHandler } from "../src/runtime.js";

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  request.url = "/ready";
  await loungeDeployHttpHandler(request, response);
}
