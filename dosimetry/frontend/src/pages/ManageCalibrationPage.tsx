import { useEffect, useState } from "react";
import {
  Card, Table, Button, Tag, Modal, Descriptions, message,
  Popconfirm, Select, Space, Input,
} from "antd";
import { ReloadOutlined, DeleteOutlined, EditOutlined } from "@ant-design/icons";
import api from "../services/api";
import dayjs from "dayjs";

export default function ManageCalibrationPage() {
  const [calibrations, setCalibrations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [filterDeviceId, setFilterDeviceId] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<any>(null);
  const [editName, setEditName] = useState("");
  const [editLoading, setEditLoading] = useState(false);

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
      width: 90,
      render: (v: number) => v != null ? `${Number(v).toFixed(6)} V` : "-",
    },
    {
      title: "Cumulative Dose",
      dataIndex: "cumulativeDose",
      render: (v: string) => v != null ? `${Number(v).toLocaleString()} V·s` : "-",
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
          {v != null ? `${Number(v).toFixed(6)} V·s/cGy` : "-"}
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
      width: 60,
      render: (_: any, r: any) => (
        <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(r.id)}>
          <Button danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
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

      {/* Detail Modal */}
      <Modal
        title="Calibration Detail"
        open={!!selected}
        onCancel={() => setSelected(null)}
        footer={<Button onClick={() => setSelected(null)}>Close</Button>}
        width={600}
      >
        {selected && (
          <>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="ID">{selected.id}</Descriptions.Item>
              <Descriptions.Item label="Device">{selected.device?.deviceName}</Descriptions.Item>
              <Descriptions.Item label="User">{selected.user?.name || selected.user?.username}</Descriptions.Item>
              <Descriptions.Item label="Date">{selected.date ? dayjs(selected.date).format("YYYY-MM-DD") : "-"}</Descriptions.Item>
              <Descriptions.Item label="Filter Type"><Tag>{selected.filterType || "-"}</Tag></Descriptions.Item>
              <Descriptions.Item label="Window Size">{selected.windowSize ?? "-"}</Descriptions.Item>
              <Descriptions.Item label="Baseline">{selected.baseline != null ? `${Number(selected.baseline).toFixed(6)} V` : "-"}</Descriptions.Item>
              <Descriptions.Item label="Time Range">
                {selected.startTime && selected.endTime
                  ? `${dayjs(selected.startTime).format("HH:mm:ss")} ~ ${dayjs(selected.endTime).format("HH:mm:ss")}`
                  : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="Cumulative Dose" span={2}>
                <span style={{ fontSize: 14, color: "#4472C4", fontWeight: 600 }}>
                  {selected.cumulativeDose != null ? `${Number(selected.cumulativeDose).toLocaleString()} V·s` : "-"}
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="Delivered Dose">
                {selected.deliveredDose != null ? `${Number(selected.deliveredDose)} cGy` : "-"}
              </Descriptions.Item>
              <Descriptions.Item label="CF Factor">
                <span style={{ fontSize: 16, color: "#70AD47", fontWeight: 700 }}>
                  {selected.cfFactor != null ? `${Number(selected.cfFactor).toFixed(6)} V·s/cGy` : "-"}
                </span>
              </Descriptions.Item>
            </Descriptions>

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
