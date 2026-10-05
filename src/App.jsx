import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Visitas from './pages/Visitas'
import Cadastro from './pages/Cadastro'
import Vendas from './pages/Vendas'
import Produtos from './pages/Produtos'
import Relatorios from './pages/Relatorios'
import Configuracoes from './pages/Configuracoes'

function Rotas() {
  const { session, carregando } = useAuth()

  if (carregando) {
    return <div className="min-h-screen flex items-center justify-center text-mata-ink/50 text-sm">Carregando…</div>
  }

  if (!session) {
    return <Login />
  }

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/visitas" element={<Visitas />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/vendas" element={<Vendas />} />
        <Route path="/produtos" element={<Produtos />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="/configuracoes" element={<Configuracoes />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Rotas />
    </AuthProvider>
  )
}
