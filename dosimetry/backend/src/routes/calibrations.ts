import { FastifyInstance } from "fastify";
import { prisma } from "../index.js";
import { applyFilter, calculateCumulativeDose, FilterType } from "../lib/smoothing.js";

export async function calibrationRoutes(app: FastifyInstance) {
  // 모든 라우트에 인증 적용
  app.addHook("onRequest", (app as any).authenticate);

  // POST /api/calibrations/calculate — 스무딩 + 누적선량 계산
  app.post("/calculate", async (request, reply) => {
    const body = request.body as {
      deviceId: number;
      startTime: string;
      endTime: string;
      filterType: FilterType;
      windowSize: number;
      baseline: number;
    };

    if (!body.deviceId || !body.startTime || !body.endTime) {
      return reply.status(400).send({ error: "deviceId, startTime, endTime은 필수입니다." });
    }

    const filterType = body.filterType || "median";
    const windowSize = body.windowSize || 10;
    const baseline = body.baseline ?? 0;

    // 센서 데이터 조회
    const sensorData = await prisma.sensorData.findMany({
      where: {
        deviceId: body.deviceId,
        timestamp: {
          gte: new Date(body.startTime),
          lte: new Date(body.endTime),
        },
      },
      orderBy: { timestamp: "asc" },
      take: 100000,
    });

    if (sensorData.length < 2) {
      return reply.status(400).send({ error: "계산에 필요한 데이터가 부족합니다. (최소 2개)" });
    }

    // 원본 데이터
    const timestamps = sensorData.map((d) => d.timestamp.getTime());
    const originalVoltages = sensorData.map((d) => Number(d.voltage) || 0);

    // 스무딩 적용
    const smoothedVoltages = applyFilter(originalVoltages, filterType, windowSize);

    // 누적선량 계산
    const cumulativeDose = calculateCumulativeDose(timestamps, smoothedVoltages, baseline);

    // 응답 데이터 (차트 표시용 — 최대 2000포인트로 다운샘플)
    const maxPoints = 2000;
    const step = Math.max(1, Math.floor(sensorData.length / maxPoints));

    const chartData = [];
    for (let i = 0; i < sensorData.length; i += step) {
      chartData.push({
        timestamp: sensorData[i].timestamp,
        original: originalVoltages[i],
        smoothed: smoothedVoltages[i],
      });
    }
    // 마지막 포인트 포함 보장
    if (chartData.length > 0 && chartData[chartData.length - 1].timestamp !== sensorData[sensorData.length - 1].timestamp) {
      chartData.push({
        timestamp: sensorData[sensorData.length - 1].timestamp,
        original: originalVoltages[originalVoltages.length - 1],
        smoothed: smoothedVoltages[smoothedVoltages.length - 1],
      });
    }

    return {
      totalPoints: sensorData.length,
      filterType,
      windowSize,
      baseline,
      cumulativeDose: Math.round(cumulativeDose * 100) / 100,
      chartData,
    };
  });

  // POST /api/calibrations/calculate-range — 특정 시간 범위의 누적선량 재계산
  app.post("/calculate-range", async (request, reply) => {
    const body = request.body as {
      deviceId: number;
      dataStartTime: string;  // 전체 데이터 범위
      dataEndTime: string;
      rangeStartTime: string; // 계산 범위
      rangeEndTime: string;
      filterType: FilterType;
      windowSize: number;
      baseline: number;
    };

    if (!body.deviceId || !body.rangeStartTime || !body.rangeEndTime) {
      return reply.status(400).send({ error: "필수 파라미터가 누락되었습니다." });
    }

    // 전체 데이터 범위에서 센서 데이터 조회 (스무딩은 전체에 적용해야 정확)
    const sensorData = await prisma.sensorData.findMany({
      where: {
        deviceId: body.deviceId,
        timestamp: {
          gte: new Date(body.dataStartTime || body.rangeStartTime),
          lte: new Date(body.dataEndTime || body.rangeEndTime),
        },
      },
      orderBy: { timestamp: "asc" },
      take: 100000,
    });

    if (sensorData.length < 2) {
      return reply.status(400).send({ error: "데이터가 부족합니다." });
    }

    const timestamps = sensorData.map((d) => d.timestamp.getTime());
    const originalVoltages = sensorData.map((d) => Number(d.voltage) || 0);
    const smoothedVoltages = applyFilter(originalVoltages, body.filterType || "median", body.windowSize || 10);

    // 지정 범위만 필터링
    const rangeStart = new Date(body.rangeStartTime).getTime();
    const rangeEnd = new Date(body.rangeEndTime).getTime();

    const rangeTimestamps: number[] = [];
    const rangeVoltages: number[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (timestamps[i] >= rangeStart && timestamps[i] <= rangeEnd) {
        rangeTimestamps.push(timestamps[i]);
        rangeVoltages.push(smoothedVoltages[i]);
      }
    }

    const cumulativeDose = calculateCumulativeDose(rangeTimestamps, rangeVoltages, body.baseline ?? 0);

    return {
      cumulativeDose: Math.round(cumulativeDose * 100) / 100,
      dataPoints: rangeTimestamps.length,
    };
  });

  // POST /api/calibrations — CF Factor 저장
  app.post("/", async (request, reply) => {
    const body = request.body as any;

    if (!body.deviceId || body.cumulativeDose == null || body.deliveredDose == null) {
      return reply.status(400).send({ error: "deviceId, cumulativeDose, deliveredDose는 필수입니다." });
    }

    if (body.deliveredDose <= 0) {
      return reply.status(400).send({ error: "Delivered Dose는 0보다 커야 합니다." });
    }

    const cfFactor = body.cumulativeDose / body.deliveredDose;
    const user = (request as any).user;

    const calibration = await prisma.calibration.create({
      data: {
        deviceId: body.deviceId,
        userId: user.id,
        date: body.date ? new Date(body.date) : new Date(),
        filterType: body.filterType,
        windowSize: body.windowSize,
        baseline: body.baseline,
        startTime: body.startTime ? new Date(body.startTime) : null,
        endTime: body.endTime ? new Date(body.endTime) : null,
        cumulativeDose: body.cumulativeDose,
        deliveredDose: body.deliveredDose,
        cfFactor,
        cfName: body.cfName || `CF_${new Date().toISOString().slice(0, 10)}`,
      },
    });

    return calibration;
  });

  // GET /api/calibrations — 목록 조회
  app.get("/", async (request) => {
    const { page = "1", size = "20", deviceId } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const sizeNum = Math.min(100, Math.max(1, parseInt(size, 10) || 20));
    const skip = (pageNum - 1) * sizeNum;

    const where: any = {};
    if (deviceId) where.deviceId = Number(deviceId);

    const [calibrations, total] = await Promise.all([
      prisma.calibration.findMany({
        where,
        skip,
        take: sizeNum,
        orderBy: { createdAt: "desc" },
        include: {
          device: { select: { deviceName: true, macAddress: true } },
          user: { select: { username: true, name: true } },
        },
      }),
      prisma.calibration.count({ where }),
    ]);

    return { data: calibrations, total, page: pageNum, size: sizeNum };
  });

  // GET /api/calibrations/:id
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const calibration = await prisma.calibration.findUnique({
      where: { id: Number(id) },
      include: {
        device: { select: { deviceName: true, macAddress: true } },
        user: { select: { username: true, name: true } },
      },
    });
    if (!calibration) return reply.status(404).send({ error: "Calibration not found" });
    return calibration;
  });

  // PUT /api/calibrations/:id
  app.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    try {
      const data: any = {};
      if (body.cfName !== undefined) data.cfName = body.cfName;
      if (body.filterType !== undefined) data.filterType = body.filterType;
      if (body.windowSize !== undefined) data.windowSize = body.windowSize;
      if (body.baseline !== undefined) data.baseline = body.baseline;

      const calibration = await prisma.calibration.update({
        where: { id: Number(id) },
        data,
      });
      return calibration;
    } catch (err: any) {
      if (err.code === "P2025") {
        return reply.status(404).send({ error: "Calibration not found" });
      }
      throw err;
    }
  });

  // DELETE /api/calibrations/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.calibration.delete({ where: { id: Number(id) } });
      return { message: "삭제되었습니다." };
    } catch (err: any) {
      if (err.code === "P2025") {
        return reply.status(404).send({ error: "Calibration not found" });
      }
      if (err.code === "P2003") {
        return reply.status(409).send({ error: "연결된 분석 결과가 있어 삭제할 수 없습니다." });
      }
      throw err;
    }
  });
}
