import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { Menu, Button, Dropdown, Space } from "antd";
import {
  HddOutlined,
  LineChartOutlined,
  ExperimentOutlined,
  DatabaseOutlined,
  BarChartOutlined,
  UserOutlined,
  LogoutOutlined,
  GlobalOutlined,
  CloudUploadOutlined,
} from "@ant-design/icons";
import { useTranslation } from "react-i18next";

export default function MainLayout() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const currentKey = location.pathname.split("/").pop() || "device";
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const menuItems = [
    { key: "device", icon: <HddOutlined />, label: t("nav.device") },
    { key: "data-monitoring", icon: <LineChartOutlined />, label: t("nav.monitoring") },
    { key: "calibration", icon: <ExperimentOutlined />, label: t("nav.calibration") },
    { key: "manage-calibration", icon: <DatabaseOutlined />, label: t("nav.manage_calibration") },
    { key: "data-analysis", icon: <BarChartOutlined />, label: t("nav.data_analysis") },
    { key: "ota", icon: <CloudUploadOutlined />, label: t("nav.ota") },
    { key: "settings", icon: <UserOutlined />, label: t("nav.settings") },
  ];

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const toggleLang = () => {
    const newLang = i18n.language === "ko" ? "en" : "ko";
    i18n.changeLanguage(newLang);
    localStorage.setItem("lang", newLang);
    window.dispatchEvent(new Event("languagechange"));
  };

  const userMenu = {
    items: [
      { key: "profile", label: `${user.name || "Admin"} (${user.role || "admin"})`, disabled: true },
      { type: "divider" as const },
      { key: "logout", icon: <LogoutOutlined />, label: t("nav.logout"), onClick: handleLogout },
    ],
  };

  return (
    <>
      <div className="sidebar">
        <div className="sidebar-logo">Dosimetry</div>
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
          <Space>
            <Button
              size="small"
              icon={<GlobalOutlined />}
              onClick={toggleLang}
            >
              {i18n.language === "ko" ? "EN" : "KO"}
            </Button>
            <Dropdown menu={userMenu} placement="bottomRight">
              <Button type="primary" icon={<UserOutlined />}>
                {user.name || "Admin"}
              </Button>
            </Dropdown>
          </Space>
        </div>
        <div className="main-content">
          <Outlet />
        </div>
      </div>
    </>
  );
}
