import { BrowserRouter, Routes, Route } from "react-router-dom";
import JunoPage from "./pages/JunoPage";
import AndrewPage from "./pages/AndrewPage";
import CalendarPage from "./pages/CalendarPage";
import { Analytics } from "@vercel/analytics/react";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AndrewPage />} />
        <Route path="/juno" element={<JunoPage />} />
        <Route path="/andrew" element={<AndrewPage />} />
        <Route path="/calendar" element={<CalendarPage />} />
      </Routes>

      <Analytics />
    </BrowserRouter>
  );
}