import { FastifyInstance } from "fastify";
import { prisma } from "../index.js";

export async function workspaceRoutes(app: FastifyInstance) {
  // 모든 라우트에 인증 적용
  app.addHook("onRequest", (app as any).authenticate);

  // GET /api/workspaces — 워크스페이스 목록 (유저/디바이스/게이트웨이 개수 포함)
  app.get("/", async () => {
    const workspaces = await prisma.workspace.findMany({
      orderBy: { id: "asc" },
      include: {
        _count: {
          select: { users: true, devices: true, gateways: true },
        },
      },
    });
    return { data: workspaces, total: workspaces.length };
  });

  // POST /api/workspaces — 생성
  app.post("/", async (request, reply) => {
    const body = request.body as { name?: string };
    if (!body.name || body.name.trim().length === 0) {
      return reply.status(400).send({ error: "name은 필수입니다." });
    }
    const workspace = await prisma.workspace.create({
      data: { name: body.name.trim() },
    });
    return workspace;
  });

  // PUT /api/workspaces/:id — 이름 변경
  app.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name?: string };
    if (!body.name || body.name.trim().length === 0) {
      return reply.status(400).send({ error: "name은 필수입니다." });
    }
    try {
      const workspace = await prisma.workspace.update({
        where: { id: Number(id) },
        data: { name: body.name.trim() },
      });
      return workspace;
    } catch (err: any) {
      if (err.code === "P2025") {
        return reply.status(404).send({ error: "Workspace not found" });
      }
      throw err;
    }
  });

  // DELETE /api/workspaces/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      // 사용중인 참조가 있으면 Prisma P2003 (FK) 에러 발생
      await prisma.workspace.delete({ where: { id: Number(id) } });
      return { message: "삭제되었습니다." };
    } catch (err: any) {
      if (err.code === "P2025") {
        return reply.status(404).send({ error: "Workspace not found" });
      }
      if (err.code === "P2003") {
        return reply.status(409).send({ error: "이 워크스페이스를 사용 중인 사용자/디바이스가 있어 삭제할 수 없습니다." });
      }
      throw err;
    }
  });
}
