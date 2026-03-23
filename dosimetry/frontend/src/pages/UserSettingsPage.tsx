import { useState } from "react";
import { Card, Form, Input, Button, message, Descriptions } from "antd";
import { useTranslation } from "react-i18next";
import api from "../services/api";

export default function UserSettingsPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const user = JSON.parse(localStorage.getItem("user") || "{}");

  const handleChangePassword = async (values: any) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error(t("settings.password_mismatch"));
      return;
    }
    setLoading(true);
    try {
      await api.put(`/users/${user.id}/password`, {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      message.success(t("settings.password_changed"));
      form.resetFields();
    } catch {
      message.error(t("common.error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Card title={t("settings.user_info")} style={{ marginBottom: 16 }}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="Username">{user.username}</Descriptions.Item>
          <Descriptions.Item label="Name">{user.name || "-"}</Descriptions.Item>
          <Descriptions.Item label="Role">{user.role}</Descriptions.Item>
          <Descriptions.Item label="Account Type">{user.accountType || "-"}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={t("settings.change_password")}>
        <Form form={form} layout="vertical" onFinish={handleChangePassword} style={{ maxWidth: 400 }}>
          <Form.Item label={t("settings.current_password")} name="currentPassword" rules={[{ required: true, message: t("settings.enter_current") }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item label={t("settings.new_password")} name="newPassword" rules={[{ required: true, message: t("settings.enter_new") }, { min: 6, message: t("settings.password_min") }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item label={t("settings.confirm_password")} name="confirmPassword" rules={[{ required: true, message: t("settings.enter_confirm") }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading}>{t("settings.change_password")}</Button>
        </Form>
      </Card>
    </>
  );
}
