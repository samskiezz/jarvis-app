import { Route, Routes } from "react-router-dom";
import AuthGate from "@/components/AuthGate";
import Layout from "@/components/Layout";
import CommandCentre from "@/pages/CommandCentre";
import WorldDetail from "@/pages/WorldDetail";
import InventionDetail from "@/pages/InventionDetail";
import InventionList from "@/pages/InventionList";
import PatentScanner from "@/pages/PatentScanner";
import Population from "@/pages/Population";
import Guilds from "@/pages/Guilds";
import Safety from "@/pages/Safety";

export default function App() {
  return (
    <AuthGate>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<CommandCentre />} />
          <Route path="/worlds/:id" element={<WorldDetail />} />
          <Route path="/population" element={<Population />} />
          <Route path="/inventions" element={<InventionList />} />
          <Route path="/inventions/:id" element={<InventionDetail />} />
          <Route path="/patents" element={<PatentScanner />} />
          <Route path="/guilds" element={<Guilds />} />
          <Route path="/safety" element={<Safety />} />
        </Route>
      </Routes>
    </AuthGate>
  );
}
