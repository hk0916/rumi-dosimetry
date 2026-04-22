import { useEffect, useState } from "react";
import {
  Card, Tabs, Table, Button, Modal, Form, Input, Select, Space,
  Popconfirm, Tag, message, Typography,
} from "antd";
import {
  UserAddOutlined, DeleteOutlined, EditOutlined, ReloadOutlined,
  LockOutlined, TeamOutlined, AppstoreOutlined, PlusOutlined,
} from "@ant-design/icons";
import api from "../services/api";
import dayjs from "dayjs";

const { Text } = Typography;

interface UserRow {
  id: number;
  username: string;
  name?: string | null;
  role: string;
  accountType?: string | null;
  groupName?: string | null;
  workspaceId?: number | null;
  workspace?: { id: number; name: string } | null;
  createdAt: string;
}

interface GroupRow {
  name: string;
  memberCount: number;
}

interface WorkspaceRow {
  id: number;
  name: string;
  createdAt: string;
  _count: { users: number; devices: number; gateways: number };
}

export default function ManageUsersPage() {
  const [activeTab, setActiveTab] = useState<string>("users");

  // Users
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [userForm] = Form.useForm();
  const [pwModalUser, setPwModalUser] = useState<UserRow | null>(null);
  const [pwForm] = Form.useForm();

  // Groups
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupEditOld, setGroupEditOld] = useState<string | null>(null);
  const [groupEditNew, setGroupEditNew] = useState("");

  // Workspaces
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsModalOpen, setWsModalOpen] = useState(false);
  const [editingWs, setEditingWs] = useState<WorkspaceRow | null>(null);
  const [wsForm] = Form.useForm();

  const me = JSON.parse(localStorage.getItem("user") || "{}");

  // ============ Users ============
  const fetchUsers = async () => {
    setUsersLoading(true);
    try {
      const { data } = await api.get("/users");
      setUsers(data.data);
    } catch {
      message.error("사용자 목록을 불러올 수 없습니다.");
    } finally {
      setUsersLoading(false);
    }
  };

  const fetchWorkspaces = async () => {
    setWsLoading(true);
    try {
      const { data } = await api.get("/workspaces");
      setWorkspaces(data.data);
    } catch {
      message.error("워크스페이스 목록을 불러올 수 없습니다.");
    } finally {
      setWsLoading(false);
    }
  };

  const fetchGroups = async () => {
    setGroupsLoading(true);
    try {
      const { data } = await api.get("/users/groups");
      setGroups(data.data);
    } catch {
      message.error("그룹 목록을 불러올 수 없습니다.");
    } finally {
      setGroupsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchWorkspaces();
    fetchGroups();
  }, []);

  const openCreateUser = () => {
    setEditingUser(null);
    userForm.resetFields();
    userForm.setFieldsValue({ role: "admin", accountType: "Local Account", workspaceId: 1 });
    setUserModalOpen(true);
  };

  const openEditUser = (u: UserRow) => {
    setEditingUser(u);
    userForm.setFieldsValue({
      username: u.username,
      name: u.name,
      role: u.role,
      accountType: u.accountType,
      groupName: u.groupName,
      workspaceId: u.workspaceId,
    });
    setUserModalOpen(true);
  };

  const handleSaveUser = async () => {
    try {
      const values = await userForm.validateFields();
      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, {
          name: values.name,
          role: values.role,
          accountType: values.accountType,
          groupName: values.groupName,
          workspaceId: values.workspaceId,
        });
        message.success("사용자 정보가 수정되었습니다.");
      } else {
        await api.post("/users", values);
        message.success("사용자가 추가되었습니다.");
      }
      setUserModalOpen(false);
      fetchUsers();
      fetchGroups();
    } catch (err: any) {
      if (err?.errorFields) return; // form validation error
      message.error(err.response?.data?.error || "저장에 실패했습니다.");
    }
  };

  const handleDeleteUser = async (id: number) => {
    try {
      await api.delete(`/users/${id}`);
      message.success("삭제되었습니다.");
      fetchUsers();
      fetchGroups();
    } catch (err: any) {
      message.error(err.response?.data?.error || "삭제에 실패했습니다.");
    }
  };

  const handleResetPassword = async () => {
    if (!pwModalUser) return;
    try {
      const values = await pwForm.validateFields();
      await api.put(`/users/${pwModalUser.id}/password`, { newPassword: values.newPassword });
      message.success("비밀번호가 변경되었습니다.");
      setPwModalUser(null);
      pwForm.resetFields();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || "변경에 실패했습니다.");
    }
  };

  // ============ Groups ============
  const handleRenameGroup = async () => {
    if (!groupEditOld || !groupEditNew.trim()) return;
    try {
      await api.put("/users/groups/rename", { oldName: groupEditOld, newName: groupEditNew.trim() });
      message.success("그룹명이 변경되었습니다.");
      setGroupEditOld(null);
      setGroupEditNew("");
      fetchGroups();
      fetchUsers();
    } catch (err: any) {
      message.error(err.response?.data?.error || "변경에 실패했습니다.");
    }
  };

  // ============ Workspaces ============
  const openCreateWs = () => {
    setEditingWs(null);
    wsForm.resetFields();
    setWsModalOpen(true);
  };

  const openEditWs = (w: WorkspaceRow) => {
    setEditingWs(w);
    wsForm.setFieldsValue({ name: w.name });
    setWsModalOpen(true);
  };

  const handleSaveWs = async () => {
    try {
      const values = await wsForm.validateFields();
      if (editingWs) {
        await api.put(`/workspaces/${editingWs.id}`, { name: values.name });
        message.success("워크스페이스 이름이 변경되었습니다.");
      } else {
        await api.post("/workspaces", { name: values.name });
        message.success("워크스페이스가 추가되었습니다.");
      }
      setWsModalOpen(false);
      fetchWorkspaces();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(err.response?.data?.error || "저장에 실패했습니다.");
    }
  };

  const handleDeleteWs = async (id: number) => {
    try {
      await api.delete(`/workspaces/${id}`);
      message.success("삭제되었습니다.");
      fetchWorkspaces();
    } catch (err: any) {
      message.error(err.response?.data?.error || "삭제에 실패했습니다.");
    }
  };

  // ============ Columns ============
  const userColumns = [
    { title: "ID", dataIndex: "id", width: 60 },
    { title: "Username", dataIndex: "username", width: 140 },
    { title: "Name", dataIndex: "name", render: (v: string) => v || "-" },
    {
      title: "Role",
      dataIndex: "role",
      width: 110,
      render: (v: string) => <Tag color={v === "super_admin" ? "red" : "blue"}>{v}</Tag>,
    },
    {
      title: "Account Type",
      dataIndex: "accountType",
      width: 130,
      render: (v: string) => v || "-",
    },
    {
      title: "Group",
      dataIndex: "groupName",
      width: 120,
      render: (v: string) => v ? <Tag>{v}</Tag> : "-",
    },
    {
      title: "Workspace",
      dataIndex: ["workspace", "name"],
      width: 140,
      render: (_: any, r: UserRow) => r.workspace?.name || "-",
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      width: 110,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD"),
    },
    {
      title: "",
      width: 140,
      render: (_: any, r: UserRow) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditUser(r)} />
          <Button size="small" icon={<LockOutlined />} onClick={() => { setPwModalUser(r); pwForm.resetFields(); }} />
          <Popconfirm
            title={r.id === me.id ? "본인 계정은 삭제할 수 없습니다." : "삭제하시겠습니까?"}
            onConfirm={() => handleDeleteUser(r.id)}
            disabled={r.id === me.id}
          >
            <Button size="small" danger icon={<DeleteOutlined />} disabled={r.id === me.id} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const groupColumns = [
    { title: "Group Name", dataIndex: "name" },
    {
      title: "Members",
      dataIndex: "memberCount",
      width: 100,
      render: (v: number) => <Tag color="blue">{v}</Tag>,
    },
    {
      title: "",
      width: 100,
      render: (_: any, r: GroupRow) => (
        <Button
          size="small"
          icon={<EditOutlined />}
          onClick={() => { setGroupEditOld(r.name); setGroupEditNew(r.name); }}
        >
          Rename
        </Button>
      ),
    },
  ];

  const wsColumns = [
    { title: "ID", dataIndex: "id", width: 60 },
    { title: "Name", dataIndex: "name" },
    {
      title: "Users",
      width: 80,
      render: (_: any, r: WorkspaceRow) => <Tag>{r._count.users}</Tag>,
    },
    {
      title: "Devices",
      width: 90,
      render: (_: any, r: WorkspaceRow) => <Tag>{r._count.devices}</Tag>,
    },
    {
      title: "Gateways",
      width: 90,
      render: (_: any, r: WorkspaceRow) => <Tag>{r._count.gateways}</Tag>,
    },
    {
      title: "Created",
      dataIndex: "createdAt",
      width: 110,
      render: (v: string) => dayjs(v).format("YYYY-MM-DD"),
    },
    {
      title: "",
      width: 140,
      render: (_: any, r: WorkspaceRow) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEditWs(r)} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDeleteWs(r.id)}>
            <Button size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Card size="small">
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
            {
              key: "users",
              label: <span><UserAddOutlined /> Users</span>,
              children: (
                <>
                  <Space style={{ marginBottom: 12 }}>
                    <Button type="primary" icon={<UserAddOutlined />} onClick={openCreateUser}>
                      Add User
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={fetchUsers}>Refresh</Button>
                    <Tag>{users.length} users</Tag>
                  </Space>
                  <Table
                    dataSource={users}
                    columns={userColumns}
                    rowKey="id"
                    loading={usersLoading}
                    size="small"
                    pagination={{ pageSize: 20 }}
                  />
                </>
              ),
            },
            {
              key: "groups",
              label: <span><TeamOutlined /> Groups</span>,
              children: (
                <>
                  <Space style={{ marginBottom: 12 }}>
                    <Button icon={<ReloadOutlined />} onClick={fetchGroups}>Refresh</Button>
                    <Tag>{groups.length} groups</Tag>
                  </Space>
                  <Text type="secondary" style={{ display: "block", marginBottom: 8 }}>
                    그룹은 사용자의 Group 필드로 구성됩니다. Rename 시 해당 그룹의 모든 사용자가 일괄 변경됩니다.
                  </Text>
                  <Table
                    dataSource={groups}
                    columns={groupColumns}
                    rowKey="name"
                    loading={groupsLoading}
                    size="small"
                    pagination={false}
                  />
                </>
              ),
            },
            {
              key: "workspaces",
              label: <span><AppstoreOutlined /> Workspaces</span>,
              children: (
                <>
                  <Space style={{ marginBottom: 12 }}>
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreateWs}>
                      Add Workspace
                    </Button>
                    <Button icon={<ReloadOutlined />} onClick={fetchWorkspaces}>Refresh</Button>
                    <Tag>{workspaces.length} workspaces</Tag>
                  </Space>
                  <Table
                    dataSource={workspaces}
                    columns={wsColumns}
                    rowKey="id"
                    loading={wsLoading}
                    size="small"
                    pagination={false}
                  />
                </>
              ),
            },
          ]}
        />
      </Card>

      {/* Add / Edit User Modal */}
      <Modal
        title={editingUser ? "Edit User" : "Add User"}
        open={userModalOpen}
        onCancel={() => setUserModalOpen(false)}
        onOk={handleSaveUser}
        okText={editingUser ? "Save" : "Add"}
        width={500}
      >
        <Form form={userForm} layout="vertical">
          <Form.Item
            label="Username"
            name="username"
            rules={[{ required: !editingUser, message: "Username is required" }]}
          >
            <Input disabled={!!editingUser} />
          </Form.Item>
          {!editingUser && (
            <Form.Item
              label="Password"
              name="password"
              rules={[{ required: true, min: 4, message: "최소 4자" }]}
            >
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item label="Name" name="name">
            <Input />
          </Form.Item>
          <Form.Item label="Role" name="role" rules={[{ required: true }]}>
            <Select
              options={[
                { value: "admin", label: "Admin" },
                { value: "super_admin", label: "Super Admin" },
              ]}
            />
          </Form.Item>
          <Form.Item label="Account Type" name="accountType">
            <Select
              allowClear
              options={[
                { value: "Local Account", label: "Local Account" },
                { value: "AD Account", label: "AD Account" },
              ]}
            />
          </Form.Item>
          <Form.Item label="Group" name="groupName">
            <Select
              allowClear
              showSearch
              placeholder="Select or type group"
              mode="tags"
              maxCount={1}
              options={groups.map((g) => ({ value: g.name, label: g.name }))}
              tokenSeparators={[","]}
              onChange={(v) => {
                // mode="tags" + maxCount=1 → 단일 값
                const single = Array.isArray(v) ? v[0] : v;
                userForm.setFieldsValue({ groupName: single });
              }}
            />
          </Form.Item>
          <Form.Item label="Workspace" name="workspaceId">
            <Select
              allowClear
              options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Password Reset Modal */}
      <Modal
        title={`Reset Password — ${pwModalUser?.username}`}
        open={!!pwModalUser}
        onCancel={() => setPwModalUser(null)}
        onOk={handleResetPassword}
        okText="Reset"
        width={400}
      >
        <Form form={pwForm} layout="vertical">
          <Form.Item
            label="New Password"
            name="newPassword"
            rules={[{ required: true, min: 4, message: "최소 4자" }]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>

      {/* Group Rename Modal */}
      <Modal
        title={`Rename Group — ${groupEditOld}`}
        open={!!groupEditOld}
        onCancel={() => { setGroupEditOld(null); setGroupEditNew(""); }}
        onOk={handleRenameGroup}
        okText="Rename"
        width={400}
      >
        <Form layout="vertical">
          <Form.Item label="New Group Name">
            <Input value={groupEditNew} onChange={(e) => setGroupEditNew(e.target.value)} />
          </Form.Item>
        </Form>
      </Modal>

      {/* Workspace Add/Edit Modal */}
      <Modal
        title={editingWs ? "Edit Workspace" : "Add Workspace"}
        open={wsModalOpen}
        onCancel={() => setWsModalOpen(false)}
        onOk={handleSaveWs}
        okText={editingWs ? "Save" : "Add"}
        width={400}
      >
        <Form form={wsForm} layout="vertical">
          <Form.Item label="Name" name="name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
