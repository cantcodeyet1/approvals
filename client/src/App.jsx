import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Sign from './pages/Sign.jsx';
import InvoiceDetail from './pages/InvoiceDetail.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sign" element={<Sign />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/invoice/:id" element={<InvoiceDetail />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
