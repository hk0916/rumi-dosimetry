import { useEffect, useRef, useState, useCallback } from "react";
import {
  Select, Button, Card, Space, Tag, message,
  DatePicker, Table, Statistic, Row, Col, Tabs,
} from "antd";
import {
  PlayCircleOutlined, PauseCircleOutlined,
  DownloadOutlined, SearchOutlined, ReloadOutlined,
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import api from "../services/api";
import dayjs from "dayjs";

const { RangePicker } = DatePicker;

// 실시간 차트 슬라이딩 윈도우: 최근 N ms만 유지
const LIVE_WINDOW_MS = 2 * 60 * 1000;

interface DataPoint {
  time: string;
  voltage: number;
  timestamp: string;
}

interface SensorRecord {
  id: string;
  voltage: number;
  timestamp: string;
}

export default function MonitoringPage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [gateways, setGateways] = useState<any[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [liveData, setLiveData] = useState<DataPoint[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  // Historical data
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [historyData, setHistoryData] = useState<SensorRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Live stats
  const [liveStats, setLiveStats] = useState({ count: 0, min: 0, max: 0, avg: 0, latest: 0 });

  useEffect(() => {
    api.get("/devices").then(({ data }) => setDevices(data.data));
    api.get("/gateways").then(({ data }) => setGateways(data.data));
    return () => { wsRef.current?.close(); };
  }, []);

  // 실시간 모니터링 중에는 주기적으로 윈도우 밖 데이터 제거
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - LIVE_WINDOW_MS;
      setLiveData((prev) => {
        const filtered = prev.filter((d) => new Date(d.timestamp).getTime() >= cutoff);
        return filtered.length === prev.length ? prev : filtered;
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [running]);

  // Update live stats when liveData changes
  useEffect(() => {
    if (liveData.length === 0) {
      setLiveStats({ count: 0, min: 0, max: 0, avg: 0, latest: 0 });
      return;
    }
    const voltages = liveData.map((d) => d.voltage);
    setLiveStats({
      count: voltages.length,
      min: Math.min(...voltages),
      max: Math.max(...voltages),
      avg: voltages.reduce((a, b) => a + b, 0) / voltages.length,
      latest: voltages[voltages.length - 1],
    });
  }, [liveData]);

  const handleStart = () => {
    if (!selectedDeviceId) return;
    setRunning(true);
    setLiveData([]);

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws/monitoring/${selectedDeviceId}`);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        setLiveData((prev) => {
          const next = [...prev, {
            time: new Date(msg.timestamp).toLocaleTimeString("ko-KR", { hour12: false }),
            voltage: Number(msg.voltage),
            timestamp: msg.timestamp,
          }];
          const cutoff = Date.now() - LIVE_WINDOW_MS;
          return next.filter((d) => new Date(d.timestamp).getTime() >= cutoff);
        });
      } catch {
        // 잘못된 메시지 무시
      }
    };

    ws.onerror = () => {
      message.warning("WebSocket 연결에 문제가 발생했습니다.");
    };

    ws.onclose = () => setRunning(false);
    wsRef.current = ws;
  };

  const handleStop = () => {
    wsRef.current?.close();
    setRunning(false);
  };

  // Historical data query
  const handleQueryHistory = async () => {
    if (!selectedDeviceId) {
      message.warning("디바이스를 선택하세요.");
      return;
    }
    if (!dateRange) {
      message.warning("날짜 범위를 선택하세요.");
      return;
    }

    setHistoryLoading(true);
    try {
      const params: any = {
        deviceId: selectedDeviceId,
        startDate: dateRange[0].format("YYYY-MM-DD"),
        startTime: dateRange[0].format("HH:mm:ss"),
        endDate: dateRange[1].format("YYYY-MM-DD"),
        endTime: dateRange[1].format("HH:mm:ss"),
      };
      const { data } = await api.get("/data/sensor-data", { params });
      setHistoryData(data.data);
      message.success(`${data.total}건의 데이터를 조회했습니다.`);
    } catch {
      message.error("데이터 조회에 실패했습니다.");
    } finally {
      setHistoryLoading(false);
    }
  };

  // CSV Export
  const handleExportCSV = useCallback(() => {
    const dataToExport = historyData.length > 0 ? historyData : liveData.map((d, i) => ({
      id: String(i + 1),
      voltage: d.voltage,
      timestamp: d.timestamp,
    }));

    if (!dataToExport.length) {
      message.warning("내보낼 데이터가 없습니다.");
      return;
    }

    const deviceName = devices.find((d) => d.id === selectedDeviceId)?.deviceName || "unknown";
    // raw(20-bit ADC, endian 변환 적용된 원본) = round(voltage(V) * 0xFFFFF / 1.21)
    const toRaw = (v: number) => Math.round((Number(v) * 0xFFFFF) / 1.21);
    const csv = [
      "ID,Timestamp,Raw,Voltage(mV),Voltage(V)",
      ...dataToExport.map((d) =>
        `${d.id},${dayjs(d.timestamp).format("YYYY-MM-DD HH:mm:ss.SSS")},${toRaw(d.voltage)},${Number(d.voltage) * 1000},${Number(d.voltage)}`
      ),
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dosimetry_${deviceName}_${dayjs().format("YYYYMMDD_HHmmss")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    message.success("CSV 파일이 다운로드되었습니다.");
  }, [historyData, liveData, selectedDeviceId, devices]);

  // Live chart option
  const liveChartOption: EChartsOption = {
    animation: false,
    grid: { top: 50, right: 40, bottom: 60, left: 70 },
    title: { text: "Real-time Voltage", left: "center", textStyle: { fontSize: 14 } },
    xAxis: {
      type: "category",
      data: liveData.map((d) => d.time),
      axisLabel: { fontSize: 10, rotate: 30 },
    },
    yAxis: {
      type: "value",
      name: "Voltage (mV)",
      axisLabel: { fontSize: 10, formatter: (v: number) => v.toFixed(3) },
    },
    series: [{
      type: "line",
      data: liveData.map((d) => d.voltage * 1000),
      smooth: true,
      showSymbol: false,
      lineStyle: { color: "#4472C4", width: 2 },
      areaStyle: { color: "rgba(68,114,196,0.1)" },
    }],
    tooltip: { trigger: "axis", formatter: (params: any) => {
      const p = params[0];
      return `${p.axisValue}<br/>Voltage: <b>${Number(p.value)} mV</b>`;
    }},
    dataZoom: [
      { type: "inside", start: 0, end: 100 },
      { type: "slider", start: 0, end: 100, height: 20, bottom: 5 },
    ],
    toolbox: {
      right: 20,
      feature: {
        dataZoom: { yAxisIndex: "none", title: { zoom: "Zoom", back: "Zoom Out" } },
        restore: { title: "Restore" },
        saveAsImage: { title: "Save" },
      },
    },
  };

  // History chart option
  const historyChartOption: EChartsOption = {
    animation: false,
    grid: { top: 50, right: 40, bottom: 80, left: 70 },
    title: { text: `Historical Data (${historyData.length}건)`, left: "center", textStyle: { fontSize: 14 } },
    xAxis: {
      type: "category",
      data: historyData.map((d) => dayjs(d.timestamp).format("HH:mm:ss")),
      axisLabel: { fontSize: 10, rotate: 30 },
    },
    yAxis: {
      type: "value",
      name: "Voltage (mV)",
      axisLabel: { fontSize: 10, formatter: (v: number) => v.toFixed(3) },
    },
    series: [{
      type: "line",
      data: historyData.map((d) => d.voltage * 1000),
      smooth: false,
      showSymbol: historyData.length < 100,
      symbolSize: 4,
      lineStyle: { color: "#70AD47", width: 1.5 },
      areaStyle: { color: "rgba(112,173,71,0.08)" },
    }],
    tooltip: { trigger: "axis", formatter: (params: any) => {
      const p = params[0];
      return `${p.axisValue}<br/>Voltage: <b>${Number(p.value)} mV</b>`;
    }},
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

  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(50);

  const historyColumns = [
    {
      title: "#",
      key: "index",
      width: 80,
      render: (_: any, __: any, index: number) => (historyPage - 1) * historyPageSize + index + 1,
    },
    {
      title: "Timestamp",
      dataIndex: "timestamp",
      render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm:ss.SSS"),
    },
    {
      title: "Voltage (mV)",
      dataIndex: "voltage",
      render: (v: number) => (Number(v) * 1000).toFixed(6),
      sorter: (a: SensorRecord, b: SensorRecord) => a.voltage - b.voltage,
    },
  ];

  return (
    <>
      {/* Control Bar */}
      <Card size="small" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <Space wrap>
            <span style={{ fontWeight: 600 }}>Device</span>
            <Select
              style={{ width: 200 }}
              placeholder="디바이스 선택"
              value={selectedDeviceId}
              onChange={(v) => { setSelectedDeviceId(v); setHistoryData([]); }}
              options={devices.map((d) => ({
                label: (
                  <span>
                    <Tag color={d.status === "online" ? "green" : "default"} style={{ marginRight: 4 }}>
                      {d.status === "online" ? "ON" : "OFF"}
                    </Tag>
                    {d.deviceName}
                  </span>
                ),
                value: d.id,
              }))}
            />
            {!running ? (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart} disabled={!selectedDeviceId}>Start</Button>
            ) : (
              <Button danger icon={<PauseCircleOutlined />} onClick={handleStop}>Stop</Button>
            )}
            <Button icon={<ReloadOutlined />} onClick={() => {
              api.get("/devices").then(({ data }) => setDevices(data.data));
              api.get("/gateways").then(({ data }) => setGateways(data.data));
            }} />
            <Button icon={<DownloadOutlined />} onClick={handleExportCSV} disabled={liveData.length === 0 && historyData.length === 0}>
              CSV Export
            </Button>
          </Space>

        </div>
      </Card>

      <Tabs
        defaultActiveKey="realtime"
        items={[
          {
            key: "realtime",
            label: "Real-time Monitoring",
            children: (
              <>
                {/* Live Stats */}
                {liveData.length > 0 && (
                  <Card size="small" style={{ marginBottom: 12 }}>
                    <Row gutter={16}>
                      <Col span={4}><Statistic title="Data Points" value={liveStats.count} /></Col>
                      <Col span={5}><Statistic title="Latest (mV)" value={liveStats.latest * 1000} precision={6} valueStyle={{ color: "#4472C4" }} /></Col>
                      <Col span={5}><Statistic title="Min (mV)" value={liveStats.min * 1000} precision={6} valueStyle={{ color: "#70AD47" }} /></Col>
                      <Col span={5}><Statistic title="Max (mV)" value={liveStats.max * 1000} precision={6} valueStyle={{ color: "#C0504D" }} /></Col>
                      <Col span={5}><Statistic title="Avg (mV)" value={liveStats.avg * 1000} precision={6} /></Col>
                    </Row>
                  </Card>
                )}

                {/* Live Chart */}
                <Card size="small">
                  {liveData.length > 0 ? (
                    <ReactECharts option={liveChartOption} style={{ height: 380 }} />
                  ) : (
                    <div style={{ height: 380, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb" }}>
                      {running
                        ? "데이터 수신 대기 중..."
                        : "디바이스를 선택하고 Start 버튼을 누르세요."}
                    </div>
                  )}
                </Card>
              </>
            ),
          },
          {
            key: "history",
            label: "Historical Data",
            children: (
              <>
                {/* Query Controls */}
                <Card size="small" style={{ marginBottom: 12 }}>
                  <Space wrap>
                    <RangePicker
                      showTime={{ format: "HH:mm:ss" }}
                      format="YYYY-MM-DD HH:mm:ss"
                      value={dateRange}
                      onChange={(v) => setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null)}
                      presets={[
                        { label: "최근 1시간", value: [dayjs().subtract(1, "hour"), dayjs()] },
                        { label: "최근 6시간", value: [dayjs().subtract(6, "hour"), dayjs()] },
                        { label: "오늘", value: [dayjs().startOf("day"), dayjs()] },
                        { label: "어제", value: [dayjs().subtract(1, "day").startOf("day"), dayjs().subtract(1, "day").endOf("day")] },
                        { label: "최근 7일", value: [dayjs().subtract(7, "day"), dayjs()] },
                      ]}
                    />
                    <Button type="primary" icon={<SearchOutlined />} onClick={handleQueryHistory} loading={historyLoading} disabled={!selectedDeviceId}>
                      조회
                    </Button>
                    <Button icon={<DownloadOutlined />} onClick={handleExportCSV} disabled={historyData.length === 0}>
                      CSV Export
                    </Button>
                  </Space>
                </Card>

                {/* History Chart */}
                {historyData.length > 0 && (
                  <Card size="small" style={{ marginBottom: 12 }}>
                    <ReactECharts option={historyChartOption} style={{ height: 350 }} />
                  </Card>
                )}

                {/* History Table */}
                <Card size="small">
                  <Table
                    dataSource={historyData}
                    columns={historyColumns}
                    rowKey="id"
                    loading={historyLoading}
                    size="small"
                    pagination={{
                      pageSize: historyPageSize,
                      showSizeChanger: true,
                      pageSizeOptions: ["20", "50", "100", "500"],
                      showTotal: (t) => `Total: ${t}건`,
                      onChange: (page, size) => { setHistoryPage(page); setHistoryPageSize(size); },
                    }}
                    scroll={{ y: 400 }}
                  />
                </Card>
              </>
            ),
          },
        ]}
      />
    </>
  );
}
