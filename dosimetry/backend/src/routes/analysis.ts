import { FastifyInstance } from "fastify";
import { prisma } from "../index.js";
import { applyFilter, calculateCumulativeDose, FilterType } from "../lib/smoothing.js";

export async function analysisRoutes(app: FastifyInstance) {
  app.addHook("onRequest", (app as any).authenticate);

  // GET /api/analysis/radiation-factors — 방사선 가중 인자 목록
  app.get("/radiation-factors", async () => {
    const factors = await prisma.radiationWeightingFactor.findMany();
    return { data: factors };
  });

  // GET /api/analysis/tissue-factors — 조직 가중 인자 목록
  app.get("/tissue-factors", async () => {
    const factors = await prisma.tissueWeightingFactor.findMany();
    return { data: factors };
  });

  // POST /api/analysis/calculate — 4종 선량 계산
  app.post("/calculate", async (request, reply) => {
    const body = request.body as {
      calibrationId?: number;
      calibrationIds?: number[];  // 다중 선택 시 평균 CF 사용
      radiationSource: string;
      targetOrgan: string;
      rangeType: string;       // "full" | "sub"
      subRangeStart?: string;
      subRangeEnd?: string;
      // 직접 계산 모드 (calibration 없이)
      deviceId?: number;
      startTime?: string;
      endTime?: string;
      filterType?: FilterType;
      windowSize?: number;
      baseline?: number;
    };

    // 다중 선택: calibrationIds가 있으면 첫 번째를 대표(calibrationId)로 사용
    const multiIds: number[] = Array.isArray(body.calibrationIds) && body.calibrationIds.length > 0
      ? body.calibrationIds
      : (body.calibrationId ? [body.calibrationId] : []);
    const primaryId = multiIds[0];

    if (!primaryId || !body.radiationSource || !body.targetOrgan) {
      return reply.status(400).send({ error: "calibrationId(s), radiationSource, targetOrgan은 필수입니다." });
    }

    // wR, wT 조회
    const radiationFactor = await prisma.radiationWeightingFactor.findFirst({
      where: { radiationSource: body.radiationSource },
    });
    const tissueFactor = await prisma.tissueWeightingFactor.findFirst({
      where: { organName: body.targetOrgan },
    });

    if (!radiationFactor || !tissueFactor) {
      return reply.status(400).send({ error: "유효하지 않은 방사선 종류 또는 장기입니다." });
    }

    const wR = Number(radiationFactor.weightingFactor);
    const wT = Number(tissueFactor.weightingFactor);

    let cumulativeDose: number;
    let cfFactor: number;
    let deviceId: number;
    let filterType: string = "median";
    let windowSize: number = 10;
    let baseline: number = 0;
    let calcStartTime: string | undefined;
    let calcEndTime: string | undefined;

    if (primaryId) {
      // Calibration 기반 계산 (다중 선택 시 평균 CF 사용)
      const calibrations = await prisma.calibration.findMany({
        where: { id: { in: multiIds } },
      });
      if (calibrations.length === 0) {
        return reply.status(404).send({ error: "Calibration을 찾을 수 없습니다." });
      }

      const cfs = calibrations
        .map((c) => Number(c.cfFactor))
        .filter((v) => isFinite(v) && v > 0);
      if (cfs.length === 0) {
        return reply.status(400).send({ error: "CF Factor가 없는 Calibration입니다." });
      }

      // 다중: 평균 / 단일: 그 값
      cfFactor = cfs.reduce((a, b) => a + b, 0) / cfs.length;

      // 대표 calibration(primary)의 설정으로 필터/범위 적용
      const calibration = calibrations.find((c) => c.id === primaryId) || calibrations[0];
      deviceId = calibration.deviceId;
      filterType = calibration.filterType || "median";
      windowSize = calibration.windowSize || 10;
      baseline = Number(calibration.baseline) || 0;

      if (body.rangeType === "sub" && body.subRangeStart && body.subRangeEnd) {
        // Sub range: 지정 범위 재계산
        calcStartTime = body.subRangeStart;
        calcEndTime = body.subRangeEnd;
      } else {
        // Full range: calibration 범위 사용
        calcStartTime = calibration.startTime?.toISOString();
        calcEndTime = calibration.endTime?.toISOString();
      }

      if (!calcStartTime || !calcEndTime) {
        return reply.status(400).send({ error: "시간 범위를 확인할 수 없습니다." });
      }

      // 센서 데이터 조회 + 스무딩 + 적분
      const sensorData = await prisma.sensorData.findMany({
        where: {
          deviceId,
          timestamp: {
            gte: new Date(calcStartTime),
            lte: new Date(calcEndTime),
          },
        },
        orderBy: { timestamp: "asc" },
        take: 100000,
      });

      if (sensorData.length < 2) {
        return reply.status(400).send({ error: "계산에 필요한 데이터가 부족합니다." });
      }

      const timestamps = sensorData.map((d) => d.timestamp.getTime());
      const voltages = sensorData.map((d) => Number(d.voltage) || 0);
      const smoothed = applyFilter(voltages, filterType as FilterType, windowSize);
      cumulativeDose = calculateCumulativeDose(timestamps, smoothed, baseline);

    } else if (body.deviceId && body.startTime && body.endTime) {
      // 직접 계산 모드
      deviceId = body.deviceId;
      filterType = body.filterType || "median";
      windowSize = body.windowSize || 10;
      baseline = body.baseline ?? 0;
      cfFactor = 1; // CF Factor 없이 직접 계산 시 1로 처리
      calcStartTime = body.startTime;
      calcEndTime = body.endTime;

      const sensorData = await prisma.sensorData.findMany({
        where: {
          deviceId,
          timestamp: {
            gte: new Date(calcStartTime),
            lte: new Date(calcEndTime),
          },
        },
        orderBy: { timestamp: "asc" },
        take: 100000,
      });

      if (sensorData.length < 2) {
        return reply.status(400).send({ error: "데이터가 부족합니다." });
      }

      const timestamps = sensorData.map((d) => d.timestamp.getTime());
      const voltages = sensorData.map((d) => Number(d.voltage) || 0);
      const smoothed = applyFilter(voltages, filterType as FilterType, windowSize);
      cumulativeDose = calculateCumulativeDose(timestamps, smoothed, baseline);
    } else {
      return reply.status(400).send({ error: "calibrationId 또는 deviceId+시간범위가 필요합니다." });
    }

    // 4종 선량 계산
    const absorbedDose = cumulativeDose / cfFactor;  // Gy (cGy)
    const equivalentDose = absorbedDose * wR;         // Sv
    const effectiveDose = equivalentDose * wT;         // Sv

    const round6 = (v: number) => Math.round(v * 1000000) / 1000000;

    // DB 저장
    const user = (request as any).user;
    const result = await prisma.analysisResult.create({
      data: {
        calibrationId: primaryId,
        userId: user.id,
        radiationSource: body.radiationSource,
        targetOrgan: body.targetOrgan,
        rangeType: body.rangeType || "full",
        subRangeStart: body.subRangeStart ? new Date(body.subRangeStart) : null,
        subRangeEnd: body.subRangeEnd ? new Date(body.subRangeEnd) : null,
        cumulativeDose: round6(cumulativeDose),
        absorbedDose: round6(absorbedDose),
        equivalentDose: round6(equivalentDose),
        effectiveDose: round6(effectiveDose),
      },
    });

    return {
      id: result.id,
      cumulativeDose: round6(cumulativeDose),
      absorbedDose: round6(absorbedDose),
      equivalentDose: round6(equivalentDose),
      effectiveDose: round6(effectiveDose),
      wR,
      wT,
      cfFactor,
    };
  });

  // GET /api/analysis — 분석 결과 목록
  app.get("/", async (request) => {
    const { page = "1", size = "20" } = request.query as Record<string, string>;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const sizeNum = Math.min(100, Math.max(1, parseInt(size, 10) || 20));
    const skip = (pageNum - 1) * sizeNum;

    const [results, total] = await Promise.all([
      prisma.analysisResult.findMany({
        skip,
        take: sizeNum,
        orderBy: { createdAt: "desc" },
        include: {
          calibration: {
            select: {
              id: true, cfFactor: true, cfName: true,
              device: { select: { deviceName: true } },
            },
          },
          user: { select: { username: true, name: true } },
        },
      }),
      prisma.analysisResult.count(),
    ]);

    return { data: results, total, page: pageNum, size: sizeNum };
  });

  // GET /api/analysis/:id
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await prisma.analysisResult.findUnique({
      where: { id: Number(id) },
      include: {
        calibration: {
          select: {
            id: true, cfFactor: true, cfName: true, filterType: true,
            windowSize: true, baseline: true,
            device: { select: { deviceName: true, macAddress: true } },
          },
        },
        user: { select: { username: true, name: true } },
      },
    });
    if (!result) return reply.status(404).send({ error: "Analysis result not found" });
    return result;
  });

  // DELETE /api/analysis/:id
  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      await prisma.analysisResult.delete({ where: { id: Number(id) } });
      return { message: "삭제되었습니다." };
    } catch (err: any) {
      if (err.code === "P2025") {
        return reply.status(404).send({ error: "Not found" });
      }
      throw err;
    }
  });

  // GET /api/analysis/:id/export — CSV 내보내기
  // Query: type=summary|raw|smoothing (default=summary)
  app.get("/:id/export", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { type = "summary" } = request.query as { type?: string };

    const result = await prisma.analysisResult.findUnique({
      where: { id: Number(id) },
      include: {
        calibration: {
          include: { device: { select: { deviceName: true, macAddress: true } } },
        },
        user: { select: { username: true, name: true } },
      },
    });

    if (!result) return reply.status(404).send({ error: "Not found" });

    // 공통 헤더 (메타)
    const cal = result.calibration;
    const filterType = (cal?.filterType || "median") as FilterType;
    const windowSize = cal?.windowSize || 10;
    const baseline = Number(cal?.baseline) || 0;
    const deviceId = cal?.deviceId;
    const startTime = result.rangeType === "sub" && result.subRangeStart ? result.subRangeStart : cal?.startTime;
    const endTime = result.rangeType === "sub" && result.subRangeEnd ? result.subRangeEnd : cal?.endTime;

    const metaLines = [
      "Dosimetry Analysis Report",
      `Generated,${new Date().toISOString()}`,
      `Report Type,${type}`,
      "",
      "Device," + (cal?.device?.deviceName || "N/A"),
      "MAC Address," + (cal?.device?.macAddress || "N/A"),
      "User," + (result.user?.name || result.user?.username || "N/A"),
      "CF Name," + (cal?.cfName || "N/A"),
      "CF Factor," + (cal?.cfFactor || "N/A"),
      "Filter Type," + (cal?.filterType || ""),
      "Window Size," + (cal?.windowSize || ""),
      `Baseline (mV),${(baseline * 1000).toFixed(6)}`,
      "Range Type," + (result.rangeType || ""),
      "Start Time," + (startTime?.toISOString() || ""),
      "End Time," + (endTime?.toISOString() || ""),
      "Radiation Source," + (result.radiationSource || ""),
      "Target Organ," + (result.targetOrgan || ""),
      "",
    ];

    // summary: dose summary only
    if (type === "summary") {
      const lines = [
        ...metaLines,
        "Dose Type,Value,Unit",
        `Cumulative Dose (V·s),${result.cumulativeDose},V·s`,
        `Cumulative Dose (mV·s),${(Number(result.cumulativeDose) * 1000).toFixed(6)},mV·s`,
        `Absorbed Dose,${result.absorbedDose},Gy`,
        `Equivalent Dose,${result.equivalentDose},Sv`,
        `Effective Dose,${result.effectiveDose},Sv`,
      ];
      const csv = "\uFEFF" + lines.join("\n");
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="analysis_${id}_summary.csv"`);
      return reply.send(csv);
    }

    // raw / smoothing: 센서 데이터 필요
    if (!deviceId || !startTime || !endTime) {
      return reply.status(400).send({ error: "Calibration 범위 정보가 없어 raw/smoothing을 내보낼 수 없습니다." });
    }

    const sensorData = await prisma.sensorData.findMany({
      where: {
        deviceId,
        timestamp: { gte: new Date(startTime), lte: new Date(endTime) },
      },
      orderBy: { timestamp: "asc" },
      take: 200000,
    });

    if (sensorData.length === 0) {
      return reply.status(400).send({ error: "데이터가 없습니다." });
    }

    const voltages = sensorData.map((d) => Number(d.voltage) || 0);

    const RAW_MAX = 0xFFFFF;
    const REF_V = 1.21;
    const toRaw = (v: number) => Math.round((v * RAW_MAX) / REF_V);

    if (type === "raw") {
      const rows = sensorData.map((d, i) => {
        const vV = voltages[i];
        return [
          i + 1,
          d.timestamp.toISOString(),
          toRaw(vV),
          (vV * 1000).toString(),
          vV.toString(),
        ].join(",");
      });
      const lines = [
        ...metaLines,
        "Index,Timestamp,Raw,Voltage(mV),Voltage(V)",
        ...rows,
      ];
      const csv = "\uFEFF" + lines.join("\n");
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="analysis_${id}_raw.csv"`);
      return reply.send(csv);
    }

    if (type === "smoothing") {
      const smoothed = applyFilter(voltages, filterType, windowSize);
      const rows = sensorData.map((d, i) => {
        const vV = voltages[i];
        const sV = smoothed[i];
        return [
          i + 1,
          d.timestamp.toISOString(),
          toRaw(vV),
          (vV * 1000).toString(),
          (sV * 1000).toString(),
          (sV * 1000 - baseline * 1000).toString(),
        ].join(",");
      });
      const lines = [
        ...metaLines,
        "Index,Timestamp,Raw,Original(mV),Smoothed(mV),Filtered(mV)",
        ...rows,
      ];
      const csv = "\uFEFF" + lines.join("\n");
      reply.header("Content-Type", "text/csv; charset=utf-8");
      reply.header("Content-Disposition", `attachment; filename="analysis_${id}_smoothing.csv"`);
      return reply.send(csv);
    }

    return reply.status(400).send({ error: "type은 summary|raw|smoothing이어야 합니다." });
  });
}
