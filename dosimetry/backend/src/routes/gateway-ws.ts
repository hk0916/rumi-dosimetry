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
  buildSetOtaFileName,
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

export { gatewayConnections };

export function createGatewaySocketHandler(app: FastifyInstance) {
  return (socket: any, request: any) => {
    app.log.info("Gateway WebSocket 연결됨");
    socketBuffers.set(socket, Buffer.alloc(0));

    const infoReq = buildGetGwInfoRequest();
    socket.send(infoReq);
    app.log.info(`-> 0x01 Get GW Info Request 전송`);

    socket.on("message", async (rawData: Buffer | ArrayBuffer | Buffer[]) => {
      try {
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
          await handlePacket(app, socket, packet);
        }
      } catch (err) {
        app.log.error(`패킷 처리 오류: ${err}`);
      }
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

    const pingInterval = setInterval(() => {
      if (socket.readyState === 1) {
        socket.ping();
      } else {
        clearInterval(pingInterval);
      }
    }, 30000);
    socket.on("close", () => clearInterval(pingInterval));
  };
}

export async function gatewayWsRoutes(app: FastifyInstance) {
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

  // POST /ws/gw-cmd/ota-filename/:mac — 0x03 Set OTA File Name
  app.post("/gw-cmd/ota-filename/:mac", async (request, reply) => {
    const { mac } = request.params as { mac: string };
    const { fileName } = request.body as { fileName: string };
    if (!fileName) return reply.status(400).send({ error: "fileName은 필수입니다." });
    const ws = gatewayConnections.get(mac);
    if (!ws) return reply.status(404).send({ error: "Gateway가 연결되어 있지 않습니다.", mac });
    ws.send(buildSetOtaFileName(fileName));
    return { sent: true, command: "0x03 Set OTA File Name", fileName };
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
    case CMD.SET_OTA_FILE_NAME:
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
      otaFileName: info.otaFileName,
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
      otaFileName: info.otaFileName,
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

  const device = await prisma.device.findUnique({
    where: { macAddress: dose.btMacAddr },
  });

  if (device) {
    // 마지막 dose 데이터로 디바이스 상태 업데이트
    const lastDose = dose.doseData[dose.doseData.length - 1];
    const voltage = lastDose ? lastDose.doseSensingVal : undefined;
    const advertisingCount = lastDose ? lastDose.advCount : undefined;

    await prisma.device.update({
      where: { id: device.id },
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

    // 각 dose 데이터를 SensorData로 저장
    // 한 패킷 내 entry별로 1ms씩 차이를 둬서 timestamp 중복 방지
    const nowMs = Date.now();
    for (let i = 0; i < dose.doseData.length; i++) {
      const entry = dose.doseData[i];
      const sensorData = await prisma.sensorData.create({
        data: {
          deviceId: device.id,
          timestamp: new Date(nowMs + i),
          voltage: entry.doseSensingVal,
          rssi: dose.rssi,
          battery: dose.battery,
          temperature: Math.round(dose.temperature * 100),
          advertisingCount: entry.advCount,
          gatewayMac: gwMac,
        },
      });

      // 프론트엔드 WebSocket 클라이언트에 실시간 전파
      const clients = wsClients.get(device.id);
      if (clients) {
        const msg = JSON.stringify({
          deviceId: device.id,
          voltage: entry.doseSensingVal,
          rssi: dose.rssi,
          battery: dose.battery,
          temperature: dose.temperature,
          advertisingCount: entry.advCount,
          doseSensingVal: entry.doseSensingVal,
          gatewayMac: gwMac,
          timestamp: sensorData.timestamp,
        });
        for (const client of clients) {
          try { client.send(msg); } catch { clients.delete(client); }
        }
      }
    }
  } else {
    app.log.warn(`미등록 태그 디바이스: ${dose.btMacAddr}`);
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
