import { useEffect, useState } from "react";
import { Tabs, Table, Button, Tag, Modal, Descriptions, message, Popconfirm } from "antd";
import { PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import api from "../services/api";
import dayjs from "dayjs";

export default function DevicePage() {
  const [dosimeters, setDosimeters] = useState<any[]>([]);
  const [gateways, setGateways] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [selectedGateway, setSelectedGateway] = useState<any>(null);

  const fetchDosimeters = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/devices");
      setDosimeters(data.data);
    } catch {
      message.error("디바이스 목록을 불러올 수 없습니다.");
    } finally {
      setLoading(false);
    }
  };

  const fetchGateways = async () => {
    try {
      const { data } = await api.get("/gateways");
      setGateways(data.data);
    } catch {
      message.error("Gateway 목록을 불러올 수 없습니다.");
    }
  };

  useEffect(() => {
    fetchDosimeters();
    fetchGateways();
  }, []);

  const handleDeleteDevice = async (id: number) => {
    await api.delete(`/devices/${id}`);
    message.success("삭제되었습니다.");
    fetchDosimeters();
  };

  const dosimeterColumns = [
    { title: "Device Name", dataIndex: "deviceName", render: (t: string, r: any) => <a onClick={() => setSelectedDevice(r)}>{t}</a> },
    { title: "Status", dataIndex: "status", render: (s: string) => <Tag color={s === "online" ? "green" : "default"}>{s}</Tag> },
    { title: "Device Type", dataIndex: "deviceType" },
    { title: "MAC Address", dataIndex: "macAddress" },
    { title: "Battery", dataIndex: "battery", render: (v: number) => v != null ? `${v}%` : "-" },
    { title: "RSSI", dataIndex: "rssi", render: (v: number) => v != null ? `${v}dBm` : "-" },
    { title: "Voltage", dataIndex: "voltage", render: (v: string) => v || "-" },
    { title: "Uptime", dataIndex: "uptime", render: (v: string) => v ? dayjs(v).format("YYYY-MM-DD HH:mm:ss") : "-" },
  ];

  const gatewayColumns = [
    { title: "Device Name", dataIndex: "deviceName", render: (t: string, r: any) => <a onClick={() => setSelectedGateway(r)}>● {t}</a> },
    { title: "Status", dataIndex: "status", render: (s: string) => <Tag color={s === "online" ? "green" : "default"}>{s}</Tag> },
    { title: "Device Type", dataIndex: "deviceType" },
    { title: "MAC Address", dataIndex: "macAddress" },
    { title: "Server IP", dataIndex: "serverIp" },
    { title: "Uptime", dataIndex: "uptime", render: (v: string) => v ? dayjs(v).format("YYYY-MM-DD HH:mm:ss") : "-" },
  ];

  return (
    <>
      <Tabs
        defaultActiveKey="dosimeter"
        items={[
          {
            key: "dosimeter",
            label: "Dosimeter",
            children: (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ color: "#888" }}>{dosimeters.length}건</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button icon={<ReloadOutlined />} onClick={fetchDosimeters} />
                    <Button type="primary" icon={<PlusOutlined />}>Add Device</Button>
                  </div>
                </div>
                <Table
                  dataSource={dosimeters}
                  columns={dosimeterColumns}
                  rowKey="id"
                  loading={loading}
                  pagination={{ pageSize: 20, showSizeChanger: false }}
                  size="middle"
                />
              </>
            ),
          },
          {
            key: "gateway",
            label: "Gateway",
            children: (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ color: "#888" }}>{gateways.length}건</span>
                  <Button type="primary" icon={<PlusOutlined />}>Add Gateway</Button>
                </div>
                <Table
                  dataSource={gateways}
                  columns={gatewayColumns}
                  rowKey="id"
                  size="middle"
                  pagination={false}
                />
              </>
            ),
          },
        ]}
      />

      {/* Dosimeter Detail Modal */}
      <Modal
        title={selectedDevice?.deviceName}
        open={!!selectedDevice}
        onCancel={() => setSelectedDevice(null)}
        footer={[
          <Popconfirm key="del" title="삭제하시겠습니까?" onConfirm={() => { handleDeleteDevice(selectedDevice.id); setSelectedDevice(null); }}>
            <Button danger>Delete</Button>
          </Popconfirm>,
          <Button key="close" onClick={() => setSelectedDevice(null)}>Close</Button>,
        ]}
        width={520}
      >
        {selectedDevice && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="Device Name">{selectedDevice.deviceName}</Descriptions.Item>
            <Descriptions.Item label="MAC Address">{selectedDevice.macAddress}</Descriptions.Item>
            <Descriptions.Item label="Device Type">{selectedDevice.deviceType}</Descriptions.Item>
            <Descriptions.Item label="Status"><Tag color={selectedDevice.status === "online" ? "green" : "default"}>{selectedDevice.status}</Tag></Descriptions.Item>
            <Descriptions.Item label="Battery">{selectedDevice.battery != null ? `${selectedDevice.battery}%` : "-"}</Descriptions.Item>
            <Descriptions.Item label="RSSI">{selectedDevice.rssi != null ? `${selectedDevice.rssi}dBm` : "-"}</Descriptions.Item>
            <Descriptions.Item label="Voltage">{selectedDevice.voltage || "-"}</Descriptions.Item>
            <Descriptions.Item label="Uptime">{selectedDevice.uptime ? dayjs(selectedDevice.uptime).format("YYYY-MM-DD HH:mm:ss") : "-"}</Descriptions.Item>
          </Descriptions>
        )}
      </Modal>

      {/* Gateway Detail Modal */}
      <Modal
        title={selectedGateway?.deviceName}
        open={!!selectedGateway}
        onCancel={() => setSelectedGateway(null)}
        footer={<Button onClick={() => setSelectedGateway(null)}>Close</Button>}
        width={680}
      >
        {selectedGateway && (
          <Tabs items={[
            {
              key: "device",
              label: "Device",
              children: (
                <Descriptions column={1} bordered size="small">
                  <Descriptions.Item label="Device Name">{selectedGateway.deviceName}</Descriptions.Item>
                  <Descriptions.Item label="MAC Address">{selectedGateway.macAddress}</Descriptions.Item>
                  <Descriptions.Item label="Device Type">{selectedGateway.deviceType}</Descriptions.Item>
                  <Descriptions.Item label="Status"><Tag color={selectedGateway.status === "online" ? "green" : "default"}>{selectedGateway.status}</Tag></Descriptions.Item>
                  <Descriptions.Item label="Uptime">{selectedGateway.uptime ? dayjs(selectedGateway.uptime).format("YYYY-MM-DD HH:mm:ss") : "-"}</Descriptions.Item>
                  <Descriptions.Item label="Server IP">{selectedGateway.serverIp}</Descriptions.Item>
                  <Descriptions.Item label="Server URL">{selectedGateway.serverUrl}</Descriptions.Item>
                  <Descriptions.Item label="IPv4 Mode">{selectedGateway.ipv4Mode}</Descriptions.Item>
                  <Descriptions.Item label="IP Address">{selectedGateway.ipAddress}</Descriptions.Item>
                  <Descriptions.Item label="Subnet Mask">{selectedGateway.subnetMask}</Descriptions.Item>
                  <Descriptions.Item label="Gateway IP">{selectedGateway.gatewayIp}</Descriptions.Item>
                  <Descriptions.Item label="DNS Main">{selectedGateway.dnsMain}</Descriptions.Item>
                  <Descriptions.Item label="DNS Sub">{selectedGateway.dnsSub}</Descriptions.Item>
                  <Descriptions.Item label="LED">{selectedGateway.ledEnabled ? "ON" : "OFF"}</Descriptions.Item>
                  <Descriptions.Item label="BLE RSSI Threshold">{selectedGateway.bleRssiThreshold}</Descriptions.Item>
                  <Descriptions.Item label="Device Firmware">{selectedGateway.deviceFwVersion || "-"}</Descriptions.Item>
                  <Descriptions.Item label="BLE Firmware">{selectedGateway.bleFwVersion || "-"}</Descriptions.Item>
                </Descriptions>
              ),
            },
            {
              key: "setting",
              label: "Setting",
              children: <p style={{ color: "#888", padding: 20 }}>Setting 기능은 Phase 1에서 구현 예정</p>,
            },
          ]} />
        )}
      </Modal>
    </>
  );
}
