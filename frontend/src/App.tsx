import React, { useEffect, useState, useCallback } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { Header } from "./components/Header";
import { api } from "./api/client";
import { usePolling } from "./hooks/usePolling";

import Overview from "./pages/Overview";
import ForecastPage from "./pages/Forecast";
import OptimizerPage from "./pages/Optimizer";
import DigitalTwinPage from "./pages/DigitalTwin";
import WhatIfPage from "./pages/WhatIf";
import RiskPage from "./pages/Risk";
import MaintenancePage from "./pages/Maintenance";
import AdvisorPage from "./pages/Advisor";
import AnalyticsPage from "./pages/Analytics";
import AlertsPage from "./pages/Alerts";

export default function App() {
  const [station, setStation] = useState("BHARATI");
  const [running, setRunning] = useState(false);

  const { data: status, refresh } = usePolling(() => api.status(), 8000, [station]);
  const { data: openAlerts } = usePolling(() => api.alerts("OPEN"), 15000, [station]);

  // Auto-tick the simulation forward while "running" so the dashboard visibly
  // progresses without requiring the user to keep clicking.
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      api.tick(1).then(refresh).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [running, refresh]);

  const onStationChange = useCallback(async (code: string) => {
    await api.switchStation(code);
    setStation(code);
  }, []);

  const onControl = useCallback(async (action: "start" | "pause" | "reset", speed?: number) => {
    await api.simControl(action, speed);
    if (action === "start") setRunning(true);
    if (action === "pause") setRunning(false);
    if (action === "reset") { setRunning(false); refresh(); }
  }, [refresh]);

  return (
    <BrowserRouter>
      <div className="flex min-h-screen">
        <Sidebar station={station} onStationChange={onStationChange} />
        <main className="flex-1 p-5 max-w-[1600px]">
          <Header
            identity={status?.identity}
            weather={status?.tick?.weather}
            mode={status?.mode || "NORMAL"}
            onControl={onControl}
            running={running}
            alertCount={openAlerts?.alerts?.length || 0}
          />
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/forecast" element={<ForecastPage />} />
            <Route path="/optimizer" element={<OptimizerPage />} />
            <Route path="/digital-twin" element={<DigitalTwinPage />} />
            <Route path="/whatif" element={<WhatIfPage />} />
            <Route path="/risk" element={<RiskPage />} />
            <Route path="/maintenance" element={<MaintenancePage />} />
            <Route path="/advisor" element={<AdvisorPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
