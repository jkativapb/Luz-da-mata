import { useState } from 'react'
import { useAuth } from '../AuthContext'

export default function Login() {
  const { entrarComEmailSenha } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setErro('')
    setCarregando(true)

    const { error } = await entrarComEmailSenha(email, senha)

    setCarregando(false)

    if (error) {
      setErro('Email ou senha incorretos.')
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-mata-bark px-6 py-10">
      {/* Fundo — arquivo login-bg.jpg deve estar em public/, na raiz do projeto */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url('/login-bg.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      />

      {/* Vinheta escura leve para dar contraste ao card e aos textos */}
      <div className="absolute inset-0 bg-mata-bark/30" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 62% 45%, rgba(212,175,105,0.10), transparent 55%)',
        }}
      />

      {/* Modelo recortada — arquivo login-model.png deve estar em public/ também */}
      <img
        src="/login-model.png"
        alt=""
        className="hidden md:block absolute -bottom-8 lg:-bottom-14 left-0 h-[85%] lg:h-[95%] w-auto object-contain object-bottom pointer-events-none select-none"
      />

      {/* Textos decorativos nos cantos, só em telas largas */}
      <p className="hidden lg:block absolute top-10 left-10 max-w-xs font-display text-3xl leading-tight text-mata-cream drop-shadow-lg">
        Beleza que impulsa mulheres <span className="italic text-mata-gold">reais.</span>
      </p>
      <p className="hidden lg:block absolute top-[140] left-10 text-[11px] tracking-widest text-mata-sand/70 leading-relaxed drop-shadow">
        MAIS QUE COSMÉTICOS.<br />CONQUISTAS REAIS.
      </p>
      <p className="hidden lg:block absolute top-10 right-10 text-right font-display text-mata-gold/80 text-lg leading-snug drop-shadow">
        Beleza que conecta<br />pessoas
      </p>

      {/* Card principal — centralizado na tela */}
      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-3xl border border-mata-gold/30 bg-mata-bark/70 backdrop-blur-md px-8 py-10 text-center shadow-[0_0_60px_-15px_rgba(212,175,105,0.35)]">
          <div className="flex justify-center mb-4">
            <div className="w-14 h-14 rounded-full border border-mata-gold/50 flex items-center justify-center">
              <span className="text-mata-gold text-2xl">✳</span>
            </div>
          </div>

          <p className="font-display text-2xl text-mata-cream leading-none">LuzDaMata</p>
          <p className="text-mata-sand/60 text-xs mb-6">Ilumine sua beleza</p>

          <p className="uppercase tracking-widest text-mata-gold text-xs mb-3">Ilumine sua beleza</p>
          <h1 className="font-display text-4xl text-mata-cream mb-2">CRM LuzDaMata</h1>
          <p className="text-mata-sand/70 text-sm mb-8">
            Acompanhe compradoras, revendedoras e visitas em um só lugar.
          </p>

          <form onSubmit={handleLogin} className="space-y-3 text-left">
            <div>
              <label className="text-mata-sand/70 text-xs">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-full bg-mata-cream/95 text-mata-ink px-4 py-2 mt-1 outline-none focus:ring-2 focus:ring-mata-gold"
                placeholder="seuemail@exemplo.com"
              />
            </div>

            <div>
              <label className="text-mata-sand/70 text-xs">Senha</label>
              <input
                type="password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="w-full rounded-full bg-mata-cream/95 text-mata-ink px-4 py-2 mt-1 outline-none focus:ring-2 focus:ring-mata-gold"
                placeholder="••••••••"
              />
            </div>

            {erro && (
              <p className="text-red-300 text-xs text-center">{erro}</p>
            )}

            <button
              type="submit"
              disabled={carregando}
              className="w-full bg-mata-cream text-mata-ink font-medium rounded-full py-3 px-6 hover:bg-white transition-colors disabled:opacity-60 mt-2"
            >
              {carregando ? 'Entrando...' : 'Entrar'}
            </button>
          </form>

          <p className="text-mata-sand/40 text-xs mt-8">
            Acesso restrito à equipe LuzDaMata.
          </p>
        </div>

        {/* Faixa de ícones embaixo do card */}
        <div className="flex justify-center gap-10 mt-8 text-mata-gold/80">
          <div className="text-center">
            <p className="text-lg mb-1">◇</p>
            <p className="text-[10px] tracking-wide text-mata-sand/60 leading-tight">
              GESTÃO DE<br />RELACIONAMENTOS
            </p>
          </div>
          <div className="text-center">
            <p className="text-lg mb-1">▲</p>
            <p className="text-[10px] tracking-wide text-mata-sand/60 leading-tight">
              MAIS VENDAS<br />MAIS CONQUISTAS
            </p>
          </div>
          <div className="text-center">
            <p className="text-lg mb-1">♡</p>
            <p className="text-[10px] tracking-wide text-mata-sand/60 leading-tight">
              BELEZA QUE<br />TRANSFORMA
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
