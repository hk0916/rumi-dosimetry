/**
 * Lumi Gateway <-> Server 바이너리 프로토콜 상수 정의
 * 프로토콜 문서: Server_Com_Protocol_20260408_Lumi.xlsx
 */

// ============ Data Type (Command) ============
export const CMD = {
  GET_GW_INFO:           0x01,
  SET_OTA_SERVER_URL:    0x02,
  SET_WS_SERVER_URL:     0x04,
  SET_REPORT_INTERVAL:   0x05,
  SET_RSSI_FILTER:       0x06,
  CMD_OTA_START:         0x07,
  GW_INFO_INDICATION:    0x08,
  GW_FACTORY_RESET:      0x09,
  TAG_DATA_INDICATION:   0x0A,
  DOSE_DATA_INDICATION:  0x0B,
} as const;

// ============ Direction (Req/Rsp) ============
export const DIR = {
  REQUEST:    0x01,
  RESPONSE:   0x02,
  INDICATION: 0x03,
} as const;

// ============ Return Values ============
export const RET = {
  SUCCESS: 0x00,
  FAIL:    0x01,
} as const;

// ============ Tag Beacon 필드 오프셋 (31 bytes 기준) ============
export const TAG_BEACON = {
  LOCAL_NAME_LENGTH_BYTE: 0,   // 0x06 = 6 bytes
  LOCAL_NAME_ID:          1,   // 0x09 = Complete Local Name
  LOCAL_NAME_START:       2,   // 5 bytes (P_LAB)
  TX_POWER_LENGTH_BYTE:   7,   // 0x02
  TX_POWER_ID:            8,   // 0x0A
  TX_POWER_VALUE:         9,   // Tx Power Level
  MFG_LENGTH_BYTE:       10,   // 0x0C = 12
  MFG_ID:                11,   // 0xFF
  MFG_COMPANY_ID_0:      12,   // 0x05
  MFG_COMPANY_ID_1:      13,   // 0x05
  BATTERY:               14,   // Battery %
  TEMP_HIGH:             15,
  TEMP_LOW:              16,
  ADV_COUNT_0:           17,
  ADV_COUNT_1:           18,
  ADV_COUNT_2:           19,
  ADV_COUNT_3:           20,
  DOSE_ADC_0:            21,
  DOSE_ADC_1:            22,
  DOSE_ADC_2:            23,
  DOSE_ADC_3:            24,
  RESERVED_START:        25,   // 25~30: Reserved (6 bytes)
} as const;

// 프로토콜 헤더 크기: DataType(1) + Direction(1) + Length(2) = 4 bytes
export const HEADER_SIZE = 4;

// DataType(1) + Direction(1) = 최소 패킷 (length 없는 경우, 예: 0x01 Request)
export const MIN_PACKET_SIZE = 2;

// 유효한 CMD 값 집합 (resync에 사용)
export const VALID_CMDS: Set<number> = new Set([
  CMD.GET_GW_INFO, CMD.SET_OTA_SERVER_URL,
  CMD.SET_WS_SERVER_URL, CMD.SET_REPORT_INTERVAL, CMD.SET_RSSI_FILTER,
  CMD.CMD_OTA_START, CMD.GW_INFO_INDICATION, CMD.GW_FACTORY_RESET,
  CMD.TAG_DATA_INDICATION, CMD.DOSE_DATA_INDICATION,
]);

// 유효한 Direction 값 집합
export const VALID_DIRS: Set<number> = new Set([DIR.REQUEST, DIR.RESPONSE, DIR.INDICATION]);

// Length 상한 (이 이상이면 파싱 오류로 판단)
export const MAX_PACKET_LENGTH = 4096;

export type CmdType = typeof CMD[keyof typeof CMD];
export type DirType = typeof DIR[keyof typeof DIR];
