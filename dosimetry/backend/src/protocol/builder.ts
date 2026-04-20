/**
 * Lumi 바이너리 프로토콜 빌더
 * Server -> Gateway 전송 패킷 생성
 */
import { CMD, DIR } from "./constants.js";

/**
 * 프로토콜 패킷 생성 (DataType + Direction + Length + Data)
 */
function buildPacket(dataType: number, direction: number, data?: Buffer): Buffer {
  if (!data || data.length === 0) {
    // 데이터 없는 패킷 (예: 0x01 Request, 0x09 Request)
    const buf = Buffer.alloc(2);
    buf.writeUInt8(dataType, 0);
    buf.writeUInt8(direction, 1);
    return buf;
  }

  const buf = Buffer.alloc(4 + data.length);
  buf.writeUInt8(dataType, 0);
  buf.writeUInt8(direction, 1);
  buf.writeUInt16BE(data.length, 2);
  data.copy(buf, 4);
  return buf;
}

// ============ 0x01: Get GW Information Request ============
export function buildGetGwInfoRequest(): Buffer {
  return buildPacket(CMD.GET_GW_INFO, DIR.REQUEST);
}

// ============ 0x02: Set OTA Server URL Request ============
export function buildSetOtaServerUrl(url: string): Buffer {
  const urlBuf = Buffer.from(url, "utf8");
  return buildPacket(CMD.SET_OTA_SERVER_URL, DIR.REQUEST, urlBuf);
}

// ============ 0x03: Set OTA File Name Request ============
export function buildSetOtaFileName(fileName: string): Buffer {
  const nameBuf = Buffer.from(fileName, "utf8");
  return buildPacket(CMD.SET_OTA_FILE_NAME, DIR.REQUEST, nameBuf);
}

// ============ 0x04: Set WebSocket Server URL Request ============
export function buildSetWsServerUrl(url: string): Buffer {
  const urlBuf = Buffer.from(url, "utf8");
  return buildPacket(CMD.SET_WS_SERVER_URL, DIR.REQUEST, urlBuf);
}

// ============ 0x05: Set Server Report Interval Request ============
export function buildSetReportInterval(seconds: number): Buffer {
  const data = Buffer.alloc(4);
  data.writeUInt32BE(seconds, 0);
  return buildPacket(CMD.SET_REPORT_INTERVAL, DIR.REQUEST, data);
}

// ============ 0x06: Set RSSI Filter Request ============
export function buildSetRssiFilter(rssi: number): Buffer {
  const data = Buffer.alloc(1);
  data.writeInt8(rssi, 0);
  return buildPacket(CMD.SET_RSSI_FILTER, DIR.REQUEST, data);
}

// ============ 0x07: Cmd OTA Start Request (Manual) ============
export function buildCmdOtaStart(otaUri: string): Buffer {
  const uriBuf = Buffer.from(otaUri, "utf8");
  return buildPacket(CMD.CMD_OTA_START, DIR.REQUEST, uriBuf);
}

// ============ 0x08: GW Info Indication Response ============
export function buildGwInfoIndicationResponse(returnValue: number): Buffer {
  const data = Buffer.alloc(1);
  data.writeUInt8(returnValue, 0);
  return buildPacket(CMD.GW_INFO_INDICATION, DIR.RESPONSE, data);
}

// ============ 0x09: GW Factory Reset Request ============
export function buildGwFactoryReset(): Buffer {
  return buildPacket(CMD.GW_FACTORY_RESET, DIR.REQUEST);
}

// ============ 0x0A: Tag Data Indication Response ============
export function buildTagDataResponse(returnValue: number): Buffer {
  const data = Buffer.alloc(1);
  data.writeUInt8(returnValue, 0);
  return buildPacket(CMD.TAG_DATA_INDICATION, DIR.RESPONSE, data);
}

// ============ 0x0B: Dose Data Indication Response ============
export function buildDoseDataResponse(returnValue: number): Buffer {
  const data = Buffer.alloc(1);
  data.writeUInt8(returnValue, 0);
  return buildPacket(CMD.DOSE_DATA_INDICATION, DIR.RESPONSE, data);
}
