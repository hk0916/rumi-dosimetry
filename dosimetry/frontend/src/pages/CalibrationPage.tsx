import { Card, Typography } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";

export default function CalibrationPage() {
  return (
    <Card style={{ textAlign: "center", padding: 60 }}>
      <ExperimentOutlined style={{ fontSize: 48, color: "#bbb", marginBottom: 16 }} />
      <Typography.Title level={4} style={{ color: "#888" }}>Calibration</Typography.Title>
      <Typography.Text type="secondary">
        Phase 3에서 구현 예정입니다.<br />
        스무딩 필터 (6종), 누적선량 계산, CF Factor 산출 기능이 포함됩니다.
      </Typography.Text>
    </Card>
  );
}
