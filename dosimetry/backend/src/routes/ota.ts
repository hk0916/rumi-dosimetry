import { FastifyInstance } from "fastify";
import { prisma } from "../index.js";

export async function otaRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (app as any).authenticate);

  // ========== Firmware CRUD ==========

  // GET /api/ota/firmwares
  app.get("/firmwares", async (request) => {
    const { page = "1", size = "20", targetType } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const sizeNum = Math.min(100, Math.max(1, parseInt(size, 10) || 20));
    const skip = (pageNum - 1) * sizeNum;

    const where: any = {};
    if (targetType) where.targetType = targetType;

    const [firmwares, total] = await Promise.all([
      prisma.otaFirmware.findMany({
        where,
        skip,
        take: sizeNum,
        orderBy: { createdAt: "desc" },
        include: { _count: { select: { tasks: true } } },
      }),
      prisma.otaFirmware.count({ where }),
    ]);

    return { data: firmwares, total, page: pageNum, size: sizeNum };
  });

  // POST /api/ota/firmwares
  app.post("/firmwares", async (request, reply) => {
    const body = request.body as any;
    if (!body.name || !body.version || !body.targetType) {
      return reply.status(400).send({ error: "name, version, targetType은 필수입니다." });
    }
    if (!["gateway", "device"].includes(body.targetType)) {
      return reply.status(400).send({ error: "targetType은 gateway 또는 device여야 합니다." });
    }

    const firmware = await prisma.otaFirmware.create({
      data: {
        name: body.name,
        version: body.version,
        targetType: body.targetType,
        fileName: body.fileName,
        fileSize: body.fileSize ? Number(body.fileSize) : null,
        checksum: body.checksum,
        description: body.description,
      },
    });
    return firmware;
  });

  // DELETE /api/ota/firmwares/:id
  app.delete("/firmwares/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const pendingTasks = await prisma.otaTask.count({
        where: { firmwareId: Number(id), status: { in: ["pending", "in_progress"] } },
      });
      if (pendingTasks > 0) {
        return reply.status(409).send({ error: "진행 중인 OTA 작업이 있어 삭제할 수 없습니다." });
      }
      await prisma.otaTask.deleteMany({ where: { firmwareId: Number(id) } });
      await prisma.otaFirmware.delete({ where: { id: Number(id) } });
      return { message: "삭제되었습니다." };
    } catch (err: any) {
      if (err.code === "P2025") {
        return reply.status(404).send({ error: "Firmware not found" });
      }
      throw err;
    }
  });

  // ========== OTA Tasks ==========

  // GET /api/ota/tasks
  app.get("/tasks", async (request) => {
    const { page = "1", size = "20", status, targetType } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const sizeNum = Math.min(100, Math.max(1, parseInt(size, 10) || 20));
    const skip = (pageNum - 1) * sizeNum;

    const where: any = {};
    if (status) where.status = status;
    if (targetType) where.targetType = targetType;

    const [tasks, total] = await Promise.all([
      prisma.otaTask.findMany({
        where,
        skip,
        take: sizeNum,
        orderBy: { createdAt: "desc" },
        include: { firmware: { select: { name: true, version: true, targetType: true } } },
      }),
      prisma.otaTask.count({ where }),
    ]);

    return { data: tasks, total, page: pageNum, size: sizeNum };
  });

  // POST /api/ota/tasks - 단일 또는 다중 대상에 OTA 작업 생성
  app.post("/tasks", async (request, reply) => {
    const body = request.body as any;
    if (!body.firmwareId || !body.targets || !Array.isArray(body.targets) || body.targets.length === 0) {
      return reply.status(400).send({ error: "firmwareId와 targets 배열은 필수입니다." });
    }

    const firmware = await prisma.otaFirmware.findUnique({ where: { id: Number(body.firmwareId) } });
    if (!firmware) {
      return reply.status(404).send({ error: "Firmware를 찾을 수 없습니다." });
    }

    const tasks = [];
    for (const target of body.targets) {
      const task = await prisma.otaTask.create({
        data: {
          firmwareId: firmware.id,
          targetType: firmware.targetType,
          targetId: Number(target.id),
          targetName: target.name || null,
          params: body.params ? JSON.stringify(body.params) : null,
        },
      });
      tasks.push(task);
    }

    return { message: `${tasks.length}개 OTA 작업이 생성되었습니다.`, tasks };
  });

  // PUT /api/ota/tasks/:id/status - 상태 업데이트 (실제 디바이스에서 콜백 또는 수동)
  app.put("/tasks/:id/status", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;

    if (!body.status) {
      return reply.status(400).send({ error: "status는 필수입니다." });
    }

    const validStatuses = ["pending", "in_progress", "success", "failed", "cancelled"];
    if (!validStatuses.includes(body.status)) {
      return reply.status(400).send({ error: `유효한 status: ${validStatuses.join(", ")}` });
    }

    try {
      const task = await prisma.otaTask.update({
        where: { id: Number(id) },
        data: {
          status: body.status,
          progress: body.progress !== undefined ? Number(body.progress) : undefined,
          errorMessage: body.errorMessage || undefined,
        },
      });

      // OTA 성공 시 대상 디바이스/게이트웨이의 펌웨어 버전 업데이트
      if (body.status === "success") {
        const firmware = await prisma.otaFirmware.findUnique({ where: { id: task.firmwareId } });
        if (firmware) {
          if (task.targetType === "gateway") {
            await prisma.gateway.update({
              where: { id: task.targetId },
              data: { deviceFwVersion: firmware.version },
            });
          }
        }
      }

      return task;
    } catch (err: any) {
      if (err.code === "P2025") {
        return reply.status(404).send({ error: "Task not found" });
      }
      throw err;
    }
  });

  // POST /api/ota/tasks/:id/retry - 실패한 작업 재시도
  app.post("/tasks/:id/retry", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const task = await prisma.otaTask.findUnique({ where: { id: Number(id) } });
      if (!task) return reply.status(404).send({ error: "Task not found" });
      if (task.status !== "failed" && task.status !== "cancelled") {
        return reply.status(400).send({ error: "실패하거나 취소된 작업만 재시도할 수 있습니다." });
      }

      const updated = await prisma.otaTask.update({
        where: { id: Number(id) },
        data: { status: "pending", progress: 0, errorMessage: null },
      });
      return updated;
    } catch (err: any) {
      throw err;
    }
  });
}
