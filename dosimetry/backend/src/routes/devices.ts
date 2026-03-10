import { FastifyInstance } from "fastify";
import { prisma } from "../index.js";

export async function deviceRoutes(app: FastifyInstance) {
  // GET /api/devices
  app.get("/", async (request) => {
    const { page = "1", size = "20" } = request.query as Record<string, string>;
    const skip = (Number(page) - 1) * Number(size);
    const take = Number(size);

    const [devices, total] = await Promise.all([
      prisma.device.findMany({ skip, take, orderBy: { updatedAt: "desc" } }),
      prisma.device.count(),
    ]);

    return { data: devices, total, page: Number(page), size: take };
  });

  // GET /api/devices/:id
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const device = await prisma.device.findUnique({ where: { id: Number(id) } });
    if (!device) return reply.status(404).send({ error: "Device not found" });
    return device;
  });

  // POST /api/devices
  app.post("/", async (request) => {
    const body = request.body as any;
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
  });

  // PUT /api/devices/:id
  app.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    try {
      const device = await prisma.device.update({
        where: { id: Number(id) },
        data: {
          deviceName: body.deviceName,
          deviceType: body.deviceType,
          macAddress: body.macAddress,
        },
      });
      return device;
    } catch {
      return reply.status(404).send({ error: "Device not found" });
    }
  });

  // DELETE /api/devices/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.device.delete({ where: { id: Number(id) } });
      return { message: "삭제되었습니다." };
    } catch {
      return reply.status(404).send({ error: "Device not found" });
    }
  });
}
