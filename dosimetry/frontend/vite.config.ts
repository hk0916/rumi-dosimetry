import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: "0.0.0.0",
    proxy: {
      "/api": { target: "http://backend:4000", changeOrigin: true },
      "/ws": { target: "ws://backend:4000", ws: true },
    },
  },
  // Vite dev 서버가 hard refresh 시 echarts 등 큰 라이브러리를 매번 수백 개 ESM 파일로
  // 로드하지 않도록 명시적으로 pre-bundle 시킨다.
  optimizeDeps: {
    include: [
      "echarts",
      "echarts/core",
      "echarts-for-react",
      "xlsx",
      "antd",
      "@ant-design/icons",
      "react",
      "react-dom",
      "react-router-dom",
      "axios",
      "dayjs",
      "i18next",
      "react-i18next",
    ],
  },
});
