import { FastifyInstance } from "fastify";
import { prisma } from "../index.js";

export async function gatewayRoutes(app: FastifyInstance) {
  // 모든 라우트에 인증 적용
  app.addHook("onRequest", (app as any).authenticate);

  // GET /api/gateways
  app.get("/", async (request) => {
    const { page = "1", size = "20" } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const sizeNum = Math.min(100, Math.max(1, parseInt(size, 10) || 20));
    const skip = (pageNum - 1) * sizeNum;

    const [gateways, total] = await Promise.all([
      prisma.gateway.findMany({ skip, take: sizeNum, orderBy: { updatedAt: "desc" } }),
      prisma.gateway.count(),
    ]);

    return { data: gateways, total, page: pageNum, size: sizeNum };
  });

  // GET /api/gateways/:id
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const gateway = await prisma.gateway.findUnique({ where: { id: Number(id) } });
    if (!gateway) return reply.status(404).send({ error: "Gateway not found" });
    return gateway;
  });

  // POST /api/gateways
  app.post("/", async (request, reply) => {
    const body = request.body as any;
    if (!body.deviceName || !body.macAddress) {
      return reply.status(400).send({ error: "deviceName과 macAddress는 필수입니다." });
    }
    try {
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
          bleRssiThreshold: body.bleRssiThreshold ?? -100,
          workspaceId: body.workspaceId || 1,
        },
      });
      return gateway;
    } catch (err: any) {
      if (err.code === "P2002") {
        return reply.status(409).send({ error: "이미 등록된 MAC 주소입니다." });
      }
      throw err;
    }
  });

  // PUT /api/gateways/:id — 기본 정보 수정 (이름 등)
  app.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    try {
      const data: any = {};
      if (body.deviceName !== undefined) data.deviceName = body.deviceName;
      if (body.deviceType !== undefined) data.deviceType = body.deviceType;
      if (body.macAddress !== undefined) data.macAddress = body.macAddress;

      const gateway = await prisma.gateway.update({
        where: { id: Number(id) },
        data,
      });
      return gateway;
    } catch (err: any) {
      if (err.code === "P2025") {
        return reply.status(404).send({ error: "Gateway not found" });
      }
      if (err.code === "P2002") {
        return reply.status(409).send({ error: "이미 등록된 MAC 주소입니다." });
      }
      throw err;
    }
  });

  // PUT /api/gateways/:id/settings
  app.put("/:id/settings", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    try {
      const data: any = {};
      if (body.serverIp !== undefined) data.serverIp = body.serverIp;
      if (body.serverUrl !== undefined) data.serverUrl = body.serverUrl;
      if (body.ipv4Mode !== undefined) data.ipv4Mode = body.ipv4Mode;
      if (body.ipAddress !== undefined) data.ipAddress = body.ipAddress;
      if (body.subnetMask !== undefined) data.subnetMask = body.subnetMask;
      if (body.gatewayIp !== undefined) data.gatewayIp = body.gatewayIp;
      if (body.dnsMain !== undefined) data.dnsMain = body.dnsMain;
      if (body.dnsSub !== undefined) data.dnsSub = body.dnsSub;
      if (body.interfaceType !== undefined) data.interfaceType = body.interfaceType;
      if (body.ledEnabled !== undefined) data.ledEnabled = body.ledEnabled;
      if (body.bleRssiThreshold !== undefined) data.bleRssiThreshold = body.bleRssiThreshold;
      if (body.otaServerUrl !== undefined) data.otaServerUrl = body.otaServerUrl;
      if (body.wsServerUrl !== undefined) data.wsServerUrl = body.wsServerUrl;
      if (body.reportInterval !== undefined) data.reportInterval = body.reportInterval;

      const gateway = await prisma.gateway.update({
        where: { id: Number(id) },
        data,
      });
      return gateway;
    } catch (err: any) {
      if (err.code === "P2025") {
        return reply.status(404).send({ error: "Gateway not found" });
      }
      throw err;
    }
  });

  // DELETE /api/gateways/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.gateway.delete({ where: { id: Number(id) } });
      return { message: "삭제되었습니다." };
    } catch (err: any) {
      if (err.code === "P2025") {
        return reply.status(404).send({ error: "Gateway not found" });
      }
      throw err;
    }
  });
}
