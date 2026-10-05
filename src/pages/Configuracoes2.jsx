import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'

export default function Configuracoes() {
  const { setPageHeader } = useOutletContext()

  useEffect(() => {
    setPageHeader({ title: 'Configurações', subtitle: 'Em construção', actions: null })
    return () => setPageHeader({ title: '', subtitle: '', actions: null })
  }, [])

  return (
    <div className="p-4 sm:p-6 lg:p-7 max-w-7xl mx-auto">
      <div className="bg-white/95 border border-mata-sand rounded-2xl shadow-[0_8px_28px_rgba(83,52,31,0.06)] p-12 text-center">
        <p className="font-display text-lg text-mata-ink mb-1">Em construção 🚧</p>
        <p className="text-sm text-mata-ink/50">As configurações do LuzDaMata estarão disponíveis aqui em breve.</p>
      </div>
    </div>
  )
}
