import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { supabase } from '../supabaseClient'
import { formatarDataHora } from '../lib/helpers'

const vazio = {
  nome_lead: '',
  contato_id: '',
  data_visita: '',
  tipo_contato: 'presencial',
  observacoes: '',
  lembrete_para: 'cliente',
  telefone: '',
  responsavel: '',
}

const STATUS_LABEL = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu',
}

const STATUS_ESTILO = {
  agendado: 'bg-mata-gold/20 text-mata-clay',
  confirmado: 'bg-blue-100 text-blue-700',
  concluido: 'bg-mata-moss/10 text-mata-moss',
  cancelado: 'bg-red-100 text-red-700',
  nao_compareceu: 'bg-zinc-200 text-zinc-600',
}

const LEMBRETE_LABEL = {
  cliente: 'Cliente/revendedora',
  equipe: 'Equipe',
  ambos: 'Cliente e equipe',
  nenhum: 'Sem lembrete',
}


// Responsáveis pelo agendamento: o lembrete "para a equipe" vai para o telefone de quem agendou.
const RESPONSAVEIS = [
  { nome: 'Jane', telefone: '46 92001-8570' },
  { nome: 'Samuel', telefone: '46 9941-9111' },
]

const soDigitos = (v) => String(v || '').replace(/\D/g, '')

// Máscara: "46 99999-9999" (celular) ou "46 9999-9999"
function mascaraTelefone(valor) {
  const d = soDigitos(valor).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `${d.slice(0, 2)} ${d.slice(2)}`
  if (d.length <= 10) return `${d.slice(0, 2)} ${d.slice(2, 6)}-${d.slice(6)}`
  return `${d.slice(0, 2)} ${d.slice(2, 7)}-${d.slice(7)}`
}

// Telefone do cadastro do contato (aceita variações do nome da coluna)
function telefoneDoContato(c) {
  let d = soDigitos(c?.telefone || c?.whatsapp || c?.celular || c?.phone || '')
  if (d.startsWith('55') && d.length > 11) d = d.slice(2)
  return mascaraTelefone(d)
}

function linkWhatsApp(telefone, mensagem) {
  let d = soDigitos(telefone)
  if (!d) return ''
  if (!(d.startsWith('55') && d.length >= 12)) d = `55${d}`
  return `https://wa.me/${d}?text=${encodeURIComponent(mensagem)}`
}

function partesDaReuniao(dataVisita) {
  const d = new Date(dataVisita)
  return {
    dia: d.toLocaleDateString('pt-BR', { weekday: 'long' }),
    data: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }
}

function mensagemParaCliente(visita) {
  const nome = visita.nome_lead || visita.contatos?.nome || ''
  const primeiroNome = nome.trim().split(/\s+/)[0]
  const { dia, data, hora } = partesDaReuniao(visita.data_visita)
  const presencial = visita.tipo_contato === 'presencial'

  const linhas = [
    `Olá, ${primeiroNome}! Tudo bem?`,
    `Passando para lembrar da sua reunião com a LuzDaMata, no dia ${dia}, ${data}, às ${hora}, ${
      presencial ? 'presencialmente' : 'por videoconferência'
    }.`,
  ]
  if (!presencial) linhas.push('O link será encaminhado próximo ao horário da reunião.')
  linhas.push('Até lá!')
  return linhas.join('\n')
}

function mensagemParaEquipe(visita, telefoneContato) {
  const nome = visita.nome_lead || visita.contatos?.nome || ''
  const { dia, data, hora } = partesDaReuniao(visita.data_visita)
  const presencial = visita.tipo_contato === 'presencial'

  const linhas = [
    `Olá, ${visita.responsavel}! Tudo bem?`,
    `Passando para lembrar da reunião com ${nome}, no dia ${dia}, ${data}, às ${hora}, ${
      presencial ? 'presencialmente' : 'por videoconferência'
    }.`,
  ]
  if (telefoneContato) linhas.push(`Telefone do contato: ${telefoneContato}`)
  linhas.push('Até lá!')
  return linhas.join('\n')
}

export default function Visitas() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setPageHeader } = useOutletContext()
  const [visitas, setVisitas] = useState([])
  const [contatos, setContatos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState(vazio)
  const [erroForm, setErroForm] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [reagendando, setReagendando] = useState(null) // visita sendo reagendada
  const [novaDataReagendar, setNovaDataReagendar] = useState('')
  const [motivoReagendar, setMotivoReagendar] = useState('')
  const [erroReagendar, setErroReagendar] = useState('')
  const [cancelando, setCancelando] = useState(null) // visita sendo cancelada
  const [motivoCancelar, setMotivoCancelar] = useState('')
  const [erroCancelar, setErroCancelar] = useState('')
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroPeriodo, setFiltroPeriodo] = useState('todos')
  const [gerenciando, setGerenciando] = useState(null)

  useEffect(() => {
    carregar()
  }, [])

  useEffect(() => {
    setPageHeader({
      title: 'Visitas',
      subtitle: 'Agendamentos presenciais e por videoconferência',
      actions: (
        <button
          type="button"
          onClick={() => {
            setForm(vazio)
            setErroForm('')
            setMostrarForm(true)
          }}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-[0_8px_20px_rgba(154,91,32,0.20)] hover:brightness-105 transition"
        >
          <span className="text-lg leading-none">+</span> Agendar visita
        </button>
      ),
    })
    return () => setPageHeader({ title: '', subtitle: '', actions: null })
  }, [setPageHeader])

  // Se chegou aqui vindo do Dashboard (clique em "Registrar contato/visita"),
  // já abre o formulário com o cliente pré-selecionado.
  useEffect(() => {
    const idPreSelecionado = location.state?.novoContatoId
    if (idPreSelecionado) {
      setForm({ ...vazio, contato_id: idPreSelecionado })
      setMostrarForm(true)
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function selecionarContato(id) {
    const c = contatos.find((x) => x.id === id)
    setForm((f) => ({ ...f, contato_id: id, telefone: id ? telefoneDoContato(c) : '' }))
  }

  // Quando o contato já vem pré-selecionado (ex.: vindo do Dashboard), preenche o telefone do cadastro
  useEffect(() => {
    if (!mostrarForm || !form.contato_id || form.telefone) return
    const tel = telefoneDoContato(contatos.find((x) => x.id === form.contato_id))
    if (tel) setForm((f) => ({ ...f, telefone: tel }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mostrarForm, form.contato_id, contatos])

  async function carregar() {
    setCarregando(true)
    const { data: vData } = await supabase
      .from('visitas')
      .select('*, contatos(*)')
      .order('data_visita', { ascending: false })
    const { data: cData } = await supabase.from('contatos').select('*').order('nome')
    setVisitas(vData || [])
    // Contatos inativos não devem aparecer como opção para registrar nova visita/contato
    setContatos((cData || []).filter((c) => c.ativo !== false))
    setCarregando(false)
  }

  async function salvar(e) {
    e.preventDefault()
    setErroForm('')

    if (!form.data_visita) {
      setErroForm('Escolha uma data e horário para a visita.')
      return
    }
    if (!form.contato_id && !form.nome_lead.trim()) {
      setErroForm('Selecione um contato ou informe o nome do lead.')
      return
    }
    if (['cliente', 'ambos'].includes(form.lembrete_para) && soDigitos(form.telefone).length < 10) {
      setErroForm('Informe o telefone (com DDD) para enviar o lembrete ao cliente.')
      return
    }
    if (['equipe', 'ambos'].includes(form.lembrete_para) && !form.responsavel) {
      setErroForm('Selecione o responsável pelo agendamento para enviar o lembrete à equipe.')
      return
    }

    const payload = {
      contato_id: form.contato_id || null,
      nome_lead: form.contato_id ? null : form.nome_lead.trim(),
      data_visita: form.data_visita,
      tipo_contato: form.tipo_contato,
      observacoes: form.observacoes,
      lembrete_para: form.lembrete_para,
      telefone: soDigitos(form.telefone) ? form.telefone.trim() : null,
      responsavel: form.responsavel || null,
      status: 'agendado',
    }
    const { error } = await supabase.from('visitas').insert(payload)
    if (error) {
      setErroForm(`Não foi possível salvar o agendamento: ${error.message}`)
      return
    }
    setForm(vazio)
    setMostrarForm(false)
    carregar()
  }

  function abrirReagendar(v) {
    setReagendando(v)
    setNovaDataReagendar(v.data_visita ? v.data_visita.slice(0, 16) : '')
    setMotivoReagendar('')
    setErroReagendar('')
  }

  async function confirmarReagendamento(e) {
    e.preventDefault()
    if (!novaDataReagendar) {
      setErroReagendar('Escolha a nova data e horário.')
      return
    }
    if (!motivoReagendar.trim()) {
      setErroReagendar('Informe o motivo do reagendamento.')
      return
    }

    await supabase
      .from('visitas')
      .update({
        data_anterior: reagendando.data_visita,
        data_visita: novaDataReagendar,
        motivo_reagendamento: motivoReagendar.trim(),
        status: 'agendado',
      })
      .eq('id', reagendando.id)

    setReagendando(null)
    carregar()
  }

  function abrirCancelar(v) {
    setCancelando(v)
    setMotivoCancelar('')
    setErroCancelar('')
  }

  async function confirmarCancelamento(e) {
    e.preventDefault()
    if (!motivoCancelar.trim()) {
      setErroCancelar('Informe o motivo do cancelamento.')
      return
    }

    await supabase
      .from('visitas')
      .update({ status: 'cancelado', motivo_cancelamento: motivoCancelar.trim() })
      .eq('id', cancelando.id)

    setCancelando(null)
    carregar()
  }

  async function atualizarStatus(v, novoStatus) {
    await supabase.from('visitas').update({ status: novoStatus }).eq('id', v.id)
    carregar()
  }

  async function confirmarConversao(v) {
    // O tipo (cliente final ou revendedora) é escolhido depois, na ficha do Cadastro
    const { data: novoContato, error: erroContato } = await supabase
      .from('contatos')
      .insert({ nome: v.nome_lead || v.contatos?.nome, tipo: 'cliente_final' })
      .select()
      .single()

    if (erroContato || !novoContato) {
      console.error('Erro ao converter visita:', erroContato)
      alert('Não foi possível converter: ' + (erroContato?.message || 'erro desconhecido'))
      return
    }

    await supabase
      .from('visitas')
      .update({ convertido: true, contato_id: novoContato.id, status: 'concluido' })
      .eq('id', v.id)

    carregar()
    // Leva para a página de cadastro para completar os dados do novo contato
    navigate('/cadastro', { state: { editarContatoId: novoContato.id } })
  }

  async function marcarNaoConvertido(v) {
    await supabase.from('visitas').update({ convertido: false, tipo_conversao: null }).eq('id', v.id)
    carregar()
  }

  const totalVisitas = visitas.length
  const convertidas = visitas.filter((v) => v.convertido).length
  const agendadas = visitas.filter((v) => (v.status || 'agendado') === 'agendado').length
  const confirmadas = visitas.filter((v) => (v.status || 'agendado') === 'confirmado').length
  const taxaConversao = totalVisitas ? Math.round((convertidas / totalVisitas) * 100) : 0

  const buscaNormalizada = busca.trim().toLowerCase()
  const visitasFiltradas = visitas.filter((v) => {
    if (filtroStatus && (v.status || 'agendado') !== filtroStatus) return false

    if (filtroPeriodo !== 'todos' && v.data_visita) {
      const dias = Number(filtroPeriodo)
      const limite = new Date()
      limite.setDate(limite.getDate() - dias)
      if (new Date(v.data_visita) < limite) return false
    }

    if (!buscaNormalizada) return true
    const nome = v.nome_lead || v.contatos?.nome || ''
    return nome.toLowerCase().includes(buscaNormalizada)
  })

  function iniciais(nome = '') {
    return nome
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((parte) => parte[0]?.toUpperCase() || '')
      .join('')
  }

  // Dados para o gráfico "Visitas x Convertidas em negócio" (últimos 6 meses)
  const dadosMensais = useMemo(() => {
    const meses = []
    const hoje = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      meses.push({
        chave: `${d.getFullYear()}-${d.getMonth()}`,
        label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        Visitas: 0,
        Convertidas: 0,
      })
    }
    const porChave = Object.fromEntries(meses.map((m) => [m.chave, m]))
    visitas.forEach((v) => {
      if (!v.data_visita) return
      const d = new Date(v.data_visita)
      const chave = `${d.getFullYear()}-${d.getMonth()}`
      const alvo = porChave[chave]
      if (!alvo) return
      alvo.Visitas += 1
      if (v.convertido) alvo.Convertidas += 1
    })
    return meses
  }, [visitas])


  const lembreteGer = gerenciando?.lembrete_para || 'cliente'
  const telClienteGer = gerenciando ? gerenciando.telefone || telefoneDoContato(gerenciando.contatos) : ''
  const respGer = RESPONSAVEIS.find((r) => r.nome === gerenciando?.responsavel)

  // Abre o WhatsApp com a mensagem pronta; é só tocar em enviar.
  function enviarLembrete(destino) {
    const v = gerenciando
    const link =
      destino === 'equipe'
        ? linkWhatsApp(respGer?.telefone, mensagemParaEquipe(v, telClienteGer))
        : linkWhatsApp(telClienteGer, mensagemParaCliente(v))
    if (link) window.open(link, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="w-full pb-3 space-y-[3px]">

      {/* Visão gerencial: gráfico principal + resumo */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-[6px] items-stretch">
        <div className="xl:col-span-2 bg-white/90 border border-[#eadfce] rounded-2xl px-4 sm:px-5 py-2 shadow-[0_10px_30px_rgba(79,45,18,0.05)] h-56 xl:h-[230px] flex flex-col min-w-0">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div>
              <p className="font-display text-xl text-mata-ink">Visitas x Conversões em Negócio</p>
              <p className="text-xs text-mata-ink/45 mt-0.5">Últimos 6 meses</p>
            </div>
            <span className="hidden sm:inline-flex border border-[#eadfce] rounded-xl px-3 py-1.5 text-xs text-mata-ink/65 bg-[#fbf7f0]">
              Taxa de conversão: {taxaConversao}%
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosMensais} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eadfce" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#59483A' }} axisLine={{ stroke: '#D9C7AE' }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#59483A' }} width={32} axisLine={false} tickLine={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Visitas" fill="#B8782D" radius={[6, 6, 0, 0]} maxBarSize={38} />
                <Bar dataKey="Convertidas" fill="#4C6B4C" radius={[6, 6, 0, 0]} maxBarSize={38} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="xl:col-span-1 bg-white/90 border border-[#eadfce] rounded-2xl px-4 sm:px-5 py-1 shadow-[0_10px_30px_rgba(77,45,18,0.05)] h-56 xl:h-[230px] min-w-0">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[#9A5B20] text-xl">▣</span>
            <h3 className="font-display text-lg text-mata-ink">Resumo</h3>
          </div>

          <div className="divide-y divide-[#eadfce]">
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-mata-ink/65">Agendadas</span>
              <span className="font-display text-2xl text-[#9A5B20]">{agendadas}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-mata-ink/65">Confirmadas</span>
              <span className="font-display text-2xl text-mata-moss">{confirmadas}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-mata-ink/65">Convertidas</span>
              <span className="font-display text-2xl text-mata-moss">{convertidas}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-mata-ink/65">Taxa de conversão</span>
              <span className="font-display text-2xl text-[#9A5B20]">{taxaConversao}%</span>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-[5px] items-stretch">
        <div className="min-w-0 space-y-[5px] xl:col-span-2 flex flex-col">
          {/* Busca e filtros */}
          <section className="bg-white/90 border border-[#eadfce] rounded-2xl px-3 py-2 shadow-[0_8px_26px_rgba(77,45,18,0.04)] flex flex-col sm:flex-row items-stretch sm:items-center gap-2">

  <input
    type="text"
    placeholder="Localizar por nome..."
    value={busca}
    onChange={(e) => setBusca(e.target.value)}
    className="w-full sm:flex-[1.4] min-w-0 border border-[#eadfce] bg-[#fffdfa] rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
  />

  <select
    value={filtroStatus}
    onChange={(e) => setFiltroStatus(e.target.value)}
    className="w-full sm:flex-1 min-w-0 border border-[#eadfce] bg-[#fffdfa] rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
  >
    <option value="">Todos os status</option>

    {Object.entries(STATUS_LABEL).map(([valor, label]) => (
      <option key={valor} value={valor}>
        {label}
      </option>
    ))}
  </select>

  <select
    value={filtroPeriodo}
    onChange={(e) => setFiltroPeriodo(e.target.value)}
    className="w-full sm:flex-1 min-w-0 border border-[#eadfce] bg-[#fffdfa] rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
  >
    <option value="todos">Todos os períodos</option>
    <option value="30">Últimos 30 dias</option>
    <option value="90">Últimos 3 meses</option>
    <option value="180">Últimos 6 meses</option>
    <option value="365">Últimos 12 meses</option>
  </select>
</section>
          {/* Agenda compacta */}
          <section className="w-full bg-white/90 border border-[#eadfce] rounded-2xl shadow-[0_8px_26px_rgba(77,45,18,0.04)] overflow-hidden min-w-0">
            <div className="px-3 py-2.5 flex items-center justify-between border-b border-[#eadfce]">
              <div className="flex items-center gap-2">
                <span className="text-[#9A5B20]">♙</span>
                <h3 className="font-display text-lg text-mata-ink">Agendamentos</h3>
              </div>
              <span className="text-xs text-mata-ink/45">{visitasFiltradas.length} registro(s)</span>
            </div>

            <div
              className="hidden md:grid gap-2 px-3 py-2 border-b border-[#eadfce] bg-[#fbf7f0]/65 text-[9px] uppercase tracking-[0.08em] text-mata-ink/45 items-center"
              style={{
                gridTemplateColumns: 'minmax(0, 2fr) minmax(125px, 1.25fr) minmax(105px, .95fr) minmax(85px, .8fr) 88px',
              }}
            >
              <span>Cliente</span>
              <span>Data e hora</span>
              <span>Tipo</span>
              <span>Status</span>
              <span className="text-right">Ações</span>
            </div>

            {carregando ? (
              <p className="p-5 text-mata-ink/50 text-sm">Carregando…</p>
            ) : visitasFiltradas.length === 0 ? (
              <p className="p-5 text-mata-ink/50 text-sm">
                {busca || filtroStatus || filtroPeriodo !== 'todos'
                  ? 'Nenhum resultado para esse filtro.'
                  : 'Nenhuma visita agendada ainda.'}
              </p>
            ) : (
              <div className="h-[360px] md:h-[200px] overflow-y-scroll divide-y divide-[#eadfce]" style={{ scrollbarGutter: "stable" }}>
                {visitasFiltradas.map((v) => {
                  const status = v.status || 'agendado'
                  const nome = v.nome_lead || v.contatos?.nome || 'Sem nome'

                  return (
                    <div key={v.id} className="hover:bg-[#fbf7f0]/70 transition">
                      {/* Linha desktop */}
                      <div
                        className="hidden md:grid items-center gap-2 px-3 py-1.5"
                        style={{
                          gridTemplateColumns: 'minmax(0, 2fr) minmax(125px, 1.25fr) minmax(105px, .95fr) minmax(85px, .8fr) 88px',
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-[#f3e5cf] text-[#7A471D] flex items-center justify-center text-[10px] font-medium shrink-0">
                            {iniciais(nome)}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-[12px] text-mata-ink truncate">{nome}</p>
                            <p className="text-[10px] text-mata-ink/45 truncate">
                              {v.contato_id ? 'Cliente/revendedora cadastrada' : 'Lead'}
                            </p>
                          </div>
                        </div>

                        <div className="text-[11px] text-mata-ink/60 whitespace-nowrap">
                          {formatarDataHora(v.data_visita)}
                        </div>

                        <div className="text-[11px] text-mata-ink/60 whitespace-nowrap">
                          {v.tipo_contato === 'presencial' ? '◉ Presencial' : '▣ Videoconferência'}
                        </div>

                        <div className="">
                          <span className={`inline-flex text-[9px] px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_ESTILO[status] || 'bg-zinc-100 text-zinc-600'}`}>
                            {v.convertido ? 'Convertido' : STATUS_LABEL[status] || status}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setGerenciando(v)}
                          className="justify-self-end px-2 py-1 rounded-lg border border-[#d9b98d] text-[#9A5B20] text-[10px] whitespace-nowrap hover:bg-[#f8efe3] transition"
                        >
                          Gerenciar
                        </button>
                      </div>

                      {/* Card mobile */}
                      <div className="md:hidden flex flex-col gap-2 px-3 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-8 h-8 rounded-full bg-[#f3e5cf] text-[#7A471D] flex items-center justify-center text-[11px] font-medium shrink-0">
                              {iniciais(nome)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-[13px] text-mata-ink truncate">{nome}</p>
                              <p className="text-[10px] text-mata-ink/45 truncate">
                                {v.contato_id ? 'Cliente/revendedora cadastrada' : 'Lead'}
                              </p>
                            </div>
                          </div>
                          <span className={`shrink-0 inline-flex text-[9px] px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_ESTILO[status] || 'bg-zinc-100 text-zinc-600'}`}>
                            {v.convertido ? 'Convertido' : STATUS_LABEL[status] || status}
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-mata-ink/60">
                          <span>{formatarDataHora(v.data_visita)}</span>
                          <span>{v.tipo_contato === 'presencial' ? '◉ Presencial' : '▣ Videoconferência'}</span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setGerenciando(v)}
                          className="self-end px-3 py-1.5 rounded-lg border border-[#d9b98d] text-[#9A5B20] text-[11px] whitespace-nowrap hover:bg-[#f8efe3] transition"
                        >
                          Gerenciar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </section>


        </div>

        {/* Gerenciar visita - sempre visível ao lado da agenda no desktop */}
        <aside className="w-full bg-[#fffdfa] border border-[#eadfce] rounded-2xl shadow-[0_8px_26px_rgba(77,45,18,0.06)] overflow-hidden min-w-0 xl:col-span-1 xl:self-start">
          {!gerenciando ? (
            <div className="h-[300px] xl:h-[326px] flex flex-col">
              <div className="px-3 py-2 border-b border-[#eadfce]">
                <p className="text-xs uppercase tracking-[0.08em] text-mata-ink/45">Gerenciar visita</p>
                <h3 className="font-display text-xl text-mata-ink mt-1">Selecione um agendamento</h3>
              </div>

              <div className="flex-1 flex items-center justify-center p-5 text-center">
                <div>
                  <div className="w-12 h-10 rounded-full bg-[#f3e5cf] text-[#9A5B20] flex items-center justify-center mx-auto mb-3 text-xl">
                    ✦
                  </div>
                  <p className="text-sm text-mata-ink/30">
                    Clique em <strong>Gerenciar</strong> em uma visita para visualizar e executar as ações.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-[300px] xl:h-[340px] flex flex-col overflow-y-auto min-h-0">
              <div className="px-3 py-2 border-b border-[#eadfce] flex items-center justify-between sticky top-0 bg-[#fffdfa] z-10">
                <div>
                  <p className="text-xs uppercase tracking-[0.08em] text-mata-ink/20">Gerenciar visita</p>
                  <h3 className="font-display text-xl text-mata-ink mt-1">
                    {gerenciando.nome_lead || gerenciando.contatos?.nome || 'Visita'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setGerenciando(null)}
                  className="w-9 h-9 rounded-full border border-[#eadfce] text-mata-ink/50 hover:bg-[#f8efe3]"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="bg-[#fbf7f0] border border-[#eadfce] rounded-2xl p-4 space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-mata-ink/45">Data e hora</span>
                    <span className="text-mata-ink text-right">{formatarDataHora(gerenciando.data_visita)}</span>
                  </div>

                  <div className="flex justify-between gap-4">
                    <span className="text-mata-ink/45">Tipo</span>
                    <span className="text-mata-ink">
                      {gerenciando.tipo_contato === 'presencial' ? 'Presencial' : 'Videoconferência'}
                    </span>
                  </div>

                  {telClienteGer && (
                    <div className="flex justify-between gap-4">
                      <span className="text-mata-ink/45">Telefone</span>
                      <span className="text-mata-ink">{telClienteGer}</span>
                    </div>
                  )}

                  {respGer && (
                    <div className="flex justify-between gap-4">
                      <span className="text-mata-ink/45">Responsável</span>
                      <span className="text-mata-ink">{respGer.nome}</span>
                    </div>
                  )}

                  <div className="flex justify-between gap-4 items-center">
                    <span className="text-mata-ink/45">Status</span>
                    <span className={`inline-flex text-[11px] px-3 py-1 rounded-full ${STATUS_ESTILO[gerenciando.status || 'agendado'] || 'bg-zinc-100 text-zinc-600'}`}>
                      {gerenciando.convertido
                        ? 'Convertido'
                        : STATUS_LABEL[gerenciando.status || 'agendado']}
                    </span>
                  </div>

                  {gerenciando.observacoes && (
                    <div className="pt-2 border-t border-[#eadfce]">
                      <p className="text-xs text-mata-ink/45 mb-1">Observações</p>
                      <p className="text-mata-ink/70">{gerenciando.observacoes}</p>
                    </div>
                  )}
                </div>

                {(gerenciando.status || 'agendado') !== 'cancelado' && lembreteGer !== 'nenhum' && (
                  <div className="flex gap-2">
                    {['cliente', 'ambos'].includes(lembreteGer) && (
                      <button
                        type="button"
                        onClick={() => enviarLembrete('cliente')}
                        disabled={!telClienteGer}
                        title={telClienteGer ? 'Abrir o WhatsApp com a mensagem pronta' : 'Visita sem telefone'}
                        style={{ opacity: telClienteGer ? 1 : 0.45, cursor: telClienteGer ? 'pointer' : 'not-allowed' }}
                        className="flex-1 px-2 py-2 rounded-lg border border-[#d9b98d] text-[#9A5B20] text-[11px] font-medium hover:bg-[#f8efe3] transition"
                      >
                        Lembrar cliente (WhatsApp)
                      </button>
                    )}
                    {['equipe', 'ambos'].includes(lembreteGer) && (
                      <button
                        type="button"
                        onClick={() => enviarLembrete('equipe')}
                        disabled={!respGer}
                        title={respGer ? 'Abrir o WhatsApp com a mensagem pronta' : 'Visita sem responsável'}
                        style={{ opacity: respGer ? 1 : 0.45, cursor: respGer ? 'pointer' : 'not-allowed' }}
                        className="flex-1 px-2 py-2 rounded-lg border border-[#d9b98d] text-[#9A5B20] text-[11px] font-medium hover:bg-[#f8efe3] transition"
                      >
                        Lembrar {respGer ? respGer.nome : 'responsável'} (WhatsApp)
                      </button>
                    )}
                  </div>
                )}

                {!gerenciando.convertido &&
                  (gerenciando.status || 'agendado') !== 'cancelado' &&
                  (gerenciando.status || 'agendado') !== 'concluido' && (
                    <div className="flex flex-nowrap gap-1 overflow-x-auto">
                      {(gerenciando.status || 'agendado') === 'agendado' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await atualizarStatus(gerenciando, 'confirmado')
                            setGerenciando(null)
                          }}
                          className="flex-1 min-w-0 basis-0 px-1.5 py-2 rounded-lg bg-mata-moss text-white text-[10px] font-medium whitespace-nowrap hover:brightness-105 transition"
                        >
                          ✓ Confirmar
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          const visita = gerenciando
                          setGerenciando(null)
                          abrirReagendar(visita)
                        }}
                        className="flex-1 min-w-0 basis-0 px-1.5 py-2 rounded-lg border border-[#d9b98d] text-[#9A5B20] text-[10px] font-medium whitespace-nowrap hover:bg-[#f8efe3] transition"
                      >
                        Reagendar
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const visita = gerenciando
                          setGerenciando(null)
                          confirmarConversao(visita)
                        }}
                        className="flex-1 min-w-0 basis-0 px-1.5 py-2 rounded-lg border border-[#B8782D] text-[#9A5B20] text-[10px] font-medium whitespace-nowrap hover:bg-[#f8efe3] transition"
                      >
                        Converter
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const visita = gerenciando
                          setGerenciando(null)
                          abrirCancelar(visita)
                        }}
                        className="flex-1 min-w-0 basis-0 px-1.5 py-2 rounded-lg border border-red-300 text-red-600 text-[10px] font-medium whitespace-nowrap hover:bg-red-50 transition"
                      >
                        Cancelar
                      </button>
                    </div>
                  )}

                {gerenciando.convertido && (
                  <button
                    type="button"
                    onClick={async () => {
                      await marcarNaoConvertido(gerenciando)
                      setGerenciando(null)
                    }}
                    className="w-full px-4 py-3 rounded-xl border border-[#eadfce] text-mata-ink/60 text-sm hover:bg-[#f8efe3] transition"
                  >
                    Desfazer conversão
                  </button>
                )}

                {(gerenciando.status || 'agendado') === 'cancelado' && gerenciando.motivo_cancelamento && (
                  <div className="rounded-xl bg-red-50 border border-red-100 p-4">
                    <p className="text-xs uppercase tracking-wide text-red-500">Motivo do cancelamento</p>
                    <p className="text-sm text-red-700 mt-1">{gerenciando.motivo_cancelamento}</p>
                  </div>
                )}

                {gerenciando.motivo_reagendamento && (
                  <div className="rounded-xl bg-[#fbf7f0] border border-[#eadfce] p-4">
                    <p className="text-xs uppercase tracking-wide text-mata-ink/45">Último reagendamento</p>
                    <p className="text-sm text-mata-ink/70 mt-1">{gerenciando.motivo_reagendamento}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>

      {mostrarForm && (
        <div className="fixed inset-0 bg-[#1d120b]/45 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6 z-50">
          <form
            onSubmit={salvar}
            style={{ maxHeight: 'calc(100vh - 32px)', overflowY: 'auto' }}
            className="bg-[#fffdfa] border border-[#eadfce] rounded-2xl p-5 sm:p-6 w-full max-w-md space-y-4 shadow-2xl"
          >
            <h3 className="font-display text-xl">Agendar visita / contato</h3>

            <div>
              <label className="text-xs text-mata-ink/60">Contato já cadastrado (opcional)</label>
              <select
                value={form.contato_id}
                onChange={(e) => selecionarContato(e.target.value)}
                className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm mt-1"
              >
                <option value="">— Novo lead (ainda não cadastrado) —</option>
                {contatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.tipo === 'comprador' ? 'compradora' : 'revendedora'})
                  </option>
                ))}
              </select>
            </div>

            {!form.contato_id && (
              <input
                required
                placeholder="Nome do lead"
                value={form.nome_lead}
                onChange={(e) => setForm({ ...form, nome_lead: e.target.value })}
                className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm"
              />
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="text-xs text-mata-ink/60">Telefone (WhatsApp)</label>
                <input
                  type="tel"
                  inputMode="tel"
                  placeholder="46 99999-9999"
                  value={form.telefone}
                  onChange={(e) => setForm({ ...form, telefone: mascaraTelefone(e.target.value) })}
                  className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm mt-1"
                />
              </div>
              <div>
                <label className="text-xs text-mata-ink/60">Responsável</label>
                <select
                  value={form.responsavel}
                  onChange={(e) => setForm({ ...form, responsavel: e.target.value })}
                  className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm mt-1"
                >
                  <option value="">Selecione</option>
                  {RESPONSAVEIS.map((r) => (
                    <option key={r.nome} value={r.nome}>
                      {r.nome}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs text-mata-ink/60">Data e horário *</label>
              <input
                type="datetime-local"
                required
                value={form.data_visita}
                onChange={(e) => setForm({ ...form, data_visita: e.target.value })}
                className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm mt-1"
              />
            </div>

            <div className="flex gap-2">
              {[
                { v: 'presencial', l: 'Presencial' },
                { v: 'videoconferencia', l: 'Videoconferência' },
              ].map((op) => (
                <label
                  key={op.v}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm border cursor-pointer ${
                    form.tipo_contato === op.v
                      ? 'bg-mata-copper text-white border-mata-copper'
                      : 'border-mata-sand text-mata-ink/60'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={form.tipo_contato === op.v}
                    onChange={() => setForm({ ...form, tipo_contato: op.v })}
                    className="hidden"
                  />
                  {op.l}
                </label>
              ))}
            </div>

            <div>
              <label className="text-xs text-mata-ink/60">Enviar lembrete por WhatsApp para</label>
              <select
                value={form.lembrete_para}
                onChange={(e) => setForm({ ...form, lembrete_para: e.target.value })}
                className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm mt-1"
              >
                <option value="cliente">Cliente/revendedora</option>
                <option value="equipe">Equipe (interno)</option>
                <option value="ambos">Cliente e equipe</option>
                <option value="nenhum">Sem lembrete</option>
              </select>
            </div>

            <textarea
              placeholder="Observações"
              value={form.observacoes}
              onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm"
              rows={3}
            />

            {erroForm && <p className="text-xs text-red-600">{erroForm}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMostrarForm(false)}
                className="px-4 py-2 text-sm text-mata-ink/60"
              >
                Cancelar
              </button>
              <button type="submit" className="px-4 py-2 text-sm bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white rounded-xl shadow-[0_8px_20px_rgba(154,91,32,0.18)] hover:brightness-105 transition">
                Agendar
              </button>
            </div>
          </form>
        </div>
      )}

      {reagendando && (
        <div className="fixed inset-0 bg-[#1d120b]/45 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6 z-50">
          <form onSubmit={confirmarReagendamento} className="bg-[#fffdfa] border border-[#eadfce] rounded-2xl p-5 sm:p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <h3 className="font-display text-xl">Reagendar visita</h3>
            <p className="text-sm text-mata-ink/60">
              {reagendando.nome_lead || reagendando.contatos?.nome} — data atual: {formatarDataHora(reagendando.data_visita)}
            </p>

            <div>
              <label className="text-xs text-mata-ink/60">Nova data e horário *</label>
              <input
                type="datetime-local"
                required
                value={novaDataReagendar}
                onChange={(e) => setNovaDataReagendar(e.target.value)}
                className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm mt-1"
              />
            </div>

            <div>
              <label className="text-xs text-mata-ink/60">Motivo do reagendamento *</label>
              <textarea
                required
                value={motivoReagendar}
                onChange={(e) => setMotivoReagendar(e.target.value)}
                className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm mt-1"
                rows={2}
              />
            </div>

            {erroReagendar && <p className="text-xs text-red-600">{erroReagendar}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setReagendando(null)} className="px-4 py-2 text-sm text-mata-ink/60">
                Voltar
              </button>
              <button type="submit" className="px-4 py-2 text-sm bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white rounded-xl shadow-[0_8px_20px_rgba(154,91,32,0.18)] hover:brightness-105 transition">
                Confirmar reagendamento
              </button>
            </div>
          </form>
        </div>
      )}

      {cancelando && (
        <div className="fixed inset-0 bg-[#1d120b]/45 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6 z-50">
          <form onSubmit={confirmarCancelamento} className="bg-[#fffdfa] border border-[#eadfce] rounded-2xl p-5 sm:p-6 w-full max-w-sm space-y-4 shadow-2xl">
            <h3 className="font-display text-xl">Cancelar visita</h3>
            <p className="text-sm text-mata-ink/60">
              {cancelando.nome_lead || cancelando.contatos?.nome} — {formatarDataHora(cancelando.data_visita)}
            </p>

            <div>
              <label className="text-xs text-mata-ink/60">Motivo do cancelamento *</label>
              <textarea
                required
                value={motivoCancelar}
                onChange={(e) => setMotivoCancelar(e.target.value)}
                className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm mt-1"
                rows={2}
              />
            </div>

            {erroCancelar && <p className="text-xs text-red-600">{erroCancelar}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setCancelando(null)} className="px-4 py-2 text-sm text-mata-ink/60">
                Voltar
              </button>
              <button type="submit" className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl shadow-[0_8px_20px_rgba(220,38,38,0.18)] hover:brightness-105 transition">
                Confirmar cancelamento
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  )
}