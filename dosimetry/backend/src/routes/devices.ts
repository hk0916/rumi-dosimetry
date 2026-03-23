import { FastifyInstance } from "fastify";
import { prisma } from "../index.js";

export async function deviceRoutes(app: FastifyInstance) {
  // 모든 라우트에 인증 적용
  app.addHook("onRequest", (app as any).authenticate);

  // GET /api/devices
  app.get("/", async (request) => {
    const { page = "1", size = "20" } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const sizeNum = Math.min(100, Math.max(1, parseInt(size, 10) || 20));
    const skip = (pageNum - 1) * sizeNum;

    const [devices, total] = await Promise.all([
      prisma.device.findMany({ skip, take: sizeNum, orderBy: { updatedAt: "desc" } }),
      prisma.device.count(),
    ]);

    return { data: devices, total, page: pageNum, size: sizeNum };
  });

  // GET /api/devices/:id
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const device = await prisma.device.findUnique({ where: { id: Number(id) } });
    if (!device) return reply.status(404).send({ error: "Device not found" });
    return device;
  });

  // POST /api/devices
  app.post("/", async (request, reply) => {
    const body = request.body as any;
    if (!body.deviceName || !body.macAddress) {
      return reply.status(400).send({ error: "deviceName과 macAddress는 필수입니다." });
    }
    try {
      const device = await prisma.device.create({
        data: {
          deviceName: body.deviceName,
          deviceType: body.deviceType || "Skin Dosimeter",
          macAddress: body.macAddress,
          status: "offline",
          workspaceId: body.workspaceId || 1,
        },
      });
      return device;
    } catch (err: any) {
      if (err.code === "P2002") {
        return reply.status(409).send({ error: "이미 등록된 MAC 주소입니다." });
      }
      throw err;
    }
  });

  // PUT /api/devices/:id
  app.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    try {
      const data: any = {};
      if (body.deviceName !== undefined) data.deviceName = body.deviceName;
      if (body.deviceType !== undefined) data.deviceType = body.deviceType;
      if (body.macAddress !== undefined) data.macAddress = body.macAddress;

      const device = await prisma.device.update({
        where: { id: Number(id) },
        data,
      });
      return device;
    } catch (err: any) {
      if (err.code === "P2025") {
        return reply.status(404).send({ error: "Device not found" });
      }
      if (err.code === "P2002") {
        return reply.status(409).send({ error: "이미 등록된 MAC 주소입니다." });
      }
      throw err;
    }
  });

  // DELETE /api/devices/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.device.delete({ where: { id: Number(id) } });
      return { message: "삭제되었습니다." };
    } catch (err: any) {
      if (err.code === "P2025") {
        return reply.status(404).send({ error: "Device not found" });
      }
      if (err.code === "P2003") {
        return reply.status(409).send({ error: "연결된 센서 데이터가 있어 삭제할 수 없습니다." });
      }
      throw err;
    }
  });
}
