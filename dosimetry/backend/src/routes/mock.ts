import { FastifyInstance } from "fastify";
import { startMockGenerator, stopMockGenerator, getMockGeneratorStatus } from "../lib/mock-generator.js";

export async function mockRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (app as any).authenticate);

  app.post("/start", async (request, reply) => {
    const { gatewayMac, deviceMacs, intervalMs = 1000 } = request.body as {
      gatewayMac: string;
      deviceMacs: string[];
      intervalMs?: number;
    };
    if (!gatewayMac || !deviceMacs?.length) {
      return reply.status(400).send({ error: "gatewayMac and deviceMacs are required" });
    }
    return await startMockGenerator(gatewayMac, deviceMacs, intervalMs);
  });

  app.post("/stop", async () => stopMockGenerator());

  app.get("/status", async () => getMockGeneratorStatus());
}
