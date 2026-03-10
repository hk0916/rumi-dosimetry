import { FastifyInstance } from "fastify";
import { prisma } from "../index.js";

export async function gatewayRoutes(app: FastifyInstance) {
  // GET /api/gateways
  app.get("/", async (request) => {
    const { page = "1", size = "20" } = request.query as Record<string, string>;
    const skip = (Number(page) - 1) * Number(size);
    const take = Number(size);

    const [gateways, total] = await Promise.all([
      prisma.gateway.findMany({ skip, take, orderBy: { updatedAt: "desc" } }),
      prisma.gateway.count(),
    ]);

    return { data: gateways, total, page: Number(page), size: take };
  });

  // GET /api/gateways/:id
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const gateway = await prisma.gateway.findUnique({ where: { id: Number(id) } });
    if (!gateway) return reply.status(404).send({ error: "Gateway not found" });
    return gateway;
  });

  // POST /api/gateways
  app.post("/", async (request) => {
    const body = request.body as any;
    const gateway = await prisma.gateway.create({
      data: {
        deviceName: body.deviceName,
        deviceType: body.deviceType || "Twin Tracker BLE",
        macAddress: body.macAddress,
        serverIp: body.serverIp,
        serverUrl: body.serverUrl,
        ipv4Mode: body.ipv4Mode || "manual",
        ipAddress: body.ipAddress,
        subnetMask: body.subnetMask,
        gatewayIp: body.gatewayIp,
        dnsMain: body.dnsMain,
        dnsSub: body.dnsSub,
        bleRssiThreshold: body.bleRssiThreshold || -100,
        workspaceId: body.workspaceId || 1,
      },
    });
    return gateway;
  });

  // PUT /api/gateways/:id/settings
  app.put("/:id/settings", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    try {
      const gateway = await prisma.gateway.update({
        where: { id: Number(id) },
        data: {
          serverIp: body.serverIp,
          serverUrl: body.serverUrl,
          ipv4Mode: body.ipv4Mode,
          ipAddress: body.ipAddress,
          subnetMask: body.subnetMask,
          gatewayIp: body.gatewayIp,
          dnsMain: body.dnsMain,
          dnsSub: body.dnsSub,
          interfaceType: body.interfaceType,
          ledEnabled: body.ledEnabled,
          bleRssiThreshold: body.bleRssiThreshold,
        },
      });
      return gateway;
    } catch {
      return reply.status(404).send({ error: "Gateway not found" });
    }
  });

  // DELETE /api/gateways/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.gateway.delete({ where: { id: Number(id) } });
      return { message: "삭제되었습니다." };
    } catch {
      return reply.status(404).send({ error: "Gateway not found" });
    }
  });
}
