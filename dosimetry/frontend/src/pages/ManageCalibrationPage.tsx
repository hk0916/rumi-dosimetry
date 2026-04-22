import { useEffect, useState } from "react";
import {
  Card, Table, Button, Tag, Modal, Descriptions, message,
  Popconfirm, Select, Space, Input, Spin,
} from "antd";
import { ReloadOutlined, DeleteOutlined, EditOutlined, DownloadOutlined, LineChartOutlined } from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import type { EChartsOption } from "echarts";
import api from "../services/api";
import dayjs from "dayjs";

const RAW_MAX = 0xFFFFF;
const REF_V = 1.21;
// Voltage (V) → Raw ADC (0..0xFFFFF)
const toRaw = (voltage_V: number) => Math.round((voltage_V * RAW_MAX) / REF_V);

export default function ManageCalibrationPage() {
  const [calibrations, setCalibrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [filterDeviceId, setFilterDeviceId] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  // 차트 재현 상태
  const [chartData, setChartData] = useState<any[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [exportingId, setExportingId] = useState<number | null>(null);

  const fetchCalibrations = async () => {
    setLoading(true);
    try {
      const params: any = { size: "100" };
      if (filterDeviceId) params.deviceId = filterDeviceId;
      const { data } = await api.get("/calibrations", { params });
      setCalibrations(data.data);
    } catch {
      message.error("Calibration 목록을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get("/devices").then(({ data }) => setDevices(data.data)).catch(() => {});
    fetchCalibrations();
  }, []);

  useEffect(() => {
    fetchCalibrations();
  }, [filterDeviceId]);

  const handleDelete = async (id: number) => {
    try {
      await api.delete(`/calibrations/${id}`);
      message.success("삭제되었습니다.");
      fetchCalibrations();
      if (selected?.id === id) setSelected(null);
    } catch (err: any) {
      message.error(err.response?.data?.error || "삭제에 실패했습니다.");
    }
  };

  const handleUpdateName = async () => {
    if (!selected) return;
    setEditLoading(true);
    try {
      await api.put(`/calibrations/${selected.id}`, { cfName: editName });
      message.success("이름이 변경되었습니다.");
      fetchCalibrations();
      setSelected({ ...selected, cfName: editName });
    } catch {
      message.error("변경에 실패했습니다.");
    } finally {
      setEditLoading(false);
    }
  };

  // 차트 재현: 선택된 calibration의 설정으로 calculate 호출
  const loadChart = async (cal: any) => {
    if (!cal?.startTime || !cal?.endTime) {
      setChartData([]);
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
      setChartData(data.chartData || []);
    } catch {
      message.warning("차트 데이터를 불러올 수 없습니다.");
      setChartData([]);
    } finally {
      setChartLoading(false);
    }
  };

  // 모달 열릴 때 차트 로드
  useEffect(() => {
    if (selected) {
      loadChart(selected);
    } else {
      setChartData([]);
    }
  }, [selected?.id]);

  // CSV Export: calibration의 차트 데이터(Raw/Voltage mV/Voltage V/Smoothed mV)를 CSV로 내보냄
  const handleExport = async (cal: any) => {
    if (!cal.startTime || !cal.endTime) {
      message.warning("시간 범위가 없어 내보낼 데이터가 없습니다.");
      return;
    }
    setExportingId(cal.id);
    try {
      const { data } = await api.post("/calibrations/calculate", {
        deviceId: cal.deviceId,
        startTime: cal.startTime,
        endTime: cal.endTime,
        filterType: cal.filterType || "median",
        windowSize: cal.windowSize || 10,
        baseline: Number(cal.baseline) || 0,
      });

      const rows = data.chartData || [];
      if (rows.length === 0) {
        message.warning("내보낼 데이터가 없습니다.");
        return;
      }

      const baselineV = Number(cal.baseline) || 0;
      const header = [
        `# CF Name: ${cal.cfName || `CF#${cal.id}`}`,
        `# Device: ${cal.device?.deviceName || ""}`,
        `# Filter: ${cal.filterType || ""} (Window ${cal.windowSize ?? ""})`,
        `# Baseline: ${(baselineV * 1000).toFixed(6)} mV`,
        `# CF Factor: ${cal.cfFactor != null ? (Number(cal.cfFactor) * 1000).toFixed(6) + " mV·s/cGy" : "-"}`,
        `# Date: ${cal.date ? dayjs(cal.date).format("YYYY-MM-DD") : ""}`,
        "",
        "Index,Timestamp,Raw,Voltage(mV),Voltage(V),Smoothed(mV),Filtered(mV)",
      ].join("\n");

      const body = rows
        .map((d: any, i: number) => {
          const vV = Number(d.original) || 0;
          const sV = Number(d.smoothed) || 0;
          return [
            i + 1,
            dayjs(d.timestamp).format("YYYY-MM-DD HH:mm:ss.SSS"),
            toRaw(vV),
            vV * 1000,
            vV,
            sV * 1000,
            sV * 1000 - baselineV * 1000,
          ].join(",");
        })
        .join("\n");

      const csv = header + "\n" + body + "\n";
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safeName = (cal.cfName || `CF_${cal.id}`).replace(/[^\w\-]+/g, "_");
      a.href = url;
      a.download = `${safeName}_${dayjs().format("YYYYMMDD_HHmmss")}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(`${rows.length}건 내보내기 완료`);
    } catch (err: any) {
      message.error(err.response?.data?.error || "내보내기에 실패했습니다.");
    } finally {
      setExportingId(null);
    }
  };

  // 차트 옵션 (CalibrationPage와 동일 스타일)
  const baselineMv = selected ? (Number(selected.baseline) || 0) * 1000 : 0;
  const chartOption: EChartsOption = {
    animation: false,
    grid: { top: 40, right: 30, bottom: 70, left: 70 },
    legend: { data: ["Original", "Baseline", "Filtered"], top: 5 },
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
        showSymbol: false,
        lineStyle: { color: "#4472C4", width: 1 },
      },
      {
        name: "Baseline",
        type: "line",
        data: chartData.map(() => baselineMv),
        showSymbol: false,
        lineStyle: { color: "#FFC000", width: 1.5, type: "dashed" },
      },
      {
        // PDF 스펙: Filtered = 스무딩된 값 − baseline
        name: "Filtered",
        type: "line",
        data: chartData.map((d) => d.smoothed * 1000 - baselineMv),
        showSymbol: false,
        lineStyle: { color: "#70AD47", width: 2 },
      },
    ],
    tooltip: { trigger: "axis" },
    dataZoom: [
      { type: "inside", start: 0, end: 100 },
      { type: "slider", start: 0, end: 100, height: 16, bottom: 5 },
    ],
  };

  const columns = [
    {
      title: "CF Name",
      dataIndex: "cfName",
      render: (v: string, r: any) => (
        <a onClick={() => { setSelected(r); setEditName(r.cfName || ""); }}>{v || "-"}</a>
      ),
    },
    {
      title: "Device",
      dataIndex: ["device", "deviceName"],
    },
    {
      title: "Filter",
      dataIndex: "filterType",
      render: (v: string) => <Tag>{v || "-"}</Tag>,
    },
    {
      title: "Window",
      dataIndex: "windowSize",
      width: 80,
    },
    {
      title: "Baseline",
      dataIndex: "baseline",
      width: 110,
      render: (v: number) => v != null ? `${(Number(v) * 1000).toFixed(6)} mV` : "-",
    },
    {
      title: "Cumulative Dose",
      dataIndex: "cumulativeDose",
      render: (v: string) => v != null ? `${(Number(v) * 1000).toLocaleString(undefined, { maximumFractionDigits: 6 })} mV·s` : "-",
    },
    {
      title: "Delivered Dose",
      dataIndex: "deliveredDose",
      render: (v: string) => v != null ? `${Number(v)} cGy` : "-",
    },
    {
      title: "CF Factor",
      dataIndex: "cfFactor",
      render: (v: string) => (
        <span style={{ fontWeight: 700, color: "#70AD47" }}>
          {v != null ? `${(Number(v) * 1000).toFixed(6)} mV·s/cGy` : "-"}
        </span>
      ),
    },
    {
      title: "Date",
      dataIndex: "createdAt",
      width: 100,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD"),
    },
    {
      title: "",
      width: 120,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button
            size="small"
            icon={<LineChartOutlined />}
            onClick={() => { setSelected(r); setEditName(r.cfName || ""); }}
            title="차트 보기"
          />
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => handleExport(r)}
            loading={exportingId === r.id}
            title="CSV 내보내기"
          />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(r.id)}>
            <Button danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space>
          <span style={{ fontWeight: 600 }}>Device Filter</span>
          <Select
            style={{ width: 200 }}
            placeholder="All Devices"
            allowClear
            value={filterDeviceId}
            onChange={setFilterDeviceId}
            options={devices.map((d) => ({ label: d.deviceName, value: d.id }))}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchCalibrations} />
          <Tag>{calibrations.length}건</Tag>
        </Space>
      </Card>

      <Card size="small">
        <Table
          dataSource={calibrations}
          columns={columns}
          rowKey="id"
          loading={loading}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Total: ${t}건` }}
        />
      </Card>

      {/* Detail Modal with Chart */}
      <Modal
        title="Calibration Detail"
        open={!!selected}
        onCancel={() => setSelected(null)}
        footer={
          selected && (
            <Space>
              <Button icon={<DownloadOutlined />} onClick={() => handleExport(selected)} loading={exportingId === selected.id}>
                CSV Export
              </Button>
              <Button onClick={() => setSelected(null)}>Close</Button>
            </Space>
          )
        }
        width={900}
      >
        {selected && (
          <>
            <Descriptions column={3} bordered size="small">
              <Descriptions.Item label="ID">{selected.id}</Descriptions.Item>
              <Descriptions.Item label="Device" span={2}>{selected.device?.deviceName}</Descriptions.Item>
              <Descriptions.Item label="User">{selected.user?.name || selected.user?.username}</Descriptions.Item>
              <Descriptions.Item label="Date">{selected.date ? dayjs(selected.date).format("YYYY-MM-DD") : "-"}</Descriptions.Item>
              <Descriptions.Item label="Filter Type"><Tag>{selected.filterType || "-"}</Tag></Descriptions.Item>
              <Descriptions.Item label="Window Size">{selected.windowSize ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="Baseline" span={2}>
                {selected.baseline != null ? `${(Number(selected.baseline) * 1000).toFixed(6)} mV` : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Time Range" span={3}>
                {selected.startTime && selected.endTime
                  ? `${dayjs(selected.startTime).format("YYYY-MM-DD HH:mm:ss")} ~ ${dayjs(selected.endTime).format("HH:mm:ss")}`
                  : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Cumulative Dose" span={3}>
                <span style={{ fontSize: 14, color: "#4472C4", fontWeight: 600 }}>
                  {selected.cumulativeDose != null ? `${(Number(selected.cumulativeDose) * 1000).toLocaleString(undefined, { maximumFractionDigits: 6 })} mV·s` : "-"}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Delivered Dose">
                {selected.deliveredDose != null ? `${Number(selected.deliveredDose)} cGy` : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="CF Factor" span={2}>
                <span style={{ fontSize: 16, color: "#70AD47", fontWeight: 700 }}>
                  {selected.cfFactor != null ? `${(Number(selected.cfFactor) * 1000).toFixed(6)} mV·s/cGy` : "-"}
                </span>
              </Descriptions.Item>
            </Descriptions>

            {/* 차트 재현 */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                <LineChartOutlined /> Chart (Reproduced)
              </div>
              {chartLoading ? (
                <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Spin />
                </div>
              ) : chartData.length > 0 ? (
                <ReactECharts option={chartOption} style={{ height: 280 }} />
              ) : (
                <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "#bbb" }}>
                  차트 데이터가 없습니다.
                </div>
              )}
            </div>

            <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 600 }}>CF Name:</span>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{ width: 200 }}
                size="small"
              />
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={handleUpdateName}
                loading={editLoading}
              >
                Rename
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
