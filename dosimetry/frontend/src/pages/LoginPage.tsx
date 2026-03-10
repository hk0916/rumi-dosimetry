import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, Input, Button, message } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import api from "../services/api";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    if (!username || !password) {
      message.warning("아이디와 비밀번호를 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { username, password });
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/dosimetry/device");
    } catch (err: any) {
      message.error(err.response?.data?.error || "로그인에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <Card className="login-card" bordered={false}>
        <div className="login-logo">DOSIMETRY</div>
        <p style={{ color: "#888", marginBottom: 28 }}>방사선 선량 측정 시스템</p>
        <Input
          size="large"
          prefix={<UserOutlined />}
          placeholder="아이디 입력"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onPressEnter={handleLogin}
          style={{ marginBottom: 12 }}
        />
        <Input.Password
          size="large"
          prefix={<LockOutlined />}
          placeholder="비밀번호 입력"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onPressEnter={handleLogin}
          style={{ marginBottom: 20 }}
        />
        <Button type="primary" size="large" block loading={loading} onClick={handleLogin}>
          로그인
        </Button>
      </Card>
    </div>
  );
}
