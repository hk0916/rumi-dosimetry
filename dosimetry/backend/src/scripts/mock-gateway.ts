/**
 * Mock Gateway — 백엔드의 게이트웨이 WS 엔드포인트 (`ws://backend:4000/`) 에 외부 클라이언트로 접속해서
 * 실 게이트웨이가 보내는 것과 동일한 binary 0x0B Dose Data 패킷을 1초마다 N개 태그에 대해 송신.
 *
 * 실행:
 *   docker exec -it dosimetry-backend npx tsx /app/src/scripts/mock-gateway.ts
 * 옵션 (환경변수):
 *   TAGS=6           (mock 태그 개수, 기본 6)
 *   PACKET_HZ=1      (초당 packet 빈도, 기본 1)
 *   ENTRIES=40       (한 packet 의 dose entry 수, 기본 40)
 *   LOSS_PCT=0       (전송 패킷 손실률 시뮬레이션 0~100, 기본 0)
 *   JITTER_MS=0      (송신 시각 무작위 지터 ±N ms, 기본 0)
 *   WS_URL=ws://backend:4000/   (백엔드 게이트웨이 WS, 기본 컨테이너 내부 호스트명)
 *
 * 주의: 이 스크립트가 동작하는 동안 backend 의 내장 mock generator (`DISABLE_MOCK=1` 미설정 시 자동 시작)
 *       와 같은 device_id 에 같이 쓰면 데이터 충돌. mock-gateway 는 tag MAC 을 별도로 사용.
 */
import WebSocket from "ws";

const TAGS = Number(process.env.TAGS ?? 6);
const PACKET_HZ = Number(process.env.PACKET_HZ ?? 1);
const ENTRIES = Number(process.env.ENTRIES ?? 40);
const LOSS_PCT = Number(process.env.LOSS_PCT ?? 0);
const JITTER_MS = Number(process.env.JITTER_MS ?? 0);
const WS_URL = process.env.WS_URL ?? "ws://backend:4000/";

const GATEWAY_MAC = "AA:BB:CC:DD:EE:FF"; // mock gateway MAC
// mock 태그 MAC: AA:BB:CC:11:00:01 ~
const TAG_MACS = Array.from({ length: TAGS }, (_, i) =>
  `AA:BB:CC:11:00:${(i + 1).toString(16).padStart(2, "0").toUpperCase()}`,
);

// ---- packet builders ----
function macToBytes(mac: string): Buffer {
  return Buffer.from(mac.split(":").map((h) => parseInt(h, 16)));
}

/** 0x01 GW Info Response (서버의 0x01 Request 에 응답) */
function buildGwInfoResponse(): Buffer {
  const otaUrl = "http://mock.local/ota.bin";
  const wsUrl = "ws://mock.local:5102/";
  const otaBuf = Buffer.from(otaUrl, "utf8");
  const wsBuf = Buffer.from(wsUrl, "utf8");
  const dataLen = 1 + 6 + 7 + 7 + 1 + otaBuf.length + 1 + wsBuf.length + 4 + 1;
  const buf = Buffer.alloc(4 + dataLen);
  let off = 0;
  buf.writeUInt8(0x01, off); off += 1; // CMD
  buf.writeUInt8(0x02, off); off += 1; // DIR Response
  buf.writeUInt16BE(dataLen, off); off += 2;
  // data
  buf.writeUInt8(0x00, off); off += 1; // returnValue SUCCESS
  macToBytes(GATEWAY_MAC).copy(buf, off); off += 6;
  Buffer.from("0.0.0.1", "ascii").copy(buf, off); off += 7; // HW
  Buffer.from("0.0.0.1", "ascii").copy(buf, off); off += 7; // FW
  buf.writeUInt8(otaBuf.length, off); off += 1;
  otaBuf.copy(buf, off); off += otaBuf.length;
  buf.writeUInt8(wsBuf.length, off); off += 1;
  wsBuf.copy(buf, off); off += wsBuf.length;
  buf.writeUInt32LE(60, off); off += 4; // reportInterval = 60s (LE per real gateway)
  buf.writeInt8(-90, off); off += 1; // rssiFilter
  return buf;
}

/** 0x08 GW Info Indication (주기 보고) */
function buildGwInfoIndication(): Buffer {
  const otaUrl = "http://mock.local/ota.bin";
  const wsUrl = "ws://mock.local:5102/";
  const otaBuf = Buffer.from(otaUrl, "utf8");
  const wsBuf = Buffer.from(wsUrl, "utf8");
  const dataLen = 6 + 7 + 7 + 1 + otaBuf.length + 1 + wsBuf.length + 4 + 1;
  const buf = Buffer.alloc(4 + dataLen);
  let off = 0;
  buf.writeUInt8(0x08, off); off += 1;
  buf.writeUInt8(0x03, off); off += 1;
  buf.writeUInt16BE(dataLen, off); off += 2;
  macToBytes(GATEWAY_MAC).copy(buf, off); off += 6;
  Buffer.from("0.0.0.1", "ascii").copy(buf, off); off += 7;
  Buffer.from("0.0.0.1", "ascii").copy(buf, off); off += 7;
  buf.writeUInt8(otaBuf.length, off); off += 1;
  otaBuf.copy(buf, off); off += otaBuf.length;
  buf.writeUInt8(wsBuf.length, off); off += 1;
  wsBuf.copy(buf, off); off += wsBuf.length;
  buf.writeUInt32LE(60, off); off += 4;
  buf.writeInt8(-90, off); off += 1;
  return buf;
}

/** 0x0B Dose Data Indication */
function buildDosePacket(
  tagMac: string,
  advCountStart: number,
  doseValues: number[],
  rssi: number,
  battery: number,
  tempCelsius: number,
): Buffer {
  const N = doseValues.length;
  const dataLen = 6 + 1 + 1 + 4 + 1 + N * 8;
  const buf = Buffer.alloc(4 + dataLen);
  let off = 0;
  buf.writeUInt8(0x0B, off); off += 1;
  buf.writeUInt8(0x03, off); off += 1;
  buf.writeUInt16BE(dataLen, off); off += 2;
  macToBytes(tagMac).copy(buf, off); off += 6;
  buf.writeInt8(rssi, off); off += 1;
  buf.writeUInt8(battery, off); off += 1;
  buf.writeFloatLE(tempCelsius, off); off += 4;
  buf.writeUInt8(N, off); off += 1;
  for (let i = 0; i < N; i++) {
    buf.writeUInt32LE(advCountStart + i, off); off += 4;
    buf.writeUInt32LE(doseValues[i], off); off += 4;
  }
  return buf;
}

// ---- main ----
function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(`[mock-gw ${new Date().toISOString().slice(11, 23)}] ${msg}`);
}

const advByMac = new Map<string, number>();
let txCount = 0;
let lossCount = 0;
let totalEntries = 0;

function nextDose(mac: string): number {
  // 488 ± 12 사이의 변동값 (실 센서와 비슷한 노이즈)
  const seed = mac.charCodeAt(mac.length - 1);
  const phase = (seed % 7) / 7 * Math.PI * 2;
  const t = Date.now() / 1000;
  const sine = 12 * Math.sin(t / 5 + phase);
  const noise = (Math.random() - 0.5) * 4;
  return Math.round(488 + sine + noise);
}

async function run() {
  log(`연결 시도: ${WS_URL} (tags=${TAGS}, hz=${PACKET_HZ}, entries=${ENTRIES}, loss=${LOSS_PCT}%, jitter=±${JITTER_MS}ms)`);
  log(`mock tag MACs: ${TAG_MACS.join(", ")}`);

  const ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    log(`connected`);
  });

  ws.on("message", (data: Buffer) => {
    if (data.length < 2) return;
    const cmd = data.readUInt8(0);
    const dir = data.readUInt8(1);
    log(`<- 수신 CMD=0x${cmd.toString(16).padStart(2, "0")} DIR=0x${dir.toString(16).padStart(2, "0")}`);
    if (cmd === 0x01 && dir === 0x01) {
      const resp = buildGwInfoResponse();
      ws.send(resp);
      log(`-> 0x01 Response 전송 (${resp.length}B)`);
    }
  });

  ws.on("error", (err: Error) => log(`WS error: ${err.message}`));
  ws.on("close", () => {
    log(`connection closed, exiting`);
    process.exit(0);
  });

  // 0x08 GW Info Indication: 매 10초마다
  const infoTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(buildGwInfoIndication());
  }, 10000);

  // 0x0B Dose Data: 태그마다 PACKET_HZ 횟수
  const dosePeriod = Math.round(1000 / PACKET_HZ);
  const doseTimer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    for (const mac of TAG_MACS) {
      const advStart = advByMac.get(mac) ?? 1;
      const doseValues: number[] = [];
      for (let i = 0; i < ENTRIES; i++) doseValues.push(nextDose(mac));
      const rssi = -30 - Math.floor(Math.random() * 30);
      const battery = 80;
      const tempC = 32 + Math.random() * 2;

      const send = () => {
        if (LOSS_PCT > 0 && Math.random() * 100 < LOSS_PCT) {
          lossCount += 1;
          // advCount 는 게이트웨이가 보낸 셈 치고 advance (실 게이트웨이가 못 받으면 advance 안 됨)
          // 여기선 "보낼 패킷 자체를 드롭" 시뮬레이션이므로 advCount 는 진행
          advByMac.set(mac, advStart + ENTRIES);
          return;
        }
        const pkt = buildDosePacket(mac, advStart, doseValues, rssi, battery, tempC);
        ws.send(pkt);
        txCount += 1;
        totalEntries += ENTRIES;
        advByMac.set(mac, advStart + ENTRIES);
      };

      if (JITTER_MS > 0) {
        const delay = Math.random() * JITTER_MS;
        setTimeout(send, delay);
      } else {
        send();
      }
    }
  }, dosePeriod);

  // 통계 로그
  const statsTimer = setInterval(() => {
    log(`tx=${txCount} loss=${lossCount} entries=${totalEntries} rate≈${(txCount * ENTRIES / 5).toFixed(0)}/sec (last 5s)`);
    txCount = 0; lossCount = 0; totalEntries = 0;
  }, 5000);

  process.on("SIGINT", () => {
    log("SIGINT — 종료");
    clearInterval(infoTimer);
    clearInterval(doseTimer);
    clearInterval(statsTimer);
    ws.close();
    setTimeout(() => process.exit(0), 500);
  });
}

run().catch((err) => {
  console.error("mock-gateway fatal:", err);
  process.exit(1);
});
