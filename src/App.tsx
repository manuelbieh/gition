import { Routes, Route } from 'react-router'
import { Landing } from './pages/Landing'
import { Wiki } from './pages/Wiki'
import { Settings } from './pages/Settings'
import { AuthCallback } from './pages/AuthCallback'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/:owner/:repo/_settings" element={<Settings />} />
      <Route path="/:owner/:repo/*" element={<Wiki />} />
    </Routes>
  )
}
