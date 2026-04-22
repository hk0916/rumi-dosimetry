import { useEffect, useState, useCallback } from "react";
import {
  Card, Select, DatePicker, Button, InputNumber,
  Space, Row, Col, Divider, message, Input, Descriptions, Tag, Modal, Upload,
} from "antd";
import {
  SearchOutlined, SaveOutlined, CalculatorOutlined,
  FilterOutlined, ReloadOutlined, InfoCircleOutlined, UploadOutlined,
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import api from "../services/api";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

dayjs.extend(customParseFormat);

const { RangePicker } = DatePicker;

// 공통 RangePicker presets
const rangePresets: { label: string; value: [dayjs.Dayjs, dayjs.Dayjs] }[] = [
  { label: "최근 15분",  value: [dayjs().subtract(15, "minute"), dayjs()] },
  { label: "최근 30분",  value: [dayjs().subtract(30, "minute"), dayjs()] },
  { label: "최근 1시간", value: [dayjs().subtract(1, "hour"),    dayjs()] },
  { label: "최근 6시간", value: [dayjs().subtract(6, "hour"),    dayjs()] },
  { label: "오늘",        value: [dayjs().startOf("day"),          dayjs()] },
  { label: "어제",        value: [dayjs().subtract(1, "day").startOf("day"), dayjs().subtract(1, "day").endOf("day")] },
  { label: "최근 7일",    value: [dayjs().subtract(7, "day"),     dayjs()] },
];

// CSV 타임스탬프 파서 (여러 포맷 fallback)
function parseCsvTimestamp(raw: string): number {
  const trimmed = raw.trim();
  // 1차: dayjs 기본 파서 (ISO 및 일부 공통 포맷)
  let d = dayjs(trimmed);
  if (d.isValid()) return d.valueOf();
  // 2차: space → T 로 ISO 변환
  d = dayjs(trimmed.replace(" ", "T"));
  if (d.isValid()) return d.valueOf();
  // 3차: customParseFormat 명시
  d = dayjs(trimmed, ["YYYY-MM-DD HH:mm:ss.SSS", "YYYY-MM-DD HH:mm:ss", "YYYY/MM/DD HH:mm:ss"], true);
  if (d.isValid()) return d.valueOf();
  // 4차: native Date
  const nd = new Date(trimmed);
  if (!isNaN(nd.getTime())) return nd.getTime();
  return NaN;
}

const FILTER_OPTIONS = [
  { label: "Median", value: "median" },
  { label: "Arithmetic Mean", value: "arithmetic_mean" },
  { label: "Geometric Mean", value: "geometric_mean" },
  { label: "Least Square", value: "least_square" },
  { label: "Envelope", value: "envelope" },
  { label: "Bezier", value: "bezier" },
];

interface ChartPoint {
  timestamp: string;
  original: number;
  smoothed: number;
}

export default function CalibrationPage() {
  // 디바이스 목록
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);

  // 데이터 조회 조건 (full Dayjs — 날짜+시간)
  const [startDateTime, setStartDateTime] = useState<dayjs.Dayjs | null>(null);
  const [endDateTime, setEndDateTime] = useState<dayjs.Dayjs | null>(null);

  // 필터 설정
  const [filterType, setFilterType] = useState<string>("median");
  const [windowSize, setWindowSize] = useState<number>(10);
  const [baseline, setBaseline] = useState<number>(0);

  // 계산 결과
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(false);

  // 누적선량 범위 계산 (full Dayjs — 날짜+시간)
  const [rangeStart, setRangeStart] = useState<dayjs.Dayjs | null>(null);
  const [rangeEnd, setRangeEnd] = useState<dayjs.Dayjs | null>(null);
  const [cumulativeDose, setCumulativeDose] = useState<number | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // CF Factor
  const [deliveredDose, setDeliveredDose] = useState<number | null>(null);
  const [cfFactor, setCfFactor] = useState<number | null>(null);
  const [cfName, setCfName] = useState("");           // 닉네임 (필수)
  const [gatewayMac, setGatewayMac] = useState<string | null>(null);  // 선택한 gateway MAC
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);

  // Gateway 목록 (캘리브레이션 시점에 사용한 게이트웨이 기록용)
  const [gateways, setGateways] = useState<any[]>([]);
  const [gatewayReportInterval, setGatewayReportInterval] = useState<number | null>(null);

  useEffect(() => {
    api.get("/devices").then(({ data }) => setDevices(data.data)).catch(() => {});
    api.get("/gateways", { params: { size: "50" } })
      .then(({ data }) => {
        setGateways(data.data || []);
        const intervals = (data.data || [])
          .map((g: any) => Number(g.reportInterval))
          .filter((v: number) => isFinite(v) && v > 0);
        if (intervals.length > 0) {
          setGatewayReportInterval(Math.max(...intervals));
        }
      })
      .catch(() => {});
  }, []);

  // Import Data (DB 조회)
  const handleImportData = useCallback(async () => {
    if (!selectedDeviceId || !startDateTime || !endDateTime) {
      message.warning("디바이스와 시간 범위를 선택하세요.");
      return;
    }

    setLoading(true);
    setCumulativeDose(null);
    setCfFactor(null);

    try {
      const { data } = await api.post("/calibrations/calculate", {
        deviceId: selectedDeviceId,
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        filterType,
        windowSize,
        baseline: baseline / 1000,
      });

      setChartData(data.chartData);
      setTotalPoints(data.totalPoints);
      setCumulativeDose(data.cumulativeDose);

      // 기본 범위를 전체 범위로 설정
      setRangeStart(startDateTime);
      setRangeEnd(endDateTime);

      message.success(`${data.totalPoints}건 데이터 로드 완료. 누적선량: ${(data.cumulativeDose * 1000).toFixed(6)} mV·s`);
    } catch (err: any) {
      message.error(err.response?.data?.error || "데이터 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [selectedDeviceId, startDateTime, endDateTime, filterType, windowSize, baseline]);

  // CSV 업로드로 불러오기 (실시간 모니터링/ManageCalibration export 호환)
  // 헤더 기반 컬럼 매핑: "Timestamp" + "Voltage(V)" 또는 "Voltage(mV)"
  const handleImportCSV = useCallback(async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let text = String(e.target?.result || "");
        // BOM 제거
        if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

        const rawLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (rawLines.length < 2) {
          message.error("CSV 파일에 유효한 데이터가 없습니다.");
          return;
        }

        // 첫 헤더 라인 찾기 (메타 주석 # 은 스킵)
        const headerIdx = rawLines.findIndex((l) => !l.trim().startsWith("#"));
        if (headerIdx < 0) { message.error("CSV 헤더를 찾을 수 없습니다."); return; }

        const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "");
        const headers = rawLines[headerIdx].split(",").map(normalize);

        const tsIdx = headers.findIndex((h) => h === "timestamp" || h === "time");
        let voltIdx = headers.findIndex((h) => h === "voltage(v)");
        let voltInV = true;
        if (voltIdx < 0) {
          voltIdx = headers.findIndex((h) => h === "voltage(mv)");
          voltInV = false;
        }

        if (tsIdx < 0 || voltIdx < 0) {
          message.error(`CSV 헤더에 Timestamp와 Voltage(V/mV) 컬럼이 필요합니다. 발견된 헤더: ${headers.join(", ")}`);
          return;
        }

        const timestamps: number[] = [];
        const voltages: number[] = [];
        let skipped = 0;

        for (let i = headerIdx + 1; i < rawLines.length; i++) {
          const line = rawLines[i];
          if (line.trim().startsWith("#")) continue;
          const cols = line.split(",");
          if (cols.length <= Math.max(tsIdx, voltIdx)) { skipped++; continue; }

          const tsMs = parseCsvTimestamp(cols[tsIdx]);
          const voltRaw = Number(cols[voltIdx].trim());
          if (!isFinite(tsMs) || !isFinite(voltRaw)) { skipped++; continue; }

          timestamps.push(tsMs);
          voltages.push(voltInV ? voltRaw : voltRaw / 1000);  // mV → V
        }

        console.log(`[CSV Import] parsed=${voltages.length} skipped=${skipped} firstTs=${timestamps[0]} lastTs=${timestamps[timestamps.length - 1]}`);

        if (voltages.length < 2) {
          message.error(`유효한 샘플이 부족합니다. (파싱됨: ${voltages.length}, 스킵됨: ${skipped})`);
          return;
        }

        setLoading(true);
        setCumulativeDose(null);
        setCfFactor(null);

        try {
          const { data } = await api.post("/calibrations/calculate-from-csv", {
            timestamps,
            voltages,
            filterType,
            windowSize,
            baseline: baseline / 1000,
          });

          setChartData(data.chartData);
          setTotalPoints(data.totalPoints);
          setCumulativeDose(data.cumulativeDose);

          // CSV의 시간범위를 UI에 자동 반영
          const firstTs = dayjs(data.startTime);
          const lastTs = dayjs(data.endTime);
          setStartDateTime(firstTs);
          setEndDateTime(lastTs);
          setRangeStart(firstTs);
          setRangeEnd(lastTs);

          message.success(`${data.totalPoints}건 로드 완료. 누적선량: ${(data.cumulativeDose * 1000).toFixed(6)} mV·s`);
        } catch (err: any) {
          message.error(err.response?.data?.error || "CSV 계산 요청에 실패했습니다.");
        } finally {
          setLoading(false);
        }
      } catch (err) {
        console.error("[CSV Import] parse error", err);
        message.error("CSV 파싱 중 오류가 발생했습니다.");
      }
    };
    reader.onerror = () => message.error("파일을 읽을 수 없습니다.");
    reader.readAsText(file, "utf-8");
  }, [filterType, windowSize, baseline]);

  // 필터 재적용 (DB 모드 전용 — CSV 모드에서는 다시 Upload CSV 필요)
  const handleApplyFilter = useCallback(async () => {
    if (!selectedDeviceId || !startDateTime || !endDateTime) {
      message.warning("먼저 데이터를 불러오세요. (CSV로 로드한 경우 다시 Upload CSV 하세요)");
      return;
    }
    await handleImportData();
  }, [handleImportData, selectedDeviceId, startDateTime, endDateTime]);

  // 범위 지정 누적선량 재계산 (DB 모드)
  const handleCalculateRange = useCallback(async () => {
    if (!selectedDeviceId || !startDateTime || !endDateTime || !rangeStart || !rangeEnd) {
      message.warning("계산 범위를 설정하세요.");
      return;
    }

    setCalcLoading(true);
    try {
      const { data } = await api.post("/calibrations/calculate-range", {
        deviceId: selectedDeviceId,
        dataStartTime: startDateTime.toISOString(),
        dataEndTime: endDateTime.toISOString(),
        rangeStartTime: rangeStart.toISOString(),
        rangeEndTime: rangeEnd.toISOString(),
        filterType,
        windowSize,
        baseline: baseline / 1000,
      });

      setCumulativeDose(data.cumulativeDose);
      message.success(`범위 내 ${data.dataPoints}건, 누적선량: ${(data.cumulativeDose * 1000).toFixed(6)} mV·s`);
    } catch (err: any) {
      message.error(err.response?.data?.error || "계산에 실패했습니다.");
    } finally {
      setCalcLoading(false);
    }
  }, [selectedDeviceId, startDateTime, endDateTime, rangeStart, rangeEnd, filterType, windowSize, baseline]);

  // CF Factor 계산 (V·s/cGy 단위로 보관; 표시 시 ×1000하여 mV·s/cGy로 변환)
  useEffect(() => {
    if (cumulativeDose != null && deliveredDose && deliveredDose > 0) {
      setCfFactor(cumulativeDose / deliveredDose);
    } else {
      setCfFactor(null);
    }
  }, [cumulativeDose, deliveredDose]);

  // Save 모달 열기
  const openSaveModal = () => {
    if (cfFactor == null || !selectedDeviceId || cumulativeDose == null || !deliveredDose) {
      message.warning("모든 계산을 완료한 후 저장하세요.");
      return;
    }
    // 기본 CF Name 제안 (이미 입력한 값이 있으면 유지)
    if (!cfName) {
      const dateStr = startDateTime?.format("YYYYMMDD") || dayjs().format("YYYYMMDD");
      const suggested = `CF_${dateStr}_${filterType}`;
      setCfName(suggested);
    }
    setSaveModalOpen(true);
  };

  // CF Factor 저장
  const handleSave = async () => {
    if (cfFactor == null || !selectedDeviceId || cumulativeDose == null || !deliveredDose) {
      message.warning("모든 계산을 완료한 후 저장하세요.");
      return;
    }

    if (!cfName || !cfName.trim()) {
      message.warning("닉네임(CF Name)을 입력하세요.");
      return;
    }

    setSaveLoading(true);
    try {
      await api.post("/calibrations", {
        deviceId: selectedDeviceId,
        date: startDateTime?.format("YYYY-MM-DD"),
        filterType,
        windowSize,
        baseline: baseline / 1000,
        startTime: rangeStart?.toISOString(),
        endTime: rangeEnd?.toISOString(),
        cumulativeDose,
        deliveredDose,
        cfName: cfName.trim(),
        gatewayMac: gatewayMac || undefined,
      });
      message.success("CF Factor가 저장되었습니다.");
      setSaveModalOpen(false);
    } catch (err: any) {
      message.error(err.response?.data?.error || "저장에 실패했습니다.");
    } finally {
      setSaveLoading(false);
    }
  };

  // 차트 옵션
  const chartOption: EChartsOption = {
    animation: false,
    grid: { top: 50, right: 40, bottom: 80, left: 70 },
    legend: {
      data: ["Original", "Baseline", "Filtered"],
      top: 10,
    },
    xAxis: {
      type: "category",
      data: chartData.map((d) => dayjs(d.timestamp).format("HH:mm:ss")),
      axisLabel: { fontSize: 10, rotate: 30 },
    },
    yAxis: {
      type: "value",
      name: "Voltage (mV)",
      axisLabel: { fontSize: 10, formatter: (v: number) => v.toFixed(3) },
    },
    series: [
      {
        name: "Original",
        type: "line",
        data: chartData.map((d) => d.original * 1000),
        smooth: false,
        showSymbol: false,
        lineStyle: { color: "#4472C4", width: 1 },
      },
      {
        name: "Baseline",
        type: "line",
        data: chartData.map(() => baseline),
        smooth: false,
        showSymbol: false,
        lineStyle: { color: "#FFC000", width: 1.5, type: "dashed" },
      },
      {
        // PDF 스펙: "해당 필터로 스무딩 된 [원본 - baseline] 차트" (초록차트)
        name: "Filtered",
        type: "line",
        data: chartData.map((d) => d.smoothed * 1000 - baseline),
        smooth: false,
        showSymbol: false,
        lineStyle: { color: "#70AD47", width: 2 },
      },
    ],
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const time = params[0]?.axisValue || "";
        let html = `<b>${time}</b><br/>`;
        for (const p of params) {
          if (p.seriesName !== "Baseline") {
            html += `${p.marker} ${p.seriesName}: ${Number(p.value)} mV<br/>`;
          }
        }
        return html;
      },
    },
    dataZoom: [
      { type: "inside", start: 0, end: 100 },
      { type: "slider", start: 0, end: 100, height: 20, bottom: 5 },
    ],
    toolbox: {
      right: 20,
      feature: {
        dataZoom: { yAxisIndex: "none" },
        restore: {},
      },
    },
  };

  const deviceName = devices.find((d) => d.id === selectedDeviceId)?.deviceName || "";

  return (
    <>
      {/* 조건 설정 + 필터 설정 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[16, 12]} align="middle">
          {/* 조건 설정 */}
          <Col>
            <Space>
              <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Device</span>
              <Select
                style={{ width: 180 }}
                placeholder="디바이스 선택"
                value={selectedDeviceId}
                onChange={setSelectedDeviceId}
                options={devices.map((d) => ({ label: d.deviceName, value: d.id }))}
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <span style={{ fontWeight: 600 }}>Range</span>
              <RangePicker
                showTime={{ format: "HH:mm:ss" }}
                format="YYYY-MM-DD HH:mm:ss"
                value={startDateTime && endDateTime ? [startDateTime, endDateTime] : null}
                onChange={(v) => {
                  if (v && v[0] && v[1]) {
                    setStartDateTime(v[0]);
                    setEndDateTime(v[1]);
                  } else {
                    setStartDateTime(null);
                    setEndDateTime(null);
                  }
                }}
                presets={rangePresets}
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <Button
                type="primary"
                icon={<SearchOutlined />}
                onClick={handleImportData}
                loading={loading}
              >
                Import Data
              </Button>
              <Upload
                accept=".csv"
                maxCount={1}
                showUploadList={false}
                beforeUpload={(file) => {
                  handleImportCSV(file);
                  return false;  // 자동 업로드 방지 (수동 처리)
                }}
              >
                <Button icon={<UploadOutlined />} loading={loading}>
                  Upload CSV
                </Button>
              </Upload>
            </Space>
          </Col>
          {gatewayReportInterval != null && gatewayReportInterval > 30 && (
            <Col>
              <Tag icon={<InfoCircleOutlined />} color="orange">
                Gateway report interval: {gatewayReportInterval}s — 최근 {gatewayReportInterval}초 구간은 아직 수신되지 않았을 수 있습니다.
              </Tag>
            </Col>
          )}
        </Row>

        <Divider style={{ margin: "12px 0" }} />

        {/* 캘리브레이션 메타 (Nickname / Gateway) */}
        <Row gutter={[16, 12]} align="middle">
          <Col>
            <Space>
              <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Nickname</span>
              <Input
                value={cfName}
                onChange={(e) => setCfName(e.target.value)}
                placeholder="예: CF_20260422_median"
                style={{ width: 260 }}
                allowClear
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>Gateway</span>
              <Select
                allowClear
                style={{ width: 280 }}
                placeholder="사용한 Gateway 선택 (선택사항)"
                value={gatewayMac}
                onChange={(v) => setGatewayMac(v || null)}
                options={gateways.map((g) => ({
                  label: `${g.deviceName} (${g.macAddress})`,
                  value: g.macAddress,
                }))}
              />
            </Space>
          </Col>
        </Row>

        <Divider style={{ margin: "12px 0" }} />

        {/* 필터 설정 */}
        <Row gutter={[16, 12]} align="middle">
          <Col>
            <Space>
              <FilterOutlined />
              <span style={{ fontWeight: 600 }}>Filter</span>
              <Select
                style={{ width: 170 }}
                value={filterType}
                onChange={setFilterType}
                options={FILTER_OPTIONS}
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <span style={{ fontWeight: 600 }}>Window</span>
              <InputNumber
                min={3}
                max={500}
                value={windowSize}
                onChange={(v) => v && setWindowSize(v)}
                style={{ width: 90 }}
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <span style={{ fontWeight: 600 }}>Baseline</span>
              <InputNumber
                value={baseline}
                onChange={(v) => v != null && setBaseline(v)}
                style={{ width: 120 }}
                addonAfter="mV"
                step={0.001}
              />
            </Space>
          </Col>
          <Col>
            <Button
              icon={<ReloadOutlined />}
              onClick={handleApplyFilter}
              disabled={chartData.length === 0}
            >
              Apply Filter
            </Button>
          </Col>
          {totalPoints > 0 && (
            <Col>
              <Tag color="blue">{totalPoints.toLocaleString()} points</Tag>
            </Col>
          )}
        </Row>
      </Card>

      {/* 차트 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        {chartData.length > 0 ? (
          <ReactECharts option={chartOption} style={{ height: 380 }} />
        ) : (
          <div style={{ height: 380, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb", textAlign: "center" }}>
            디바이스를 선택하고 Import Data를 클릭하거나,<br />
            실시간 모니터링에서 export한 CSV를 Upload CSV로 불러오세요.
          </div>
        )}
      </Card>

      {/* 계산 영역 (Footer) — 항상 표시 */}
      {(
        <Card size="small" title="Dose Calculation">
          <Row gutter={[24, 16]} align="middle">
            {/* 범위 지정 */}
            <Col span={12}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <div>
                  <span style={{ fontWeight: 600, marginRight: 8 }}>Calculation Range</span>
                  <Space>
                    <RangePicker
                      showTime={{ format: "HH:mm:ss" }}
                      format="YYYY-MM-DD HH:mm:ss"
                      size="small"
                      value={rangeStart && rangeEnd ? [rangeStart, rangeEnd] : null}
                      onChange={(v) => {
                        if (v && v[0] && v[1]) {
                          setRangeStart(v[0]);
                          setRangeEnd(v[1]);
                        } else {
                          setRangeStart(null);
                          setRangeEnd(null);
                        }
                      }}
                    />
                    <Button
                      size="small"
                      icon={<CalculatorOutlined />}
                      onClick={handleCalculateRange}
                      loading={calcLoading}
                    >
                      Apply
                    </Button>
                  </Space>
                </div>
              </Space>
            </Col>

            {/* 결과 표시 */}
            <Col span={12}>
              <Descriptions
                bordered
                size="small"
                column={1}
                labelStyle={{ width: 140, fontWeight: 600 }}
              >
                <Descriptions.Item label="Cumulative Dose">
                  <span style={{ fontSize: 16, color: "#4472C4", fontWeight: 700 }}>
                    {cumulativeDose != null ? (cumulativeDose * 1000).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "-"}
                  </span>
                  <span style={{ marginLeft: 4, color: "#888" }}>mV·s</span>
                </Descriptions.Item>
                <Descriptions.Item label="Delivered Dose">
                  <Space>
                    <InputNumber
                      min={0.01}
                      step={1}
                      value={deliveredDose}
                      onChange={(v) => setDeliveredDose(v)}
                      placeholder="e.g. 100"
                      style={{ width: 120 }}
                      size="small"
                    />
                    <span style={{ color: "#888" }}>cGy</span>
                  </Space>
                </Descriptions.Item>
                <Descriptions.Item label="CF Factor">
                  <span style={{ fontSize: 18, color: cfFactor != null ? "#70AD47" : "#ccc", fontWeight: 700 }}>
                    {cfFactor != null ? (cfFactor * 1000).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "-"}
                  </span>
                  <span style={{ marginLeft: 4, color: "#888" }}>mV·s/cGy</span>
                </Descriptions.Item>
              </Descriptions>
            </Col>
          </Row>

          <Divider style={{ margin: "12px 0" }} />

          {/* 저장 */}
          <Row justify="end" align="middle">
            <Col>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={openSaveModal}
                disabled={cfFactor == null}
              >
                Save Calibration Factor
              </Button>
            </Col>
          </Row>
        </Card>
      )}

      {/* Save Modal */}
      <Modal
        title="Save Calibration Factor"
        open={saveModalOpen}
        onCancel={() => setSaveModalOpen(false)}
        onOk={handleSave}
        okText="Save"
        cancelText="Cancel"
        confirmLoading={saveLoading}
        width={500}
      >
        <Descriptions bordered size="small" column={1} labelStyle={{ width: 140, fontWeight: 600 }}>
          <Descriptions.Item label="Device">{deviceName || "-"}</Descriptions.Item>
          <Descriptions.Item label="Date">{startDateTime?.format("YYYY-MM-DD") || "-"}</Descriptions.Item>
          <Descriptions.Item label="Filter">
            <Tag>{filterType}</Tag> Window <Tag>{windowSize}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="Baseline">{baseline.toFixed(6)} mV</Descriptions.Item>
          <Descriptions.Item label="Cumulative Dose">
            <span style={{ color: "#4472C4", fontWeight: 600 }}>
              {cumulativeDose != null ? (cumulativeDose * 1000).toLocaleString(undefined, { maximumFractionDigits: 6 }) : "-"} mV·s
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="Delivered Dose">{deliveredDose ?? "-"} cGy</Descriptions.Item>
          <Descriptions.Item label="CF Factor">
            <span style={{ color: "#70AD47", fontWeight: 700, fontSize: 15 }}>
              {cfFactor != null ? (cfFactor * 1000).toFixed(6) : "-"} mV·s/cGy
            </span>
          </Descriptions.Item>
        </Descriptions>
        <div style={{ marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>CF Name</div>
          <Input
            value={cfName}
            onChange={(e) => setCfName(e.target.value)}
            placeholder="이 Calibration의 이름을 입력하세요"
          />
        </div>
      </Modal>
    </>
  );
}
