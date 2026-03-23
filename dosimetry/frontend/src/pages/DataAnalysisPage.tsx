import { useEffect, useState, useCallback } from "react";
import {
  Card, Select, Button, Space, Row, Col, Divider, message,
  Descriptions, Tag, Table, TimePicker, Radio, Popconfirm, Statistic,
} from "antd";
import {
  CalculatorOutlined, DownloadOutlined, DeleteOutlined, ReloadOutlined,
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import api from "../services/api";
import dayjs from "dayjs";

// snake_case → Title Case
const toLabel = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

interface WeightingFactor {
  id: number;
  radiationSource?: string;
  organName?: string;
  weightingFactor: string;
}

interface AnalysisResult {
  id: number;
  cumulativeDose: number;
  absorbedDose: number;
  equivalentDose: number;
  effectiveDose: number;
  wR: number;
  wT: number;
  cfFactor: number;
}

export default function DataAnalysisPage() {
  // Calibration 목록
  const [calibrations, setCalibrations] = useState<any[]>([]);
  const [selectedCalibrationId, setSelectedCalibrationId] = useState<number | null>(null);

  // Weighting Factors
  const [radiationFactors, setRadiationFactors] = useState<WeightingFactor[]>([]);
  const [tissueFactors, setTissueFactors] = useState<WeightingFactor[]>([]);
  const [radiationSource, setRadiationSource] = useState<string | null>(null);
  const [targetOrgan, setTargetOrgan] = useState<string | null>(null);

  // Range
  const [rangeType, setRangeType] = useState<"full" | "sub">("full");
  const [subRangeStart, setSubRangeStart] = useState<dayjs.Dayjs | null>(null);
  const [subRangeEnd, setSubRangeEnd] = useState<dayjs.Dayjs | null>(null);

  // Results
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);

  // Chart data (from calibration's data)
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);

  // History
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Load initial data
  useEffect(() => {
    api.get("/calibrations", { params: { size: "100" } })
      .then(({ data }) => setCalibrations(data.data))
      .catch(() => {});
    api.get("/analysis/radiation-factors")
      .then(({ data }) => setRadiationFactors(data.data))
      .catch(() => {});
    api.get("/analysis/tissue-factors")
      .then(({ data }) => setTissueFactors(data.data))
      .catch(() => {});
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get("/analysis", { params: { size: "50" } });
      setHistory(data.data);
    } catch {} finally {
      setHistoryLoading(false);
    }
  };

  // Load chart when calibration selected
  const selectedCalibration = calibrations.find((c) => c.id === selectedCalibrationId);

  const handleLoadChart = useCallback(async () => {
    if (!selectedCalibration) return;

    const cal = selectedCalibration;
    if (!cal.startTime || !cal.endTime) {
      message.warning("시간 범위가 없는 Calibration입니다.");
      return;
    }

    setChartLoading(true);
    try {
      const { data } = await api.post("/calibrations/calculate", {
        deviceId: cal.deviceId,
        startTime: cal.startTime,
        endTime: cal.endTime,
        filterType: cal.filterType || "median",
        windowSize: cal.windowSize || 10,
        baseline: Number(cal.baseline) || 0,
      });
      setChartData(data.chartData);
    } catch {
      message.error("차트 데이터 로드에 실패했습니다.");
    } finally {
      setChartLoading(false);
    }
  }, [selectedCalibration]);

  useEffect(() => {
    if (selectedCalibrationId) {
      handleLoadChart();
      setResult(null);
    } else {
      setChartData([]);
    }
  }, [selectedCalibrationId]);

  // Calculate
  const handleCalculate = async () => {
    if (!selectedCalibrationId || !radiationSource || !targetOrgan) {
      message.warning("Calibration, 방사선 종류, 장기를 모두 선택하세요.");
      return;
    }

    setCalcLoading(true);
    try {
      const cal = selectedCalibration;
      const payload: any = {
        calibrationId: selectedCalibrationId,
        radiationSource,
        targetOrgan,
        rangeType,
      };

      if (rangeType === "sub" && subRangeStart && subRangeEnd && cal) {
        const dateStr = dayjs(cal.startTime).format("YYYY-MM-DD");
        payload.subRangeStart = `${dateStr}T${subRangeStart.format("HH:mm:ss")}`;
        payload.subRangeEnd = `${dateStr}T${subRangeEnd.format("HH:mm:ss")}`;
      }

      const { data } = await api.post("/analysis/calculate", payload);
      setResult(data);
      fetchHistory();
      message.success("계산이 완료되었습니다.");
    } catch (err: any) {
      message.error(err.response?.data?.error || "계산에 실패했습니다.");
    } finally {
      setCalcLoading(false);
    }
  };

  // Export CSV
  const handleExport = async (id: number) => {
    try {
      const response = await api.get(`/analysis/${id}/export`, { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([response.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `analysis_${id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      message.error("CSV 내보내기에 실패했습니다.");
    }
  };

  // Delete
  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/analysis/${id}`);
      message.success("삭제되었습니다.");
      fetchHistory();
    } catch (err: any) {
      message.error(err.response?.data?.error || "삭제에 실패했습니다.");
    }
  };

  // Chart option
  const baseline = Number(selectedCalibration?.baseline) || 0;
  const chartOption: EChartsOption = {
    animation: false,
    grid: { top: 50, right: 40, bottom: 80, left: 70 },
    legend: { data: ["Original", "Baseline", "Filtered"], top: 10 },
    xAxis: {
      type: "category",
      data: chartData.map((d: any) => dayjs(d.timestamp).format("HH:mm:ss")),
      axisLabel: { fontSize: 10, rotate: 30 },
    },
    yAxis: { type: "value", name: "Voltage (mV)", axisLabel: { fontSize: 10 } },
    series: [
      { name: "Original", type: "line", data: chartData.map((d: any) => d.original), showSymbol: false, lineStyle: { color: "#4472C4", width: 1 } },
      { name: "Baseline", type: "line", data: chartData.map(() => baseline), showSymbol: false, lineStyle: { color: "#FFC000", width: 1.5, type: "dashed" } },
      { name: "Filtered", type: "line", data: chartData.map((d: any) => d.smoothed), showSymbol: false, lineStyle: { color: "#70AD47", width: 2 } },
    ],
    tooltip: { trigger: "axis" },
    dataZoom: [
      { type: "inside", start: 0, end: 100 },
      { type: "slider", start: 0, end: 100, height: 20, bottom: 5 },
    ],
  };

  // wR/wT display
  const selectedWR = radiationFactors.find((f) => f.radiationSource === radiationSource);
  const selectedWT = tissueFactors.find((f) => f.organName === targetOrgan);

  const historyColumns = [
    {
      title: "Date",
      dataIndex: "createdAt",
      width: 90,
      render: (v: string) => dayjs(v).format("MM-DD HH:mm"),
    },
    {
      title: "Device",
      dataIndex: ["calibration", "device", "deviceName"],
      width: 120,
    },
    {
      title: "Radiation",
      dataIndex: "radiationSource",
      width: 110,
      render: (v: string) => <Tag>{toLabel(v)}</Tag>,
    },
    {
      title: "Organ",
      dataIndex: "targetOrgan",
      width: 100,
      render: (v: string) => toLabel(v),
    },
    {
      title: "Cumulative (V·s)",
      dataIndex: "cumulativeDose",
      render: (v: string) => Number(v).toFixed(2),
    },
    {
      title: "Absorbed (Gy)",
      dataIndex: "absorbedDose",
      render: (v: string) => Number(v).toFixed(4),
    },
    {
      title: "Equivalent (Sv)",
      dataIndex: "equivalentDose",
      render: (v: string) => Number(v).toFixed(4),
    },
    {
      title: "Effective (Sv)",
      dataIndex: "effectiveDose",
      render: (v: string) => (
        <span style={{ fontWeight: 700, color: "#C0504D" }}>{Number(v).toFixed(6)}</span>
      ),
    },
    {
      title: "",
      width: 80,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<DownloadOutlined />} onClick={() => handleExport(r.id)} />
          <Popconfirm title="삭제?" onConfirm={() => handleDelete(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      {/* 조건 설정 */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <Row gutter={[16, 12]} align="middle">
          <Col>
            <Space>
              <span style={{ fontWeight: 600 }}>Calibration</span>
              <Select
                style={{ width: 260 }}
                placeholder="Calibration 선택 (CF Factor 필요)"
                value={selectedCalibrationId}
                onChange={setSelectedCalibrationId}
                options={calibrations.map((c) => ({
                  label: `${c.cfName || `CF#${c.id}`} — ${c.device?.deviceName} (CF: ${Number(c.cfFactor).toFixed(2)})`,
                  value: c.id,
                }))}
                showSearch
                optionFilterProp="label"
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <span style={{ fontWeight: 600 }}>Radiation</span>
              <Select
                style={{ width: 180 }}
                placeholder="방사선 종류"
                value={radiationSource}
                onChange={setRadiationSource}
                options={radiationFactors.map((f) => ({
                  label: `${toLabel(f.radiationSource!)} (wR=${Number(f.weightingFactor)})`,
                  value: f.radiationSource,
                }))}
              />
            </Space>
          </Col>
          <Col>
            <Space>
              <span style={{ fontWeight: 600 }}>Organ</span>
              <Select
                style={{ width: 160 }}
                placeholder="장기 선택"
                value={targetOrgan}
                onChange={setTargetOrgan}
                options={tissueFactors.map((f) => ({
                  label: `${toLabel(f.organName!)} (wT=${Number(f.weightingFactor)})`,
                  value: f.organName,
                }))}
                showSearch
                optionFilterProp="label"
              />
            </Space>
          </Col>
        </Row>

        <Divider style={{ margin: "12px 0" }} />

        <Row gutter={[16, 12]} align="middle">
          <Col>
            <Space>
              <span style={{ fontWeight: 600 }}>Range</span>
              <Radio.Group value={rangeType} onChange={(e) => setRangeType(e.target.value)} size="small">
                <Radio.Button value="full">Full Range</Radio.Button>
                <Radio.Button value="sub">Sub Range</Radio.Button>
              </Radio.Group>
            </Space>
          </Col>
          {rangeType === "sub" && (
            <Col>
              <Space>
                <TimePicker value={subRangeStart} onChange={setSubRangeStart} format="HH:mm:ss" placeholder="Start" size="small" />
                <span>~</span>
                <TimePicker value={subRangeEnd} onChange={setSubRangeEnd} format="HH:mm:ss" placeholder="End" size="small" />
              </Space>
            </Col>
          )}
          <Col>
            <Button
              type="primary"
              icon={<CalculatorOutlined />}
              onClick={handleCalculate}
              loading={calcLoading}
              disabled={!selectedCalibrationId || !radiationSource || !targetOrgan}
            >
              Calculate
            </Button>
          </Col>
          {selectedCalibration && (
            <Col>
              <Space>
                <Tag color="blue">CF: {Number(selectedCalibration.cfFactor).toFixed(2)}</Tag>
                <Tag>{selectedCalibration.filterType}</Tag>
                <Tag>W: {selectedCalibration.windowSize}</Tag>
              </Space>
            </Col>
          )}
        </Row>
      </Card>

      {/* 차트 + 결과 */}
      <Row gutter={12} style={{ marginBottom: 12 }}>
        <Col span={16}>
          <Card size="small" loading={chartLoading}>
            {chartData.length > 0 ? (
              <ReactECharts option={chartOption} style={{ height: 340 }} />
            ) : (
              <div style={{ height: 340, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb" }}>
                Calibration을 선택하면 차트가 표시됩니다.
              </div>
            )}
          </Card>
        </Col>
        <Col span={8}>
          <Card
            size="small"
            title="Dose Report"
            style={{ height: "100%" }}
            extra={
              result && (
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => handleExport(result.id)}
                >
                  CSV
                </Button>
              )
            }
          >
            {result ? (
              <Space direction="vertical" style={{ width: "100%" }} size={12}>
                <Statistic
                  title="Cumulative Dose"
                  value={result.cumulativeDose}
                  precision={2}
                  suffix="V·s"
                  valueStyle={{ color: "#4472C4", fontSize: 18 }}
                />
                <Statistic
                  title={`Absorbed Dose (CF=${result.cfFactor.toFixed(2)})`}
                  value={result.absorbedDose}
                  precision={4}
                  suffix="Gy"
                  valueStyle={{ fontSize: 18 }}
                />
                <Statistic
                  title={`Equivalent Dose (wR=${result.wR})`}
                  value={result.equivalentDose}
                  precision={4}
                  suffix="Sv"
                  valueStyle={{ fontSize: 18 }}
                />
                <div style={{ background: "#fff1f0", padding: "8px 12px", borderRadius: 6 }}>
                  <Statistic
                    title={`Effective Dose (wT=${result.wT})`}
                    value={result.effectiveDose}
                    precision={6}
                    suffix="Sv"
                    valueStyle={{ color: "#C0504D", fontSize: 20, fontWeight: 700 }}
                  />
                </div>
              </Space>
            ) : (
              <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb" }}>
                Calculate를 클릭하세요.
              </div>
            )}
          </Card>
        </Col>
      </Row>

      {/* 분석 이력 */}
      <Card size="small" title="Analysis History" extra={<Button size="small" icon={<ReloadOutlined />} onClick={fetchHistory} />}>
        <Table
          dataSource={history}
          columns={historyColumns}
          rowKey="id"
          loading={historyLoading}
          size="small"
          pagination={{ pageSize: 10, showTotal: (t) => `${t}건` }}
        />
      </Card>
    </>
  );
}
