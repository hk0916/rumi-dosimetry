import { useEffect, useRef, useState } from "react";
import { Select, Button, Card } from "antd";
import { PlayCircleOutlined, PauseCircleOutlined } from "@ant-design/icons";
import ReactECharts from "echarts-for-react";
import api from "../services/api";

export default function MonitoringPage() {
  const [devices, setDevices] = useState<any[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [running, setRunning] = useState(false);
  const [chartData, setChartData] = useState<{ time: string; voltage: number }[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    api.get("/devices").then(({ data }) => setDevices(data.data));
    return () => { wsRef.current?.close(); };
  }, []);

  const handleStart = () => {
    if (!selectedDeviceId) return;
    setRunning(true);
    setChartData([]);

    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws/monitoring/${selectedDeviceId}`);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      setChartData((prev) => {
        const next = [...prev, { time: new Date(msg.timestamp).toLocaleTimeString(), voltage: Number(msg.voltage) }];
        return next.length > 200 ? next.slice(-200) : next;
      });
    };

    ws.onclose = () => setRunning(false);
    wsRef.current = ws;
  };

  const handleStop = () => {
    wsRef.current?.close();
    setRunning(false);
  };

  const chartOption = {
    animation: false,
    grid: { top: 40, right: 30, bottom: 40, left: 60 },
    xAxis: { type: "category" as const, data: chartData.map((d) => d.time), axisLabel: { fontSize: 10 } },
    yAxis: { type: "value" as const, name: "Voltage (mV)", axisLabel: { fontSize: 10 } },
    series: [{ type: "line", data: chartData.map((d) => d.voltage), smooth: true, showSymbol: false, lineStyle: { color: "#4472C4" } }],
    tooltip: { trigger: "axis" as const },
  };

  return (
    <>
      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontWeight: 600 }}>Device</span>
          <Select
            style={{ width: 240 }}
            placeholder="디바이스 선택"
            value={selectedDeviceId}
            onChange={setSelectedDeviceId}
            options={devices.map((d) => ({ label: `✦ ${d.deviceName}`, value: d.id }))}
          />
          {!running ? (
            <Button type="primary" icon={<PlayCircleOutlined />} onClick={handleStart} disabled={!selectedDeviceId}>Start</Button>
          ) : (
            <Button danger icon={<PauseCircleOutlined />} onClick={handleStop}>Stop</Button>
          )}
        </div>
      </Card>
      <Card>
        <ReactECharts option={chartOption} style={{ height: 400 }} />
      </Card>
    </>
  );
}
