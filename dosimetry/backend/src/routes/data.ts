import { FastifyInstance } from "fastify";
import { prisma } from "../index.js";

// 활성 WebSocket 클라이언트 관리 (deviceId별)
export const wsClients = new Map<number, Set<any>>();

export async function dataRoutes(app: FastifyInstance) {
  // POST /api/data/ingest — Gateway가 센서 데이터 전송 (인증 없음 - Gateway 직접 호출)
  app.post("/ingest", async (request, reply) => {
    const body = request.body as {
      gateway_mac: string;
      devices: Array<{
        mac_address: string;
        voltage: number;
        rssi?: number;
        battery?: number;
        timestamp?: string;
      }>;
    };

    if (!body.gateway_mac || !Array.isArray(body.devices)) {
      return reply.status(400).send({ error: "gateway_mac and devices array are required" });
    }

    // Gateway 상태 업데이트
    await prisma.gateway.updateMany({
      where: { macAddress: body.gateway_mac },
      data: { status: "online", uptime: new Date() },
    });

    const results = [];

    for (const d of body.devices) {
      if (!d.mac_address || d.voltage == null || !isFinite(d.voltage)) continue;

      // Device 찾기
      const device = await prisma.device.findUnique({
        where: { macAddress: d.mac_address },
      });

      if (!device) continue;

      // 타임스탬프 검증
      const ts = d.timestamp ? new Date(d.timestamp) : new Date();
      if (isNaN(ts.getTime())) continue;

      // Device 상태 업데이트
      await prisma.device.update({
        where: { id: device.id },
        data: {
          status: "online",
          voltage: d.voltage,
          rssi: d.rssi,
          battery: d.battery,
          uptime: new Date(),
        },
      });

      // 센서 데이터 저장
      const sensorData = await prisma.sensorData.create({
        data: {
          deviceId: device.id,
          timestamp: ts,
          voltage: d.voltage,
        },
      });

      results.push(sensorData);

      // WebSocket으로 실시간 전파
      const clients = wsClients.get(device.id);
      if (clients) {
        const msg = JSON.stringify({
          deviceId: device.id,
          voltage: d.voltage,
          timestamp: sensorData.timestamp,
        });
        for (const client of clients) {
          try {
            client.send(msg);
          } catch {
            clients.delete(client);
          }
        }
      }
    }

    return { received: results.length };
  });

  // GET /api/data/sensor-data — 센서 데이터 조회 (인증 필요)
  app.get("/sensor-data", {
    preHandler: [(app as any).authenticate],
  }, async (request) => {
    const { deviceId, startDate, endDate, startTime, endTime } =
      request.query as Record<string, string>;

    if (!deviceId) {
      return { data: [], total: 0 };
    }

    const where: any = { deviceId: Number(deviceId) };

    if (startDate && startTime && endDate && endTime) {
      where.timestamp = {
        gte: new Date(`${startDate}T${startTime}`),
        lte: new Date(`${endDate}T${endTime}.999`),
      };
    } else if (startDate && endDate) {
      where.timestamp = {
        gte: new Date(`${startDate}T00:00:00`),
        lte: new Date(`${endDate}T23:59:59.999`),
      };
    }

    const data = await prisma.sensorData.findMany({
      where,
      orderBy: { timestamp: "asc" },
      take: 50000,
    });

    return {
      data: data.map((d) => ({
        id: d.id.toString(),
        voltage: d.voltage,
        timestamp: d.timestamp,
      })),
      total: data.length,
    };
  });
}
