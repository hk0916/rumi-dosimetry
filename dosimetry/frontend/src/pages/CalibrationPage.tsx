import { useEffect, useState, useCallback } from "react";
import {
  Card, Select, DatePicker, TimePicker, Button, InputNumber,
  Space, Row, Col, Divider, Statistic, message, Input, Descriptions, Tag, Upload,
} from "antd";
import {
  SearchOutlined, SaveOutlined, CalculatorOutlined,
  FilterOutlined, ReloadOutlined, UploadOutlined,
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import * as XLSX from "xlsx";
import api from "../services/api";
import dayjs from "dayjs";

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

  // 데이터 조회 조건
  const [date, setDate] = useState<dayjs.Dayjs | null>(null);
  const [startTime, setStartTime] = useState<dayjs.Dayjs | null>(null);
  const [endTime, setEndTime] = useState<dayjs.Dayjs | null>(null);

  // 필터 설정
  const [filterType, setFilterType] = useState<string>("median");
  const [windowSize, setWindowSize] = useState<number>(10);
  const [baseline, setBaseline] = useState<number>(0);

  // 계산 결과
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [totalPoints, setTotalPoints] = useState(0);
  const [loading, setLoading] = useState(false);

  // 누적선량 범위 계산
  const [rangeStartTime, setRangeStartTime] = useState<dayjs.Dayjs | null>(null);
  const [rangeEndTime, setRangeEndTime] = useState<dayjs.Dayjs | null>(null);
  const [cumulativeDose, setCumulativeDose] = useState<number | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // CF Factor
  const [deliveredDose, setDeliveredDose] = useState<number | null>(null);
  const [cfFactor, setCfFactor] = useState<number | null>(null);
  const [cfName, setCfName] = useState("");
  const [saveLoading, setSaveLoading] = useState(false);

  // 업로드된 XLSX 의 디바이스별 데이터. uploadMode=true 면 device select / 차트 / 계산이 이 안에서만 동작.
  // Import Data (DB) 누르면 해제되어 전체 devices 목록으로 돌아간다.
  type UploadedDevice = { deviceId: number; deviceName: string; macAddress: string; timestamps: number[]; voltages: number[] };
  const [uploadedDevices, setUploadedDevices] = useState<UploadedDevice[]>([]);
  const uploadMode = uploadedDevices.length > 0;

  useEffect(() => {
    api.get("/devices").then(({ data }) => setDevices(data.data)).catch(() => {});
  }, []);

  // Import Data
  const handleImportData = useCallback(async () => {
    if (!selectedDeviceId || !date || !startTime || !endTime) {
      message.warning("디바이스, 날짜, 시작/종료 시간을 모두 입력하세요.");
      return;
    }

    // DB 조회로 다시 들어가니 업로드 모드 해제 — device select 가 전체 목록으로 돌아간다.
    setUploadedDevices([]);

    const dateStr = date.format("YYYY-MM-DD");
    const start = `${dateStr}T${startTime.format("HH:mm:ss")}`;
    const end = `${dateStr}T${endTime.format("HH:mm:ss")}`;

    setLoading(true);
    setCumulativeDose(null);
    setCfFactor(null);

    try {
      const { data } = await api.post("/calibrations/calculate", {
        deviceId: selectedDeviceId,
        startTime: start,
        endTime: end,
        filterType,
        windowSize,
        baseline,
      });

      setChartData(data.chartData);
      setTotalPoints(data.totalPoints);
      setCumulativeDose(data.cumulativeDose);

      // 기본 범위를 전체 범위로 설정
      setRangeStartTime(startTime);
      setRangeEndTime(endTime);

      message.success(`${data.totalPoints}건 데이터 로드 완료. 누적선량: ${data.cumulativeDose} V·s`);
    } catch (err: any) {
      message.error(err.response?.data?.error || "데이터 조회에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [selectedDeviceId, date, startTime, endTime, filterType, windowSize, baseline]);

  // 업로드된 디바이스의 timestamps/voltages 로 backend 재계산 — uploadMode 에서 디바이스 변경 / Apply Filter 시 호출
  const recomputeForUpload = useCallback(async (target: UploadedDevice) => {
    setLoading(true);
    setCumulativeDose(null);
    setCfFactor(null);
    try {
      const { data: resp } = await api.post("/calibrations/calculate-from-csv", {
        timestamps: target.timestamps,
        voltages: target.voltages,
        filterType,
        windowSize,
        baseline,
      });
      setChartData(resp.chartData);
      setTotalPoints(resp.totalPoints);
      setCumulativeDose(resp.cumulativeDose);
      const firstTs = dayjs(resp.startTime);
      const lastTs = dayjs(resp.endTime);
      setDate(firstTs);
      setStartTime(firstTs);
      setEndTime(lastTs);
      setRangeStartTime(firstTs);
      setRangeEndTime(lastTs);
      message.success(`${resp.totalPoints}건 로드 [${target.deviceName}]. 누적선량: ${resp.cumulativeDose} V·s`);
    } catch (err: any) {
      message.error(err.response?.data?.error || "계산 요청에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  }, [filterType, windowSize, baseline]);

  // XLSX 업로드 — 모든 시트 파싱해서 디바이스별 데이터를 메모리에 보관.
  // Device select 가 이 디바이스들로 제한되고, 디바이스 선택을 바꾸면 해당 시트 데이터로 재계산된다.
  // 형식: 시트 1개 = 디바이스 1개. 헤더: # 메타 (DeviceMac/DeviceId/DeviceName) + 빈 줄 + 컬럼 헤더(Timestamp/Raw/Voltage(mV)/Voltage(V)).
  // Raw 컬럼 우선 (DB 모드와 단위 일관).
  const handleImportXLSX = useCallback(async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        if (workbook.SheetNames.length === 0) {
          message.error("XLSX 파일에 시트가 없습니다.");
          return;
        }

        const parsed: UploadedDevice[] = [];
        const skippedSheets: string[] = [];

        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });
          if (rows.length < 2) { skippedSheets.push(`${sheetName}: 빈 시트`); continue; }

          const metaLines: string[] = [];
          let headerRowIdx = -1;
          for (let i = 0; i < rows.length; i++) {
            const cell0 = String(rows[i]?.[0] ?? "").trim();
            if (cell0.startsWith("#")) { metaLines.push(cell0); continue; }
            if (cell0 === "") continue;
            headerRowIdx = i;
            break;
          }
          if (headerRowIdx < 0) { skippedSheets.push(`${sheetName}: 헤더 없음`); continue; }

          const getMeta = (key: string): string | null => {
            const re = new RegExp(`^#\\s*${key}\\s*:\\s*(.+?)\\s*$`, "i");
            for (const l of metaLines) {
              const m = l.match(re);
              if (m) return m[1];
            }
            return null;
          };
          const metaMac = getMeta("DeviceMac");
          const metaDeviceId = getMeta("DeviceId");
          const metaDeviceName = getMeta("DeviceName") || getMeta("Device");
          let matchedDevice: any = null;
          if (metaMac) matchedDevice = devices.find((d) => (d.macAddress || "").toLowerCase() === metaMac.toLowerCase());
          if (!matchedDevice && metaDeviceId) matchedDevice = devices.find((d) => String(d.id) === String(metaDeviceId));
          if (!matchedDevice && metaDeviceName) matchedDevice = devices.find((d) => d.deviceName === metaDeviceName);
          if (!matchedDevice) {
            skippedSheets.push(`${sheetName}: 매칭되는 디바이스 없음 (${metaDeviceName || metaMac || "메타 없음"})`);
            continue;
          }

          const normalize = (s: any) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, "");
          const headers = (rows[headerRowIdx] as any[]).map(normalize);
          const tsIdx = headers.findIndex((h) => h === "timestamp" || h === "time");
          let voltIdx = headers.findIndex((h) => h === "raw");
          let voltScale = 1;
          if (voltIdx < 0) {
            voltIdx = headers.findIndex((h) => h === "voltage(mv)");
            if (voltIdx >= 0) voltScale = 1;
          }
          if (voltIdx < 0) {
            voltIdx = headers.findIndex((h) => h === "voltage(v)");
            if (voltIdx >= 0) voltScale = 1000;
          }
          if (tsIdx < 0 || voltIdx < 0) {
            skippedSheets.push(`${sheetName}: 헤더에 Timestamp 또는 Raw/Voltage 컬럼 없음`);
            continue;
          }

          const timestamps: number[] = [];
          const voltages: number[] = [];
          for (let i = headerRowIdx + 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length <= Math.max(tsIdx, voltIdx)) continue;
            const tsRaw = row[tsIdx];
            let tsMs: number;
            if (tsRaw instanceof Date) tsMs = tsRaw.getTime();
            else {
              const d = dayjs(String(tsRaw).trim());
              tsMs = d.isValid() ? d.valueOf() : NaN;
            }
            const voltRaw = Number(row[voltIdx]);
            if (!isFinite(tsMs) || !isFinite(voltRaw)) continue;
            timestamps.push(tsMs);
            voltages.push(voltRaw * voltScale);
          }

          if (voltages.length < 2) {
            skippedSheets.push(`${sheetName}: 유효 샘플 부족 (${voltages.length})`);
            continue;
          }

          parsed.push({
            deviceId: matchedDevice.id,
            deviceName: matchedDevice.deviceName,
            macAddress: matchedDevice.macAddress,
            timestamps,
            voltages,
          });
        }

        if (parsed.length === 0) {
          message.error(`불러올 디바이스가 없습니다. ${skippedSheets.join(" / ")}`);
          return;
        }

        setUploadedDevices(parsed);
        setSelectedDeviceId(parsed[0].deviceId);
        // recomputeForUpload 는 selectedDeviceId 변경 effect 에서 자동 호출됨

        const skipNote = skippedSheets.length > 0 ? ` (스킵: ${skippedSheets.length})` : "";
        message.success(`${parsed.length}개 디바이스 로드: ${parsed.map((d) => d.deviceName).join(", ")}${skipNote}`);
      } catch (err) {
        console.error("[XLSX Import] parse error", err);
        message.error("XLSX 파싱 중 오류가 발생했습니다.");
      }
    };
    reader.onerror = () => message.error("파일을 읽을 수 없습니다.");
    reader.readAsArrayBuffer(file);
  }, [devices]);

  // uploadMode 에서 디바이스 선택을 바꾸면 해당 디바이스의 시트 데이터로 자동 재계산
  useEffect(() => {
    if (!uploadMode || !selectedDeviceId) return;
    const target = uploadedDevices.find((d) => d.deviceId === selectedDeviceId);
    if (target) recomputeForUpload(target);
  }, [selectedDeviceId, uploadMode, uploadedDevices, recomputeForUpload]);

  // 필터 재적용 — uploadMode 면 업로드 데이터에 재적용, 아니면 DB 모드
  const handleApplyFilter = useCallback(async () => {
    if (uploadMode) {
      const target = uploadedDevices.find((d) => d.deviceId === selectedDeviceId);
      if (!target) { message.warning("디바이스를 선택하세요."); return; }
      await recomputeForUpload(target);
      return;
    }
    if (!selectedDeviceId || !date || !startTime || !endTime) {
      message.warning("먼저 데이터를 불러오세요.");
      return;
    }
    await handleImportData();
  }, [uploadMode, uploadedDevices, selectedDeviceId, recomputeForUpload, handleImportData, date, startTime, endTime]);

  // 범위 지정 누적선량 재계산
  const handleCalculateRange = useCallback(async () => {
    if (!selectedDeviceId || !date || !rangeStartTime || !rangeEndTime) {
      message.warning("계산 범위를 설정하세요.");
      return;
    }

    const dateStr = date.format("YYYY-MM-DD");
    const dataStart = `${dateStr}T${startTime?.format("HH:mm:ss") || "00:00:00"}`;
    const dataEnd = `${dateStr}T${endTime?.format("HH:mm:ss") || "23:59:59"}`;
    const rStart = `${dateStr}T${rangeStartTime.format("HH:mm:ss")}`;
    const rEnd = `${dateStr}T${rangeEndTime.format("HH:mm:ss")}`;

    setCalcLoading(true);
    try {
      const { data } = await api.post("/calibrations/calculate-range", {
        deviceId: selectedDeviceId,
        dataStartTime: dataStart,
        dataEndTime: dataEnd,
        rangeStartTime: rStart,
        rangeEndTime: rEnd,
        filterType,
        windowSize,
        baseline,
      });

      setCumulativeDose(data.cumulativeDose);
      message.success(`범위 내 ${data.dataPoints}건, 누적선량: ${data.cumulativeDose} V·s`);
    } catch (err: any) {
      message.error(err.response?.data?.error || "계산에 실패했습니다.");
    } finally {
      setCalcLoading(false);
    }
  }, [selectedDeviceId, date, startTime, endTime, rangeStartTime, rangeEndTime, filterType, windowSize, baseline]);

  // CF Factor 계산
  useEffect(() => {
    if (cumulativeDose != null && deliveredDose && deliveredDose > 0) {
      setCfFactor(Math.round((cumulativeDose / deliveredDose) * 100) / 100);
    } else {
      setCfFactor(null);
    }
  }, [cumulativeDose, deliveredDose]);

  // CF Factor 저장
  const handleSave = async () => {
    if (cfFactor == null || !selectedDeviceId || cumulativeDose == null || !deliveredDose) {
      message.warning("모든 계산을 완료한 후 저장하세요.");
      return;
    }

    const dateStr = date?.format("YYYY-MM-DD");
    const rStart = rangeStartTime ? `${dateStr}T${rangeStartTime.format("HH:mm:ss")}` : undefined;
    const rEnd = rangeEndTime ? `${dateStr}T${rangeEndTime.format("HH:mm:ss")}` : undefined;

    setSaveLoading(true);
    try {
      await api.post("/calibrations", {
        deviceId: selectedDeviceId,
        date: dateStr,
        filterType,
        windowSize,
        baseline,
        startTime: rStart,
        endTime: rEnd,
        cumulativeDose,
        deliveredDose,
        cfName: cfName || undefined,
      });
      message.success("CF Factor가 저장되었습니다.");
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
      axisLabel: { fontSize: 10 },
    },
    series: [
      {
        name: "Original",
        type: "line",
        data: chartData.map((d) => d.original),
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
        name: "Filtered",
        type: "line",
        data: chartData.map((d) => d.smoothed),
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
            html += `${p.marker} ${p.seriesName}: ${Number(p.value).toFixed(2)} mV<br/>`;
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
                style={{ width: 220 }}
                placeholder={uploadMode ? "업로드된 디바이스" : "디바이스 선택"}
                value={selectedDeviceId}
                onChange={setSelectedDeviceId}
                options={
                  uploadMode
                    ? uploadedDevices.map((d) => ({ label: `${d.deviceName} (${d.voltages.length})`, value: d.deviceId }))
                    : devices.map((d) => ({ label: d.deviceName, value: d.id }))
                }
              />
              {uploadMode && (
                <Tag color="purple">XLSX {uploadedDevices.length}개</Tag>
              )}
            </Space>
          </Col>
          <Col>
            <Space>
              <span style={{ fontWeight: 600 }}>Date</span>
              <DatePicker value={date} onChange={setDate} />
            </Space>
          </Col>
          <Col>
            <Space>
              <span style={{ fontWeight: 600 }}>Start</span>
              <TimePicker value={startTime} onChange={setStartTime} format="HH:mm:ss" />
              <span style={{ fontWeight: 600 }}>End</span>
              <TimePicker value={endTime} onChange={setEndTime} format="HH:mm:ss" />
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
                accept=".xlsx,.xlsm"
                showUploadList={false}
                beforeUpload={(file) => { handleImportXLSX(file); return false; }}
              >
                <Button icon={<UploadOutlined />}>Upload XLSX</Button>
              </Upload>
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
                style={{ width: 100 }}
                addonAfter="mV"
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
          <div style={{ height: 380, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb" }}>
            디바이스를 선택하고 Import Data를 클릭하세요.
          </div>
        )}
      </Card>

      {/* 계산 영역 */}
      {chartData.length > 0 && (
        <Card size="small" title="Dose Calculation">
          <Row gutter={[24, 16]} align="middle">
            {/* 범위 지정 */}
            <Col span={12}>
              <Space direction="vertical" style={{ width: "100%" }}>
                <div>
                  <span style={{ fontWeight: 600, marginRight: 8 }}>Calculation Range</span>
                  <Space>
                    <TimePicker
                      value={rangeStartTime}
                      onChange={setRangeStartTime}
                      format="HH:mm:ss"
                      placeholder="Start"
                      size="small"
                    />
                    <span>~</span>
                    <TimePicker
                      value={rangeEndTime}
                      onChange={setRangeEndTime}
                      format="HH:mm:ss"
                      placeholder="End"
                      size="small"
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
                    {cumulativeDose != null ? cumulativeDose.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}
                  </span>
                  <span style={{ marginLeft: 4, color: "#888" }}>V·s</span>
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
                    {cfFactor != null ? cfFactor.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "-"}
                  </span>
                  <span style={{ marginLeft: 4, color: "#888" }}>mV·s/cGy</span>
                </Descriptions.Item>
              </Descriptions>
            </Col>
          </Row>

          <Divider style={{ margin: "12px 0" }} />

          {/* 저장 */}
          <Row justify="end" align="middle" gutter={12}>
            <Col>
              <Input
                placeholder="CF Name (선택)"
                value={cfName}
                onChange={(e) => setCfName(e.target.value)}
                style={{ width: 200 }}
                size="small"
              />
            </Col>
            <Col>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saveLoading}
                disabled={cfFactor == null}
              >
                Save CF Factor
              </Button>
            </Col>
          </Row>
        </Card>
      )}
    </>
  );
}
