import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Menu, Button, Dropdown } from "antd";
import {
  HddOutlined,
  LineChartOutlined,
  ExperimentOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  UserOutlined,
  LogoutOutlined,
} from "@ant-design/icons";

const menuItems = [
  { key: "device", icon: <HddOutlined />, label: "Device" },
  { key: "data-monitoring", icon: <LineChartOutlined />, label: "Data Monitoring" },
  { key: "calibration", icon: <ExperimentOutlined />, label: "Calibration" },
  { key: "manage-calibration", icon: <DatabaseOutlined />, label: "Manage Calibration" },
  { key: "data-analysis", icon: <BarChartOutlined />, label: "Data Analysis" },
];

export default function MainLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentKey = location.pathname.split("/").pop() || "device";
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const userMenu = {
    items: [
      { key: "profile", label: `${user.name || "관리자"} (${user.role || "admin"})`, disabled: true },
      { type: "divider" as const },
      { key: "logout", icon: <LogoutOutlined />, label: "로그아웃", onClick: handleLogout },
    ],
  };

  return (
    <>
      <div className="sidebar">
        <div className="sidebar-logo">✦ Dosimetry</div>
        <div className="sidebar-menu">
          <Menu
            mode="inline"
            selectedKeys={[currentKey]}
            items={menuItems}
            onClick={({ key }) => navigate(`/dosimetry/${key}`)}
          />
        </div>
      </div>
      <div className="main-layout">
        <div className="main-header">
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
            {menuItems.find((m) => m.key === currentKey)?.label || "Dosimetry"}
          </h3>
          <Dropdown menu={userMenu} placement="bottomRight">
            <Button type="primary" icon={<UserOutlined />}>
              {user.name || "관리자"}
            </Button>
          </Dropdown>
        </div>
        <div className="main-content">
          <Outlet />
        </div>
      </div>
    </>
  );
}
