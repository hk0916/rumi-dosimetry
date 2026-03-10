import { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { prisma } from "../index.js";

export async function authRoutes(app: FastifyInstance) {
  // POST /api/auth/login
  app.post("/login", async (request, reply) => {
    const { username, password } = request.body as {
      username: string;
      password: string;
    };

    if (!username || !password) {
      return reply.status(400).send({ error: "아이디와 비밀번호를 입력해주세요." });
    }

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      return reply.status(401).send({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: "아이디 또는 비밀번호가 올바르지 않습니다." });
    }

    const token = app.jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      { expiresIn: "24h" }
    );

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
      },
    };
  });

  // POST /api/auth/logout
  app.post("/logout", async () => {
    return { message: "로그아웃되었습니다." };
  });
}
