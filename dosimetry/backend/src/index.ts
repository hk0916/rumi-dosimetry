import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import websocket from "@fastify/websocket";
import { PrismaClient } from "@prisma/client";
import { authRoutes } from "./routes/auth.js";
import { deviceRoutes } from "./routes/devices.js";
import { gatewayRoutes } from "./routes/gateways.js";
import { userRoutes } from "./routes/users.js";
import { dataRoutes } from "./routes/data.js";
import { monitoringRoutes } from "./routes/monitoring.js";
import { mockRoutes } from "./routes/mock.js";
import { calibrationRoutes } from "./routes/calibrations.js";
import { analysisRoutes } from "./routes/analysis.js";
import { otaRoutes } from "./routes/ota.js";
import { authMiddleware } from "./middleware/auth.js";

export const prisma = new PrismaClient();

const app = Fastify({ logger: true });

async function start() {
  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: process.env.JWT_SECRET || "dev-secret" });
  await app.register(websocket);

  // Decorate
  app.decorate("prisma", prisma);
  app.decorate("authenticate", authMiddleware(app));

  // Routes
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(deviceRoutes, { prefix: "/api/devices" });
  await app.register(gatewayRoutes, { prefix: "/api/gateways" });
  await app.register(userRoutes, { prefix: "/api/users" });
  await app.register(dataRoutes, { prefix: "/api/data" });
  await app.register(monitoringRoutes, { prefix: "/ws" });
  await app.register(mockRoutes, { prefix: "/api/mock" });
  await app.register(calibrationRoutes, { prefix: "/api/calibrations" });
  await app.register(analysisRoutes, { prefix: "/api/analysis" });
  await app.register(otaRoutes, { prefix: "/api/ota" });

  // Health check
  app.get("/api/health", async () => ({ status: "ok", timestamp: new Date() }));

  const port = Number(process.env.PORT) || 4000;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Server running on port ${port}`);
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
