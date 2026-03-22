import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import JarvisTerminal from './pages/JarvisTerminal';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/JarvisTerminal" replace />} />
        <Route path="/JarvisTerminal" element={<JarvisTerminal />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
