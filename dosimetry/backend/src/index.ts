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

import { calibrationRoutes } from "./routes/calibrations.js";
import { analysisRoutes } from "./routes/analysis.js";
import { otaRoutes } from "./routes/ota.js";
import { gatewayWsRoutes, createGatewaySocketHandler } from "./routes/gateway-ws.js";
import { mockRoutes } from "./routes/mock.js";
import { startMockGenerator } from "./lib/mock-generator.js";
import { authMiddleware } from "./middleware/auth.js";

const MOCK_GATEWAY_MAC = "64:E8:33:65:3C:5E";
const MOCK_DEVICE_MACS = [
  "AA:BB:CC:00:00:01",
  "AA:BB:CC:00:00:02",
  "AA:BB:CC:00:00:03",
  "AA:BB:CC:00:00:04",
  "AA:BB:CC:00:00:05",
  "AA:BB:CC:00:00:06",
];

async function ensureMockDevices() {
  for (let i = 0; i < MOCK_DEVICE_MACS.length; i++) {
    const mac = MOCK_DEVICE_MACS[i];
    await prisma.device.upsert({
      where: { macAddress: mac },
      update: {},
      create: {
        macAddress: mac,
        deviceName: `Mock-Sensor-${String(i + 1).padStart(2, "0")}`,
        deviceType: "Skin Dosimeter",
      },
    });
  }
}

export const prisma = new PrismaClient();

const app = Fastify({ logger: true });

async function start() {
  // listen 전에 connection pool 워밍 — lazy init race 방지.
  // 게이트웨이가 listen 직후 0x0B 를 쏟아내는데, pool 이 준비되기 전이면 findUnique 가 빈 결과를 돌려주는 case 가 관측됨.
  // $connect() 는 init only 라 prepared statement 는 아직 활성화 안 됨. devices 테이블에 실제 쿼리를 날려서 워밍.
  await prisma.$connect();
  await prisma.device.count();

  await app.register(cors, { origin: true });
  await app.register(jwt, { secret: process.env.JWT_SECRET || "dev-secret" });
  await app.register(websocket);

  // Decorate
  app.decorate("prisma", prisma);
  app.decorate("authenticate", authMiddleware(app));

  // Gateway WebSocket at root "/" (인증 없음 — 펌웨어용)
  app.get("/", { websocket: true }, createGatewaySocketHandler(app));

  // Routes
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(deviceRoutes, { prefix: "/api/devices" });
  await app.register(gatewayRoutes, { prefix: "/api/gateways" });
  await app.register(userRoutes, { prefix: "/api/users" });
  await app.register(dataRoutes, { prefix: "/api/data" });
  await app.register(monitoringRoutes, { prefix: "/ws" });
  await app.register(gatewayWsRoutes, { prefix: "/ws" });

  await app.register(calibrationRoutes, { prefix: "/api/calibrations" });
  await app.register(analysisRoutes, { prefix: "/api/analysis" });
  await app.register(otaRoutes, { prefix: "/api/ota" });
  await app.register(mockRoutes, { prefix: "/api/mock" });

  // Health check
  app.get("/api/health", async () => ({ status: "ok", timestamp: new Date() }));

  const port = Number(process.env.PORT) || 4000;
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`Server running on port ${port}`);

  // Mock 센서 5개 자동 시드 + generator 자동 시작 (실제 센서는 별도로 게이트웨이에서 수신)
  if (process.env.DISABLE_MOCK !== "1") {
    try {
      await ensureMockDevices();
      const result = await startMockGenerator(MOCK_GATEWAY_MAC, MOCK_DEVICE_MACS, 1000);
      app.log.info(`Mock generator: ${result.status} (${result.deviceCount} devices)`);
    } catch (err) {
      app.log.error(`Mock generator 시작 실패: ${err}`);
    }
  }
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
