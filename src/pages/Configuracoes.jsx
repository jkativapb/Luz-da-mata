import { useEffect } from 'react'
import { useOutletContext } from 'react-router-dom'

export default function Configuracoes() {
  const { setPageHeader } = useOutletContext()

  useEffect(() => {
    setPageHeader({ title: 'Configurações', subtitle: 'Em construção', actions: null })
    return () => setPageHeader({ title: '', subtitle: '', actions: null })
  }, [])

  return (
    <div className="w-full pb-3 space-y-[1px]">
      <div className="bg-white/90 border border-[#eadfce] rounded-2xl shadow-[0_8px_26px_rgba(77,45,18,0.04)] min-h-[200px] flex flex-col items-center justify-center p-8 text-center">
        <p className="font-display text-lg text-mata-ink mb-1">Em construção 🚧</p>
        <p className="text-sm text-mata-ink/50">As configurações do LuzDaMata estarão disponíveis aqui em breve.</p>
      </div>
    </div>
  )
}
