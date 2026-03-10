import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../index.js";

export async function userRoutes(app: FastifyInstance) {
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
        createdAt: true,
      },
    });
    return { data: users };
  });

  // POST /api/users
  app.post("/", async (request, reply) => {
    const body = request.body as any;
    const existing = await prisma.user.findUnique({
      where: { username: body.username },
    });
    if (existing) {
      return reply.status(409).send({ error: "이미 존재하는 아이디입니다." });
    }

    const hash = await bcrypt.hash(body.password || "1234", 10);
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
      const user = await prisma.user.update({
        where: { id: Number(id) },
        data: { name: body.name, role: body.role, groupName: body.groupName },
      });
      return { id: user.id, username: user.username, name: user.name, role: user.role };
    } catch {
      return reply.status(404).send({ error: "User not found" });
    }
  });

  // PUT /api/users/:id/password
  app.put("/:id/password", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { password } = request.body as { password: string };
    if (!password || password.length < 4) {
      return reply.status(400).send({ error: "비밀번호는 4자 이상이어야 합니다." });
    }
    const hash = await bcrypt.hash(password, 10);
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
    } catch {
      return reply.status(404).send({ error: "User not found" });
    }
  });
}
