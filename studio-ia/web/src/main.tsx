import "@fontsource-variable/inter";
import "./styles/global.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { AnalyzePage } from "./pages/Analyze";
import { DashboardPage } from "./pages/Dashboard";
import { EnhancePage } from "./pages/Enhance";
import { GeneratePage } from "./pages/Generate";
import { LibraryPage } from "./pages/Library";
import { NotFoundPage } from "./pages/NotFound";
import { SettingsPage } from "./pages/Settings";
import { StudioProvider } from "./state/studio";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <StudioProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<DashboardPage />} />
            <Route path="generer" element={<GeneratePage />} />
            <Route path="analyser" element={<AnalyzePage />} />
            <Route path="ameliorer" element={<EnhancePage />} />
            <Route path="bibliotheque" element={<LibraryPage />} />
            <Route path="parametres" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </StudioProvider>
    </BrowserRouter>
  </StrictMode>,
);
