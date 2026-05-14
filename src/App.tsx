import { Routes, Route } from 'react-router'
import { Landing } from './pages/Landing'
import { Wiki } from './pages/Wiki'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/:owner/:repo/*" element={<Wiki />} />
    </Routes>
  )
}
