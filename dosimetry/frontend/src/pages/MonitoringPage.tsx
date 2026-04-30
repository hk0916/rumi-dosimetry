import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  Select, Button, Card, Space, Tag, message,
  DatePicker, Table, Tabs,
} from "antd";
import {
  PlayCircleOutlined, PauseCircleOutlined,
  DownloadOutlined, SearchOutlined, ReloadOutlined,
} from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import * as XLSX from "xlsx";
import api from "../services/api";
import dayjs from "dayjs";

const { RangePicker } = DatePicker;

// 실시간 차트 슬라이딩 윈도우: 최근 N ms만 유지
const LIVE_WINDOW_MS = 2 * 60 * 1000;
const MAX_DEVICES = 6;
const SERIES_COLORS = ["#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"];
// 샘플 간격이 이 값을 넘으면 데이터 누락으로 판단해 라인을 끊음
// 25ms × 4 = 100ms → 4개 이상 연속 누락 시 끊김 표시
const GAP_BREAK_MS = 100;

/**
 * 인접 샘플 간 시간 갭이 GAP_BREAK_MS 초과면 [ts, null] 점을 끼워넣어
 * ECharts 라인이 끊기도록 변환. 이렇게 하면 BLE 패킷 손실로 인한 "플랫"/"사선"
 * 인공 흔적이 아니라 진짜 갭으로 보임.
 */
function withGaps<T extends { timestamp: string; voltage: number }>(arr: T[]): Array<[string, number | null]> {
  const out: Array<[string, number | null]> = [];
  let prevMs = -Infinity;
  for (const d of arr) {
    const ms = new Date(d.timestamp).getTime();
    if (ms - prevMs > GAP_BREAK_MS && out.length > 0) {
      out.push([d.timestamp, null]);
    }
    out.push([d.timestamp, d.voltage]);
    prevMs = ms;
  }
  return out;
}

interface DataPoint {
  voltage: number;
  advertisingCount?: number;
  timestamp: string; // ISO
}

interface SensorRecord {
  id: string;
  voltage: number;
  advertisingCount?: number;
  timestamp: string;
}

export default function MonitoringPage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<number[]>([]);
  const [running, setRunning] = useState(false);
  const [liveDataByDevice, setLiveDataByDevice] = useState<Record<number, DataPoint[]>>({});
  const wsRefsRef = useRef<Map<number, WebSocket>>(new Map());

  // Historical data
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [historyDataByDevice, setHistoryDataByDevice] = useState<Record<number, SensorRecord[]>>({});
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchDevices = useCallback(() => {
    api.get("/devices").then(({ data }) => setDevices(data.data));
  }, []);

  useEffect(() => {
    fetchDevices();
    return () => {
      for (const ws of wsRefsRef.current.values()) ws.close();
      wsRefsRef.current.clear();
    };
  }, [fetchDevices]);

  // 실시간 모니터링 중에는 주기적으로 윈도우 밖 데이터 제거
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - LIVE_WINDOW_MS;
      setLiveDataByDevice((prev) => {
        let changed = false;
        const next: Record<number, DataPoint[]> = {};
        for (const [devIdStr, arr] of Object.entries(prev)) {
          const filtered = arr.filter((d) => new Date(d.timestamp).getTime() >= cutoff);
          if (filtered.length !== arr.length) changed = true;
          next[Number(devIdStr)] = filtered;
        }
        return changed ? next : prev;
      });
    }, 2000);
    return () => clearInterval(timer);
  }, [running]);

  const handleSelectChange = (vals: number[]) => {
    if (vals.length > MAX_DEVICES) {
      message.warning(`최대 ${MAX_DEVICES}개까지만 선택할 수 있습니다.`);
      return;
    }
    setSelectedDeviceIds(vals);
    // 선택에서 제거된 디바이스의 데이터 정리
    setLiveDataByDevice((prev) => {
      const next: Record<number, DataPoint[]> = {};
      for (const id of vals) if (prev[id]) next[id] = prev[id];
      return next;
    });
    setHistoryDataByDevice((prev) => {
      const next: Record<number, SensorRecord[]> = {};
      for (const id of vals) if (prev[id]) next[id] = prev[id];
      return next;
    });
  };

  const handleStart = () => {
    if (selectedDeviceIds.length === 0) {
      message.warning("디바이스를 1개 이상 선택하세요.");
      return;
    }
    setRunning(true);
    setLiveDataByDevice(Object.fromEntries(selectedDeviceIds.map((id) => [id, []])));

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    for (const devId of selectedDeviceIds) {
      const ws = new WebSocket(`${protocol}://${window.location.host}/ws/monitoring/${devId}`);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          setLiveDataByDevice((prev) => {
            const cutoff = Date.now() - LIVE_WINDOW_MS;
            const arr = prev[devId] || [];
            const next = [...arr, {
              voltage: Number(msg.voltage),
              advertisingCount: msg.advertisingCount != null ? Number(msg.advertisingCount) : undefined,
              timestamp: msg.timestamp,
            }].filter((d) => new Date(d.timestamp).getTime() >= cutoff);
            return { ...prev, [devId]: next };
          });
        } catch {
          // ignore
        }
      };
      ws.onerror = () => {
        message.warning(`디바이스 ${devId} WebSocket 연결 문제`);
      };
      wsRefsRef.current.set(devId, ws);
    }
  };

  const handleStop = () => {
    for (const ws of wsRefsRef.current.values()) ws.close();
    wsRefsRef.current.clear();
    setRunning(false);
  };

  const handleQueryHistory = async () => {
    if (selectedDeviceIds.length === 0) {
      message.warning("디바이스를 선택하세요.");
      return;
    }
    if (!dateRange) {
      message.warning("날짜 범위를 선택하세요.");
      return;
    }

    setHistoryLoading(true);
    try {
      const results = await Promise.all(
        selectedDeviceIds.map((devId) =>
          api.get("/data/sensor-data", {
            params: {
              deviceId: devId,
              startDate: dateRange[0].format("YYYY-MM-DD"),
              startTime: dateRange[0].format("HH:mm:ss"),
              endDate: dateRange[1].format("YYYY-MM-DD"),
              endTime: dateRange[1].format("HH:mm:ss"),
            },
          }).then(({ data }) => [devId, data.data as SensorRecord[]] as const)
        )
      );
      const byDevice: Record<number, SensorRecord[]> = {};
      let total = 0;
      for (const [devId, rows] of results) {
        byDevice[devId] = rows;
        total += rows.length;
      }
      setHistoryDataByDevice(byDevice);
      message.success(`${selectedDeviceIds.length}개 디바이스, 총 ${total}건 조회`);
    } catch {
      message.error("데이터 조회에 실패했습니다.");
    } finally {
      setHistoryLoading(false);
    }
  };

  const deviceById = useMemo(() => {
    const m = new Map<number, any>();
    for (const d of devices) m.set(d.id, d);
    return m;
  }, [devices]);

  const handleExportCSV = useCallback(() => {
    if (selectedDeviceIds.length === 0) {
      message.warning("디바이스를 선택하세요.");
      return;
    }

    const exportedAt = dayjs().format("YYYY-MM-DD HH:mm:ss");
    const fileTs = dayjs().format("YYYYMMDD_HHmmss");
    // Voltage(V) = raw * 1.21 / 0xFFFFF (20-bit ADC, Vref=1.21V)
    const toVolt = (raw: number) => (Number(raw) * 1.21) / 0xFFFFF;

    const workbook = XLSX.utils.book_new();
    const usedSheetNames = new Set<string>();
    let sheetCount = 0;
    let skipped = 0;

    for (const devId of selectedDeviceIds) {
      const dev = deviceById.get(devId);
      const deviceName = dev?.deviceName || `dev-${devId}`;
      const deviceMac = dev?.macAddress || "";

      const historyRows = historyDataByDevice[devId] || [];
      const liveRows = liveDataByDevice[devId] || [];
      const useHistory = historyRows.length > 0;
      const data = useHistory
        ? historyRows.map((d) => ({ id: d.id, voltage: d.voltage, advertisingCount: d.advertisingCount, timestamp: d.timestamp }))
        : liveRows.map((d, i) => ({ id: String(i + 1), voltage: d.voltage, advertisingCount: d.advertisingCount, timestamp: d.timestamp }));

      if (data.length === 0) {
        skipped += 1;
        continue;
      }

      const mode = useHistory ? "historical" : "realtime";
      const firstTs = data[0]?.timestamp;
      const lastTs = data[data.length - 1]?.timestamp;

      // 시트 데이터 = summary 헤더 + 빈 줄 + 컬럼 헤더 + 데이터 행
      const aoa: (string | number)[][] = [
        [`# DeviceName: ${deviceName}`],
        [`# DeviceMac: ${deviceMac}`],
        [`# DeviceId: ${devId}`],
        [`# Mode: ${mode}`],
        [`# Samples: ${data.length}`],
        [`# StartTime: ${firstTs ? dayjs(firstTs).format("YYYY-MM-DD HH:mm:ss.SSS") : ""}`],
        [`# EndTime: ${lastTs ? dayjs(lastTs).format("YYYY-MM-DD HH:mm:ss.SSS") : ""}`],
        [`# ExportedAt: ${exportedAt}`],
        [],
        ["ID", "Timestamp", "Advertise cnt", "Raw", "Voltage(mV)", "Voltage(V)"],
      ];
      for (const d of data) {
        const raw = Number(d.voltage);
        const v = toVolt(raw);
        aoa.push([
          d.id,
          dayjs(d.timestamp).format("YYYY-MM-DD HH:mm:ss.SSS"),
          d.advertisingCount != null ? d.advertisingCount : "",
          Math.round(raw),
          v * 1000,
          v,
        ]);
      }

      const sheet = XLSX.utils.aoa_to_sheet(aoa);
      // 컬럼 너비 (가독성)
      sheet["!cols"] = [
        { wch: 8 },   // ID
        { wch: 24 },  // Timestamp
        { wch: 14 },  // Advertise cnt
        { wch: 8 },   // Raw
        { wch: 14 },  // Voltage(mV)
        { wch: 14 },  // Voltage(V)
      ];

      // 시트 이름은 디바이스명 기반, Excel 제약(최대 31자, 일부 특수문자 금지) + 중복 회피
      let baseName = deviceName.replace(/[\\/?*[\]:]/g, "_").slice(0, 31);
      let sheetName = baseName;
      let suffix = 2;
      while (usedSheetNames.has(sheetName)) {
        const tag = `_${suffix++}`;
        sheetName = (baseName.slice(0, 31 - tag.length)) + tag;
      }
      usedSheetNames.add(sheetName);

      XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
      sheetCount += 1;
    }

    if (sheetCount === 0) {
      message.warning("내보낼 데이터가 없습니다.");
      return;
    }

    XLSX.writeFile(workbook, `dosimetry_${fileTs}.xlsx`);
    if (skipped > 0) {
      message.success(`Excel 다운로드 (${sheetCount}개 시트, ${skipped}개 디바이스는 데이터 없음으로 제외)`);
    } else {
      message.success(`Excel 다운로드 완료 (${sheetCount}개 시트)`);
    }
  }, [selectedDeviceIds, historyDataByDevice, liveDataByDevice, deviceById]);

  // ===== 차트 옵션 =====
  const liveChartOption: EChartsOption = useMemo(() => ({
    animation: false,
    grid: { top: 50, right: 40, bottom: 70, left: 70 },
    title: { text: "Real-time Voltage", left: "center", textStyle: { fontSize: 14 } },
    legend: { top: 25, type: "scroll" },
    xAxis: { type: "time", axisLabel: { fontSize: 10 } },
    yAxis: { type: "value", name: "Voltage (mV)", scale: true, axisLabel: { fontSize: 10 } },
    series: selectedDeviceIds.map((devId, idx) => {
      const arr = liveDataByDevice[devId] || [];
      const dev = deviceById.get(devId);
      return {
        name: dev?.deviceName || `Device ${devId}`,
        type: "line" as const,
        data: withGaps(arr),
        smooth: false,
        showSymbol: false,
        connectNulls: false,
        // 실시간은 윈도우(2분 × 40Hz × 6 디바이스 ≤ 30k점)이라 샘플링 없이 모든 점을 그림 — flat 구간 인공 흔적 제거
        lineStyle: { color: SERIES_COLORS[idx % SERIES_COLORS.length], width: 1.5 },
        itemStyle: { color: SERIES_COLORS[idx % SERIES_COLORS.length] },
      };
    }),
    tooltip: {
      trigger: "axis",
      formatter: (params: any) => {
        const time = dayjs(params[0].axisValue).format("HH:mm:ss.SSS");
        const lines = params.map((p: any) => `${p.marker} ${p.seriesName}: <b>${Number(p.value[1]).toFixed(2)} mV</b>`);
        return `${time}<br/>${lines.join("<br/>")}`;
      },
    },
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
  }), [selectedDeviceIds, liveDataByDevice, deviceById]);

  const historyChartOption: EChartsOption = useMemo(() => {
    const totalCount = Object.values(historyDataByDevice).reduce((sum, arr) => sum + arr.length, 0);
    return {
      animation: false,
      grid: { top: 50, right: 40, bottom: 80, left: 70 },
      title: { text: `Historical Data (${totalCount}건)`, left: "center", textStyle: { fontSize: 14 } },
      legend: { top: 25, type: "scroll" },
      xAxis: { type: "time", axisLabel: { fontSize: 10 } },
      yAxis: { type: "value", name: "Voltage (mV)", scale: true, axisLabel: { fontSize: 10 } },
      series: selectedDeviceIds.map((devId, idx) => {
        const arr = historyDataByDevice[devId] || [];
        const dev = deviceById.get(devId);
        return {
          name: dev?.deviceName || `Device ${devId}`,
          type: "line" as const,
          data: withGaps(arr),
          smooth: false,
          showSymbol: false,
          symbolSize: 4,
          sampling: "lttb" as const,
          progressive: 4000,
          progressiveThreshold: 8000,
          connectNulls: false,
          lineStyle: { color: SERIES_COLORS[idx % SERIES_COLORS.length], width: 1.5 },
          itemStyle: { color: SERIES_COLORS[idx % SERIES_COLORS.length] },
        };
      }),
      tooltip: {
        trigger: "axis",
        formatter: (params: any) => {
          const time = dayjs(params[0].axisValue).format("YYYY-MM-DD HH:mm:ss");
          const lines = params.map((p: any) => `${p.marker} ${p.seriesName}: <b>${Number(p.value[1]).toFixed(4)} mV</b>`);
          return `${time}<br/>${lines.join("<br/>")}`;
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
          saveAsImage: { title: "Save" },
        },
      },
    };
  }, [selectedDeviceIds, historyDataByDevice, deviceById]);

  // ===== 디바이스별 통계 (실시간) =====
  const liveStatsRows = useMemo(() => {
    return selectedDeviceIds.map((devId, idx) => {
      const arr = liveDataByDevice[devId] || [];
      const voltages = arr.map((d) => d.voltage);
      const dev = deviceById.get(devId);
      return {
        key: devId,
        color: SERIES_COLORS[idx % SERIES_COLORS.length],
        name: dev?.deviceName || `Device ${devId}`,
        status: dev?.status,
        count: voltages.length,
        latest: voltages.length ? voltages[voltages.length - 1] : null,
        min: voltages.length ? Math.min(...voltages) : null,
        max: voltages.length ? Math.max(...voltages) : null,
        avg: voltages.length ? voltages.reduce((a, b) => a + b, 0) / voltages.length : null,
      };
    });
  }, [selectedDeviceIds, liveDataByDevice, deviceById]);

  const liveStatsColumns = [
    {
      title: "", dataIndex: "color", width: 28,
      render: (c: string) => <span style={{ display: "inline-block", width: 12, height: 12, background: c, borderRadius: 2 }} />,
    },
    { title: "Device", dataIndex: "name" },
    { title: "Status", dataIndex: "status", width: 80, render: (s: string) => <Tag color={s === "online" ? "green" : "default"}>{s === "online" ? "ON" : "OFF"}</Tag> },
    { title: "Points", dataIndex: "count", width: 80 },
    { title: "Latest", dataIndex: "latest", width: 100, render: (v: number | null) => v == null ? "-" : v.toFixed(2) },
    { title: "Min", dataIndex: "min", width: 100, render: (v: number | null) => v == null ? "-" : v.toFixed(2) },
    { title: "Max", dataIndex: "max", width: 100, render: (v: number | null) => v == null ? "-" : v.toFixed(2) },
    { title: "Avg", dataIndex: "avg", width: 100, render: (v: number | null) => v == null ? "-" : v.toFixed(2) },
  ];

  // ===== History table: flatten with deviceName column =====
  const flatHistoryRows = useMemo(() => {
    const rows: { key: string; deviceId: number; deviceName: string; timestamp: string; voltage: number }[] = [];
    for (const [devIdStr, arr] of Object.entries(historyDataByDevice)) {
      const devId = Number(devIdStr);
      const name = deviceById.get(devId)?.deviceName || `dev-${devId}`;
      for (const d of arr) {
        rows.push({ key: `${devId}-${d.id}`, deviceId: devId, deviceName: name, timestamp: d.timestamp, voltage: d.voltage });
      }
    }
    rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return rows;
  }, [historyDataByDevice, deviceById]);

  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(50);

  const historyColumns = [
    {
      title: "#", key: "index", width: 70,
      render: (_: any, __: any, index: number) => (historyPage - 1) * historyPageSize + index + 1,
    },
    { title: "Device", dataIndex: "deviceName", width: 180 },
    { title: "Timestamp", dataIndex: "timestamp", render: (v: string) => dayjs(v).format("YYYY-MM-DD HH:mm:ss.SSS") },
    {
      title: "Voltage (mV)", dataIndex: "voltage",
      render: (v: number) => Number(v).toFixed(4),
      sorter: (a: any, b: any) => a.voltage - b.voltage,
    },
  ];

  return (
    <>
      <Card size="small" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <Space wrap>
            <span style={{ fontWeight: 600 }}>Devices ({selectedDeviceIds.length}/{MAX_DEVICES})</span>
            <Select
              mode="multiple"
              style={{ minWidth: 360, maxWidth: 600 }}
              placeholder="디바이스 선택 (최대 6개)"
              value={selectedDeviceIds}
              onChange={handleSelectChange}
              maxTagCount="responsive"
              disabled={running}
              optionFilterProp="label"
              options={devices.map((d) => ({
                label: `${d.status === "online" ? "● " : "○ "}${d.deviceName}`,
                value: d.id,
              }))}
            />
            {!running ? (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart} disabled={selectedDeviceIds.length === 0}>Start</Button>
            ) : (
              <Button danger icon={<PauseCircleOutlined />} onClick={handleStop}>Stop</Button>
            )}
            <Button icon={<ReloadOutlined />} onClick={fetchDevices} />
            <Button
              icon={<DownloadOutlined />}
              onClick={handleExportCSV}
              disabled={flatHistoryRows.length === 0 && Object.values(liveDataByDevice).every((arr) => arr.length === 0)}
            >
              Excel Export
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
                {selectedDeviceIds.length > 0 && (
                  <Card size="small" style={{ marginBottom: 12 }}>
                    <Table
                      size="small"
                      pagination={false}
                      dataSource={liveStatsRows}
                      columns={liveStatsColumns as any}
                    />
                  </Card>
                )}

                <Card size="small">
                  {selectedDeviceIds.length > 0 ? (
                    <ReactECharts option={liveChartOption} style={{ height: 420 }} notMerge={true} />
                  ) : (
                    <div style={{ height: 420, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb" }}>
                      디바이스를 선택하고 Start 버튼을 누르세요.
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
                    <Button type="primary" icon={<SearchOutlined />} onClick={handleQueryHistory} loading={historyLoading} disabled={selectedDeviceIds.length === 0}>
                      조회
                    </Button>
                  </Space>
                </Card>

                {flatHistoryRows.length > 0 && (
                  <Card size="small" style={{ marginBottom: 12 }}>
                    <ReactECharts option={historyChartOption} style={{ height: 380 }} notMerge={true} />
                  </Card>
                )}

                <Card size="small">
                  <Table
                    dataSource={flatHistoryRows}
                    columns={historyColumns}
                    rowKey="key"
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
