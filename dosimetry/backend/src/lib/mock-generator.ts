import { prisma } from "../index.js";
import { wsClients } from "../routes/data.js";

let mockInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
let mockState: { gatewayMac: string; deviceMacs: string[]; intervalMs: number; tick: number } | null = null;
// 디바이스별 마지막 entry 의 timestamp (ms epoch). setInterval jitter 와 무관하게 25ms 간격을 유지하기 위해.
const lastEntryMsByMac = new Map<string, number>();
// device.id 캐시 (매 tick 마다 findUnique 안 하도록)
const deviceIdByMac = new Map<string, number>();

export async function startMockGenerator(
  gatewayMac: string,
  deviceMacs: string[],
  intervalMs = 1000,
): Promise<{ status: "started" | "already_running"; intervalMs: number; deviceCount: number }> {
  if (mockInterval) {
    return { status: "already_running", intervalMs: mockState!.intervalMs, deviceCount: mockState!.deviceMacs.length };
  }

  const safeInterval = Math.max(100, intervalMs);
  mockState = { gatewayMac, deviceMacs, intervalMs: safeInterval, tick: 0 };

  await prisma.gateway.updateMany({
    where: { macAddress: gatewayMac },
    data: { status: "online", uptime: new Date() },
  });

  // 시작 시 device.id 한 번만 조회해서 캐싱
  for (const mac of deviceMacs) {
    const device = await prisma.device.findUnique({ where: { macAddress: mac } });
    if (device) deviceIdByMac.set(mac, device.id);
  }

  mockInterval = setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;
    mockState!.tick++;
    const tick = mockState!.tick;
    const tickStart = Date.now();
    try {
      for (let i = 0; i < deviceMacs.length; i++) {
        const mac = deviceMacs[i];
        const deviceId = deviceIdByMac.get(mac);
        if (deviceId == null) continue;
        const device = { id: deviceId };

        // 실 센서 동일 패턴: 1초마다 40개 entry, 25ms 간격으로 펼침
        const SAMPLES_PER_PACKET = 40;
        const SAMPLE_INTERVAL_MS = 25;
        const phase = (i / deviceMacs.length) * Math.PI * 2;
        const battery = Math.max(20, 100 - Math.floor(tick / 60) - i * 2);
        const rssi = -50 - Math.floor(Math.random() * 20) - i;
        const temperature = 2200 + Math.floor(Math.random() * 300);

        // setInterval jitter 와 무관하게 25ms 간격 보장. 처리 지연이 쌓여 mock 시각이 실시간 대비
        // 60초 이상 뒤처지면 따라잡기 위해 점프 (LIVE_WINDOW_MS=2분 안에 들어가도록).
        const nowMs = Date.now();
        const previousLast = lastEntryMsByMac.get(mac);
        const continuousStart = previousLast != null ? previousLast + SAMPLE_INTERVAL_MS : nowMs - (SAMPLES_PER_PACKET - 1) * SAMPLE_INTERVAL_MS;
        const startMs = (nowMs - continuousStart > 60000)
          ? nowMs - (SAMPLES_PER_PACKET - 1) * SAMPLE_INTERVAL_MS
          : continuousStart;

        let lastVoltage = 0;
        const rows = [] as { ts: Date; voltage: number; advCount: number }[];
        for (let s = 0; s < SAMPLES_PER_PACKET; s++) {
          const subTick = tick + s / SAMPLES_PER_PACKET;
          const sineComponent = 15 * Math.sin((subTick / 30) * Math.PI * 2 + phase);
          const noise = (Math.random() - 0.5) * 4;
          const voltage = 500 + sineComponent + noise;
          lastVoltage = voltage;
          rows.push({
            ts: new Date(startMs + s * SAMPLE_INTERVAL_MS),
            voltage,
            advCount: tick * SAMPLES_PER_PACKET + s,
          });
        }
        // 다음 tick 이 25ms 간격 이어서 시작하도록 마지막 entry 시각 기억
        lastEntryMsByMac.set(mac, startMs + (SAMPLES_PER_PACKET - 1) * SAMPLE_INTERVAL_MS);

        // device.update 는 매 초 안 함 (5tick=5초마다, 장치관리 페이지의 5초 reload 와 정렬). createMany 우선.
        if (tick % 5 === 0) {
          await prisma.device.update({
            where: { id: device.id },
            data: {
              status: "online", voltage: lastVoltage, rssi, battery,
              temperature, txPower: -4,
              advertisingCount: rows[rows.length - 1].advCount,
              localName: "MOCK",
              uptime: new Date(),
            },
          });
        }

        await prisma.sensorData.createMany({
          data: rows.map((r) => ({
            deviceId: device.id,
            timestamp: r.ts,
            voltage: r.voltage,
            rssi, battery, temperature,
            advertisingCount: r.advCount,
            scanTick: r.advCount,
            gatewayMac,
          })),
        });

        const clients = wsClients.get(device.id);
        if (clients) {
          for (const r of rows) {
            const msg = JSON.stringify({
              deviceId: device.id,
              voltage: r.voltage,
              advertisingCount: r.advCount,
              timestamp: r.ts,
            });
            for (const client of clients) {
              try { client.send(msg); } catch { clients.delete(client); }
            }
          }
        }
      }
    } catch (err) {
      console.error("Mock generator error:", err);
    } finally {
      const tickElapsed = Date.now() - tickStart;
      if (tickElapsed > 800) {
        console.warn(`[mock] tick ${tick} took ${tickElapsed}ms (target ≤1000ms)`);
      }
      isProcessing = false;
    }
  }, safeInterval);

  return { status: "started", intervalMs: safeInterval, deviceCount: deviceMacs.length };
}

export function stopMockGenerator(): { status: "stopped" | "not_running" } {
  if (mockInterval) {
    clearInterval(mockInterval);
    mockInterval = null;
    mockState = null;
    isProcessing = false;
    lastEntryMsByMac.clear();
    return { status: "stopped" };
  }
  return { status: "not_running" };
}

export function getMockGeneratorStatus() {
  return {
    running: !!mockInterval,
    state: mockState ? { gatewayMac: mockState.gatewayMac, deviceMacs: mockState.deviceMacs, intervalMs: mockState.intervalMs } : null,
  };
}
