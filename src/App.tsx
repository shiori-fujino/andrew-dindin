import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import JunoPage from "./pages/JunoPage";
import AndrewPage from "./pages/AndrewPage";
import CalendarPage from "./pages/CalendarPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/juno" replace />} />
        <Route path="/juno" element={<JunoPage />} />
        <Route path="/andrew" element={<AndrewPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
      </Routes>
    </BrowserRouter>
  );
}
