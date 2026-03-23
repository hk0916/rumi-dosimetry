import { useEffect, useState } from "react";
import {
  Tabs, Table, Button, Tag, Modal, Descriptions, message, Popconfirm,
  Form, Input, Select, Switch, InputNumber, Upload, Divider,
} from "antd";
import { PlusOutlined, ReloadOutlined, UploadOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import api from "../services/api";
import dayjs from "dayjs";

export default function DevicePage() {
  const { t } = useTranslation();
  const [dosimeters, setDosimeters] = useState<any[]>([]);
  const [gateways, setGateways] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [gwLoading, setGwLoading] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<any>(null);
  const [selectedGateway, setSelectedGateway] = useState<any>(null);
  const [addDeviceOpen, setAddDeviceOpen] = useState(false);
  const [addGatewayOpen, setAddGatewayOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [deviceForm] = Form.useForm();
  const [gatewayForm] = Form.useForm();
  const [settingForm] = Form.useForm();

  const fetchDosimeters = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/devices");
      setDosimeters(data.data);
    } catch {
      message.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  const fetchGateways = async () => {
    setGwLoading(true);
    try {
      const { data } = await api.get("/gateways");
      setGateways(data.data);
    } catch {
      message.error(t("common.error"));
    } finally {
      setGwLoading(false);
    }
  };

  useEffect(() => {
    fetchDosimeters();
    fetchGateways();
  }, []);

  // When gateway is selected, populate setting form
  useEffect(() => {
    if (selectedGateway) {
      settingForm.setFieldsValue({
        serverIp: selectedGateway.serverIp,
        serverUrl: selectedGateway.serverUrl,
        ipv4Mode: selectedGateway.ipv4Mode,
        ipAddress: selectedGateway.ipAddress,
        subnetMask: selectedGateway.subnetMask,
        gatewayIp: selectedGateway.gatewayIp,
        dnsMain: selectedGateway.dnsMain,
        dnsSub: selectedGateway.dnsSub,
        ledEnabled: selectedGateway.ledEnabled,
        bleRssiThreshold: selectedGateway.bleRssiThreshold,
      });
    }
  }, [selectedGateway, settingForm]);

  const handleDeleteDevice = async (id: number) => {
    try {
      await api.delete(`/devices/${id}`);
      message.success(t("device.deleted"));
      fetchDosimeters();
    } catch (err: any) {
      message.error(err.response?.data?.error || t("common.error"));
    }
  };

  const handleDeleteGateway = async (id: number) => {
    try {
      await api.delete(`/gateways/${id}`);
      message.success(t("device.deleted"));
      fetchGateways();
    } catch (err: any) {
      message.error(err.response?.data?.error || t("common.error"));
    }
  };

  const handleAddDevice = async (values: any) => {
    setSaving(true);
    try {
      await api.post("/devices", values);
      message.success(t("device.added"));
      setAddDeviceOpen(false);
      deviceForm.resetFields();
      fetchDosimeters();
    } catch {
      message.error(t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const handleAddGateway = async (values: any) => {
    setSaving(true);
    try {
      await api.post("/gateways", values);
      message.success(t("device.added"));
      setAddGatewayOpen(false);
      gatewayForm.resetFields();
      fetchGateways();
    } catch {
      message.error(t("common.error"));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSettings = async (values: any) => {
    if (!selectedGateway) return;
    setSaving(true);
    try {
      const { data } = await api.put(`/gateways/${selectedGateway.id}/settings`, values);
      message.success(t("device.settings_saved"));
      setSelectedGateway(data);
      fetchGateways();
    } catch {
      message.error(t("common.error"));
    } finally {
      setSaving(false);
    }
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
    { title: "Device Name", dataIndex: "deviceName", render: (t: string, r: any) => <a onClick={() => setSelectedGateway(r)}>{t}</a> },
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
            label: t("device.dosimeter"),
            children: (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ color: "#888" }}>{dosimeters.length}건</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button icon={<ReloadOutlined />} onClick={fetchDosimeters} />
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddDeviceOpen(true)}>{t("device.add_device")}</Button>
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
            label: t("device.gateway"),
            children: (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ color: "#888" }}>{gateways.length}건</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Button icon={<ReloadOutlined />} onClick={fetchGateways} />
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddGatewayOpen(true)}>{t("device.add_gateway")}</Button>
                  </div>
                </div>
                <Table
                  dataSource={gateways}
                  columns={gatewayColumns}
                  rowKey="id"
                  size="middle"
                  loading={gwLoading}
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
          <Popconfirm key="del" title={t("common.confirm_delete")} onConfirm={() => { handleDeleteDevice(selectedDevice.id); setSelectedDevice(null); }}>
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
        footer={null}
        width={680}
        destroyOnClose
      >
        {selectedGateway && (
          <Tabs items={[
            {
              key: "device",
              label: "Device",
              children: (
                <>
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
                  <div style={{ marginTop: 16, textAlign: "right" }}>
                    <Popconfirm title={t("common.confirm_delete")} onConfirm={() => { handleDeleteGateway(selectedGateway.id); setSelectedGateway(null); }}>
                      <Button danger>Delete</Button>
                    </Popconfirm>
                  </div>
                </>
              ),
            },
            {
              key: "setting",
              label: "Setting",
              children: (
                <Form
                  form={settingForm}
                  layout="vertical"
                  onFinish={handleSaveSettings}
                  size="small"
                >
                  <Divider orientation="left" plain style={{ fontSize: 13 }}>Network</Divider>
                  <Form.Item label="Server IP" name="serverIp">
                    <Input placeholder="192.168.0.100" />
                  </Form.Item>
                  <Form.Item label="Server URL" name="serverUrl">
                    <Input placeholder="http://192.168.0.100:4000/api/data/ingest" />
                  </Form.Item>
                  <Form.Item label="IPv4 Mode" name="ipv4Mode">
                    <Select options={[{ label: "Manual", value: "manual" }, { label: "Auto (DHCP)", value: "auto" }]} />
                  </Form.Item>
                  <Form.Item label="IP Address" name="ipAddress">
                    <Input placeholder="192.168.0.50" />
                  </Form.Item>
                  <Form.Item label="Subnet Mask" name="subnetMask">
                    <Input placeholder="255.255.255.0" />
                  </Form.Item>
                  <Form.Item label="Gateway IP" name="gatewayIp">
                    <Input placeholder="192.168.0.1" />
                  </Form.Item>
                  <Form.Item label="DNS Main" name="dnsMain">
                    <Input placeholder="8.8.8.8" />
                  </Form.Item>
                  <Form.Item label="DNS Sub" name="dnsSub">
                    <Input placeholder="8.8.4.4" />
                  </Form.Item>

                  <Divider orientation="left" plain style={{ fontSize: 13 }}>BLE Setting</Divider>
                  <Form.Item label="BLE RSSI Threshold" name="bleRssiThreshold">
                    <InputNumber min={-120} max={0} addonAfter="dBm" style={{ width: "100%" }} />
                  </Form.Item>

                  <Divider orientation="left" plain style={{ fontSize: 13 }}>LED</Divider>
                  <Form.Item label="LED Enabled" name="ledEnabled" valuePropName="checked">
                    <Switch />
                  </Form.Item>

                  <Divider orientation="left" plain style={{ fontSize: 13 }}>Firmware</Divider>
                  <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ marginBottom: 4, color: "#666", fontSize: 12 }}>
                        Device FW: <strong>{selectedGateway.deviceFwVersion || "N/A"}</strong>
                      </div>
                      <Upload
                        accept=".bin,.hex,.fw"
                        maxCount={1}
                        beforeUpload={() => {
                          message.info(t("device.fw_upload_pending"));
                          return false;
                        }}
                      >
                        <Button icon={<UploadOutlined />} block>Device FW Upload</Button>
                      </Upload>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ marginBottom: 4, color: "#666", fontSize: 12 }}>
                        BLE FW: <strong>{selectedGateway.bleFwVersion || "N/A"}</strong>
                      </div>
                      <Upload
                        accept=".bin,.hex,.fw"
                        maxCount={1}
                        beforeUpload={() => {
                          message.info(t("device.fw_upload_pending"));
                          return false;
                        }}
                      >
                        <Button icon={<UploadOutlined />} block>BLE FW Upload</Button>
                      </Upload>
                    </div>
                  </div>

                  <div style={{ textAlign: "right", marginTop: 8 }}>
                    <Button type="primary" htmlType="submit" loading={saving}>{t("device.save_settings")}</Button>
                  </div>
                </Form>
              ),
            },
          ]} />
        )}
      </Modal>

      {/* Add Device Modal */}
      <Modal
        title="Add Device"
        open={addDeviceOpen}
        onCancel={() => { setAddDeviceOpen(false); deviceForm.resetFields(); }}
        footer={null}
        width={480}
        destroyOnClose
      >
        <Form form={deviceForm} layout="vertical" onFinish={handleAddDevice}>
          <Form.Item label="Device Name" name="deviceName" rules={[{ required: true, message: t("device.enter_name") }]}>
            <Input placeholder="e.g. Dosimeter-01" />
          </Form.Item>
          <Form.Item label="Device Type" name="deviceType" initialValue="Skin Dosimeter">
            <Select options={[
              { label: "Skin Dosimeter", value: "Skin Dosimeter" },
              { label: "Area Dosimeter", value: "Area Dosimeter" },
            ]} />
          </Form.Item>
          <Form.Item label="MAC Address" name="macAddress" rules={[{ required: true, message: t("device.enter_mac") }]}>
            <Input placeholder="e.g. 06:06:04:04:03:03" />
          </Form.Item>
          <div style={{ textAlign: "right" }}>
            <Button onClick={() => { setAddDeviceOpen(false); deviceForm.resetFields(); }} style={{ marginRight: 8 }}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saving}>Add</Button>
          </div>
        </Form>
      </Modal>

      {/* Add Gateway Modal */}
      <Modal
        title="Add Gateway"
        open={addGatewayOpen}
        onCancel={() => { setAddGatewayOpen(false); gatewayForm.resetFields(); }}
        footer={null}
        width={520}
        destroyOnClose
      >
        <Form form={gatewayForm} layout="vertical" onFinish={handleAddGateway}>
          <Form.Item label="Device Name" name="deviceName" rules={[{ required: true, message: t("device.enter_name") }]}>
            <Input placeholder="e.g. Gateway-01" />
          </Form.Item>
          <Form.Item label="Device Type" name="deviceType" initialValue="Twin Tracker BLE">
            <Select options={[
              { label: "Twin Tracker BLE", value: "Twin Tracker BLE" },
              { label: "Twin Tracker WiFi", value: "Twin Tracker WiFi" },
            ]} />
          </Form.Item>
          <Form.Item label="MAC Address" name="macAddress" rules={[{ required: true, message: t("device.enter_mac") }]}>
            <Input placeholder="e.g. D1:FA:88:37:A0:86" />
          </Form.Item>
          <Form.Item label="Server IP" name="serverIp">
            <Input placeholder="192.168.0.100" />
          </Form.Item>
          <Form.Item label="Server URL" name="serverUrl">
            <Input placeholder="http://192.168.0.100:4000/api/data/ingest" />
          </Form.Item>
          <Form.Item label="BLE RSSI Threshold" name="bleRssiThreshold" initialValue={-100}>
            <InputNumber min={-120} max={0} addonAfter="dBm" style={{ width: "100%" }} />
          </Form.Item>
          <div style={{ textAlign: "right" }}>
            <Button onClick={() => { setAddGatewayOpen(false); gatewayForm.resetFields(); }} style={{ marginRight: 8 }}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={saving}>Add</Button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
