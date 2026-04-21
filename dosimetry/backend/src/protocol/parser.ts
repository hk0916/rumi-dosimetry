/**
 * Lumi 바이너리 프로토콜 파서
 * Gateway -> Server 수신 데이터를 파싱
 */
import { CMD, DIR, HEADER_SIZE, TAG_BEACON, VALID_CMDS, VALID_DIRS, MAX_PACKET_LENGTH } from "./constants.js";

export interface ProtocolPacket {
  dataType: number;
  direction: number;
  length: number;
  data: Buffer;
}

// ============ 0x01 Response: Get GW Information ============
export interface GwInfoResponse {
  returnValue: number;
  btMacAddr: string;        // 6 bytes -> "11:22:33:44:55:66"
  hwVersion: string;        // 7 bytes -> "0.0.0.1"
  fwVersion: string;        // 7 bytes -> "0.0.0.1"
  otaServerUrl: string;
  otaFileName: string;
  wsServerUrl: string;
  reportInterval: number;   // 4 bytes, Big Endian (seconds)
  rssiFilter: number;       // 1 byte, signed
}

// ============ 0x08 Indication: GW Info Indication ============
export interface GwInfoIndication {
  btMacAddr: string;
  hwVersion: string;
  fwVersion: string;
  otaServerUrl: string;
  otaFileName: string;
  wsServerUrl: string;
  reportInterval: number;
  rssiFilter: number;
}

// ============ 0x0A Indication: Tag Data Indication ============
export interface TagDataIndication {
  btMacAddr: string;        // 태그의 BLE MAC 6 bytes
  scanTick: number;         // 4 bytes, Big Endian (microseconds)
  rssi: number;             // 1 byte, signed
  beacon: TagBeaconData;
}

export interface TagBeaconData {
  localName: string;        // e.g. "P_LAB"
  txPower: number;          // dBm
  manufacturerId: number;
  battery: number;          // %
  temperature: number;      // combined high/low
  advertisingCount: number; // 4 bytes
  doseAdc: number;          // 4 bytes
  raw: Buffer;              // 원본 31 bytes
}

// ============ 0x0B Indication: Dose Data Indication ============
export interface DoseDataEntry {
  advCount: number;         // 4 bytes, Big Endian
  doseSensingVal: number;   // 4 bytes, Big Endian
}

export interface DoseDataIndication {
  btMacAddr: string;        // 태그의 BLE MAC 6 bytes
  rssi: number;             // 1 byte, signed
  battery: number;          // 1 byte, %
  temperature: number;      // 4 bytes, IEEE 754 float (Big Endian)
  dataCount: number;        // 1 byte
  doseData: DoseDataEntry[];
}

// ============ 공통 Response (0x02~0x07, 0x09) ============
export interface SimpleResponse {
  returnValue: number;
}

/**
 * 바이너리 버퍼에서 패킷 하나를 파싱
 */
export function parsePacket(buf: Buffer): ProtocolPacket | null {
  if (buf.length < 2) return null;

  const dataType = buf.readUInt8(0);
  const direction = buf.readUInt8(1);

  // 0x01 Request는 데이터 없이 DataType + Direction만
  if (dataType === CMD.GET_GW_INFO && direction === DIR.REQUEST) {
    return { dataType, direction, length: 0, data: Buffer.alloc(0) };
  }

  // 0x09 Request도 데이터 없음
  if (dataType === CMD.GW_FACTORY_RESET && direction === DIR.REQUEST) {
    return { dataType, direction, length: 0, data: Buffer.alloc(0) };
  }

  if (buf.length < HEADER_SIZE) return null;

  const length = buf.readUInt16BE(2);
  const totalSize = HEADER_SIZE + length;

  if (buf.length < totalSize) return null;

  const data = buf.subarray(HEADER_SIZE, totalSize);
  return { dataType, direction, length, data };
}

/**
 * 현재 위치가 유효한 패킷 헤더인지 검증
 */
function isValidHeader(buf: Buffer, offset: number): boolean {
  if (buf.length - offset < 2) return false;
  const cmd = buf.readUInt8(offset);
  const dir = buf.readUInt8(offset + 1);
  if (!VALID_CMDS.has(cmd) || !VALID_DIRS.has(dir)) return false;

  // 데이터 없는 패킷 (0x01 Request, 0x09 Request)
  const isNoData =
    (cmd === CMD.GET_GW_INFO && dir === DIR.REQUEST) ||
    (cmd === CMD.GW_FACTORY_RESET && dir === DIR.REQUEST);
  if (isNoData) return true;

  // Length 검증
  if (buf.length - offset < HEADER_SIZE) return false;
  const length = buf.readUInt16BE(offset + 2);
  return length <= MAX_PACKET_LENGTH;
}

/**
 * 수신 버퍼에서 패킷 경계를 찾아 파싱 (스트림 누적 처리)
 * 유효하지 않은 데이터가 있으면 1바이트씩 건너뛰며 유효한 헤더를 탐색 (resync)
 */
export function extractPackets(buf: Buffer): { packets: ProtocolPacket[]; remaining: Buffer; skipped: number } {
  const packets: ProtocolPacket[] = [];
  let offset = 0;
  let skipped = 0;

  while (offset < buf.length) {
    const remaining = buf.subarray(offset);
    if (remaining.length < 2) break;

    // 유효한 헤더가 아니면 1바이트씩 건너뛰며 resync
    if (!isValidHeader(buf, offset)) {
      offset += 1;
      skipped += 1;
      continue;
    }

    const dataType = remaining.readUInt8(0);
    const direction = remaining.readUInt8(1);

    // 데이터 없는 패킷들 (0x01 Request, 0x09 Request)
    const isNoData =
      (dataType === CMD.GET_GW_INFO && direction === DIR.REQUEST) ||
      (dataType === CMD.GW_FACTORY_RESET && direction === DIR.REQUEST);

    if (isNoData) {
      packets.push({ dataType, direction, length: 0, data: Buffer.alloc(0) });
      offset += 2;
      continue;
    }

    if (remaining.length < HEADER_SIZE) break;

    const length = remaining.readUInt16BE(2);
    const totalSize = HEADER_SIZE + length;

    if (remaining.length < totalSize) break;

    const data = Buffer.from(remaining.subarray(HEADER_SIZE, totalSize));
    packets.push({ dataType, direction, length, data });
    offset += totalSize;
  }

  return { packets, remaining: Buffer.from(buf.subarray(offset)), skipped };
}

// ============ 개별 파서 함수들 ============

/** MAC 주소 6바이트를 문자열로 변환 (Little Endian: LSB 우선 전송) */
function parseMac(buf: Buffer, offset: number): string {
  const bytes: string[] = [];
  for (let i = 5; i >= 0; i--) {
    bytes.push(buf.readUInt8(offset + i).toString(16).padStart(2, "0").toUpperCase());
  }
  return bytes.join(":");
}

/** 버전 7바이트를 문자열로 변환 (0x30 2E 30 2E 30 2E 31 -> "0.0.0.1") */
function parseVersion(buf: Buffer, offset: number): string {
  return buf.subarray(offset, offset + 7).toString("ascii");
}

/** 가변 길이 문자열 읽기: 1byte 길이 + data */
function parseVarString(buf: Buffer, offset: number): { value: string; nextOffset: number } {
  const len = buf.readUInt8(offset);
  const value = buf.subarray(offset + 1, offset + 1 + len).toString("utf8");
  return { value, nextOffset: offset + 1 + len };
}

/** 0x01 Response 파싱 */
export function parseGwInfoResponse(data: Buffer): GwInfoResponse {
  let offset = 0;

  const returnValue = data.readUInt8(offset); offset += 1;
  const btMacAddr = parseMac(data, offset); offset += 6;
  const hwVersion = parseVersion(data, offset); offset += 7;
  const fwVersion = parseVersion(data, offset); offset += 7;

  const otaUrlResult = parseVarString(data, offset); offset = otaUrlResult.nextOffset;
  const otaFileResult = parseVarString(data, offset); offset = otaFileResult.nextOffset;
  const wsUrlResult = parseVarString(data, offset); offset = wsUrlResult.nextOffset;

  const reportInterval = data.readUInt32BE(offset); offset += 4;
  const rssiFilter = data.readInt8(offset);

  return {
    returnValue,
    btMacAddr,
    hwVersion,
    fwVersion,
    otaServerUrl: otaUrlResult.value,
    otaFileName: otaFileResult.value,
    wsServerUrl: wsUrlResult.value,
    reportInterval,
    rssiFilter,
  };
}

/** 0x08 Indication 파싱 (0x01 Response와 동일 구조, returnValue 없음) */
export function parseGwInfoIndication(data: Buffer): GwInfoIndication {
  let offset = 0;

  const btMacAddr = parseMac(data, offset); offset += 6;
  const hwVersion = parseVersion(data, offset); offset += 7;
  const fwVersion = parseVersion(data, offset); offset += 7;

  const otaUrlResult = parseVarString(data, offset); offset = otaUrlResult.nextOffset;
  const otaFileResult = parseVarString(data, offset); offset = otaFileResult.nextOffset;
  const wsUrlResult = parseVarString(data, offset); offset = wsUrlResult.nextOffset;

  const reportInterval = data.readUInt32BE(offset); offset += 4;
  const rssiFilter = data.readInt8(offset);

  return {
    btMacAddr,
    hwVersion,
    fwVersion,
    otaServerUrl: otaUrlResult.value,
    otaFileName: otaFileResult.value,
    wsServerUrl: wsUrlResult.value,
    reportInterval,
    rssiFilter,
  };
}

/** 0x0A Indication: Tag Data 파싱 */
export function parseTagDataIndication(data: Buffer): TagDataIndication {
  let offset = 0;

  const btMacAddr = parseMac(data, offset); offset += 6;
  const scanTick = data.readUInt32BE(offset); offset += 4;
  const rssi = data.readInt8(offset); offset += 1;

  // Tag Beacon Data: 31 bytes
  const beaconBuf = data.subarray(offset, offset + 31);
  const beacon = parseTagBeacon(beaconBuf);

  return { btMacAddr, scanTick, rssi, beacon };
}

/** Tag Beacon 31 bytes 파싱 */
function parseTagBeacon(buf: Buffer): TagBeaconData {
  const T = TAG_BEACON;

  // Local Name: byte 2~6 (5 bytes)
  const nameLen = buf.readUInt8(T.LOCAL_NAME_LENGTH_BYTE) - 1; // length includes type byte
  const localName = buf.subarray(T.LOCAL_NAME_START, T.LOCAL_NAME_START + nameLen).toString("ascii");

  const txPower = buf.readInt8(T.TX_POWER_VALUE);

  const manufacturerId = (buf.readUInt8(T.MFG_COMPANY_ID_0) << 8) | buf.readUInt8(T.MFG_COMPANY_ID_1);
  const battery = buf.readUInt8(T.BATTERY);

  const tempHigh = buf.readUInt8(T.TEMP_HIGH);
  const tempLow = buf.readUInt8(T.TEMP_LOW);
  const temperature = (tempHigh << 8) | tempLow; // raw value, 변환은 application level

  const advertisingCount = buf.readUInt32BE(T.ADV_COUNT_0);
  const doseAdc = buf.readUInt32BE(T.DOSE_ADC_0);

  return {
    localName,
    txPower,
    manufacturerId,
    battery,
    temperature,
    advertisingCount,
    doseAdc,
    raw: Buffer.from(buf),
  };
}

/** 0x0B Indication: Dose Data 파싱 */
export function parseDoseDataIndication(data: Buffer): DoseDataIndication {
  let offset = 0;

  const btMacAddr = parseMac(data, offset); offset += 6;
  const rssi = data.readInt8(offset); offset += 1;
  const battery = data.readUInt8(offset); offset += 1;
  const temperature = data.readFloatLE(offset); offset += 4;
  const dataCount = data.readUInt8(offset); offset += 1;

  const doseData: DoseDataEntry[] = [];
  for (let i = 0; i < dataCount; i++) {
    const advCount = data.readUInt32LE(offset); offset += 4;
    const doseSensingVal = data.readUInt32LE(offset); offset += 4;
    doseData.push({ advCount, doseSensingVal });
  }

  return { btMacAddr, rssi, battery, temperature, dataCount, doseData };
}

/** Simple Response 파싱 (0x02~0x07, 0x09 Response) */
export function parseSimpleResponse(data: Buffer): SimpleResponse {
  return { returnValue: data.readUInt8(0) };
}
