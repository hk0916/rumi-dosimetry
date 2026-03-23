import { useState, useEffect, useCallback } from "react";
import {
  Card, Table, Button, Modal, Form, Input, Select, Tag, Space,
  message, Popconfirm, Tabs, Progress, Descriptions, Tooltip,
} from "antd";
import {
  PlusOutlined, CloudUploadOutlined, ReloadOutlined,
  DeleteOutlined, RocketOutlined, RetweetOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:4000/api" });
api.interceptors.request.use((c) => {
  const t = localStorage.getItem("token");
  if (t) c.headers.Authorization = `Bearer ${t}`;
  return c;
});

interface Firmware {
  id: number;
  name: string;
  version: string;
  targetType: string;
  fileName?: string;
  fileSize?: number;
  checksum?: string;
  description?: string;
  createdAt: string;
  _count?: { tasks: number };
}

interface OtaTask {
  id: number;
  firmwareId: number;
  targetType: string;
  targetId: number;
  targetName?: string;
  status: string;
  params?: string;
  progress: number;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
  firmware?: { name: string; version: string; targetType: string };
}

interface Target {
  id: number;
  deviceName: string;
  macAddress: string;
  status: string;
  deviceFwVersion?: string;
  bleFwVersion?: string;
}

const statusColor: Record<string, string> = {
  pending: "default",
  in_progress: "processing",
  success: "success",
  failed: "error",
  cancelled: "warning",
};

export default function OtaPage() {
  const { t } = useTranslation();
  const [firmwares, setFirmwares] = useState<Firmware[]>([]);
  const [tasks, setTasks] = useState<OtaTask[]>([]);
  const [gateways, setGateways] = useState<Target[]>([]);
  const [devices, setDevices] = useState<Target[]>([]);
  const [fwLoading, setFwLoading] = useState(false);
  const [taskLoading, setTaskLoading] = useState(false);
  const [fwModalOpen, setFwModalOpen] = useState(false);
  const [deployModalOpen, setDeployModalOpen] = useState(false);
  const [selectedFw, setSelectedFw] = useState<Firmware | null>(null);
  const [selectedTargets, setSelectedTargets] = useState<number[]>([]);
  const [deployParams, setDeployParams] = useState("");
  const [fwForm] = Form.useForm();

  const loadFirmwares = useCallback(async () => {
    setFwLoading(true);
    try {
      const res = await api.get("/ota/firmwares", { params: { size: 100 } });
      setFirmwares(res.data.data);
    } catch { /* ignore */ }
    setFwLoading(false);
  }, []);

  const loadTasks = useCallback(async () => {
    setTaskLoading(true);
    try {
      const res = await api.get("/ota/tasks", { params: { size: 100 } });
      setTasks(res.data.data);
    } catch { /* ignore */ }
    setTaskLoading(false);
  }, []);

  const loadTargets = useCallback(async () => {
    try {
      const [gw, dv] = await Promise.all([
        api.get("/gateways", { params: { size: 100 } }),
        api.get("/devices", { params: { size: 100 } }),
      ]);
      setGateways(gw.data.data);
      setDevices(dv.data.data);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadFirmwares();
    loadTasks();
    loadTargets();
  }, [loadFirmwares, loadTasks, loadTargets]);

  // 펌웨어 등록
  const handleAddFirmware = async () => {
    try {
      const values = await fwForm.validateFields();
      await api.post("/ota/firmwares", values);
      message.success(t("ota.firmware_added"));
      setFwModalOpen(false);
      fwForm.resetFields();
      loadFirmwares();
    } catch (err: any) {
      if (err.response) message.error(err.response.data.error);
    }
  };

  // 펌웨어 삭제
  const handleDeleteFirmware = async (id: number) => {
    try {
      await api.delete(`/ota/firmwares/${id}`);
      message.success(t("device.deleted"));
      loadFirmwares();
      loadTasks();
    } catch (err: any) {
      if (err.response) message.error(err.response.data.error);
    }
  };

  // OTA 배포
  const openDeploy = (fw: Firmware) => {
    setSelectedFw(fw);
    setSelectedTargets([]);
    setDeployParams("");
    setDeployModalOpen(true);
  };

  const handleDeploy = async () => {
    if (!selectedFw || selectedTargets.length === 0) {
      message.warning(t("ota.select_targets"));
      return;
    }
    const targetList = selectedFw.targetType === "gateway" ? gateways : devices;
    const targets = selectedTargets.map((id) => ({
      id,
      name: targetList.find((t) => t.id === id)?.deviceName,
    }));

    let params: any = undefined;
    if (deployParams.trim()) {
      try {
        params = JSON.parse(deployParams);
      } catch {
        message.error(t("ota.invalid_params"));
        return;
      }
    }

    try {
      const res = await api.post("/ota/tasks", {
        firmwareId: selectedFw.id,
        targets,
        params,
      });
      message.success(res.data.message);
      setDeployModalOpen(false);
      loadTasks();
    } catch (err: any) {
      if (err.response) message.error(err.response.data.error);
    }
  };

  // 작업 상태 변경
  const updateTaskStatus = async (id: number, status: string) => {
    try {
      await api.put(`/ota/tasks/${id}/status`, {
        status,
        progress: status === "success" ? 100 : status === "in_progress" ? 50 : 0,
      });
      message.success(t("common.success"));
      loadTasks();
      loadTargets();
    } catch (err: any) {
      if (err.response) message.error(err.response.data.error);
    }
  };

  const retryTask = async (id: number) => {
    try {
      await api.post(`/ota/tasks/${id}/retry`);
      message.success(t("ota.task_retried"));
      loadTasks();
    } catch (err: any) {
      if (err.response) message.error(err.response.data.error);
    }
  };

  // 펌웨어 테이블 컬럼
  const fwColumns = [
    { title: t("ota.fw_name"), dataIndex: "name", key: "name" },
    { title: t("ota.version"), dataIndex: "version", key: "version", render: (v: string) => <Tag color="blue">v{v}</Tag> },
    {
      title: t("ota.target_type"), dataIndex: "targetType", key: "targetType",
      render: (v: string) => <Tag color={v === "gateway" ? "green" : "purple"}>{v === "gateway" ? "Gateway" : "Device"}</Tag>,
    },
    { title: t("ota.file_name"), dataIndex: "fileName", key: "fileName", render: (v: string) => v || "-" },
    { title: t("ota.description"), dataIndex: "description", key: "description", ellipsis: true, render: (v: string) => v || "-" },
    { title: t("ota.task_count"), key: "taskCount", render: (_: any, r: Firmware) => r._count?.tasks ?? 0 },
    {
      title: t("ota.created_at"), dataIndex: "createdAt", key: "createdAt",
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: "", key: "actions", width: 160,
      render: (_: any, r: Firmware) => (
        <Space>
          <Tooltip title={t("ota.deploy")}>
            <Button type="primary" size="small" icon={<RocketOutlined />} onClick={() => openDeploy(r)} />
          </Tooltip>
          <Popconfirm title={t("common.confirm_delete")} onConfirm={() => handleDeleteFirmware(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // OTA 작업 테이블 컬럼
  const taskColumns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60 },
    {
      title: t("ota.firmware"), key: "firmware",
      render: (_: any, r: OtaTask) => r.firmware ? `${r.firmware.name} v${r.firmware.version}` : "-",
    },
    {
      title: t("ota.target"), key: "target",
      render: (_: any, r: OtaTask) => (
        <Space>
          <Tag color={r.targetType === "gateway" ? "green" : "purple"}>{r.targetType}</Tag>
          <span>{r.targetName || `#${r.targetId}`}</span>
        </Space>
      ),
    },
    {
      title: t("ota.status"), dataIndex: "status", key: "status",
      render: (v: string) => <Tag color={statusColor[v]}>{v.toUpperCase()}</Tag>,
    },
    {
      title: t("ota.progress"), dataIndex: "progress", key: "progress", width: 150,
      render: (v: number, r: OtaTask) => (
        <Progress
          percent={v}
          size="small"
          status={r.status === "failed" ? "exception" : r.status === "success" ? "success" : "active"}
        />
      ),
    },
    {
      title: t("ota.params"), dataIndex: "params", key: "params", ellipsis: true,
      render: (v: string) => v || "-",
    },
    {
      title: t("ota.created_at"), dataIndex: "createdAt", key: "createdAt",
      render: (v: string) => new Date(v).toLocaleString(),
    },
    {
      title: "", key: "actions", width: 200,
      render: (_: any, r: OtaTask) => (
        <Space>
          {r.status === "pending" && (
            <>
              <Button size="small" type="primary" onClick={() => updateTaskStatus(r.id, "in_progress")}>
                {t("ota.start")}
              </Button>
              <Button size="small" onClick={() => updateTaskStatus(r.id, "cancelled")}>
                {t("ota.cancel_task")}
              </Button>
            </>
          )}
          {r.status === "in_progress" && (
            <>
              <Button size="small" type="primary" onClick={() => updateTaskStatus(r.id, "success")}>
                {t("ota.mark_success")}
              </Button>
              <Button size="small" danger onClick={() => updateTaskStatus(r.id, "failed")}>
                {t("ota.mark_failed")}
              </Button>
            </>
          )}
          {(r.status === "failed" || r.status === "cancelled") && (
            <Button size="small" icon={<RetweetOutlined />} onClick={() => retryTask(r.id)}>
              {t("ota.retry")}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  const targetOptions = selectedFw
    ? (selectedFw.targetType === "gateway" ? gateways : devices).map((t) => ({
        label: `${t.deviceName} (${t.macAddress})${t.deviceFwVersion ? ` - FW: ${t.deviceFwVersion}` : ""}`,
        value: t.id,
      }))
    : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Tabs
        defaultActiveKey="firmwares"
        items={[
          {
            key: "firmwares",
            label: t("ota.firmware_mgmt"),
            children: (
              <Card
                size="small"
                title={t("ota.firmware_list")}
                extra={
                  <Space>
                    <Button icon={<ReloadOutlined />} onClick={loadFirmwares} />
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => { fwForm.resetFields(); setFwModalOpen(true); }}>
                      {t("ota.add_firmware")}
                    </Button>
                  </Space>
                }
              >
                <Table
                  dataSource={firmwares}
                  columns={fwColumns}
                  rowKey="id"
                  loading={fwLoading}
                  size="small"
                  pagination={{ pageSize: 10 }}
                />
              </Card>
            ),
          },
          {
            key: "tasks",
            label: t("ota.task_mgmt"),
            children: (
              <Card
                size="small"
                title={t("ota.task_list")}
                extra={<Button icon={<ReloadOutlined />} onClick={loadTasks} />}
              >
                <Table
                  dataSource={tasks}
                  columns={taskColumns}
                  rowKey="id"
                  loading={taskLoading}
                  size="small"
                  pagination={{ pageSize: 10 }}
                  expandable={{
                    expandedRowRender: (r) => (
                      <Descriptions size="small" column={2}>
                        <Descriptions.Item label={t("ota.target_type")}>{r.targetType}</Descriptions.Item>
                        <Descriptions.Item label={t("ota.target_id")}>{r.targetId}</Descriptions.Item>
                        <Descriptions.Item label={t("ota.params")} span={2}>
                          <pre style={{ margin: 0, fontSize: 12 }}>{r.params || "-"}</pre>
                        </Descriptions.Item>
                        {r.errorMessage && (
                          <Descriptions.Item label={t("ota.error")} span={2}>
                            <span style={{ color: "red" }}>{r.errorMessage}</span>
                          </Descriptions.Item>
                        )}
                      </Descriptions>
                    ),
                  }}
                />
              </Card>
            ),
          },
        ]}
      />

      {/* 펌웨어 등록 모달 */}
      <Modal
        title={t("ota.add_firmware")}
        open={fwModalOpen}
        onOk={handleAddFirmware}
        onCancel={() => setFwModalOpen(false)}
        okText={t("common.save")}
        cancelText={t("common.cancel")}
      >
        <Form form={fwForm} layout="vertical">
          <Form.Item name="name" label={t("ota.fw_name")} rules={[{ required: true }]}>
            <Input placeholder="e.g. Gateway Main FW" />
          </Form.Item>
          <Form.Item name="version" label={t("ota.version")} rules={[{ required: true }]}>
            <Input placeholder="e.g. 1.2.0" />
          </Form.Item>
          <Form.Item name="targetType" label={t("ota.target_type")} rules={[{ required: true }]}>
            <Select
              options={[
                { label: "Gateway", value: "gateway" },
                { label: "Device", value: "device" },
              ]}
            />
          </Form.Item>
          <Form.Item name="fileName" label={t("ota.file_name")}>
            <Input placeholder="firmware_v1.2.0.bin" />
          </Form.Item>
          <Form.Item name="fileSize" label={t("ota.file_size")}>
            <Input type="number" placeholder="bytes" />
          </Form.Item>
          <Form.Item name="checksum" label={t("ota.checksum")}>
            <Input placeholder="SHA-256" />
          </Form.Item>
          <Form.Item name="description" label={t("ota.description")}>
            <Input.TextArea rows={3} placeholder={t("ota.desc_placeholder")} />
          </Form.Item>
        </Form>
      </Modal>

      {/* OTA 배포 모달 */}
      <Modal
        title={`${t("ota.deploy")} - ${selectedFw?.name} v${selectedFw?.version}`}
        open={deployModalOpen}
        onOk={handleDeploy}
        onCancel={() => setDeployModalOpen(false)}
        okText={t("ota.deploy")}
        cancelText={t("common.cancel")}
        width={600}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontWeight: 600, marginBottom: 8, display: "block" }}>
              {t("ota.select_targets")} ({selectedFw?.targetType === "gateway" ? "Gateway" : "Device"})
            </label>
            <Select
              mode="multiple"
              style={{ width: "100%" }}
              value={selectedTargets}
              onChange={setSelectedTargets}
              options={targetOptions}
              placeholder={t("ota.select_targets_placeholder")}
            />
          </div>
          <div>
            <label style={{ fontWeight: 600, marginBottom: 8, display: "block" }}>
              {t("ota.params")} (JSON, {t("ota.optional")})
            </label>
            <Input.TextArea
              rows={4}
              value={deployParams}
              onChange={(e) => setDeployParams(e.target.value)}
              placeholder={`{\n  "bleRssiThreshold": -80,\n  "ledEnabled": false\n}`}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
