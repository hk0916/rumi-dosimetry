import { Card, Typography } from "antd";
import { DatabaseOutlined } from "@ant-design/icons";

export default function ManageCalibrationPage() {
  return (
    <Card style={{ textAlign: "center", padding: 60 }}>
      <DatabaseOutlined style={{ fontSize: 48, color: "#bbb", marginBottom: 16 }} />
      <Typography.Title level={4} style={{ color: "#888" }}>Manage Calibration</Typography.Title>
      <Typography.Text type="secondary">
        Phase 4에서 구현 예정입니다.<br />
        저장된 CF Factor 목록 조회 및 관리 기능이 포함됩니다.
      </Typography.Text>
    </Card>
  );
}
