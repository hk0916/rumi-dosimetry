import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../index.js";

export async function userRoutes(app: FastifyInstance) {
  // 모든 라우트에 인증 적용
  app.addHook("onRequest", (app as any).authenticate);

  // GET /api/users
  app.get("/", async () => {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        role: true,
        accountType: true,
        groupName: true,
        workspaceId: true,
        workspace: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: { id: "asc" },
    });
    return { data: users, total: users.length };
  });

  // GET /api/users/groups — 중복 제거된 그룹 목록 (각 그룹의 멤버 수 포함)
  app.get("/groups", async () => {
    const rows = await prisma.user.groupBy({
      by: ["groupName"],
      _count: { _all: true },
      orderBy: { groupName: "asc" },
    });
    const data = rows
      .filter((r) => r.groupName != null && r.groupName !== "")
      .map((r) => ({ name: r.groupName, memberCount: r._count._all }));
    return { data, total: data.length };
  });

  // PUT /api/users/groups/rename — 그룹 일괄 이름 변경
  app.put("/groups/rename", async (request, reply) => {
    const body = request.body as { oldName?: string; newName?: string };
    if (!body.oldName || !body.newName || body.newName.trim().length === 0) {
      return reply.status(400).send({ error: "oldName과 newName은 필수입니다." });
    }
    const res = await prisma.user.updateMany({
      where: { groupName: body.oldName },
      data: { groupName: body.newName.trim() },
    });
    return { updated: res.count };
  });

  // POST /api/users
  app.post("/", async (request, reply) => {
    const body = request.body as any;
    if (!body.username || !body.password) {
      return reply.status(400).send({ error: "username과 password는 필수입니다." });
    }
    if (body.password.length < 4) {
      return reply.status(400).send({ error: "비밀번호는 4자 이상이어야 합니다." });
    }

    const existing = await prisma.user.findUnique({
      where: { username: body.username },
    });
    if (existing) {
      return reply.status(409).send({ error: "이미 존재하는 아이디입니다." });
    }

    const hash = await bcrypt.hash(body.password, 10);
    const user = await prisma.user.create({
      data: {
        username: body.username,
        passwordHash: hash,
        name: body.name,
        role: body.role || "admin",
        accountType: body.accountType || "Local Account",
        groupName: body.groupName,
        workspaceId: body.workspaceId || 1,
      },
    });

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
    };
  });

  // PUT /api/users/:id
  app.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    try {
      const data: any = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.groupName !== undefined) data.groupName = body.groupName;
      if (body.workspaceId !== undefined) data.workspaceId = body.workspaceId;
      if (body.role !== undefined) data.role = body.role;
      if (body.accountType !== undefined) data.accountType = body.accountType;
      const user = await prisma.user.update({
        where: { id: Number(id) },
        data,
      });
      return { id: user.id, username: user.username, name: user.name, role: user.role, groupName: user.groupName, workspaceId: user.workspaceId };
    } catch (err: any) {
      if (err.code === "P2025") {
        return reply.status(404).send({ error: "User not found" });
      }
      throw err;
    }
  });

  // PUT /api/users/:id/password
  app.put("/:id/password", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const { currentPassword, newPassword } = body;

    if (!newPassword || newPassword.length < 4) {
      return reply.status(400).send({ error: "비밀번호는 4자 이상이어야 합니다." });
    }

    // 현재 비밀번호 확인
    const user = await prisma.user.findUnique({ where: { id: Number(id) } });
    if (!user) {
      return reply.status(404).send({ error: "User not found" });
    }

    if (currentPassword) {
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        return reply.status(400).send({ error: "현재 비밀번호가 올바르지 않습니다." });
      }
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: Number(id) },
      data: { passwordHash: hash },
    });
    return { message: "비밀번호가 변경되었습니다." };
  });

  // DELETE /api/users/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.user.delete({ where: { id: Number(id) } });
      return { message: "삭제되었습니다." };
    } catch (err: any) {
      if (err.code === "P2025") {
        return reply.status(404).send({ error: "User not found" });
      }
      throw err;
    }
  });
}
