import { useEffect, useState, useCallback } from "react";
import {
  Card, Select, DatePicker, TimePicker, Button, InputNumber,
  Space, Row, Col, Divider, Statistic, message, Input, Descriptions, Tag,
} from "antd";
import {
  SearchOutlined, SaveOutlined, CalculatorOutlined,
  FilterOutlined, ReloadOutlined,
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
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

  useEffect(() => {
    api.get("/devices").then(({ data }) => setDevices(data.data)).catch(() => {});
  }, []);

  // Import Data
  const handleImportData = useCallback(async () => {
    if (!selectedDeviceId || !date || !startTime || !endTime) {
      message.warning("디바이스, 날짜, 시작/종료 시간을 모두 입력하세요.");
      return;
    }

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

  // 필터 재적용
  const handleApplyFilter = useCallback(async () => {
    if (!selectedDeviceId || !date || !startTime || !endTime) {
      message.warning("먼저 데이터를 불러오세요.");
      return;
    }
    await handleImportData();
  }, [handleImportData]);

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
            <Button
              type="primary"
              icon={<SearchOutlined />}
              onClick={handleImportData}
              loading={loading}
            >
              Import Data
            </Button>
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
