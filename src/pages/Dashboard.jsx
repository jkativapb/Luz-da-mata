import { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts'
import { supabase } from '../supabaseClient'
import { formatarMoeda, diasDesde, formatarData, categoriaRelacionamento, LABEL_CATEGORIA } from '../lib/helpers'
import { exportarParaExcel } from '../lib/excel'
import { totalLiquidoVenda, vendaValidaHistorico } from '../lib/financeiroVendas'

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
  const [condicionaisAbertos, setCondicionaisAbertos] = useState(false)
  const [contasModal, setContasModal] = useState(null) // 'recebido' | 'recebido_anterior' | 'vencer' | 'atraso' | null

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
          className="inline-flex items-center gap-2 bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white px-5 py-2.5 rounded-xl text-[9px] font-medium shadow-[0_8px_20px_rgba(154,91,32,0.20)] hover:brightness-105 transition"
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

    // Meta mensal: usa a data local do mês atual para evitar deslocamento de fuso.
    const hojeMeta = new Date()
    const mesISO = `${hojeMeta.getFullYear()}-${String(hojeMeta.getMonth() + 1).padStart(2, '0')}-01`

    const { data: metaData, error: metaError } = await supabase
      .from('metas_mensais')
      .select('valor_meta')
      .eq('mes', mesISO)
      .maybeSingle()

    if (metaError) {
      console.error('Erro ao carregar meta mensal:', metaError)
      setMetaMes(null)
    } else {
      setMetaMes(metaData?.valor_meta != null ? Number(metaData.valor_meta) : null)
    }

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

  if (carregando) return <div className="p-8 text-mata-ink/50 text-[9px]">Carregando…</div>

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
    return vendaValidaHistorico(v, contatosPorId)
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
    return totalLiquidoVenda(venda, itensPorVenda)
  }

  const hoje = new Date()
  const mesAtual = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`

  let rendaAcumulada = 0
  let rendaMes = 0
  let totalRecebido = 0
  let totalAReceber = 0
  let totalCondicional = 0
  const vendasPorMes = {}
  const vendedorTotais = {}

  vendasParaIndicadores.filter((v) => v.nf_cancelada !== true).forEach((v) => {
    const totalVendaAtual = totalVenda(v)
    const dataVenda = dataLocal(v.data_venda)

    // Venda efetivada = tudo que NÃO está em condicional.
    // Renda acumulada: todas as vendas efetivadas, independentemente de já terem sido pagas.
    if (v.situacao_pagamento !== 'condicional') {
      // Acumulado do ano: somente vendas efetivadas no ano corrente.
      if (dataVenda && dataVenda.getFullYear() === hoje.getFullYear()) {
        rendaAcumulada += totalVendaAtual
      }

      // Renda do mês: somente vendas efetivadas cuja data pertence ao mês atual.
      // Comparar ano e mês evita incluir datas futuras ou de outros períodos.
      if (dataVenda && chaveMes(v.data_venda) === mesAtual) {
        rendaMes += totalVendaAtual
      }

      const mes = chaveMes(v.data_venda)
      if (mes) vendasPorMes[mes] = (vendasPorMes[mes] || 0) + totalVendaAtual

      const nomeVendedor = v.vendedor_nome || 'Não informado'
      if (!vendedorTotais[nomeVendedor]) vendedorTotais[nomeVendedor] = { totalAno: 0, totalMes: 0, vendas: 0 }
      if (dataVenda && dataVenda.getFullYear() === hoje.getFullYear()) {
        vendedorTotais[nomeVendedor].totalAno += totalVendaAtual
      }
      if (dataVenda && chaveMes(v.data_venda) === mesAtual) {
        vendedorTotais[nomeVendedor].totalMes += totalVendaAtual
      }
      vendedorTotais[nomeVendedor].vendas += 1
    }

    // O total de condicionais é separado do financeiro efetivado.
    if (v.situacao_pagamento === 'condicional') {
      totalCondicional += totalVendaAtual
    }
  })

  // Sempre mostra os 6 meses correntes, inclusive meses sem venda.
  const graficoMensal = Array.from({ length: 6 }, (_, indice) => {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - (5 - indice), 1)
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return { mes: rotuloMes(chave), total: vendasPorMes[chave] || 0 }
  })


  // -------- vendas por categoria de produto (quantidade de itens) --------
  const categoriaQtd = {}
  let totalItensVendidos = 0
  vendasParaIndicadores.filter((v) => v.nf_cancelada !== true).forEach((v) => {
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
  const vendasCondicionais = vendasParaIndicadores.filter((v) => v.situacao_pagamento === 'condicional' && v.nf_cancelada !== true)
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
  // As parcelas são a fonte de verdade para o financeiro. Quando a venda
  // possui pagamento por parcela, usamos a situação/data de cada parcela.
  // Para vendas antigas sem esses campos, fazemos fallback para os campos da venda.
  function parcelasFinanceiras(venda) {
    let parcelas = Array.isArray(venda.parcelas_json)
      ? venda.parcelas_json
      : (Array.isArray(venda.parcelas) ? venda.parcelas : [])

    if (!parcelas.length && (venda.data_vencimento || venda.situacao_pagamento === 'pago')) {
      parcelas = [{
        valor: totalVenda(venda),
        vencimento: venda.data_vencimento || null,
        data_pagamento: venda.data_pagamento || null,
      }]
    }

    const vendaPaga = venda.situacao_pagamento === 'pago'

    return parcelas.map((parcela, index) => {
      const statusTexto = String(parcela.status || parcela.situacao || '').toLowerCase()
      const temCampo = (campo) => Object.prototype.hasOwnProperty.call(parcela, campo)
      const dataPagamento = parcela.data_pagamento || parcela.dataPagamento || parcela.data_recebimento || parcela.dataRecebimento || parcela.pago_em || parcela.data_pago || parcela.dataPago || parcela.recebido_em || parcela.recebidoEm || null

      // A tela de Vendas é a fonte de verdade. Se a parcela possui um
      // checkbox/flag de pagamento, respeitamos exatamente o valor dele.
      // Não criamos nem alteramos esse pagamento no Dashboard.
      const possuiFlagPagamento = temCampo('pago') || temCampo('recebido') || temCampo('quitado')
      const flagPaga = temCampo('pago') ? parcela.pago === true
        : temCampo('recebido') ? parcela.recebido === true
          : temCampo('quitado') ? parcela.quitado === true
            : null

      const possuiStatusPagamento = ['pago', 'paid', 'recebido', 'quitado', 'a_receber', 'pendente', 'aberto', 'em_aberto', 'atrasado'].includes(statusTexto)
      const paga = possuiFlagPagamento
        ? flagPaga
        : possuiStatusPagamento
          ? ['pago', 'paid', 'recebido', 'quitado'].includes(statusTexto)
          : Boolean(dataPagamento) || vendaPaga

      // A data também vem da parcela registrada na tela de Vendas.
      // O campo da venda só é usado no fallback de vendas antigas sem
      // controle individual de parcelas.
      const dataPagamentoFinal = dataPagamento || (vendaPaga && parcelas.length === 1 ? (venda.data_pagamento || venda.pago_em || venda.data_pago) : null)
      const vencimento = dataLocal(parcela.vencimento || parcela.data_vencimento || venda.data_vencimento)
      const valor = Number(parcela.valor || parcela.valor_parcela || parcela.total || 0)

      return {
        venda: venda,
        parcela,
        index,
        valor,
        vencimento,
        paga,
        dataPagamento: dataLocal(dataPagamentoFinal),
      }
    }).filter((p) => p.valor > 0)
  }

  const contasReceber = []
  const contasRecebidas = []

  vendasParaIndicadores
    .filter((v) => v.situacao_pagamento !== 'condicional' && v.nf_cancelada !== true)
    .forEach((v) => {
      const cliente = contatosPorId[v.contato_id]?.nome || v.contatos?.nome || 'Cliente não informado'
      parcelasFinanceiras(v).forEach((item) => {
        const registro = { ...item, cliente }

        if (item.paga) {
          contasRecebidas.push(registro)
        } else {
          // Toda parcela não marcada como paga permanece em aberto,
          // independentemente do status geral da venda.
          contasReceber.push(registro)
        }
      })
    })

  const contasEmAtraso = contasReceber.filter((c) => c.vencimento && c.vencimento < hojeData)
  const contasAVencer = contasReceber.filter((c) => c.vencimento && c.vencimento >= hojeData)
  const totalEmAtraso = contasEmAtraso.reduce((s, c) => s + c.valor, 0)
  const totalAVencer = contasAVencer.reduce((s, c) => s + c.valor, 0)

  // Os cards Recebido e A receber usam exatamente a mesma fonte da listagem
  // de parcelas abaixo, para que os valores dos cards e das listas coincidam.
  totalRecebido = contasRecebidas.reduce((total, c) => total + c.valor, 0)
  totalAReceber = contasReceber.reduce((total, c) => total + c.valor, 0)

  // Recebimentos por ano e por mês são baseados na data real de pagamento da parcela.
  const contasRecebidasNoAno = contasRecebidas.filter((c) =>
    c.dataPagamento && c.dataPagamento.getFullYear() === hoje.getFullYear()
  )
  const recebidoNoAno = contasRecebidasNoAno.reduce((total, c) => total + c.valor, 0)

  // Recebido no mês = soma dos pagamentos cuja DATA DE PAGAMENTO está no mês atual.
  const contasRecebidasNoMes = contasRecebidas.filter((c) => {
    const data = c.dataPagamento
    return data &&
      data.getMonth() === hoje.getMonth() &&
      data.getFullYear() === hoje.getFullYear()
  })
  const recebidoNoMes = contasRecebidasNoMes.reduce((total, c) => total + c.valor, 0)

  // Subconjunto do recebido no mês: pagamentos de vendas feitas antes do mês atual.
  // Este valor não é somado novamente ao total de recebidos.
  const contasRecebidasVendasAnteriores = contasRecebidasNoMes.filter((c) => {
    const dataVenda = dataLocal(c.venda?.data_venda)
    return dataVenda && (dataVenda.getFullYear() < hoje.getFullYear() ||
      (dataVenda.getFullYear() === hoje.getFullYear() && dataVenda.getMonth() < hoje.getMonth()))
  })
  const recebidoVendasAnteriores = contasRecebidasVendasAnteriores.reduce((total, c) => total + c.valor, 0)

  // Gráfico por vendedor: acumulado do ano, vendas do mês e recebimentos do mês.
  const recebidoMesPorVendedor = {}
  contasRecebidasNoMes.forEach((conta) => {
    const nome = conta.venda?.vendedor_nome || 'Não informado'
    recebidoMesPorVendedor[nome] = (recebidoMesPorVendedor[nome] || 0) + conta.valor
  })
  const vendasPorVendedor = Object.entries(vendedorTotais)
    .map(([nome, dados]) => ({
      nome,
      totalAno: dados.totalAno,
      totalMes: dados.totalMes,
      recebidoMes: recebidoMesPorVendedor[nome] || 0,
      vendas: dados.vendas,
    }))
    .sort((a, b) => b.totalAno - a.totalAno)
    .slice(0, 6)

  const listaContasModal = contasModal === 'recebido'
    ? contasRecebidasNoMes.slice().sort((a, b) => (b.dataPagamento || 0) - (a.dataPagamento || 0))
    : contasModal === 'recebido_anterior'
      ? contasRecebidasVendasAnteriores.slice().sort((a, b) => (b.dataPagamento || 0) - (a.dataPagamento || 0))
      : contasModal === 'vencer'
      ? contasAVencer.sort((a, b) => a.vencimento - b.vencimento)
      : contasModal === 'atraso'
        ? contasEmAtraso.sort((a, b) => a.vencimento - b.vencimento)
        : []

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
    <div className="w-full pt-px pb-1 space-y-0">
      {/* QUADRO 1 — Vendas */}
      <section className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-x-px gap-y-px mb-0">
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-3 py-[8px] shadow-[0_10px_30px_rgba(77,45,18,0.05)]">
          <div className="flex items-center gap-2 mb-[6px]">
            <span className="text-[#9A5B20] text-[15px]">▥</span>
            <h3 className="font-display text-[15px] text-mata-ink">Vendas</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-px gap-y-2 mb-[6px]">
            <div className="bg-[#f8f3e9] border border-[#eee2d0] rounded-xl px-3 py-2 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#f0e2cc] text-[#9A5B20] flex items-center justify-center text-[17px] shrink-0">◉</div>
              <div className="min-w-0"><p className="text-[9px] text-mata-ink/60">Vendas acumuladas no ano</p><p className="font-display text-[15px] lg:text-[17px] text-mata-ink truncate">{formatarMoeda(rendaAcumulada)}</p></div>
            </div>
            <div className="bg-green-50/80 border border-green-100 rounded-xl px-3 py-2 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-100 text-green-700 flex items-center justify-center text-[17px] shrink-0">✓</div>
              <div className="min-w-0"><p className="text-[9px] text-green-700/75">Recebidos no ano</p><p className="font-display text-[15px] lg:text-[17px] text-green-700 truncate">{formatarMoeda(recebidoNoAno)}</p></div>
            </div>
            <div className="bg-[#fcf5ec] border border-[#eee2d0] rounded-xl px-3 py-2 flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#f6e8d7] text-[#9A5B20] flex items-center justify-center text-[17px] shrink-0">▦</div>
              <div className="min-w-0"><p className="text-[9px] text-mata-ink/60">Vendas do mês</p><p className="font-display text-[15px] lg:text-[17px] text-mata-ink truncate">{formatarMoeda(rendaMes)}</p></div>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="min-w-0">
              <div className="flex items-center justify-between mb-[6px]"><h4 className="font-display text-[15px] text-mata-ink">Vendas por mês</h4><span className="text-[9px] text-mata-ink/50">Últimos 6 meses</span></div>
              <div className="h-[142px] min-w-0">
                <ResponsiveContainer width="100%" height="100%"><BarChart data={graficoMensal} margin={{ top: 8, right: 4, left: -14, bottom: 0 }}><CartesianGrid strokeDasharray="3 3" stroke="#EDE3D3" vertical={false} /><XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#59483A' }} axisLine={{ stroke: '#D9C7AE' }} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: '#59483A' }} width={48} axisLine={false} tickLine={false} /><Tooltip formatter={(v) => formatarMoeda(v)} /><Bar dataKey="total" fill="#A96A26" radius={[5, 5, 0, 0]} maxBarSize={36} /></BarChart></ResponsiveContainer>
              </div>
            </div>
            <div className="min-w-0 lg:border-l lg:border-[#eadfce] lg:pl-4">
              <div className="mb-[4px]"><div className="flex items-center justify-between gap-1"><h4 className="font-display text-[15px] text-mata-ink">Vendas por vendedor</h4><span className="text-[9px] text-mata-ink/50">Ano e mês atual</span></div><div className="flex flex-wrap gap-x-3 gap-y-1 text-[8px] text-mata-ink/65"><span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-[#5C6E4A]" />Acumulado no ano</span><span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-[#A96A26]" />Vendas do mês</span><span className="inline-flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-[#C9A15A]" />Recebidos no mês</span></div></div>
              {vendasPorVendedor.length === 0 ? <div className="h-[128px] flex items-center justify-center text-[9px] text-mata-ink/45 text-center">Ainda não há vendas atribuídas a vendedores.</div> : <div className="h-[150px] min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={vendasPorVendedor} layout="vertical" margin={{ top: 4, right: 46, left: 0, bottom: 0 }} barCategoryGap="18%" barGap={2}><CartesianGrid strokeDasharray="3 3" stroke="#EDE3D3" horizontal={false} /><XAxis type="number" tick={{ fontSize: 8, fill: '#59483A' }} axisLine={{ stroke: '#D9C7AE' }} tickLine={false} /><YAxis type="category" dataKey="nome" width={70} tick={{ fontSize: 8, fill: '#59483A' }} axisLine={false} tickLine={false} /><Bar dataKey="totalAno" name="Acumulado no ano" fill="#5C6E4A" radius={[0, 3, 3, 0]} maxBarSize={7}><LabelList dataKey="totalAno" position="right" formatter={(v) => v > 0 ? formatarMoeda(v) : ''} style={{ fontSize: 7, fill: '#59483A' }} /></Bar><Bar dataKey="totalMes" name="Vendas do mês" fill="#A96A26" radius={[0, 3, 3, 0]} maxBarSize={7}><LabelList dataKey="totalMes" position="right" formatter={(v) => v > 0 ? formatarMoeda(v) : ''} style={{ fontSize: 7, fill: '#59483A' }} /></Bar><Bar dataKey="recebidoMes" name="Recebidos no mês" fill="#C9A15A" radius={[0, 3, 3, 0]} maxBarSize={7}><LabelList dataKey="recebidoMes" position="right" formatter={(v) => v > 0 ? formatarMoeda(v) : ''} style={{ fontSize: 7, fill: '#59483A' }} /></Bar></BarChart></ResponsiveContainer></div>}
            </div>
          </div>
        </div>

        {/* QUADRO 2 — Contas a receber */}
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-3 py-[8px] shadow-[0_10px_30px_rgba(77,45,18,0.05)]">
          <div className="flex items-center justify-between gap-2 mb-[6px]"><div className="flex items-center gap-3"><span className="text-[#9A5B20] text-[17px]">◷</span><h3 className="font-display text-[15px] text-mata-ink">Contas a receber</h3></div><span className="text-[9px] text-mata-ink/50">Visão financeira</span></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-x-px gap-y-2 mb-[6px]">
            <button type="button" onClick={() => setContasModal('atraso')} className="text-left rounded-xl bg-red-50/80 border border-red-100 px-2.5 py-2 hover:shadow-md transition" title="Ver parcelas em atraso"><p className="text-[9px] text-red-700/75">Em atraso</p><p className="font-display text-[15px] text-red-700">{formatarMoeda(totalEmAtraso)}</p><p className="text-[9px] text-red-700/60">{String(contasEmAtraso.length).padStart(2, '0')} {contasEmAtraso.length === 1 ? 'registro' : 'registros'}</p></button>
            <button type="button" onClick={() => setContasModal('vencer')} className="text-left rounded-xl bg-amber-50/80 border border-amber-100 px-2.5 py-2 hover:shadow-md transition" title="Ver parcelas a vencer"><p className="text-[9px] text-amber-700/75">A vencer</p><p className="font-display text-[15px] text-amber-700">{formatarMoeda(totalAVencer)}</p><p className="text-[9px] text-amber-700/60">{String(contasAVencer.length).padStart(2, '0')} {contasAVencer.length === 1 ? 'registro' : 'registros'}</p></button>
            <button type="button" onClick={() => setContasModal('recebido')} className="text-left rounded-xl bg-green-50/80 border border-green-100 px-2.5 py-2 hover:shadow-md transition" title="Ver pagamentos recebidos no mês"><p className="text-[9px] text-green-700/75">Recebidos no mês</p><p className="font-display text-[15px] text-green-700">{formatarMoeda(recebidoNoMes)}</p><p className="text-[9px] text-green-700/60">{String(contasRecebidasNoMes.length).padStart(2, '0')} {contasRecebidasNoMes.length === 1 ? 'registro' : 'registros'}</p></button>
            <button type="button" onClick={() => setContasModal('recebido_anterior')} className="text-left rounded-xl bg-blue-50/80 border border-blue-100 px-2.5 py-2 hover:shadow-md transition" title="Ver recebimentos de vendas realizadas antes deste mês"><p className="text-[9px] text-blue-700/75">Recebidos de vendas anteriores</p><p className="font-display text-[15px] text-blue-700">{formatarMoeda(recebidoVendasAnteriores)}</p><p className="text-[9px] text-blue-700/60">{String(contasRecebidasVendasAnteriores.length).padStart(2, '0')} {contasRecebidasVendasAnteriores.length === 1 ? 'registro' : 'registros'}</p></button>
          </div>
          <div className="border-t border-[#eadfce] pt-2">
            <h4 className="font-display text-[15px] text-mata-ink mb-1">Distribuição das parcelas</h4>
            {(() => {
              const distribuicaoContas = [{ nome: 'Recebidos no mês', valor: recebidoNoMes }, { nome: 'A vencer', valor: totalAVencer }, { nome: 'Em atraso', valor: totalEmAtraso }].filter((item) => item.valor > 0)
              const totalDistribuicao = distribuicaoContas.reduce((soma, item) => soma + item.valor, 0)
              return totalDistribuicao > 0 ? <div className="grid grid-cols-1 sm:grid-cols-[minmax(130px,0.85fr)_1fr] items-center gap-3"><div className="h-[122px] min-w-0"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={distribuicaoContas} dataKey="valor" nameKey="nome" innerRadius="54%" outerRadius="82%" paddingAngle={2} stroke="none">{distribuicaoContas.map((item, index) => <Cell key={item.nome} fill={item.nome === 'Recebidos no mês' ? '#5C6E4A' : item.nome === 'A vencer' ? '#C9A15A' : '#E76F6F'} />)}</Pie><Tooltip formatter={(v) => formatarMoeda(v)} /></PieChart></ResponsiveContainer></div><div className="space-y-1.5">{distribuicaoContas.map((item) => <div key={item.nome} className="flex items-center justify-between gap-2 text-[9px] border-b border-[#f0e7da] pb-2"><div className="flex items-center gap-2 min-w-0"><span className={`w-2.5 h-2.5 rounded-full shrink-0 ${item.nome === 'Recebidos no mês' ? 'bg-[#5C6E4A]' : item.nome === 'A vencer' ? 'bg-[#C9A15A]' : 'bg-[#E76F6F]'}`} /><span className="text-mata-ink/75">{item.nome}</span></div><div className="text-right shrink-0"><p className="font-medium text-mata-ink">{formatarMoeda(item.valor)}</p><p className="text-[10px] text-mata-ink/45">{Math.round(item.valor / totalDistribuicao * 100)}%</p></div></div>)}</div></div> : <div className="h-[122px] flex items-center justify-center text-[9px] text-mata-ink/45">Ainda não há parcelas financeiras para exibir.</div>
            })()}
          </div>
        </div>
      </section>

      {/* QUADROS 3 e 4 — Avaliação e relacionamento */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-x-2 gap-y-px mb-0">
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-3 py-[7px] shadow-[0_10px_30px_rgba(77,45,18,0.05)]">
          <div className="flex items-center gap-2 mb-[6px]"><span className="text-[#9A5B20] text-[17px]">♧</span><h3 className="font-display text-[15px] text-mata-ink">Vendas em avaliação</h3></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-px gap-y-2">
            <button type="button" onClick={() => setCondicionaisAbertos(true)} className="group text-left bg-[#fcf6ed] border border-[#eee0cc] rounded-xl p-2.5 hover:shadow-md transition"><p className="text-[9px] text-mata-ink/60">Vendas condicionais</p><p className="font-display text-[17px] text-mata-ink mt-1">{formatarMoeda(totalCondicional)}</p><p className="text-[9px] text-mata-ink/50">Em avaliação <span className="text-[#9A5B20]">›</span></p></button>
            <button type="button" onClick={() => setCondicionaisAbertos(true)} className="group text-left bg-white/70 border border-[#eee0cc] rounded-xl p-2.5 hover:shadow-md transition"><p className="text-[9px] text-mata-ink/60">Produtos em avaliação</p><p className="font-display text-[17px] text-mata-ink mt-1">{produtosEmAvaliacao}</p><p className="text-[9px] text-mata-ink/50">Produtos <span className="text-[#9A5B20]">›</span></p></button>
            <button type="button" onClick={() => setRetornosAbertos(true)} className="group text-left bg-white/70 border border-[#eee0cc] rounded-xl p-2.5 hover:shadow-md transition"><p className="text-[9px] text-mata-ink/60">Retornos da semana</p><p className="font-display text-[17px] text-mata-ink mt-1">{retornosSemana}</p><p className="text-[9px] text-mata-ink/50">Retornos previstos <span className="text-[#9A5B20]">›</span></p></button>
          </div>
        </div>
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-3 py-[7px] shadow-[0_10px_30px_rgba(77,45,18,0.05)]">
          <div className="flex items-center gap-2 mb-[6px]"><span className="text-[#9A5B20] text-[17px]">♟</span><h3 className="font-display text-[15px] text-mata-ink">Relacionamento</h3></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-px gap-y-2">
            {['em_dia', 'atencao', 'precisa_contato'].map((cat) => {
              const estilo = ESTILO_CATEGORIA[cat]
              const descricao = cat === 'em_dia' ? 'clientes ativos' : cat === 'atencao' ? 'sem compra recente' : 'contatos pendentes'
              return <button key={cat} type="button" onClick={() => setCategoriaAberta(cat)} className="group text-left bg-white/75 border border-[#eadfce] rounded-xl p-2.5 hover:shadow-md transition"><p className="text-[9px] text-mata-ink/60 flex items-center gap-1"><span>{estilo.emoji}</span>{LABEL_CATEGORIA[cat]}</p><p className={`font-display text-[21px] mt-1 ${estilo.cor}`}>{porCategoria[cat].length}</p><p className="text-[9px] text-mata-ink/50">{descricao} <span className="text-[#9A5B20]">›</span></p></button>
            })}
          </div>
        </div>
      </section>

      {/* QUADRO 5 — Meta x realizado */}
      <section className="bg-white/90 border border-[#eadfce] rounded-2xl px-3 py-[7px] shadow-[0_10px_30px_rgba(77,45,18,0.05)] mb-1">
        <div className="flex items-center justify-between gap-3 mb-0"><div className="flex items-center gap-3"><span className="text-[#9A5B20] text-[17px]">◎</span><h3 className="font-display text-[15px] text-mata-ink">Meta x realizado</h3></div><span className="border border-[#eadfce] rounded-xl px-2.5 py-1 text-[9px] text-mata-ink/65 bg-[#fbf7f0]">{new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span></div>
        {metaMes === null ? <div className="py-5 text-[9px] text-mata-ink/45 text-center">Meta não definida para este mês. Cadastre a meta mensal nas configurações do negócio.</div> : <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr_105px] gap-1.5 items-center">
          <div className="bg-[#fcf6ed] border border-[#eee0cc] rounded-xl p-2"><p className="text-[9px] text-mata-ink/60">Meta do mês</p><p className="font-display text-[17px] lg:text-[21px] text-mata-ink mt-1">{formatarMoeda(metaMes)}</p></div>
          <div className="bg-white/70 border border-[#eee0cc] rounded-xl p-2"><p className="text-[9px] text-mata-ink/60">Realizado no mês</p><p className="font-display text-[17px] lg:text-[21px] text-mata-ink mt-1">{formatarMoeda(rendaMes)}</p></div>
          <div className="bg-[#fcf6ed] border border-[#eee0cc] rounded-xl p-2"><p className="text-[9px] text-mata-ink/60">Falta para a meta</p><p className="font-display text-[17px] lg:text-[21px] text-[#9A5B20] mt-1">{formatarMoeda(Math.max(0, metaMes - rendaMes))}</p><div className="h-2 bg-[#eee4d5] rounded-full mt-3 overflow-hidden"><div className="h-full bg-gradient-to-r from-[#8d521e] to-[#c18a3d] rounded-full" style={{ width: `${percentualMeta}%` }} /></div></div>
          <div className="flex flex-col items-center justify-center rounded-full border-[8px] border-[#eee4d5] w-[92px] h-[92px] mx-auto relative"><div className="absolute inset-[-8px] rounded-full border-[8px] border-transparent border-t-[#9A5B20]" style={{ transform: `rotate(${Math.min(100, percentualMeta) * 3.6}deg)` }} /><p className="font-display text-[21px] text-[#9A5B20]">{percentualMeta}%</p><p className="text-[9px] text-mata-ink/60 text-center">da meta alcançada</p></div>
        </div>}
      </section>

      {/* Modal com a listagem de todas as vendas condicionais */}
      {condicionaisAbertos && (
        <div className="fixed inset-0 bg-[#1d120b]/45 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-[#fffdfa] border border-[#eadfce] rounded-2xl p-5 sm:p-6 w-full max-w-4xl max-h-[86vh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-[17px] text-mata-ink">♧ Vendas condicionais <span className="text-mata-ink/40 text-[9px] font-sans">({vendasCondicionais.length})</span></h3>
                <p className="text-[9px] text-mata-ink/50 mt-1">Clientes e produtos que estão em avaliação.</p>
              </div>
              <button type="button" onClick={() => setCondicionaisAbertos(false)} className="text-mata-ink/45 hover:text-mata-ink text-[9px] shrink-0">Fechar ✕</button>
            </div>

            {vendasCondicionais.length === 0 ? (
              <p className="text-[9px] text-mata-ink/45 py-8 text-center">Nenhuma venda condicional registrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[9px] min-w-[680px]">
                  <thead className="text-mata-ink/50 text-[10px] uppercase tracking-wide">
                    <tr className="border-b border-[#eadfce]">
                      <th className="text-left py-2.5 pr-3">Cliente</th>
                      <th className="text-left py-2.5 pr-3">Data da venda</th>
                      <th className="text-left py-2.5 pr-3">Retorno previsto</th>
                      <th className="text-left py-2.5 pr-3">Itens</th>
                      <th className="text-right py-2.5 pr-3">Total</th>
                      <th className="text-right py-2.5">Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendasCondicionais
                      .slice()
                      .sort((a, b) => String(a.data_retorno_condicional || a.data_retorno || '9999-12-31').localeCompare(String(b.data_retorno_condicional || b.data_retorno || '9999-12-31')))
                      .map((venda) => {
                        const itens = itensPorVenda[venda.id] || []
                        const quantidade = itens.reduce((s, item) => s + Number(item.quantidade || 0), 0)
                        return (
                          <tr key={venda.id} className="border-b border-[#eadfce]/70">
                            <td className="py-3 pr-3 font-medium text-mata-ink">{venda.contatos?.nome || contatosPorId[venda.contato_id]?.nome || 'Cliente não informado'}</td>
                            <td className="py-3 pr-3 text-mata-ink/70">{formatarData(venda.data_venda)}</td>
                            <td className="py-3 pr-3 text-mata-ink/70">{(venda.data_retorno_condicional || venda.data_retorno) ? formatarData(venda.data_retorno_condicional || venda.data_retorno) : '—'}</td>
                            <td className="py-3 pr-3 text-mata-ink/70">{quantidade}</td>
                            <td className="py-3 pr-3 text-right font-medium text-mata-ink">{formatarMoeda(totalVenda(venda))}</td>
                            <td className="py-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setCondicionaisAbertos(false)
                                  navigate('/vendas', { state: { editarVendaId: venda.id } })
                                }}
                                className="text-[#9A5B20] hover:underline whitespace-nowrap"
                              >
                                Ver venda →
                              </button>
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

      {/* Modal com os retornos dos condicionais desta semana */}
      {retornosAbertos && (
        <div className="fixed inset-0 bg-[#1d120b]/45 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-[#fffdfa] border border-[#eadfce] rounded-2xl p-5 sm:p-6 w-full max-w-3xl max-h-[82vh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="font-display text-[17px] text-mata-ink">↻ Retornos dos condicionais</h3>
                <p className="text-[9px] text-mata-ink/50 mt-1">Condicionais com retorno previsto para esta semana.</p>
              </div>
              <button onClick={() => setRetornosAbertos(false)} className="text-mata-ink/45 hover:text-mata-ink text-[9px]">Fechar ✕</button>
            </div>

            {condicionaisRetornoSemana.length === 0 ? (
              <p className="text-[9px] text-mata-ink/40 py-6 text-center">Nenhum condicional com retorno previsto para esta semana.</p>
            ) : (
              <div className="space-y-2">
                {condicionaisRetornoSemana.map((venda) => {
                  const itens = itensPorVenda[venda.id] || []
                  const total = itens.reduce((s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0), 0)
                  return (
                    <div key={venda.id} className="border border-[#eadfce] rounded-xl bg-white px-4 py-3 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="font-medium text-[9px] text-mata-ink truncate">{venda.contatos?.nome || contatosPorId[venda.contato_id]?.nome || 'Cliente não informado'}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-mata-ink/55 mt-1">
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
                        className="shrink-0 rounded-lg bg-[#B8782D] px-3 py-2 text-[9px] font-medium text-white hover:brightness-105 transition"
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

      {/* Modal financeiro: recebido no mês / a vencer / em atraso */}
      {contasModal && (
        <div className="fixed inset-0 bg-[#1d120b]/45 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6 z-50">
          <div className="bg-[#fffdfa] border border-[#eadfce] rounded-2xl p-5 sm:p-6 w-full max-w-5xl max-h-[86vh] overflow-y-auto shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-display text-[17px] text-mata-ink">
                  {contasModal === 'recebido' && '✓ Recebidos no mês'}
                  {contasModal === 'recebido_anterior' && '↶ Recebidos de vendas anteriores'}
                  {contasModal === 'vencer' && '◷ A vencer'}
                  {contasModal === 'atraso' && '⚠ Em atraso'}
                  <span className="text-mata-ink/40 text-[9px] font-sans ml-2">({listaContasModal.length})</span>
                </h3>
                <p className="text-[9px] text-mata-ink/50 mt-1">
                  {contasModal === 'recebido' && 'Todos os pagamentos registrados neste mês, independentemente da data da venda.'}
                  {contasModal === 'recebido_anterior' && 'Pagamentos registrados neste mês referentes a vendas realizadas em meses anteriores.'}
                  {contasModal === 'vencer' && 'Parcelas ainda não pagas e com vencimento hoje ou em data futura.'}
                  {contasModal === 'atraso' && 'Todas as parcelas vencidas que ainda não foram pagas.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setContasModal(null)}
                className="text-mata-ink/45 hover:text-mata-ink text-[9px] shrink-0"
              >
                Fechar ✕
              </button>
            </div>

            {listaContasModal.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-[9px] text-mata-ink/45">
                  {(contasModal === 'recebido' || contasModal === 'recebido_anterior')
                    ? (contasModal === 'recebido_anterior' ? 'Nenhum recebimento de vendas anteriores neste mês.' : 'Nenhum pagamento foi registrado neste mês.')
                    : contasModal === 'vencer'
                      ? 'Nenhuma parcela a vencer.'
                      : 'Nenhuma parcela em atraso.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[9px] min-w-[760px]">
                  <thead className="text-mata-ink/50 text-[10px] uppercase tracking-wide">
                    <tr className="border-b border-[#eadfce]">
                      <th className="text-left py-2.5 pr-3">Cliente</th>
                      <th className="text-left py-2.5 pr-3">Parcela</th>
                      <th className="text-left py-2.5 pr-3">Vencimento</th>
                      {(contasModal === 'recebido' || contasModal === 'recebido_anterior') && (
                        <th className="text-left py-2.5 pr-3">Pagamento</th>
                      )}
                      {contasModal === 'atraso' && (
                        <th className="text-left py-2.5 pr-3">Dias em atraso</th>
                      )}
                      <th className="text-right py-2.5">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaContasModal.map((c) => {
                      const numeroParcela = c.parcela.numero || c.parcela.parcela || c.parcela.n || (c.index + 1)
                      const totalParcelas = c.parcela.total_parcelas || c.parcela.quantidade_parcelas || null
                      const diasAtraso = c.vencimento
                        ? Math.max(0, Math.floor((hojeData - c.vencimento) / 86400000))
                        : 0

                      return (
                        <tr key={`${c.venda.id}-${c.index}`} className="border-b border-[#eadfce]/70">
                          <td className="py-3 pr-3">
                            <p className="font-medium text-mata-ink">{c.cliente}</p>
                            <p className="text-[10px] text-mata-ink/45">
                              Venda {formatarData(c.venda.data_venda)}
                            </p>
                          </td>
                          <td className="py-3 pr-3 text-mata-ink/70">
                            {numeroParcela}{totalParcelas ? `/${totalParcelas}` : ''}
                          </td>
                          <td className="py-3 pr-3 text-mata-ink/70">
                            {c.vencimento ? formatarData(c.vencimento) : '—'}
                          </td>
                          {(contasModal === 'recebido' || contasModal === 'recebido_anterior') && (
                            <td className="py-3 pr-3">
                              <label className="inline-flex items-center gap-2 text-mata-ink/75">
                                <input
                                  type="checkbox"
                                  checked
                                  readOnly
                                  disabled
                                  className="w-4 h-4 accent-green-700"
                                />
                                <span>{c.dataPagamento ? formatarData(c.dataPagamento) : 'Pagamento registrado'}</span>
                              </label>
                            </td>
                          )}
                          {contasModal === 'atraso' && (
                            <td className="py-3 pr-3 text-red-700 font-medium">
                              {diasAtraso} dia(s)
                            </td>
                          )}
                          <td className="py-3 text-right font-medium text-mata-ink">{formatarMoeda(c.valor)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={contasModal === 'atraso' ? 4 : (contasModal === 'recebido' || contasModal === 'recebido_anterior') ? 4 : 3} className="pt-3 text-right font-medium text-mata-ink/65">
                        Total
                      </td>
                      <td className="pt-3 text-right font-display text-[15px] text-mata-ink">
                        {formatarMoeda(listaContasModal.reduce((s, c) => s + c.valor, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
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
              <h3 className="font-display text-[17px] text-mata-ink">
                {ESTILO_CATEGORIA[categoriaAberta].emoji} {LABEL_CATEGORIA[categoriaAberta]}{' '}
                <span className="text-mata-ink/40 text-[9px] font-sans">({listaCategoriaAberta.length})</span>
              </h3>
              <button onClick={() => setCategoriaAberta(null)} className="text-mata-ink/45 hover:text-mata-ink text-[9px]">Fechar ✕</button>
            </div>

            {listaCategoriaAberta.length === 0 ? (
              <p className="text-[9px] text-mata-ink/40">Nenhum contato ativo nessa categoria.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[9px] min-w-[620px]">
                  <thead className="text-mata-ink/50 text-[9px] uppercase tracking-wide">
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
