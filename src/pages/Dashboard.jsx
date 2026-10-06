import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { supabase } from '../supabaseClient'
import { formatarMoeda, diasDesde, formatarData, categoriaRelacionamento, LABEL_CATEGORIA } from '../lib/helpers'
import { exportarParaExcel } from '../lib/excel'

const CORES = ['#B0673A', '#C9A15A', '#5C6E4A', '#8C5A3C', '#3B2417']

const ESTILO_CATEGORIA = {
  em_dia: { emoji: '🟢', cor: 'text-mata-moss', bg: 'bg-mata-moss/10' },
  atencao: { emoji: '🟡', cor: 'text-amber-600', bg: 'bg-amber-50' },
  precisa_contato: { emoji: '🔴', cor: 'text-red-600', bg: 'bg-red-50' },
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { setPageHeader } = useOutletContext()
  const [carregando, setCarregando] = useState(true)
  const [contatos, setContatos] = useState([])
  const [visitas, setVisitas] = useState([])
  const [vendas, setVendas] = useState([])
  const [itensPorVenda, setItensPorVenda] = useState({})
  const [categoriaPorProduto, setCategoriaPorProduto] = useState({})
  const [metaMes, setMetaMes] = useState(null)
  const [categoriaAberta, setCategoriaAberta] = useState(null) // 'em_dia' | 'atencao' | 'precisa_contato' | null
  const [retornosAbertos, setRetornosAbertos] = useState(false)

  useEffect(() => {
    carregar()
  }, [])

  useEffect(() => {
    setPageHeader({
      title: 'Dashboard',
      subtitle: 'Visão geral do seu negócio',
      actions: (
        <button
          onClick={() => exportarParaExcel({ contatos, visitas, vendas, itensPorVenda })}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-[0_8px_20px_rgba(154,91,32,0.20)] hover:brightness-105 transition"
        >
          <span aria-hidden="true">⇩</span>
          Exportar para Excel
        </button>
      ),
    })

    return () => setPageHeader({ title: '', subtitle: '', actions: null })
  }, [setPageHeader, contatos, visitas, vendas, itensPorVenda])

  async function carregar() {
    setCarregando(true)
    const { data: cData } = await supabase.from('contatos').select('*')
    const { data: vData } = await supabase.from('visitas').select('*, contatos(nome)').order('data_visita', { ascending: false })
    const { data: vendaData } = await supabase.from('vendas').select('*, contatos(nome)').order('data_venda', { ascending: false })
    const { data: iData } = await supabase.from('itens_venda').select('*')
    const { data: prodData } = await supabase.from('produtos').select('id, categoria')

    const catPorProduto = {}
    ;(prodData || []).forEach((p) => {
      catPorProduto[p.id] = p.categoria || 'Outros'
    })

    const primeiroDiaMes = new Date()
    primeiroDiaMes.setDate(1)
    const mesISO = primeiroDiaMes.toISOString().slice(0, 10)
    const { data: metaData } = await supabase
      .from('metas_mensais')
      .select('valor_meta')
      .eq('mes', mesISO)
      .maybeSingle()
    setMetaMes(metaData?.valor_meta ?? null)

    const agrupado = {}
    ;(iData || []).forEach((i) => {
      if (!agrupado[i.venda_id]) agrupado[i.venda_id] = []
      agrupado[i.venda_id].push(i)
    })

    setContatos(cData || [])
    setVisitas(vData || [])
    setVendas(vendaData || [])
    setItensPorVenda(agrupado)
    setCategoriaPorProduto(catPorProduto)
    setCarregando(false)
  }

  if (carregando) return <div className="p-8 text-mata-ink/50 text-sm">Carregando…</div>

  // -------- filtro base: relacionamento considera SÓ contatos ativos hoje --------
  const contatosAtivos = contatos.filter((c) => c.ativo !== false)
  const idsAtivos = new Set(contatosAtivos.map((c) => c.id))
  const visitasAtivas = visitas.filter((v) => !v.contato_id || idsAtivos.has(v.contato_id))
  const vendasAtivasHoje = vendas.filter((v) => idsAtivos.has(v.contato_id))

  // -------- filtro para indicadores financeiros: conta vendas de contatos
  // ativos normalmente, e de contatos inativos até a data em que ficaram
  // inativos (vendas feitas antes da desativação continuam no histórico) --------
  const contatosPorId = {}
  contatos.forEach((c) => {
    contatosPorId[c.id] = c
  })

  function vendaContaNoHistorico(v) {
    const c = contatosPorId[v.contato_id]
    if (!c) return false
    if (c.ativo !== false) return true
    if (!c.data_inativacao) return false // inativo sem data registrada: não conta, por segurança
    return new Date(v.data_venda) <= new Date(c.data_inativacao)
  }

  const vendasParaIndicadores = vendas.filter(vendaContaNoHistorico)

  // -------- cálculos financeiros (contatos ativos + inativos até a data de inativação) --------
  // Datas de negócio são tratadas como datas locais (YYYY-MM-DD), sem conversão UTC.
  // Isso evita que uma venda de setembro apareça indevidamente em agosto.
  function dataLocal(valor) {
    if (!valor) return null
    const texto = String(valor).slice(0, 10)
    const [ano, mes, dia] = texto.split('-').map(Number)
    if (!ano || !mes || !dia) return null
    return new Date(ano, mes - 1, dia)
  }

  function chaveMes(data) {
    const d = dataLocal(data)
    return d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` : null
  }

  function rotuloMes(chave) {
    const [ano, mes] = chave.split('-').map(Number)
    return new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '')
  }

  function totalVenda(venda) {
    const itens = itensPorVenda[venda.id] || []
    return itens.reduce(
      (soma, item) => soma + Number(item.quantidade || 0) * Number(item.valor_unitario || 0),
      0
    )
  }

  const hoje = new Date()
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1)

  let rendaAcumulada = 0
  let rendaMes = 0
  let totalRecebido = 0
  let totalAReceber = 0
  let totalCondicional = 0
  const vendasPorMes = {}
  const vendedorTotais = {}

  vendasParaIndicadores.forEach((v) => {
    const totalVendaAtual = totalVenda(v)
    const dataVenda = dataLocal(v.data_venda)

    // Venda efetivada = tudo que NÃO está em condicional.
    // Renda acumulada: todas as vendas efetivadas, independentemente de já terem sido pagas.
    if (v.situacao_pagamento !== 'condicional') {
      rendaAcumulada += totalVendaAtual

      // Renda do mês: vendas efetivadas realizadas no mês atual.
      if (dataVenda && dataVenda >= inicioMes) {
        rendaMes += totalVendaAtual
      }

      const mes = chaveMes(v.data_venda)
      if (mes) vendasPorMes[mes] = (vendasPorMes[mes] || 0) + totalVendaAtual

      const nomeVendedor = v.vendedor_nome || 'Não informado'
      if (!vendedorTotais[nomeVendedor]) vendedorTotais[nomeVendedor] = { total: 0, vendas: 0 }
      vendedorTotais[nomeVendedor].total += totalVendaAtual
      vendedorTotais[nomeVendedor].vendas += 1
    }

    // Financeiro separado por situação de pagamento.
    if (v.situacao_pagamento === 'pago') {
      totalRecebido += totalVendaAtual
    } else if (v.situacao_pagamento === 'a_receber') {
      totalAReceber += totalVendaAtual
    } else if (v.situacao_pagamento === 'condicional') {
      totalCondicional += totalVendaAtual
    }
  })

  // Sempre mostra os 6 meses correntes, inclusive meses sem venda.
  const graficoMensal = Array.from({ length: 6 }, (_, indice) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - indice), 1)
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { mes: rotuloMes(chave), total: vendasPorMes[chave] || 0 }
  })

  const vendasPorVendedor = Object.entries(vendedorTotais)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 6)
    .map(([nome, dados]) => ({ nome, total: dados.total, vendas: dados.vendas }))

  // -------- vendas por categoria de produto (quantidade de itens) --------
  const categoriaQtd = {}
  let totalItensVendidos = 0
  vendasParaIndicadores.forEach((v) => {
    const itens = itensPorVenda[v.id] || []
    itens.forEach((i) => {
      const cat = (i.produto_id && categoriaPorProduto[i.produto_id]) || 'Outros'
      categoriaQtd[cat] = (categoriaQtd[cat] || 0) + i.quantidade
      totalItensVendidos += i.quantidade
    })
  })
  const vendasPorCategoria = Object.entries(categoriaQtd)
    .sort((a, b) => b[1] - a[1])
    .map(([categoria, qtd]) => ({
      categoria,
      qtd,
      pct: totalItensVendidos ? Math.round((qtd / totalItensVendidos) * 100) : 0,
    }))

  // -------- meta x realizado --------
  const percentualMeta = metaMes ? Math.min(100, Math.round((rendaMes / metaMes) * 100)) : null

  // -------- vendas condicionais --------
  const vendasCondicionais = vendasParaIndicadores.filter((v) => v.situacao_pagamento === 'condicional')
  const produtosEmAvaliacao = vendasCondicionais.reduce((total, v) => {
    const itens = itensPorVenda[v.id] || []
    return total + itens.reduce((s, i) => s + Number(i.quantidade || 0), 0)
  }, 0)
  const hojeData = dataLocal(new Date().toISOString().slice(0, 10))
  const fimSemana = hojeData ? new Date(hojeData.getFullYear(), hojeData.getMonth(), hojeData.getDate() + 7) : null
  const condicionaisRetornoSemana = vendasCondicionais
    .map((v) => ({
      ...v,
      dataRetorno: dataLocal(v.data_retorno_condicional || v.data_retorno),
    }))
    .filter((v) => v.dataRetorno && hojeData && fimSemana && v.dataRetorno >= hojeData && v.dataRetorno <= fimSemana)
    .sort((a, b) => a.dataRetorno - b.dataRetorno)

  const retornosSemana = condicionaisRetornoSemana.length
  // -------- contas a receber / inadimplência --------
  const contasReceber = []
  vendasParaIndicadores
    .filter((v) => v.situacao_pagamento === 'a_receber' && v.nf_cancelada !== true)
    .forEach((v) => {
      const cliente = contatosPorId[v.contato_id]?.nome || v.contatos?.nome || 'Cliente não informado'
      let parcelas = Array.isArray(v.parcelas_json) ? v.parcelas_json : (Array.isArray(v.parcelas) ? v.parcelas : [])
      if (!parcelas.length && v.data_vencimento) parcelas = [{ valor: Number(v.total || 0), vencimento: v.data_vencimento }]
      parcelas.forEach((parcela, index) => {
        const vencimento = dataLocal(parcela.vencimento)
        const valor = Number(parcela.valor || 0)
        if (valor > 0 && vencimento) contasReceber.push({ venda: v, cliente, parcela, index, valor, vencimento })
      })
    })

  const contasEmAtraso = contasReceber.filter((c) => c.vencimento < hojeData)
  const contasAVencer = contasReceber.filter((c) => c.vencimento >= hojeData)
  const totalEmAtraso = contasEmAtraso.reduce((s, c) => s + c.valor, 0)
  const totalAVencer = contasAVencer.reduce((s, c) => s + c.valor, 0)
  const recebidoNoMes = vendasParaIndicadores
    .filter((v) => v.situacao_pagamento === 'pago' && dataLocal(v.data_pagamento || v.data_venda)?.getMonth() === hoje.getMonth() && dataLocal(v.data_pagamento || v.data_venda)?.getFullYear() === hoje.getFullYear())
    .reduce((total, v) => total + (itensPorVenda[v.id] || []).reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0), 0), 0)

  // -------- relacionamento: último contato real do cadastro --------
  // O Dashboard deve usar a data registrada no cadastro do cliente como
  // referência principal. Visitas e vendas ficam apenas como fallback para
  // clientes antigos que ainda não possuem a data gravada no cadastro.
  const ultimoContato = {}

  function dataValida(valor) {
    if (!valor) return null
    const texto = String(valor).slice(0, 10)
    const [ano, mes, dia] = texto.split('-').map(Number)
    if (!ano || !mes || !dia) return null
    const data = new Date(ano, mes - 1, dia)
    return Number.isNaN(data.getTime()) ? null : data
  }

  function dataUltimoContatoCadastro(c) {
    // Mantemos algumas variações para compatibilidade com versões anteriores
    // do cadastro/banco, sem exigir alteração em outras telas.
    const campos = [
      'ultimo_contato',
      'data_ultimo_contato',
      'ultimoContato',
      'dataUltimoContato',
      'data_contato',
      'dataContato',
    ]

    for (const campo of campos) {
      const data = dataValida(c?.[campo])
      if (data) return data
    }

    return null
  }

  // Primeiro: data de último contato salva diretamente no cadastro.
  contatosAtivos.forEach((c) => {
    const data = dataUltimoContatoCadastro(c)
    if (data) ultimoContato[c.id] = data
  })

  // Fallback: para cadastros antigos sem a data no próprio contato,
  // considera a atividade mais recente de visita ou venda.
  ;[...visitasAtivas.filter((v) => v.contato_id), ...vendasAtivasHoje].forEach((r) => {
    const data = dataValida(r.data_visita || r.data_venda)
    const id = r.contato_id
    if (!data || ultimoContato[id]) return
    ultimoContato[id] = data
  })

  // Regra do giro de carteira integrada ao PRÓXIMO CONTATO:
  // - mais de 5 dias até o próximo contato = EM DIA
  // - faltando 5 dias ou menos = ATENÇÃO
  // - passou da data marcada = PRECISA DE CONTATO
  //
  // Se o cliente não tiver próximo contato agendado, usamos o último contato
  // como fallback para não perder clientes antigos da carteira.
  const porCategoria = { em_dia: [], atencao: [], precisa_contato: [] }

  function proximoContato(c) {
    return dataValida(c?.data_proximo_contato)
  }

  contatosAtivos.forEach((c) => {
    const ultimo = ultimoContato[c.id]
    const proximo = proximoContato(c)
    const diasAteProximo = proximo
      ? Math.floor((proximo - hojeData) / 86400000)
      : null
    const diasDesdeUltimo = ultimo
      ? Math.max(0, Math.floor((hojeData - ultimo) / 86400000))
      : null

    // Quando existe próximo contato, ele passa a ser a referência principal.
    if (diasAteProximo !== null) {
      if (diasAteProximo < 0) {
        // A data marcada já passou.
        porCategoria.precisa_contato.push(c)
      } else if (diasAteProximo <= 5) {
        // Faltam 5 dias ou menos para o retorno.
        porCategoria.atencao.push(c)
      } else {
        // Ainda faltam mais de 5 dias.
        porCategoria.em_dia.push(c)
      }
    } else if (diasDesdeUltimo !== null && diasDesdeUltimo < 5) {
      // Sem próximo contato cadastrado: fallback pelo último contato.
      porCategoria.atencao.push(c)
    } else {
      porCategoria.precisa_contato.push(c)
    }
  })

  // lista "precisa de contato" ordenada pelo maior número de dias sem contato primeiro
  // (nunca contatado conta como o maior atraso possível)
  function ordenarPorDiasDesc(lista) {
    return [...lista].sort((a, b) => {
      const diasA = diasDesde(ultimoContato[a.id])
      const diasB = diasDesde(ultimoContato[b.id])
      if (diasA === null && diasB === null) return 0
      if (diasA === null) return -1
      if (diasB === null) return 1
      return diasB - diasA
    })
  }

  const listaCategoriaAberta = categoriaAberta
    ? categoriaAberta === 'precisa_contato'
      ? ordenarPorDiasDesc(porCategoria[categoriaAberta])
      : porCategoria[categoriaAberta]
    : []

  function verCliente(id) {
    setCategoriaAberta(null)
    navigate('/cadastro', { state: { editarContatoId: id } })
  }

  function registrarContato(id) {
    setCategoriaAberta(null)
    navigate('/visitas', { state: { novoContatoId: id } })
  }

  return (
    <div className="w-full pt-px pb-3 space-y-[1px]">
      {/* Indicadores financeiros principais */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-[5px]">
        <div className="group bg-white/90 border border-[#eadfce] rounded-2xl px-3 py-2 shadow-[0_8px_24px_rgba(77,45,18,0.05)] flex items-center gap-2 min-h-[64px]">
          <div className="w-9 h-9 rounded-xl bg-[#f5ecdd] text-[#9A5B20] flex items-center justify-center text-lg shrink-0">◉</div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.06em] text-mata-ink/55 truncate">Renda acumulada</p>
            <p className="font-display text-xl lg:text-2xl text-mata-ink leading-tight mt-0.5 truncate">{formatarMoeda(rendaAcumulada)}</p>
          </div>
        </div>

        <div className="group bg-white/90 border border-[#eadfce] rounded-2xl px-3 py-2 shadow-[0_8px_24px_rgba(77,45,18,0.05)] flex items-center gap-2 min-h-[64px]">
          <div className="w-9 h-9 rounded-xl bg-[#f5ecdd] text-[#9A5B20] flex items-center justify-center text-lg shrink-0">▥</div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.06em] text-mata-ink/55 truncate">Renda do mês</p>
            <p className="font-display text-xl lg:text-2xl text-mata-ink leading-tight mt-0.5 truncate">{formatarMoeda(rendaMes)}</p>
          </div>
        </div>

        <div className="group bg-white/90 border border-[#eadfce] rounded-2xl px-3 py-2 shadow-[0_8px_24px_rgba(77,45,18,0.05)] flex items-center gap-2 min-h-[64px]">
          <div className="w-9 h-9 rounded-xl bg-green-50 text-green-700 flex items-center justify-center text-lg shrink-0">✓</div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.06em] text-mata-ink/55 truncate">Recebido</p>
            <p className="font-display text-xl lg:text-2xl text-green-700 leading-tight mt-0.5 truncate">{formatarMoeda(totalRecebido)}</p>
          </div>
        </div>

        <div className="group bg-white/90 border border-[#eadfce] rounded-2xl px-3 py-2 shadow-[0_8px_24px_rgba(77,45,18,0.05)] flex items-center gap-2 min-h-[64px]">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-lg shrink-0">◷</div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.06em] text-mata-ink/55 truncate">A receber</p>
            <p className="font-display text-xl lg:text-2xl text-amber-700 leading-tight mt-0.5 truncate">{formatarMoeda(totalAReceber)}</p>
          </div>
        </div>

        <button
          onClick={() => navigate('/vendas')}
          className="group bg-white/90 border border-[#eadfce] rounded-2xl px-3 py-2 shadow-[0_8px_24px_rgba(77,45,18,0.05)] flex items-center gap-2 min-h-[64px] text-left hover:shadow-[0_10px_26px_rgba(77,45,18,0.08)] transition-all"
        >
          <div className="w-9 h-9 rounded-xl bg-[#f5ecdd] text-[#9A5B20] flex items-center justify-center text-lg shrink-0">♧</div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.06em] text-mata-ink/55 truncate">Condicionais</p>
            <p className="font-display text-xl lg:text-2xl text-mata-ink leading-tight mt-0.5 truncate">{formatarMoeda(totalCondicional)}</p>
          </div>
        </button>
      </section>

      {/* Giro de carteira + indicadores de condicionais — mesma linha */}
      <section className="grid grid-cols-1 sm:grid-cols-5 gap-[5px]">
        {['em_dia', 'atencao', 'precisa_contato'].map((cat) => {
          const estilo = ESTILO_CATEGORIA[cat]
          const icone = cat === 'em_dia' ? '♟' : cat === 'atencao' ? '!' : '☎'
          const descricao =
            cat === 'em_dia'
              ? 'clientes ativos'
              : cat === 'atencao'
                ? 'sem compra recente'
                : 'contatos pendentes'

          return (
            <button
              key={cat}
              onClick={() => setCategoriaAberta(cat)}
              className="group text-left bg-white/90 border border-[#eadfce] rounded-2xl px-3 py-2 shadow-[0_7px_22px_rgba(77,45,18,0.04)] hover:shadow-[0_10px_26px_rgba(77,45,18,0.08)] transition-all flex items-center gap-2 min-h-[58px]"
            >
              <div className="w-9 h-9 rounded-xl bg-[#f5ecdd] text-[#9A5B20] flex items-center justify-center text-base shrink-0">
                {icone}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-[0.05em] text-mata-ink/55 flex items-center gap-1">
                  <span>{estilo.emoji}</span>
                  {LABEL_CATEGORIA[cat]}
                </p>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <p className={`font-display text-xl leading-none ${estilo.cor}`}>{porCategoria[cat].length}</p>
                  <span className="text-[10px] text-mata-ink/55 truncate">{descricao}</span>
                </div>
              </div>
              <span className="text-[#9A5B20] text-xl opacity-70 group-hover:translate-x-1 transition-transform">›</span>
            </button>
          )
        })}

        <button
          onClick={() => setRetornosAbertos(true)}
          className="group text-left bg-white/90 border border-[#eadfce] rounded-2xl px-3 py-2 shadow-[0_7px_22px_rgba(77,45,18,0.04)] hover:shadow-[0_10px_26px_rgba(77,45,18,0.08)] transition-all flex items-center gap-2 min-h-[58px]"
        >
          <div className="w-9 h-9 rounded-xl bg-[#f5ecdd] text-[#9A5B20] flex items-center justify-center text-base shrink-0">▣</div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.05em] text-mata-ink/55">Produtos em avaliação</p>
            <p className="font-display text-xl leading-none text-mata-ink mt-0.5">{produtosEmAvaliacao}</p>
          </div>
          <span className="text-[#9A5B20] text-xl opacity-70 group-hover:translate-x-1 transition-transform">›</span>
        </button>

        <button
          onClick={() => navigate('/vendas')}
          className="group text-left bg-white/90 border border-[#eadfce] rounded-2xl px-3 py-2 shadow-[0_7px_22px_rgba(77,45,18,0.04)] hover:shadow-[0_10px_26px_rgba(77,45,18,0.08)] transition-all flex items-center gap-2 min-h-[58px]"
        >
          <div className="w-9 h-9 rounded-xl bg-[#f5ecdd] text-[#9A5B20] flex items-center justify-center text-base shrink-0">▣</div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.05em] text-mata-ink/55">Retornos esta semana</p>
            <p className="font-display text-xl leading-none text-mata-ink mt-0.5">{retornosSemana}</p>
          </div>
          <span className="text-[#9A5B20] text-xl opacity-70 group-hover:translate-x-1 transition-transform">›</span>
        </button>
      </section>

      {/* Gráficos principais */}
      <section className="grid grid-cols-1 xl:grid-cols-[642fr_587fr] gap-[5px]">
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl p-4 shadow-[0_10px_30px_rgba(77,45,18,0.05)] xl:h-[205px] flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-3">
              <span className="text-[#9A5B20] text-xl">▥</span>
              <h3 className="font-display text-xl text-mata-ink">Vendas por mês</h3>
            </div>
            <span className="hidden sm:inline-flex border border-[#eadfce] rounded-xl px-2.5 py-1 text-[11px] text-mata-ink/65 bg-[#fbf7f0]">Últimos 6 meses</span>
          </div>

          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <BarChart data={graficoMensal} margin={{ top: 6, right: 6, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDE3D3" vertical={false} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#59483A' }} axisLine={{ stroke: '#D9C7AE' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#59483A' }} width={55} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v) => formatarMoeda(v)} />
                <Bar dataKey="total" fill="#A96A26" radius={[6, 6, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white/90 border border-[#eadfce] rounded-2xl p-4 shadow-[0_10px_30px_rgba(77,45,18,0.05)] xl:h-[205px] flex flex-col">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-3">
              <span className="text-[#9A5B20] text-xl">◎</span>
              <h3 className="font-display text-xl text-mata-ink">Meta x realizado</h3>
            </div>
            <span className="hidden sm:inline-flex border border-[#eadfce] rounded-xl px-2.5 py-1 text-[11px] text-mata-ink/65 bg-[#fbf7f0]">
              {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
            </span>
          </div>

          {metaMes === null ? (
            <div className="flex-1 flex items-center justify-center text-sm text-mata-ink/40 text-center px-4">
              <div>
                <p>Meta não definida para este mês.</p>
                <p className="mt-1">Cadastre em <code className="text-xs bg-mata-sand/50 px-1 rounded">metas_mensais</code> no Supabase.</p>
              </div>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_110px] gap-2 items-center min-h-0">
              <div className="grid grid-cols-2 gap-5 h-[105px] items-end px-1">
                <div className="h-full flex flex-col justify-end items-center gap-1.5">
                  <p className="font-display text-base text-mata-ink">{formatarMoeda(metaMes)}</p>
                  <div className="w-full max-w-[62px] bg-[#e9ddcb] rounded-t-lg" style={{ height: '45%' }} />
                  <p className="text-[11px] text-mata-ink/60">Meta</p>
                </div>
                <div className="h-full flex flex-col justify-end items-center gap-1.5">
                  <p className="font-display text-base text-mata-ink">{formatarMoeda(rendaMes)}</p>
                  <div
                    className="w-full max-w-[62px] bg-gradient-to-t from-[#8d521e] to-[#b97a2e] rounded-t-lg"
                    style={{ height: `${Math.max(5, Math.min(45, (rendaMes / metaMes) * 45))}%` }}
                  />
                  <p className="text-[11px] text-mata-ink/60">Realizado</p>
                </div>
              </div>

              <div className="border-l border-[#eadfce] pl-3 text-center sm:text-left">
                <p className="font-display text-3xl text-[#9A5B20] leading-none">{percentualMeta}%</p>
                <p className="text-[11px] text-mata-ink/60 mt-1">da meta alcançada</p>
                <div className="h-1.5 bg-[#eee4d5] rounded-full mt-2 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-[#8d521e] to-[#c18a3d] rounded-full" style={{ width: `${percentualMeta}%` }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Vendedores + contas a receber */}
      <section className="grid grid-cols-1 xl:grid-cols-[642fr_587fr] gap-[5px]">
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl p-4 shadow-[0_10px_30px_rgba(77,45,18,0.05)] xl:h-[235px] overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-3">
              <span className="text-[#9A5B20] text-xl">♟</span>
              <h3 className="font-display text-xl text-mata-ink">Vendas por vendedor</h3>
            </div>
            <span className="hidden sm:inline-flex border border-[#eadfce] rounded-xl px-2.5 py-1 text-[11px] text-mata-ink/65 bg-[#fbf7f0]">Todos os períodos</span>
          </div>
          {vendasPorVendedor.length === 0 ? (
            <div className="h-[125px] flex items-center justify-center text-sm text-mata-ink/40 text-center px-4">Ainda não há vendas atribuídas a vendedores.</div>
          ) : (
            <div className="h-[165px] min-h-0 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vendasPorVendedor} layout="vertical" margin={{ top: 0, right: 12, left: 8, bottom: 0 }} barCategoryGap="18%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#EDE3D3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#59483A' }} axisLine={{ stroke: '#D9C7AE' }} tickLine={false} />
                  <YAxis type="category" dataKey="nome" width={92} tick={{ fontSize: 11, fill: '#59483A' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => formatarMoeda(v)} labelFormatter={(label) => `Vendedor: ${label}`} />
                  <Bar dataKey="total" name="Valor vendido" fill="#A96A26" radius={[0, 6, 6, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white/90 border border-[#eadfce] rounded-2xl p-4 shadow-[0_10px_30px_rgba(77,45,18,0.05)] xl:h-[235px] overflow-hidden">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-3">
              <span className="text-[#9A5B20] text-xl">◷</span>
              <h3 className="font-display text-xl text-mata-ink">Contas a receber</h3>
            </div>
            <span className="border border-[#eadfce] rounded-xl px-2.5 py-1 text-[11px] text-mata-ink/65 bg-[#fbf7f0]">Inadimplência</span>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-xl bg-red-50/80 border border-red-100 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-red-700/70">Em atraso</p>
              <p className="font-display text-lg text-red-700 leading-tight">{formatarMoeda(totalEmAtraso)}</p>
              <p className="text-[10px] text-red-700/60">{contasEmAtraso.length} parcela(s)</p>
            </div>
            <div className="rounded-xl bg-amber-50/80 border border-amber-100 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-amber-700/70">A vencer</p>
              <p className="font-display text-lg text-amber-700 leading-tight">{formatarMoeda(totalAVencer)}</p>
              <p className="text-[10px] text-amber-700/60">{contasAVencer.length} parcela(s)</p>
            </div>
            <div className="rounded-xl bg-green-50/80 border border-green-100 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-green-700/70">Recebido no mês</p>
              <p className="font-display text-lg text-green-700 leading-tight">{formatarMoeda(recebidoNoMes)}</p>
              <p className="text-[10px] text-green-700/60">pagamentos</p>
            </div>
          </div>

          <div className="border-t border-[#eadfce] pt-2.5 space-y-1.5 max-h-[76px] overflow-y-auto pr-1">
            {contasEmAtraso.slice(0, 4).map((c) => (
              <div key={`${c.venda.id}-${c.index}`} className="flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0">
                  <p className="font-medium text-mata-ink truncate">{c.cliente}</p>
                  <p className="text-[10px] text-red-600/70">Vencida em {formatarData(c.parcela.vencimento)}</p>
                </div>
                <span className="font-medium text-red-700 shrink-0">{formatarMoeda(c.valor)}</span>
              </div>
            ))}
            {contasEmAtraso.length === 0 && (
              <p className="text-xs text-mata-ink/45 text-center py-2">Nenhuma parcela em atraso.</p>
            )}
          </div>
        </div>
      </section>

      {/* Modal com os retornos dos condicionais desta semana */}
      {retornosAbertos && (
        <div className="fixed inset-0 bg-[#1d120b]/45 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-[#fffdfa] border border-[#eadfce] rounded-2xl p-5 sm:p-6 w-full max-w-3xl max-h-[82vh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-xl text-mata-ink">↻ Retornos dos condicionais</h3>
                <p className="text-xs text-mata-ink/50 mt-1">Condicionais com retorno previsto para esta semana.</p>
              </div>
              <button onClick={() => setRetornosAbertos(false)} className="text-mata-ink/45 hover:text-mata-ink text-sm">Fechar ✕</button>
            </div>

            {condicionaisRetornoSemana.length === 0 ? (
              <p className="text-sm text-mata-ink/40 py-6 text-center">Nenhum condicional com retorno previsto para esta semana.</p>
            ) : (
              <div className="space-y-2">
                {condicionaisRetornoSemana.map((venda) => {
                  const itens = itensPorVenda[venda.id] || []
                  const total = itens.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0), 0)
                  return (
                    <div key={venda.id} className="border border-[#eadfce] rounded-xl bg-white px-4 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-mata-ink truncate">{venda.contatos?.nome || contatosPorId[venda.contato_id]?.nome || 'Cliente não informado'}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-mata-ink/55 mt-1">
                          <span>Retorno: <strong className="text-mata-ink/75">{formatarData(venda.dataRetorno)}</strong></span>
                          <span>{itens.reduce((s, i) => s + Number(i.quantidade || 0), 0)} item(ns)</span>
                          <span>{formatarMoeda(total)}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setRetornosAbertos(false)
                          navigate('/vendas', { state: { editarVendaId: venda.id } })
                        }}
                        className="shrink-0 rounded-lg bg-[#B8782D] px-3 py-2 text-xs font-medium text-white hover:brightness-105 transition"
                      >
                        Ver venda →
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal com a lista detalhada da categoria clicada */}
      {categoriaAberta && (
        <div className="fixed inset-0 bg-[#1d120b]/45 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-[#fffdfa] border border-[#eadfce] rounded-2xl p-5 sm:p-6 w-full max-w-2xl max-h-[82vh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-4">
              <h3 className="font-display text-xl text-mata-ink">
                {ESTILO_CATEGORIA[categoriaAberta].emoji} {LABEL_CATEGORIA[categoriaAberta]}{' '}
                <span className="text-mata-ink/40 text-sm font-sans">({listaCategoriaAberta.length})</span>
              </h3>
              <button onClick={() => setCategoriaAberta(null)} className="text-mata-ink/45 hover:text-mata-ink text-sm">Fechar ✕</button>
            </div>

            {listaCategoriaAberta.length === 0 ? (
              <p className="text-sm text-mata-ink/40">Nenhum contato ativo nessa categoria.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[620px]">
                  <thead className="text-mata-ink/50 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left py-2">Nome</th>
                      <th className="text-left py-2">Tipo</th>
                      <th className="text-left py-2">Último contato</th>
                      <th className="text-left py-2">Dias</th>
                      <th className="text-right py-2">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaCategoriaAberta.map((c) => {
                      const ultima = ultimoContato[c.id]
                      const dias = diasDesde(ultima)
                      return (
                        <tr key={c.id} className="border-t border-mata-sand/70">
                          <td className="py-2.5 font-medium">{c.nome}</td>
                          <td className="py-2.5 text-mata-ink/60">{c.tipo === 'comprador' ? 'Compradora' : 'Revendedora'}</td>
                          <td className="py-2.5 text-mata-ink/60">{ultima ? formatarData(ultima) : '—'}</td>
                          <td className="py-2.5 text-mata-ink/60">{dias === null ? 'Nunca contatado' : `${dias}d`}</td>
                          <td className="py-2.5 text-right space-x-3">
                            <button onClick={() => verCliente(c.id)} className="text-mata-copper hover:underline">👁 Ver cliente</button>
                            <button onClick={() => registrarContato(c.id)} className="text-mata-copper hover:underline">📝 Registrar contato</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
