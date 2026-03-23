import { FastifyInstance } from "fastify";
import { prisma } from "../index.js";
import { wsClients } from "./data.js";

let mockInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;

export async function mockRoutes(app: FastifyInstance) {
  // 모든 라우트에 인증 적용
  app.addHook("onRequest", (app as any).authenticate);

  // POST /api/mock/start — Mock 데이터 생성 시작
  app.post("/start", async (request, reply) => {
    if (mockInterval) {
      return { status: "already_running" };
    }

    const { gatewayMac, deviceMacs, intervalMs = 1000 } = request.body as {
      gatewayMac: string;
      deviceMacs: string[];
      intervalMs?: number;
    };

    if (!gatewayMac || !deviceMacs?.length) {
      return reply.status(400).send({ error: "gatewayMac and deviceMacs are required" });
    }

    // 최소 100ms 제한
    const safeInterval = Math.max(100, intervalMs);

    // Gateway 상태 업데이트
    await prisma.gateway.updateMany({
      where: { macAddress: gatewayMac },
      data: { status: "online", uptime: new Date() },
    });

    let tick = 0;

    mockInterval = setInterval(async () => {
      if (isProcessing) return; // 이전 작업이 끝나지 않으면 건너뜀
      isProcessing = true;
      tick++;
      try {
        for (const mac of deviceMacs) {
          const device = await prisma.device.findUnique({ where: { macAddress: mac } });
          if (!device) continue;

          // 시뮬레이션: 기본 전압 + 사인파 + 랜덤 노이즈
          const baseVoltage = 200;
          const sineComponent = 30 * Math.sin((tick / 20) * Math.PI * 2);
          const noise = (Math.random() - 0.5) * 10;
          const voltage = baseVoltage + sineComponent + noise;

          const battery = Math.max(0, 100 - Math.floor(tick / 60));
          const rssi = -50 - Math.floor(Math.random() * 20);

          await prisma.device.update({
            where: { id: device.id },
            data: { status: "online", voltage, rssi, battery, uptime: new Date() },
          });

          const sensorData = await prisma.sensorData.create({
            data: { deviceId: device.id, timestamp: new Date(), voltage },
          });

          // WebSocket 전파
          const clients = wsClients.get(device.id);
          if (clients) {
            const msg = JSON.stringify({
              deviceId: device.id,
              voltage,
              timestamp: sensorData.timestamp,
            });
            for (const client of clients) {
              try { client.send(msg); } catch { clients.delete(client); }
            }
          }
        }
      } catch (err) {
        console.error("Mock data error:", err);
      } finally {
        isProcessing = false;
      }
    }, safeInterval);

    return { status: "started", intervalMs: safeInterval };
  });

  // POST /api/mock/stop — Mock 데이터 생성 중지
  app.post("/stop", async () => {
    if (mockInterval) {
      clearInterval(mockInterval);
      mockInterval = null;
      isProcessing = false;
      return { status: "stopped" };
    }
    return { status: "not_running" };
  });

  // GET /api/mock/status
  app.get("/status", async () => {
    return { running: !!mockInterval };
  });
}
