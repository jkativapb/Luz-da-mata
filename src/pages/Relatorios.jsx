import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import * as XLSX from 'xlsx'
import { supabase } from '../supabaseClient'
import { formatarMoeda, formatarData } from '../lib/helpers'

function hojeISO() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

function inicioMesISO() {
  const hoje = hojeISO()
  return `${hoje.slice(0, 8)}01`
}

function numero(valor) {
  return Number(valor || 0)
}

// Valor oficial da venda no CRM: soma dos itens da venda.
// A condicional é separada pela situação e nunca entra em Vendido.
function totalVenda(venda, itensPorVenda) {
  return (itensPorVenda[venda.id] || []).reduce((soma, item) => {
    return soma + numero(item.quantidade) * numero(item.valor_unitario)
  }, 0)
}

function exportarRelatorio(dados) {
  const wb = XLSX.utils.book_new()
  const adicionar = (nome, linhas) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), nome.slice(0, 31))
  }
  adicionar('Resumo', [dados.resumo])
  adicionar('Vendas', dados.vendas.map((v) => ({
    Data: formatarData(v.data_venda),
    Cliente: v.contatos?.nome || '',
    Vendedor: v.vendedor_nome || '',
    Situação: v.situacao_pagamento || '',
    Total: totalVenda(v, dados.itensPorVenda),
    Pagamento: v.forma_pagamento || '',
  })))
  adicionar('Clientes', dados.contatos.map((c) => ({
    Nome: c.nome,
    Tipo: c.tipo,
    Cidade: c.cidade || '',
    Telefone: c.telefone || '',
    ÚltimoContato: c.data_ultimo_contato || '',
    PróximoContato: c.data_proximo_contato || '',
    Ativo: c.ativo !== false ? 'Sim' : 'Não',
  })))
  adicionar('Produtos', dados.topProdutos.map((p) => ({ Produto: p.nome, Quantidade: p.quantidade, Valor: p.valor })))
  XLSX.writeFile(wb, `relatorio-luzdamata-${hojeISO()}.xlsx`)
}

export default function Relatorios() {
  const { setPageHeader } = useOutletContext()
  const [inicio, setInicio] = useState(inicioMesISO())
  const [fim, setFim] = useState(hojeISO())
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [dadosBrutos, setDadosBrutos] = useState({ contatos: [], visitas: [], vendas: [], itens: [], produtos: [] })
  const [busca, setBusca] = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState('Todos')
  const [filtroPagamento, setFiltroPagamento] = useState('Todos')
  const [filtroSituacao, setFiltroSituacao] = useState('Todos')
  const [tipoRelatorio, setTipoRelatorio] = useState('vendas')

  useEffect(() => {
    carregar()
  }, [])



  async function carregar() {
    setCarregando(true)
    setErro('')
    const [c, v, ve, i, p] = await Promise.all([
      supabase.from('contatos').select('*').order('nome'),
      supabase.from('visitas').select('*, contatos(nome)').order('data_visita', { ascending: false }),
      supabase.from('vendas').select('*, contatos(nome)').order('data_venda', { ascending: false }),
      supabase.from('itens_venda').select('*'),
      supabase.from('produtos').select('id, nome, categoria'),
    ])
    const falha = [c, v, ve, i, p].find((r) => r.error)
    if (falha) setErro(falha.error.message)
    setDadosBrutos({ contatos: c.data || [], visitas: v.data || [], vendas: ve.data || [], itens: i.data || [], produtos: p.data || [] })
    setCarregando(false)
  }

  const periodoValido = inicio && fim && inicio <= fim
  const relatorio = useMemo(() => {
    const { contatos, visitas, vendas, itens } = dadosBrutos
    const vendasPeriodo = periodoValido
      ? vendas.filter((v) => String(v.data_venda).slice(0, 10) >= inicio && String(v.data_venda).slice(0, 10) <= fim)
      : []
    const visitasPeriodo = periodoValido
      ? visitas.filter((v) => String(v.data_visita).slice(0, 10) >= inicio && String(v.data_visita).slice(0, 10) <= fim)
      : []
    const itensPorVenda = {}
    itens.forEach((i) => { (itensPorVenda[i.venda_id] ||= []).push(i) })

    const vendasValidas = vendasPeriodo.filter((v) => !v.nf_cancelada)
    // Condicionais não entram como venda efetivada.
    const vendasEfetivadas = vendasValidas.filter((v) => v.situacao_pagamento !== 'condicional')
    const totalVendido = vendasEfetivadas.reduce((s, v) => s + totalVenda(v, itensPorVenda), 0)
    const recebido = vendasValidas.filter((v) => v.situacao_pagamento === 'pago').reduce((s, v) => s + totalVenda(v, itensPorVenda), 0)
    const aReceber = vendasValidas.filter((v) => v.situacao_pagamento === 'a_receber').reduce((s, v) => s + totalVenda(v, itensPorVenda), 0)
    const condicionais = vendasValidas.filter((v) => v.situacao_pagamento === 'condicional').reduce((s, v) => s + totalVenda(v, itensPorVenda), 0)
    const convertidas = visitasPeriodo.filter((v) => v.convertido).length
    const taxaConversao = visitasPeriodo.length ? Math.round((convertidas / visitasPeriodo.length) * 100) : 0

    const vendedoresMap = {}
    vendasEfetivadas.forEach((v) => {
      const nome = v.vendedor_nome || 'Sem vendedor'
      vendedoresMap[nome] = (vendedoresMap[nome] || 0) + totalVenda(v, itensPorVenda)
    })
    const porVendedor = Object.entries(vendedoresMap).map(([nome, valor]) => ({ nome, valor })).sort((a, b) => b.valor - a.valor).slice(0, 8)

    const produtoMap = {}
    vendasEfetivadas.forEach((v) => (itensPorVenda[v.id] || []).forEach((i) => {
      const nome = i.produto_nome || 'Produto sem nome'
      produtoMap[nome] ||= { quantidade: 0, valor: 0 }
      produtoMap[nome].quantidade += numero(i.quantidade)
      produtoMap[nome].valor += numero(i.quantidade) * numero(i.valor_unitario)
    }))
    const topProdutos = Object.entries(produtoMap).map(([nome, info]) => ({ nome, ...info })).sort((a, b) => b.valor - a.valor).slice(0, 8)

    const tipos = {}
    contatos.filter((c) => c.ativo !== false).forEach((c) => { tipos[c.tipo] = (tipos[c.tipo] || 0) + 1 })
    const clientesPorTipo = Object.entries(tipos).map(([name, value]) => ({ name, value }))

    const meses = []
    const cursor = new Date(`${inicio}T12:00:00`)
    const limite = new Date(`${fim}T12:00:00`)
    cursor.setDate(1)
    while (cursor <= limite && meses.length < 24) {
      const chave = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`
      const vendasMes = vendasValidas.filter((v) => String(v.data_venda).slice(0, 7) === chave)
      meses.push({
        mes: cursor.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''),
        valor: vendasMes.reduce((s, v) => s + totalVenda(v, itensPorVenda), 0),
      })
      cursor.setMonth(cursor.getMonth() + 1)
    }

    const resumo = { TotalVendido: totalVendido, Recebido: recebido, AReceber: aReceber, Condicionais: condicionais, Vendas: vendasValidas.length, Visitas: visitasPeriodo.length, Conversao: `${taxaConversao}%` }
    return { vendas: vendasValidas, vendasEfetivadas, contatos, visitas: visitasPeriodo, itensPorVenda, totalVendido, recebido, aReceber, condicionais, taxaConversao, porVendedor, topProdutos, clientesPorTipo, meses, resumo }
  }, [dadosBrutos, inicio, fim, periodoValido])

  const { vendas, contatos, visitas, itensPorVenda, topProdutos } = relatorio

  const vendedores = useMemo(
    () => ['Todos', ...Array.from(new Set(relatorio.vendas.map((v) => v.vendedor_nome).filter(Boolean))).sort()],
    [relatorio.vendas]
  )
  const pagamentos = useMemo(
    () => ['Todos', ...Array.from(new Set(relatorio.vendas.map((v) => v.forma_pagamento || '—'))).sort()],
    [relatorio.vendas]
  )
  // Inadimplência: venda a receber com parcela vencida há mais de 60 dias.
  // Consideramos as parcelas registradas; se não houver parcelas, usamos o vencimento
  // da própria venda como fallback.
  function dataRelatorio(valor) {
    if (!valor) return null
    const texto = String(valor).slice(0, 10)
    const [ano, mes, dia] = texto.split('-').map(Number)
    if (!ano || !mes || !dia) return null
    return new Date(ano, mes - 1, dia)
  }

  function diasAtrasoVenda(venda) {
    if (venda.situacao_pagamento !== 'a_receber' || venda.nf_cancelada === true) return 0

    let parcelas = Array.isArray(venda.parcelas_json)
      ? venda.parcelas_json
      : (Array.isArray(venda.parcelas) ? venda.parcelas : [])

    if (!parcelas.length && venda.data_vencimento) {
      parcelas = [{ vencimento: venda.data_vencimento, valor: Number(venda.total || 0) }]
    }

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    return parcelas.reduce((maior, parcela) => {
      const vencimento = dataRelatorio(parcela?.vencimento)
      if (!vencimento) return maior
      vencimento.setHours(0, 0, 0, 0)
      const dias = Math.floor((hoje - vencimento) / 86400000)
      return Math.max(maior, dias)
    }, 0)
  }

  function vendaInadimplente(venda) {
    return diasAtrasoVenda(venda) > 60
  }

  function atendeSituacao(venda, situacao) {
    if (situacao === 'Todos') return true
    if (situacao === 'Inadimplente') return vendaInadimplente(venda)
    return (venda.situacao_pagamento || '—') === situacao
  }

  const situacoes = useMemo(
    () => ['Todos', ...Array.from(new Set([...relatorio.vendas.map((v) => v.situacao_pagamento || '—'), 'Inadimplente'])).sort()],
    [relatorio.vendas]
  )
  const vendasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return relatorio.vendas.filter((v) => {
      const itens = relatorio.itensPorVenda[v.id] || []
      const produtos = itens.map((i) => i.produto_nome || '').join(' ').toLowerCase()
      const texto = `${v.contatos?.nome || ''} ${v.vendedor_nome || ''} ${produtos}`.toLowerCase()
      return (!termo || texto.includes(termo)) &&
        (filtroVendedor === 'Todos' || (v.vendedor_nome || 'Sem vendedor') === filtroVendedor) &&
        (filtroPagamento === 'Todos' || (v.forma_pagamento || '—') === filtroPagamento) &&
        (atendeSituacao(v, filtroSituacao))
    })
  }, [relatorio.vendas, relatorio.itensPorVenda, busca, filtroVendedor, filtroPagamento, filtroSituacao])

  // Os filtros de vendas também devem refletir nos outros relatórios.
  // Ex.: se estiver em "Clientes" e escolher "a_receber", mostramos somente
  // clientes que possuem venda no período com essa situação.
  const vendasQueAtendemFiltros = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    return relatorio.vendas.filter((v) => {
      const itens = relatorio.itensPorVenda[v.id] || []
      const produtos = itens.map((i) => i.produto_nome || '').join(' ').toLowerCase()
      const texto = `${v.contatos?.nome || ''} ${v.vendedor_nome || ''} ${produtos}`.toLowerCase()

      return (!termo || texto.includes(termo)) &&
        (filtroVendedor === 'Todos' || (v.vendedor_nome || 'Sem vendedor') === filtroVendedor) &&
        (filtroPagamento === 'Todos' || (v.forma_pagamento || '—') === filtroPagamento) &&
        (atendeSituacao(v, filtroSituacao))
    })
  }, [relatorio.vendas, relatorio.itensPorVenda, busca, filtroVendedor, filtroPagamento, filtroSituacao])

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const idsComVendasFiltradas = new Set(vendasQueAtendemFiltros.map((v) => v.contato_id).filter(Boolean))

    return relatorio.contatos.filter((c) => {
      const texto = `${c.nome || ''} ${c.telefone || ''} ${c.cidade || ''} ${c.tipo || ''}`.toLowerCase()
      const temFiltroVenda =
        filtroVendedor !== 'Todos' ||
        filtroPagamento !== 'Todos' ||
        filtroSituacao !== 'Todos'

      return (!termo || texto.includes(termo)) &&
        (!temFiltroVenda || idsComVendasFiltradas.has(c.id))
    })
  }, [relatorio.contatos, vendasQueAtendemFiltros, busca, filtroVendedor, filtroPagamento, filtroSituacao])

  const visitasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const idsComVendasFiltradas = new Set(vendasQueAtendemFiltros.map((v) => v.contato_id).filter(Boolean))
    const temFiltroVenda =
      filtroVendedor !== 'Todos' ||
      filtroPagamento !== 'Todos' ||
      filtroSituacao !== 'Todos'

    return relatorio.visitas.filter((v) => {
      const texto = `${v.nome_lead || ''} ${v.contatos?.nome || ''} ${v.responsavel || ''} ${v.tipo_contato || ''}`.toLowerCase()
      return (!termo || texto.includes(termo)) &&
        (!temFiltroVenda || idsComVendasFiltradas.has(v.contato_id))
    })
  }, [relatorio.visitas, vendasQueAtendemFiltros, busca, filtroVendedor, filtroPagamento, filtroSituacao])

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const temFiltroVenda =
      filtroVendedor !== 'Todos' ||
      filtroPagamento !== 'Todos' ||
      filtroSituacao !== 'Todos'

    if (!temFiltroVenda) {
      return topProdutos.filter((p) => !termo || p.nome.toLowerCase().includes(termo))
    }

    const produtosMap = {}
    vendasQueAtendemFiltros.forEach((v) => {
      ;(relatorio.itensPorVenda[v.id] || []).forEach((i) => {
        const nome = i.produto_nome || 'Produto sem nome'
        if (!produtosMap[nome]) produtosMap[nome] = { nome, quantidade: 0, valor: 0 }
        produtosMap[nome].quantidade += numero(i.quantidade)
        produtosMap[nome].valor += numero(i.quantidade) * numero(i.valor_unitario)
      })
    })

    return Object.values(produtosMap)
      .filter((p) => !termo || p.nome.toLowerCase().includes(termo))
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8)
  }, [topProdutos, vendasQueAtendemFiltros, relatorio.itensPorVenda, busca, filtroVendedor, filtroPagamento, filtroSituacao])

  useEffect(() => {
    setPageHeader({
      title: 'Relatórios',
      subtitle: 'Indicadores comerciais e acompanhamento da equipe',
      actions: (
        <button
          type="button"
          onClick={() => exportarRelatorio({ ...relatorio, vendas, contatos, itensPorVenda, topProdutos })}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-[0_8px_20px_rgba(154,91,32,0.20)] hover:brightness-105 transition"
        >
          ⇩ Exportar Excel
        </button>
      ),
    })
    return () => setPageHeader({ title: '', subtitle: '', actions: null })
  }, [setPageHeader, relatorio, vendas, contatos, itensPorVenda, topProdutos])

  const limparFiltros = () => {
    setBusca('')
    setFiltroVendedor('Todos')
    setFiltroPagamento('Todos')
    setFiltroSituacao('Todos')
  }
  const totalFiltrado = vendasFiltradas.reduce((s, v) => s + totalVenda(v, relatorio.itensPorVenda), 0)

  const dadosConversaoMensal = useMemo(() => {
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
    dadosBrutos.visitas.forEach((v) => {
      if (!v.data_visita) return
      const d = new Date(v.data_visita)
      const alvo = porChave[`${d.getFullYear()}-${d.getMonth()}`]
      if (!alvo) return
      alvo.Visitas += 1
      if (v.convertido) alvo.Convertidas += 1
    })
    return meses
  }, [dadosBrutos.visitas])

  if (carregando) return <div className="p-8 text-mata-ink/50 text-sm">Carregando relatórios…</div>



  return (
    <div className="w-full h-full min-h-0 overflow-y-auto pr-1 pb-[5px] text-mata-ink">
      <section className="bg-white/95 border border-[#eadfce] rounded-2xl p-4 md:p-5 shadow-[0_5px_18px_rgba(77,45,18,0.04)]">
        <div className="flex flex-col xl:flex-row xl:items-end gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-full border border-mata-sand rounded-lg px-3 py-2.5 bg-white text-sm" />
              <span className="text-sm text-mata-ink/50">até</span>
              <input type="date" value={fim} onChange={(e) => setFim(e.target.value)} className="w-full border border-mata-sand rounded-lg px-3 py-2.5 bg-white text-sm" />
            </div>
          </div>
          <div className="flex gap-1 flex-wrap">
            <button type="button" onClick={() => { setInicio(hojeISO()); setFim(hojeISO()) }} className="px-4 py-2.5 rounded-lg border border-mata-sand bg-white text-sm">Hoje</button>
            <button type="button" onClick={() => { const d = new Date(); const diff = d.getDay() === 0 ? 6 : d.getDay() - 1; d.setDate(d.getDate() - diff); setInicio(d.toLocaleDateString('en-CA')); setFim(hojeISO()) }} className="px-4 py-2.5 rounded-lg border border-mata-sand bg-white text-sm">Esta semana</button>
            <button type="button" onClick={() => { setInicio(inicioMesISO()); setFim(hojeISO()) }} className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white text-sm">Este mês</button>
            <button type="button" onClick={() => { const d = new Date(); d.setMonth(d.getMonth() - 2); setInicio(new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('en-CA')); setFim(hojeISO()) }} className="px-4 py-2.5 rounded-lg border border-mata-sand bg-white text-sm">Últimos 3 meses</button>
          </div>
        </div>
        {erro && <p className="mt-3 text-sm text-red-600">Não foi possível carregar todos os dados: {erro}</p>}
        {!periodoValido && <p className="mt-3 text-sm text-red-600">Informe um período válido.</p>}
      </section>

      <section className="mt-px bg-white/95 border border-[#eadfce] rounded-2xl p-3 shadow-[0_5px_18px_rgba(77,45,18,0.03)]">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-px bg-[#eadfce] rounded-xl overflow-hidden border border-[#eadfce]">
          {[['vendas','🛒','Vendas','Todas as vendas e situações de pagamento'],['clientes','👥','Clientes','Clientes cadastrados, ativos e inativos'],['visitas','📅','Visitas','Visitas agendadas e convertidas'],['produtos','📦','Produtos','Produtos vendidos e desempenho']].map(([key,icon,title,subtitle])=>(
            <button type="button" key={key} onClick={() => { setTipoRelatorio(key); setBusca(''); setFiltroVendedor('Todos'); setFiltroPagamento('Todos'); setFiltroSituacao('Todos') }} className={`text-left bg-white px-3 py-2 flex items-center gap-2 transition hover:bg-[#fffaf4] ${tipoRelatorio === key ? 'ring-1 ring-inset ring-[#B0673A]' : ''}`}>
              <span className="text-lg">{icon}</span><div><p className={`font-semibold ${tipoRelatorio === key ? 'text-[#A45D28]' : 'text-mata-ink'}`}>{title}</p><p className="text-[11px] text-mata-ink/55 leading-tight">{subtitle}</p></div>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-px bg-white/95 border border-[#eadfce] rounded-2xl px-3 py-2.5 shadow-[0_5px_18px_rgba(77,45,18,0.03)]">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-px bg-[#eadfce] rounded-xl overflow-hidden border border-[#eadfce]">
          <label className="bg-white p-2"><span className="sr-only">Buscar</span><input value={busca} onChange={(e)=>setBusca(e.target.value)} placeholder="Buscar por cliente, vendedor ou produto..." className="w-full border border-mata-sand rounded-lg px-3 py-2 text-sm" /></label>
          <label className="bg-white p-2"><span className="sr-only">Vendedor</span><select value={filtroVendedor} onChange={(e)=>setFiltroVendedor(e.target.value)} className="w-full border border-mata-sand rounded-lg px-3 py-2 text-sm bg-white">{vendedores.map(v=><option key={v}>{v}</option>)}</select></label>
          <label className="bg-white p-2"><span className="sr-only">Pagamento</span><select value={filtroPagamento} onChange={(e)=>setFiltroPagamento(e.target.value)} className="w-full border border-mata-sand rounded-lg px-3 py-2 text-sm bg-white">{pagamentos.map(v=><option key={v}>{v}</option>)}</select></label>
          <label className="bg-white p-2"><span className="sr-only">Situação</span><select value={filtroSituacao} onChange={(e)=>setFiltroSituacao(e.target.value)} className="w-full border border-mata-sand rounded-lg px-3 py-2 text-sm bg-white">{situacoes.map(v=><option key={v}>{v}</option>)}</select></label>
        </div>
        <div className="flex justify-end pt-1.5">
          <button type="button" onClick={limparFiltros} className="text-[11px] text-[#A45D28] hover:underline">Limpar filtros</button>
        </div>
      </section>

      {tipoRelatorio === 'vendas' && <section className="mt-px grid grid-cols-2 md:grid-cols-4 gap-px bg-[#eadfce] rounded-2xl overflow-hidden border border-[#eadfce]">
        {[['Vendido',relatorio.totalVendido],['Recebido',relatorio.recebido],['A receber',relatorio.aReceber],['Condicionais',relatorio.condicionais]].map(([label,value])=><div key={label} className="bg-white px-4 py-3.5"><p className="text-[11px] text-mata-ink/50 uppercase tracking-wide">{label}</p><p className="font-display text-xl text-mata-ink mt-1">{formatarMoeda(value)}</p></div>)}
      </section>}



      <section className="mt-px bg-white/95 border border-[#eadfce] rounded-2xl overflow-hidden shadow-[0_5px_18px_rgba(77,45,18,0.04)] mb-[5px]">
        <div className="px-4 py-3.5 border-b border-[#eadfce] flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div><h3 className="font-display text-xl">{tipoRelatorio === 'vendas' ? 'Vendas do período' : tipoRelatorio === 'clientes' ? 'Clientes do período' : tipoRelatorio === 'visitas' ? 'Visitas do período' : 'Produtos do período'}</h3><p className="text-xs text-mata-ink/50 mt-0.5">{tipoRelatorio === 'vendas' ? `${vendasFiltradas.length} ${vendasFiltradas.length === 1 ? 'venda encontrada' : 'vendas encontradas'}` : tipoRelatorio === 'clientes' ? `${clientesFiltrados.length} clientes encontrados` : tipoRelatorio === 'visitas' ? `${visitasFiltradas.length} visitas encontradas` : `${produtosFiltrados.length} produtos encontrados`}</p></div>
          <div className="flex items-center gap-2">{tipoRelatorio === 'vendas' && <><span className="text-sm text-mata-ink/60">Total filtrado:</span><strong className="text-lg text-[#5C6E4A]">{formatarMoeda(totalFiltrado)}</strong></>}<button type="button" onClick={()=>exportarRelatorio({...relatorio,vendas:vendasFiltradas,contatos,itensPorVenda,topProdutos})} className="ml-2 px-3.5 py-2 rounded-lg border border-[#cfae88] text-[#8d5225] text-sm bg-[#fffaf2]">⇩ Exportar Excel</button></div>
        </div>
        <div className="overflow-auto max-h-[calc(100vh-455px)] min-h-[280px]">
          {tipoRelatorio === 'vendas' && <table className="w-full text-sm min-w-[860px]">
            <thead className="sticky top-0 z-10 bg-[#f8f1e7] text-[10px] uppercase tracking-[0.12em] text-mata-ink/60"><tr className="border-b border-[#eadfce]"><th className="text-left px-4 py-3">Data</th><th className="text-left px-4 py-3">Cliente</th><th className="text-left px-4 py-3">Vendedor</th><th className="text-center px-4 py-3">Produtos</th><th className="text-right px-4 py-3">Valor</th><th className="text-left px-4 py-3">Pagamento</th><th className="text-left px-4 py-3">Situação</th></tr></thead>
            <tbody>{vendasFiltradas.slice(0,100).map(v=>{ const itens=relatorio.itensPorVenda[v.id]||[]; const total=totalVenda(v,relatorio.itensPorVenda); const situacao=v.situacao_pagamento||'—'; const inadimplente=vendaInadimplente(v); const badge=inadimplente?'bg-red-100 text-red-700':situacao==='pago'?'bg-emerald-100 text-emerald-700':situacao==='a_receber'?'bg-blue-100 text-blue-700':situacao==='condicional'?'bg-amber-100 text-amber-700':'bg-gray-100 text-gray-600'; return <tr key={v.id} className="border-b border-[#f0e6d9] last:border-0 hover:bg-[#fffaf4]"><td className="px-4 py-3 whitespace-nowrap">{formatarData(v.data_venda)}</td><td className="px-4 py-3 font-medium">{v.contatos?.nome||'—'}</td><td className="px-4 py-3">{v.vendedor_nome||'—'}</td><td className="px-4 py-3 text-center">{itens.reduce((s,i)=>s+numero(i.quantidade),0)}</td><td className="px-4 py-3 text-right font-medium whitespace-nowrap">{formatarMoeda(total)}</td><td className="px-4 py-3">{v.forma_pagamento||'—'}</td><td className="px-4 py-3"><span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${badge}`}>{situacao.replace('_',' ')}</span></td></tr> })}{!vendasFiltradas.length && <tr><td colSpan="7" className="py-12 text-center text-mata-ink/40">Nenhuma venda encontrada com os filtros selecionados.</td></tr>}</tbody>
          </table>}
          {tipoRelatorio === 'clientes' && <table className="w-full text-sm min-w-[760px]"><thead className="sticky top-0 z-10 bg-[#f8f1e7] text-[10px] uppercase tracking-[0.12em] text-mata-ink/60"><tr><th className="text-left px-4 py-3">Nome</th><th className="text-left px-4 py-3">Tipo</th><th className="text-left px-4 py-3">Cidade</th><th className="text-left px-4 py-3">Telefone</th><th className="text-left px-4 py-3">Último contato</th><th className="text-left px-4 py-3">Status</th></tr></thead><tbody>{clientesFiltrados.map(c=><tr key={c.id} className="border-b border-[#f0e6d9]"><td className="px-4 py-3 font-medium">{c.nome}</td><td className="px-4 py-3">{c.tipo||'—'}</td><td className="px-4 py-3">{c.cidade||'—'}</td><td className="px-4 py-3">{c.telefone||'—'}</td><td className="px-4 py-3">{c.data_ultimo_contato ? formatarData(c.data_ultimo_contato) : '—'}</td><td className="px-4 py-3">{c.ativo === false ? 'Inativo' : 'Ativo'}</td></tr>)}</tbody></table>}
          {tipoRelatorio === 'visitas' && <table className="w-full text-sm min-w-[760px]"><thead className="sticky top-0 z-10 bg-[#f8f1e7] text-[10px] uppercase tracking-[0.12em] text-mata-ink/60"><tr><th className="text-left px-4 py-3">Data</th><th className="text-left px-4 py-3">Lead / Cliente</th><th className="text-left px-4 py-3">Responsável</th><th className="text-left px-4 py-3">Tipo</th><th className="text-left px-4 py-3">Status</th></tr></thead><tbody>{visitasFiltradas.map(v=><tr key={v.id} className="border-b border-[#f0e6d9]"><td className="px-4 py-3">{formatarData(v.data_visita)}</td><td className="px-4 py-3 font-medium">{v.nome_lead||v.contatos?.nome||'—'}</td><td className="px-4 py-3">{v.responsavel||'—'}</td><td className="px-4 py-3">{v.tipo_contato||'—'}</td><td className="px-4 py-3">{v.convertido ? 'Convertida' : (v.status||'Agendada')}</td></tr>)}</tbody></table>}
          {tipoRelatorio === 'produtos' && <table className="w-full text-sm min-w-[600px]"><thead className="sticky top-0 z-10 bg-[#f8f1e7] text-[10px] uppercase tracking-[0.12em] text-mata-ink/60"><tr><th className="text-left px-4 py-3">Produto</th><th className="text-center px-4 py-3">Quantidade</th><th className="text-right px-4 py-3">Faturamento</th></tr></thead><tbody>{produtosFiltrados.map(p=><tr key={p.nome} className="border-b border-[#f0e6d9]"><td className="px-4 py-3 font-medium">{p.nome}</td><td className="px-4 py-3 text-center">{p.quantidade}</td><td className="px-4 py-3 text-right font-medium">{formatarMoeda(p.valor)}</td></tr>)}</tbody></table>}
        </div>
        <div className="px-4 py-3 border-t border-[#eadfce] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-[#fffdf9]"><span className="text-sm text-mata-ink/60">{tipoRelatorio === 'vendas' ? `Mostrando ${Math.min(vendasFiltradas.length,100)} de ${vendasFiltradas.length} vendas` : tipoRelatorio === 'clientes' ? `${clientesFiltrados.length} clientes` : tipoRelatorio === 'visitas' ? `${visitasFiltradas.length} visitas` : `${produtosFiltrados.length} produtos`}</span>{tipoRelatorio === 'vendas' && <span className="text-sm"><strong>{formatarMoeda(totalFiltrado)}</strong> no período</span>}</div>
      </section>
    </div>
  )

}
