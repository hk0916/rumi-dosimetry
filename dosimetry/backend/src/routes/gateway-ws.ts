/**
 * Gateway WebSocket 핸들러
 * Gateway가 이 서버에 WebSocket으로 접속하여 바이너리 프로토콜로 통신
 *
 * 프로토콜 흐름:
 * - Gateway 접속 시 서버가 0x01 Request를 보내 Gateway 정보를 수집
 * - Gateway는 주기적으로 0x08 (GW Info Indication), 0x0A (Tag Data Indication), 0x0B (Dose Data Indication)을 전송
 * - 서버는 REST API를 통해 0x02~0x07, 0x09 커맨드를 Gateway에 전송 가능
 */
import { FastifyInstance } from "fastify";
import { prisma } from "../index.js";
import { wsClients } from "./data.js";
import {
  CMD, DIR, RET,
  extractPackets,
  parseGwInfoResponse,
  parseGwInfoIndication,
  parseTagDataIndication,
  parseDoseDataIndication,
  parseSimpleResponse,
  buildGetGwInfoRequest,
  buildGwInfoIndicationResponse,
  buildTagDataResponse,
  buildSetOtaServerUrl,
  buildSetWsServerUrl,
  buildSetReportInterval,
  buildSetRssiFilter,
  buildCmdOtaStart,
  buildGwFactoryReset,
  type ProtocolPacket,
} from "../protocol/index.js";

// 연결된 Gateway 소켓 관리 (MAC 주소 -> WebSocket)
const gatewayConnections = new Map<string, any>();
// 소켓 -> MAC 매핑 (연결 해제 시 사용)
const socketToMac = new Map<any, string>();
// 소켓별 수신 버퍼 (바이너리 스트림 누적)
const socketBuffers = new Map<any, Buffer>();
// Dose 데이터 timestamp 안정화용 advCount anchor (deviceId → 첫 advCount + 그 시점 서버시각 + 마지막 본 advCount)
// 이게 있어야 패킷 도착 시각의 지터가 timestamp 에 반영되지 않아서 차트가 안정적으로 그려진다.
const advAnchors = new Map<number, { firstAdv: number; anchorTime: number; lastAdv: number }>();
const SAMPLE_INTERVAL_MS = 25;

// 글로벌 anchor 시각 — 모든 디바이스가 공통 base 로 사용해서 timestamp 가 디바이스간 정렬되도록 한다.
// 이전엔 디바이스별로 첫 0x0B 도착 시각 기준 anchorTime 을 따로 잡아서, 게이트웨이가 5개 디바이스를
// 25ms 단위로 forwarding 하는 구조에서 디바이스간 anchor 시각이 25ms 씩 어긋났다 (사용자 시각으로
// "1개만 빠른 느낌"). globalAnchorTime 한 번만 잡고 전 디바이스가 공유하면 같은 advCount 진행 위치는
// 같은 timestamp 로 매핑됨.
let globalAnchorTime: number | null = null;

// MAC → device row 캐싱 (매 0x0B 마다 findUnique 안 하도록).
// 정상 등록 MAC 만 영구 캐시. 미등록 MAC 은 unknownMacExpiry 에서 TTL 로 관리해서
// (1) 같은 미등록 MAC 이 매 패킷마다 DB 두드리지 않게 (DDoS 보호)
// (2) 늦게 등록된 디바이스도 TTL 만료 후 재조회되어 자동 인식
// 이렇게 분리한 이유: 이전 구현은 null 도 같은 Map 에 캐시해 stuck 되는 startup race 가 있었음.
const deviceByMac = new Map<string, { id: number }>();
const unknownMacExpiry = new Map<string, number>();
// 짧게 잡은 이유: startup pool warmup race 등 일시적 매칭 실패 시 빠른 회복이 필요.
// DDoS 보호는 한 MAC 당 30초당 findUnique 1회 = 0.03 qps 로 충분.
const NEGATIVE_TTL_MS = 30 * 1000;

// 같은 socket 의 message handler 들을 promise chain 으로 직렬화 — async handler 가 await 사이에
// 다음 메시지를 인터리브 처리하던 race 를 차단. 인터리브 시 advCount 가 backend 처리 순서로 거꾸로 보여
// anchor.lastAdv 가 새 anchor 잡고 timestamp 가 역행하는 사선 artifact 의 근본 원인이었음.
const socketTasks = new WeakMap<object, Promise<void>>();
// 디바이스별 update 카운터 — 5 packet 마다만 device.update 실행 (createMany 가 데이터 저장 책임이고 update 는 status/last 메타용)
const updateCounterByDeviceId = new Map<number, number>();

export { gatewayConnections };

export function createGatewaySocketHandler(app: FastifyInstance) {
  return (socket: any, request: any) => {
    app.log.info("Gateway WebSocket 연결됨");
    socketBuffers.set(socket, Buffer.alloc(0));

    const infoReq = buildGetGwInfoRequest();
    socket.send(infoReq);
    app.log.info(`-> 0x01 Get GW Info Request 전송`);

    socket.on("message", (rawData: Buffer | ArrayBuffer | Buffer[]) => {
      const prev = socketTasks.get(socket) || Promise.resolve();
      const next = prev.then(() => processMessage(app, socket, rawData)).catch((err) => {
        app.log.error(`수신 처리 오류: ${err}`);
      });
      socketTasks.set(socket, next);
    });

    socket.on("close", () => {
      const mac = socketToMac.get(socket);
      if (mac) {
        gatewayConnections.delete(mac);
        socketToMac.delete(socket);
        prisma.gateway.updateMany({
          where: { macAddress: mac },
          data: { status: "offline" },
        }).catch((err) => app.log.error(`Gateway offline 업데이트 실패: ${err}`));
        app.log.info(`Gateway 연결 해제: ${mac}`);
      }
      socketBuffers.delete(socket);
    });

    socket.on("error", (err: Error) => {
      app.log.error(`Gateway WS 오류: ${err.message}`);
    });

    // Application-level WebSocket ping/pong 은 게이트웨이 펌웨어 로그에 EVENT_DATA(opcode=9/10, len=0)로
    // 잡혀서 노이즈가 되므로 보내지 않음. 연결 헬스체크는 TCP keep-alive 로 위임.
  };
}

export async function gatewayWsRoutes(app: FastifyInstance) {
  // Device offline monitor — uptime (마지막 0x0B 시각) 이 OFFLINE_TIMEOUT_MS 보다 오래된 online 디바이스를 offline 으로 마크.
  // online 으로 다시 전환은 0x0B 첫 패킷의 device.update 가 즉시 처리한다 (handleDoseDataIndication).
  const OFFLINE_TIMEOUT_MS = 10 * 1000;
  const OFFLINE_CHECK_INTERVAL_MS = 3 * 1000;
  const offlineMonitor = setInterval(async () => {
    try {
      const cutoff = new Date(Date.now() - OFFLINE_TIMEOUT_MS);
      const result = await prisma.device.updateMany({
        where: { status: "online", uptime: { lt: cutoff } },
        data: { status: "offline" },
      });
      if (result.count > 0) app.log.info(`[offline-monitor] ${result.count} devices → offline`);
    } catch (err) {
      app.log.error(`[offline-monitor] ${err}`);
    }
  }, OFFLINE_CHECK_INTERVAL_MS);
  app.addHook("onClose", async () => { clearInterval(offlineMonitor); });

  // ============ REST API: Gateway에 커맨드 전송 ============
  app.addHook("onRequest", (app as any).authenticate);

  // POST /ws/gw-cmd/info/:mac — 0x01 Get GW Information 요청
  app.post("/gw-cmd/info/:mac", async (request, reply) => {
    const { mac } = request.params as { mac: string };
    const ws = gatewayConnections.get(mac);
    if (!ws) return reply.status(404).send({ error: "Gateway가 연결되어 있지 않습니다.", mac });
    ws.send(buildGetGwInfoRequest());
    return { sent: true, command: "0x01 Get GW Info Request" };
  });

  // POST /ws/gw-cmd/ota-url/:mac — 0x02 Set OTA Server URL
  app.post("/gw-cmd/ota-url/:mac", async (request, reply) => {
    const { mac } = request.params as { mac: string };
    const { url } = request.body as { url: string };
    if (!url) return reply.status(400).send({ error: "url은 필수입니다." });
    const ws = gatewayConnections.get(mac);
    if (!ws) return reply.status(404).send({ error: "Gateway가 연결되어 있지 않습니다.", mac });
    ws.send(buildSetOtaServerUrl(url));
    return { sent: true, command: "0x02 Set OTA Server URL", url };
  });

  // POST /ws/gw-cmd/ws-url/:mac — 0x04 Set WS Server URL
  app.post("/gw-cmd/ws-url/:mac", async (request, reply) => {
    const { mac } = request.params as { mac: string };
    const { url } = request.body as { url: string };
    if (!url) return reply.status(400).send({ error: "url은 필수입니다." });
    const ws = gatewayConnections.get(mac);
    if (!ws) return reply.status(404).send({ error: "Gateway가 연결되어 있지 않습니다.", mac });
    ws.send(buildSetWsServerUrl(url));
    return { sent: true, command: "0x04 Set WS Server URL", url };
  });

  // POST /ws/gw-cmd/report-interval/:mac — 0x05 Set Report Interval
  app.post("/gw-cmd/report-interval/:mac", async (request, reply) => {
    const { mac } = request.params as { mac: string };
    const { seconds } = request.body as { seconds: number };
    if (seconds == null || seconds < 1) return reply.status(400).send({ error: "seconds는 1 이상이어야 합니다." });
    const ws = gatewayConnections.get(mac);
    if (!ws) return reply.status(404).send({ error: "Gateway가 연결되어 있지 않습니다.", mac });
    ws.send(buildSetReportInterval(seconds));
    return { sent: true, command: "0x05 Set Report Interval", seconds };
  });

  // POST /ws/gw-cmd/rssi-filter/:mac — 0x06 Set RSSI Filter
  app.post("/gw-cmd/rssi-filter/:mac", async (request, reply) => {
    const { mac } = request.params as { mac: string };
    const { rssi } = request.body as { rssi: number };
    if (rssi == null) return reply.status(400).send({ error: "rssi 값은 필수입니다." });
    const ws = gatewayConnections.get(mac);
    if (!ws) return reply.status(404).send({ error: "Gateway가 연결되어 있지 않습니다.", mac });
    ws.send(buildSetRssiFilter(rssi));
    return { sent: true, command: "0x06 Set RSSI Filter", rssi };
  });

  // POST /ws/gw-cmd/ota-start/:mac — 0x07 Cmd OTA Start (Manual)
  app.post("/gw-cmd/ota-start/:mac", async (request, reply) => {
    const { mac } = request.params as { mac: string };
    const { otaUri } = request.body as { otaUri: string };
    if (!otaUri) return reply.status(400).send({ error: "otaUri는 필수입니다." });
    const ws = gatewayConnections.get(mac);
    if (!ws) return reply.status(404).send({ error: "Gateway가 연결되어 있지 않습니다.", mac });
    ws.send(buildCmdOtaStart(otaUri));
    return { sent: true, command: "0x07 OTA Start (Manual)", otaUri };
  });

  // POST /ws/gw-cmd/factory-reset/:mac — 0x09 Factory Reset
  app.post("/gw-cmd/factory-reset/:mac", async (request, reply) => {
    const { mac } = request.params as { mac: string };
    const ws = gatewayConnections.get(mac);
    if (!ws) return reply.status(404).send({ error: "Gateway가 연결되어 있지 않습니다.", mac });
    ws.send(buildGwFactoryReset());
    return { sent: true, command: "0x09 Factory Reset" };
  });

  // GET /ws/gw-cmd/connections — 현재 연결된 Gateway 목록
  app.get("/gw-cmd/connections", async () => {
    const connections: { mac: string; connected: boolean }[] = [];
    for (const [mac, ws] of gatewayConnections.entries()) {
      connections.push({ mac, connected: ws.readyState === 1 });
    }
    return { connections, total: connections.length };
  });
}

/** 한 socket 의 message 1건을 처리. promise chain 으로 직렬 호출되므로 같은 socket 에서는 동시 실행되지 않는다. */
async function processMessage(app: FastifyInstance, socket: any, rawData: Buffer | ArrayBuffer | Buffer[]) {
  let incoming: Buffer;
  if (Buffer.isBuffer(rawData)) {
    incoming = rawData;
  } else if (rawData instanceof ArrayBuffer) {
    incoming = Buffer.from(rawData);
  } else {
    incoming = Buffer.concat(rawData);
  }
  const prevBuf = socketBuffers.get(socket) || Buffer.alloc(0);
  const combined = Buffer.concat([prevBuf, incoming]);
  const { packets, remaining, skipped } = extractPackets(combined);
  if (skipped > 0) {
    app.log.warn(`패킷 resync: ${skipped} bytes 스킵됨`);
  }
  socketBuffers.set(socket, remaining);
  for (const packet of packets) {
    // 한 패킷의 처리 실패가 같은 배치의 나머지 패킷 (특히 뒤따르는 0x0B Dose Data)
    // 을 잠식하지 않도록 격리. 이전엔 0x08 처리 실패 시 같은 WS 메시지의 0x0B 가 통째로 버려졌음.
    try {
      await handlePacket(app, socket, packet);
    } catch (perPacketErr) {
      app.log.error(`패킷 처리 오류 (CMD=0x${packet.dataType.toString(16).padStart(2, "0")}, DIR=0x${packet.direction.toString(16).padStart(2, "0")}): ${perPacketErr}`);
    }
  }
}

// ============ 패킷 처리 핸들러 ============

async function handlePacket(app: FastifyInstance, socket: any, packet: ProtocolPacket) {
  const cmdHex = `0x${packet.dataType.toString(16).padStart(2, "0")}`;
  const dirHex = `0x${packet.direction.toString(16).padStart(2, "0")}`;
  app.log.info(`<- 수신: CMD=${cmdHex}, DIR=${dirHex}, LEN=${packet.length}`);

  switch (packet.dataType) {
    case CMD.GET_GW_INFO:
      if (packet.direction === DIR.RESPONSE) {
        await handleGetGwInfoResponse(app, socket, packet);
      }
      break;

    case CMD.SET_OTA_SERVER_URL:
    case CMD.SET_WS_SERVER_URL:
    case CMD.SET_REPORT_INTERVAL:
    case CMD.SET_RSSI_FILTER:
    case CMD.CMD_OTA_START:
    case CMD.GW_FACTORY_RESET:
      if (packet.direction === DIR.RESPONSE) {
        handleSimpleResponse(app, packet);
      }
      break;

    case CMD.GW_INFO_INDICATION:
      if (packet.direction === DIR.INDICATION) {
        await handleGwInfoIndication(app, socket, packet);
      }
      break;

    case CMD.TAG_DATA_INDICATION:
      if (packet.direction === DIR.INDICATION) {
        await handleTagDataIndication(app, socket, packet);
      }
      break;

    case CMD.DOSE_DATA_INDICATION:
      if (packet.direction === DIR.INDICATION) {
        await handleDoseDataIndication(app, socket, packet);
      }
      break;

    default:
      app.log.warn(`알 수 없는 커맨드: ${cmdHex}`);
  }
}

/** 0x01 Response: Gateway 정보 수신 → DB 업데이트 + MAC 매핑 */
async function handleGetGwInfoResponse(app: FastifyInstance, socket: any, packet: ProtocolPacket) {
  const info = parseGwInfoResponse(packet.data);
  app.log.info(`GW Info Response: MAC=${info.btMacAddr}, HW=${info.hwVersion}, FW=${info.fwVersion}`);

  if (info.returnValue !== RET.SUCCESS) {
    app.log.warn(`GW Info Response 실패: returnValue=${info.returnValue}`);
    return;
  }

  // MAC 주소로 소켓 매핑 등록
  registerGateway(socket, info.btMacAddr);

  // DB 업데이트
  await prisma.gateway.updateMany({
    where: { macAddress: info.btMacAddr },
    data: {
      status: "online",
      deviceFwVersion: info.fwVersion,
      bleFwVersion: info.hwVersion,
      otaServerUrl: info.otaServerUrl,
      wsServerUrl: info.wsServerUrl,
      bleRssiThreshold: info.rssiFilter,
      reportInterval: info.reportInterval,
      uptime: new Date(),
    },
  });
}

/** 0x08 Indication: Gateway 정보 주기 보고 → DB 업데이트 + 응답 전송 */
async function handleGwInfoIndication(app: FastifyInstance, socket: any, packet: ProtocolPacket) {
  const info = parseGwInfoIndication(packet.data);
  app.log.info(`GW Info Indication: MAC=${info.btMacAddr}, FW=${info.fwVersion}`);

  // MAC 매핑 (아직 없는 경우)
  registerGateway(socket, info.btMacAddr);

  // DB 업데이트
  await prisma.gateway.updateMany({
    where: { macAddress: info.btMacAddr },
    data: {
      status: "online",
      deviceFwVersion: info.fwVersion,
      bleFwVersion: info.hwVersion,
      otaServerUrl: info.otaServerUrl,
      wsServerUrl: info.wsServerUrl,
      bleRssiThreshold: info.rssiFilter,
      reportInterval: info.reportInterval,
      uptime: new Date(),
    },
  });

  // 0x08 Response (Success) 전송
  socket.send(buildGwInfoIndicationResponse(RET.SUCCESS));
}

/** 0x0A Indication: Tag 비콘 데이터 수신 → DB 저장 + WebSocket 전파 + 응답 전송 */
async function handleTagDataIndication(app: FastifyInstance, socket: any, packet: ProtocolPacket) {
  const tag = parseTagDataIndication(packet.data);
  app.log.info(`Tag Data: MAC=${tag.btMacAddr}, RSSI=${tag.rssi}, ADC=${tag.beacon.doseAdc}, Battery=${tag.beacon.battery}%`);

  // Gateway MAC 확인
  const gwMac = socketToMac.get(socket);

  // 태그 MAC으로 디바이스 찾기
  const device = await prisma.device.findUnique({
    where: { macAddress: tag.btMacAddr },
  });

  if (device) {
    // ADC 값을 voltage로 변환 (4 bytes raw ADC)
    const voltage = tag.beacon.doseAdc;

    // 디바이스 상태 업데이트
    await prisma.device.update({
      where: { id: device.id },
      data: {
        status: "online",
        voltage,
        rssi: tag.rssi,
        battery: tag.beacon.battery,
        temperature: tag.beacon.temperature,
        txPower: tag.beacon.txPower,
        advertisingCount: tag.beacon.advertisingCount,
        localName: tag.beacon.localName,
        uptime: new Date(),
      },
    });

    // 센서 데이터 저장
    const sensorData = await prisma.sensorData.create({
      data: {
        deviceId: device.id,
        timestamp: new Date(),
        voltage,
        rssi: tag.rssi,
        battery: tag.beacon.battery,
        temperature: tag.beacon.temperature,
        advertisingCount: tag.beacon.advertisingCount,
        scanTick: tag.scanTick,
        gatewayMac: gwMac,
      },
    });

    // 프론트엔드 WebSocket 클라이언트에 실시간 전파
    const clients = wsClients.get(device.id);
    if (clients) {
      const msg = JSON.stringify({
        deviceId: device.id,
        voltage,
        rssi: tag.rssi,
        battery: tag.beacon.battery,
        temperature: tag.beacon.temperature,
        advertisingCount: tag.beacon.advertisingCount,
        doseAdc: tag.beacon.doseAdc,
        localName: tag.beacon.localName,
        scanTick: tag.scanTick,
        gatewayMac: gwMac,
        timestamp: sensorData.timestamp,
      });
      for (const client of clients) {
        try { client.send(msg); } catch { clients.delete(client); }
      }
    }
  } else {
    app.log.warn(`미등록 태그 디바이스: ${tag.btMacAddr}`);
  }

  // 0x0A Response (Success) 전송
  socket.send(buildTagDataResponse(RET.SUCCESS));
}

/** 0x0B Indication: Dose Data 수신 → DB 저장 + WebSocket 전파 + 응답 전송 */
async function handleDoseDataIndication(app: FastifyInstance, socket: any, packet: ProtocolPacket) {
  const dose = parseDoseDataIndication(packet.data);
  app.log.info(`Dose Data: MAC=${dose.btMacAddr}, RSSI=${dose.rssi}, Battery=${dose.battery}%, Temp=${dose.temperature.toFixed(2)}°C, Count=${dose.dataCount}`);

  const gwMac = socketToMac.get(socket);

  // device 조회 캐싱 — 등록 MAC 은 영구 캐시, 미등록 MAC 은 NEGATIVE_TTL_MS 마다 1회만 DB 조회
  let device = deviceByMac.get(dose.btMacAddr);
  if (!device) {
    const expireAt = unknownMacExpiry.get(dose.btMacAddr);
    if (expireAt !== undefined && expireAt > Date.now()) {
      return;
    }
    const found = await prisma.device.findUnique({
      where: { macAddress: dose.btMacAddr },
      select: { id: true },
    });
    if (found) {
      deviceByMac.set(dose.btMacAddr, found);
      unknownMacExpiry.delete(dose.btMacAddr);
      device = found;
    } else {
      const firstWarn = !unknownMacExpiry.has(dose.btMacAddr);
      unknownMacExpiry.set(dose.btMacAddr, Date.now() + NEGATIVE_TTL_MS);
      if (firstWarn) {
        app.log.warn(`미등록 태그 첫 발견: MAC=${dose.btMacAddr} — devices 테이블에 등록되어야 dose data 가 저장됩니다`);
      }
      return;
    }
  }
  const dev = device;

  {
    // 마지막 dose 데이터로 디바이스 상태 업데이트 — 5 packet 마다만 (메타 정보 갱신용, 데이터 저장은 createMany 가 담당)
    const lastDose = dose.doseData[dose.doseData.length - 1];
    const voltage = lastDose ? lastDose.doseSensingVal : undefined;
    const advertisingCount = lastDose ? lastDose.advCount : undefined;

    const updateCnt = (updateCounterByDeviceId.get(dev.id) ?? 0) + 1;
    updateCounterByDeviceId.set(dev.id, updateCnt);
    if (updateCnt % 5 === 1) {
      await prisma.device.update({
        where: { id: dev.id },
        data: {
          status: "online",
          voltage,
          rssi: dose.rssi,
          battery: dose.battery,
          temperature: Math.round(dose.temperature * 100),
          advertisingCount,
          uptime: new Date(),
        },
      });
    }

    // 각 dose 데이터를 SensorData로 저장.
    // timestamp 는 advCount 기반 anchor 에서 파생: ts = anchorTime + (adv - firstAdv) * 25ms.
    // 이렇게 해야 패킷 도착 시각 지터에 영향 받지 않고, 같은 advCount 는 같은 timestamp 로 매핑되어
    // 시간축 정렬 시 advCount 가 거꾸로 가거나 인접 패킷 간 timestamp 겹침이 발생하지 않는다.
    const nowMs = Date.now();
    const count = dose.doseData.length;
    const firstEntryAdv = dose.doseData[0].advCount;
    const lastEntryAdv = dose.doseData[count - 1].advCount;

    const existing = advAnchors.get(dev.id);
    // 새 anchor 가 필요한 경우: (1) 처음, (2) 새 세션(advCount 가 이전보다 작아짐), (3) 큰 점프(60초 이상 손실)
    const isReset = !!existing && (firstEntryAdv < existing.lastAdv || firstEntryAdv - existing.lastAdv > 60 * 40);
    const needNewAnchor = !existing || isReset;
    let anchor: { firstAdv: number; anchorTime: number; lastAdv: number };
    if (needNewAnchor) {
      // 첫 0x0B 도착 시 globalAnchorTime 을 한 번만 잡는다 — 마지막 entry 시각 = 패킷 도착 nowMs 기준 역산.
      // 이후 모든 디바이스의 정상 신규 anchor 가 이 값을 anchorTime 으로 공유 → 5개 라인이 시간축에서 정렬됨.
      // reset/대규모 끊김 (isReset) 케이스는 그 디바이스만 nowMs 기준으로 새 anchor 를 잡는다 — 그래야
      // advCount 가 0 부터 다시 시작해도 timestamp 가 옛날 시각이 아닌 현재로 들어가 LIVE_WINDOW 에 보인다.
      if (globalAnchorTime === null) {
        globalAnchorTime = nowMs - (lastEntryAdv - firstEntryAdv) * SAMPLE_INTERVAL_MS;
      }
      const anchorTime = isReset
        ? nowMs - (lastEntryAdv - firstEntryAdv) * SAMPLE_INTERVAL_MS
        : globalAnchorTime;
      anchor = {
        firstAdv: firstEntryAdv,
        anchorTime,
        lastAdv: lastEntryAdv,
      };
      advAnchors.set(dev.id, anchor);
    } else {
      existing.lastAdv = Math.max(existing.lastAdv, lastEntryAdv);
      anchor = existing;
    }
    // 한 번에 createMany 로 묶어서 connection pool 고갈 방지 (이전엔 40개 entry 마다 connection 점유)
    const tempCent = Math.round(dose.temperature * 100);
    const rows = dose.doseData.map((entry) => ({
      deviceId: dev.id,
      timestamp: new Date(anchor.anchorTime + (entry.advCount - anchor.firstAdv) * SAMPLE_INTERVAL_MS),
      voltage: entry.doseSensingVal,
      rssi: dose.rssi,
      battery: dose.battery,
      temperature: tempCent,
      advertisingCount: entry.advCount,
      gatewayMac: gwMac,
    }));
    const t0 = Date.now();
    const result = await prisma.sensorData.createMany({ data: rows });
    const elapsed = Date.now() - t0;
    app.log.info(`SAVE: device=${dose.btMacAddr} adv=[${rows[0].advertisingCount}..${rows[rows.length-1].advertisingCount}] expected=${rows.length} inserted=${result.count} ${elapsed}ms`);

    // 프론트엔드 WebSocket 클라이언트에 실시간 전파
    const clients = wsClients.get(dev.id);
    if (clients) {
      for (let i = 0; i < count; i++) {
        const entry = dose.doseData[i];
        const msg = JSON.stringify({
          deviceId: dev.id,
          voltage: entry.doseSensingVal,
          rssi: dose.rssi,
          battery: dose.battery,
          temperature: dose.temperature,
          advertisingCount: entry.advCount,
          doseSensingVal: entry.doseSensingVal,
          gatewayMac: gwMac,
          timestamp: rows[i].timestamp,
        });
        for (const client of clients) {
          try { client.send(msg); } catch { clients.delete(client); }
        }
      }
    }
  }
  // 0x0B는 Gateway에 Ack 응답을 보내지 않음
}

/** 일반 Response 처리 (0x02~0x07, 0x09) — 로그만 남김 */
function handleSimpleResponse(app: FastifyInstance, packet: ProtocolPacket) {
  const resp = parseSimpleResponse(packet.data);
  const cmdHex = `0x${packet.dataType.toString(16).padStart(2, "0")}`;
  const result = resp.returnValue === RET.SUCCESS ? "성공" : "실패";
  app.log.info(`${cmdHex} Response: ${result} (returnValue=${resp.returnValue})`);
}

/** Gateway 소켓-MAC 매핑 등록 */
function registerGateway(socket: any, mac: string) {
  if (!socketToMac.has(socket)) {
    socketToMac.set(socket, mac);
    gatewayConnections.set(mac, socket);
  }
}
