import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Input, Button, message } from "antd";
import { UserOutlined, LockOutlined, GlobalOutlined } from "@ant-design/icons";
import { useTranslation } from "react-i18next";
import api from "../services/api";

export default function LoginPage() {
  const { t, i18n } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!username || !password) {
      message.warning(t("login.required"));
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { username, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/dosimetry/device");
    } catch (err: any) {
      message.error(err.response?.data?.error || t("login.error"));
    } finally {
      setLoading(false);
    }
  };

  const toggleLang = () => {
    const newLang = i18n.language === "ko" ? "en" : "ko";
    i18n.changeLanguage(newLang);
    localStorage.setItem("lang", newLang);
    window.dispatchEvent(new Event("languagechange"));
  };

  return (
    <div className="login-container">
      <Card className="login-card" bordered={false}>
        <div style={{ position: "absolute", top: 16, right: 16 }}>
          <Button size="small" icon={<GlobalOutlined />} onClick={toggleLang}>
            {i18n.language === "ko" ? "EN" : "KO"}
          </Button>
        </div>
        <div className="login-logo">DOSIMETRY</div>
        <p style={{ color: "#888", marginBottom: 28 }}>{t("login.title")}</p>
        <Input
          size="large"
          prefix={<UserOutlined />}
          placeholder={t("login.username")}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onPressEnter={handleLogin}
          style={{ marginBottom: 12 }}
        />
        <Input.Password
          size="large"
          prefix={<LockOutlined />}
          placeholder={t("login.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onPressEnter={handleLogin}
          style={{ marginBottom: 20 }}
        />
        <Button type="primary" size="large" block loading={loading} onClick={handleLogin}>
          {t("login.submit")}
        </Button>
      </Card>
    </div>
  );
}
