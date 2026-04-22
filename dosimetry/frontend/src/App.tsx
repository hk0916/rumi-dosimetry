import { Routes, Route, Navigate } from "react-router-dom";
import MainLayout from "./components/layout/MainLayout";
import LoginPage from "./pages/LoginPage";
import DevicePage from "./pages/DevicePage";
import MonitoringPage from "./pages/MonitoringPage";
import CalibrationPage from "./pages/CalibrationPage";
import ManageCalibrationPage from "./pages/ManageCalibrationPage";
import DataAnalysisPage from "./pages/DataAnalysisPage";
import UserSettingsPage from "./pages/UserSettingsPage";
import ManageUsersPage from "./pages/ManageUsersPage";
import OtaPage from "./pages/OtaPage";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("token");
  return token ? <>{children}</> : <Navigate to="/login" />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/dosimetry/*"
        element={
          <PrivateRoute>
            <MainLayout />
          </PrivateRoute>
        }
      >
        <Route path="device" element={<DevicePage />} />
        <Route path="data-monitoring" element={<MonitoringPage />} />
        <Route path="calibration" element={<CalibrationPage />} />
        <Route path="manage-calibration" element={<ManageCalibrationPage />} />
        <Route path="data-analysis" element={<DataAnalysisPage />} />
        <Route path="ota" element={<OtaPage />} />
        <Route path="manage-users" element={<ManageUsersPage />} />
        <Route path="settings" element={<UserSettingsPage />} />
        <Route index element={<Navigate to="device" />} />
      </Route>
      <Route path="*" element={<Navigate to="/dosimetry/device" />} />
    </Routes>
  );
}
