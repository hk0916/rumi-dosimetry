import { Card, Typography } from "antd";
import { BarChartOutlined } from "@ant-design/icons";

export default function DataAnalysisPage() {
  return (
    <Card style={{ textAlign: "center", padding: 60 }}>
      <BarChartOutlined style={{ fontSize: 48, color: "#bbb", marginBottom: 16 }} />
      <Typography.Title level={4} style={{ color: "#888" }}>Data Analysis</Typography.Title>
      <Typography.Text type="secondary">
        Phase 4에서 구현 예정입니다.<br />
        방사선 종류/장기 선택, 4종 선량 계산, CSV Export 기능이 포함됩니다.
      </Typography.Text>
    </Card>
  );
}
