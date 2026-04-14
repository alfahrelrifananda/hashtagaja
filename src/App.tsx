import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Home } from './pages/Home'
import { Room } from './pages/Room'
import { AdminLogin } from './pages/AdminLogin'
import { AdminDashboard } from './pages/AdminDashboard'
import { AdminGuard } from './components/AdminGuard'
import './index.css'

export default function App() {
  return (
    <BrowserRouter basename="/">
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/admin" element={<AdminLogin />} />
        <Route path="/admin/dashboard" element={
          <AdminGuard>
            <AdminDashboard />
          </AdminGuard>
        } />
        <Route path="/:hashtag" element={<Room />} />
      </Routes>
    </BrowserRouter>
  )
}
