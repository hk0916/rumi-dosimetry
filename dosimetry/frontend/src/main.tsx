import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { ConfigProvider } from "antd";
import koKR from "antd/locale/ko_KR";
import enUS from "antd/locale/en_US";
import App from "./App";
import "./i18n";
import "./styles/global.css";

function Root() {
  const [lang, setLang] = React.useState(localStorage.getItem("lang") || "ko");

  // Listen for language changes
  React.useEffect(() => {
    const handler = () => setLang(localStorage.getItem("lang") || "ko");
    window.addEventListener("languagechange", handler);
    return () => window.removeEventListener("languagechange", handler);
  }, []);

  const antdLocale = lang === "en" ? enUS : koKR;

  return (
    <ConfigProvider locale={antdLocale} theme={{ token: { colorPrimary: "#2F5496" } }}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
