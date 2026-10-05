import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { formatarData, formatarMoeda } from '../lib/helpers'

// Datas "YYYY-MM-DD" do banco devem ser lidas como data LOCAL.
// new Date('2026-10-01') é interpretado em UTC e, no Brasil (UTC-3), vira 30/09 às 21h,
// o que jogava vendas do dia 1º no mês anterior (cards, gráfico e filtro "Este mês").
function paraDataLocal(valor) {
  const [ano, mes, dia] = String(valor || '').slice(0, 10).split('-').map(Number)
  return new Date(ano || 1970, (mes || 1) - 1, dia || 1)
}

function dataParaISO(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

// "Hoje" pela data local (toISOString usa UTC e, depois das 21h, devolve o dia seguinte).
function hojeLocal() {
  return dataParaISO(new Date())
}

const vendaVazia = {
  contato_id: '',
  vendedor_id: '',
  vendedor_nome: '',
  data_venda: hojeLocal(),
  forma_pagamento: '',
  situacao_pagamento: 'pago',
  data_pagamento: hojeLocal(),
  parcelamento: '1x',
  parcelas_json: [],
  data_retorno_condicional: '',
  desconto_venda: 0,
  observacoes: '',
  id: null,
  nf_transmitida: false,
  nf_cancelada: false,
}

export default function Vendas() {
  const { setPageHeader } = useOutletContext()

  const [vendas, setVendas] = useState([])
  const [contatos, setContatos] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [produtos, setProdutos] = useState([])
  const [itensPorVenda, setItensPorVenda] = useState({})
  const [carregando, setCarregando] = useState(true)

  const [mostrarForm, setMostrarForm] = useState(false)
  const [vendaSelecionada, setVendaSelecionada] = useState(null)
  const [busca, setBusca] = useState('')
  const [pagamentoFiltro, setPagamentoFiltro] = useState('')
  const [periodoFiltro, setPeriodoFiltro] = useState('')

  const [form, setForm] = useState(vendaVazia)
  const [situacaoPagamento, setSituacaoPagamento] = useState('pago')
  const [mostrarVencimentos, setMostrarVencimentos] = useState(false)
  const [listaAberta, setListaAberta] = useState(null) // 'atraso' | 'condicional' | null
  // true = venda com NF aberta só para ajustar o pagamento (todo o resto fica travado)
  const [modoPagamento, setModoPagamento] = useState(false)
  const [parcelamento, setParcelamento] = useState('1x')
  const [itensForm, setItensForm] = useState([
    { produto_id: '', produto_nome: '', quantidade: 1, valor_unitario: 0, preco_base: 0, desconto_percentual: 0, tipo_cliente: 'cliente_final' },
  ])

  useEffect(() => {
    carregar()
  }, [])

  useEffect(() => {
    setPageHeader({
      title: 'Vendas',
      subtitle: 'Registro e análise de vendas de produtos',
      actions: (
        <button
          type="button"
          onClick={() => {
            const hoje = hojeLocal()
            setForm({ ...vendaVazia, data_venda: hoje, data_pagamento: hoje, situacao_pagamento: 'pago', parcelamento: '1x', parcelas_json: [], data_retorno_condicional: '', desconto_venda: 0 })
            setSituacaoPagamento('pago')
            setParcelamento('1x')
            setItensForm([{ produto_id: '', produto_nome: '', quantidade: 1, valor_unitario: 0, preco_base: 0, desconto_percentual: 0, tipo_cliente: 'cliente_final', quantidade_vendida: 0, quantidade_devolvida: 0 }])
            setModoPagamento(false)
            setMostrarForm(true)
          }}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-[0_8px_20px_rgba(154,91,32,0.20)] hover:brightness-105 transition"
        >
          <span className="text-lg leading-none">+</span>
          Nova venda
        </button>
      ),
    })

    return () => setPageHeader({ title: '', subtitle: '', actions: null })
  }, [setPageHeader])

  async function carregar() {
    setCarregando(true)

    const { data: vData } = await supabase
      .from('vendas')
      .select('*, contatos(nome)')
      .order('data_venda', { ascending: false })

    const { data: cData } = await supabase
      .from('contatos')
      .select('id, nome, tipo, cpf, cnpj, desconto_percentual')
      .order('nome')

    const { data: vendedorData } = await supabase
      .from('vendedores')
      .select('id, nome, ativo')
      .eq('ativo', true)
      .order('nome')

    const { data: pData } = await supabase
      .from('produtos')
      .select('*')
      .eq('ativo', true)
      .order('nome')

    const { data: iData } = await supabase.from('itens_venda').select('*')

    const agrupado = {}
    ;(iData || []).forEach((i) => {
      if (!agrupado[i.venda_id]) agrupado[i.venda_id] = []
      agrupado[i.venda_id].push(i)
    })

    setVendas(vData || [])
    setContatos(cData || [])
    setVendedores(vendedorData || [])
    setProdutos(pData || [])
    setItensPorVenda(agrupado)
    setCarregando(false)
  }

  function obterPerfilCliente(contatoId) {
    const contato = contatos.find((c) => c.id === contatoId)
    const tipo = contato?.tipo || 'cliente_final'
    const profissional = ['revendedora', 'clinica'].includes(tipo)
    const desconto = Math.max(0, Math.min(100, Number(contato?.desconto_percentual || 0)))
    return { contato, tipo, profissional, desconto }
  }

  function calcularPrecoProduto(produto, contatoId) {
    const { tipo, profissional, desconto } = obterPerfilCliente(contatoId)
    const precoBase = Number(profissional ? (produto?.preco_profissional ?? produto?.preco ?? 0) : (produto?.preco_consumidor ?? produto?.preco ?? 0))
    const valorUnitario = precoBase * (1 - desconto / 100)
    return { tipo, desconto, precoBase, valorUnitario }
  }

  function atualizarItem(idx, campo, valor) {
    const novos = [...itensForm]

    if (campo === 'produto_id') {
      const produto = produtos.find((p) => p.id === valor)
      const preco = calcularPrecoProduto(produto, form.contato_id)
      novos[idx] = {
        ...novos[idx],
        produto_id: valor,
        produto_nome: produto?.nome || '',
        valor_unitario: preco.valorUnitario,
        preco_base: preco.precoBase,
        desconto_percentual: preco.desconto,
        tipo_cliente: preco.tipo,
      }
    } else {
      novos[idx] = { ...novos[idx], [campo]: valor }
    }

    setItensForm(novos)
  }

  function adicionarLinha() {
    setItensForm([
      ...itensForm,
      { produto_id: '', produto_nome: '', quantidade: 1, valor_unitario: 0, preco_base: 0, desconto_percentual: 0, tipo_cliente: 'cliente_final', quantidade_vendida: 0, quantidade_devolvida: 0 },
    ])
  }

  function removerLinha(idx) {
    setItensForm(itensForm.filter((_, i) => i !== idx))
  }

  function obterImagemProduto(produto) {
    return (
      produto?.imagem_url ||
      produto?.imagem ||
      produto?.foto_url ||
      produto?.foto ||
      produto?.image_url ||
      produto?.url_imagem ||
      ''
    )
  }

  function adicionarDias(data, dias) {
    if (!data) return ''
    const [ano, mes, dia] = data.split('-').map(Number)
    const d = new Date(ano, (mes || 1) - 1, dia || 1)
    d.setDate(d.getDate() + dias)
    return dataParaISO(d)
  }

  function montarParcelas(total, quantidade, dataBase) {
    const valorTotal = Math.max(0, Number(total || 0))
    const partes = quantidade === '2x' ? 2 : 1
    const valorBase = Number((valorTotal / partes).toFixed(2))
    const parcelas = []

    for (let i = 0; i < partes; i += 1) {
      const valor = i === partes - 1
        ? Number((valorTotal - valorBase * (partes - 1)).toFixed(2))
        : valorBase
      parcelas.push({
        numero: i + 1,
        percentual: 100 / partes,
        valor,
        vencimento: adicionarDias(dataBase, 30 * (i + 1)),
      })
    }

    return parcelas
  }

  function atualizarSituacaoPagamento(valor) {
    setSituacaoPagamento(valor)
    setForm((atual) => ({
      ...atual,
      situacao_pagamento: valor,
      data_pagamento: valor === 'pago' ? (atual.data_pagamento || atual.data_venda) : '',
    }))
  }

  function atualizarParcelamento(valor) {
    setParcelamento(valor)
    setForm((atual) => ({ ...atual, parcelamento: valor, parcelas_json: [] }))
  }

  function diminuirQuantidade(idx) {
    const atual = Number(itensForm[idx]?.quantidade || 1)
    atualizarItem(idx, 'quantidade', Math.max(1, atual - 1))
  }

  function aumentarQuantidade(idx) {
    const atual = Number(itensForm[idx]?.quantidade || 1)
    atualizarItem(idx, 'quantidade', atual + 1)
  }

  function prepararEdicao(venda, { soPagamento = false } = {}) {
    if (venda.nf_transmitida && !soPagamento) {
      alert('Esta venda possui NF transmitida e não pode mais ser editada. Para alterar o registro, primeiro é necessário cancelar a NF.')
      return
    }

    const itens = (itensPorVenda[venda.id] || []).map((item) => ({
      ...item,
      produto_nome: item.produto_nome || produtos.find((p) => p.id === item.produto_id)?.nome || '',
      quantidade: Number(item.quantidade || 1),
      valor_unitario: Number(item.valor_unitario || 0),
      preco_base: Number(item.preco_base || item.valor_unitario || 0),
      desconto_percentual: Number(item.desconto_percentual || 0),
      tipo_cliente: item.tipo_cliente || 'cliente_final',
      quantidade_vendida: Number(item.quantidade_vendida || 0),
      quantidade_devolvida: Number(item.quantidade_devolvida || 0),
    }))

    setForm({
      id: venda.id,
      contato_id: venda.contato_id || '',
      vendedor_id: venda.vendedor_id || '',
      vendedor_nome: venda.vendedor_nome || '',
      data_venda: String(venda.data_venda || '').slice(0, 10) || hojeLocal(),
      forma_pagamento: venda.forma_pagamento || '',
      situacao_pagamento: venda.situacao_pagamento || 'pago',
      data_pagamento: String(venda.data_pagamento || venda.data_venda || '').slice(0, 10),
      parcelamento: venda.parcelamento || '1x',
      parcelas_json: venda.parcelas_json || [],
      data_retorno_condicional: String(venda.data_retorno_condicional || '').slice(0, 10),
      desconto_venda: Number(venda.desconto_venda || 0),
      observacoes: venda.observacoes || '',
      nf_transmitida: Boolean(venda.nf_transmitida),
      nf_cancelada: Boolean(venda.nf_cancelada),
    })
    setItensForm(itens.length ? itens : [{ produto_id: '', produto_nome: '', quantidade: 1, valor_unitario: 0, preco_base: 0, desconto_percentual: 0, tipo_cliente: 'cliente_final', quantidade_vendida: 0, quantidade_devolvida: 0 }])
    setSituacaoPagamento(venda.situacao_pagamento || 'pago')
    setParcelamento(venda.parcelamento || '1x')
    setVendaSelecionada(venda)
    setModoPagamento(Boolean(soPagamento && venda.nf_transmitida))
    setMostrarForm(true)
  }

  // Monta os campos de pagamento. Se todas as parcelas estiverem marcadas como pagas,
  // a venda vira "pago" (a data é a da última baixa) e as parcelas continuam guardadas.
  function camposPagamento(sit, dataVenda) {
    const parcelas = sit === 'a_receber' ? parcelasPreview : []
    const todasPagas = parcelas.length > 0 && parcelas.every((p) => p.pago)
    const ultimaBaixa = parcelas.map((p) => p.pago_em).filter(Boolean).sort().pop()
    return {
      situacao_pagamento: todasPagas ? 'pago' : sit,
      data_pagamento: todasPagas
        ? (ultimaBaixa || dataVenda)
        : (sit === 'pago' ? (form.data_pagamento || dataVenda) : null),
      parcelamento: sit === 'a_receber' ? parcelamento : null,
      parcelas_json: parcelas,
      data_retorno_condicional: sit === 'condicional' ? (form.data_retorno_condicional || null) : null,
    }
  }

  async function salvar(e) {
    e.preventDefault()

    // Venda com NF: só pagamento e datas. Itens, cliente, valores e NF não são tocados.
    if (modoPagamento && form.id) {
      const sit = ['pago', 'a_receber', 'condicional'].includes(situacaoPagamento) ? situacaoPagamento : 'pago'
      const dataVendaPg = String(form.data_venda || '').slice(0, 10)
      const { data, error } = await supabase
        .from('vendas')
        .update(camposPagamento(sit, dataVendaPg))
        .eq('id', form.id)
        .select('*, contatos(nome)')
        .single()

      if (error || !data) {
        console.error('Erro ao salvar pagamento:', error)
        alert(`Não foi possível salvar o pagamento: ${error?.message || 'erro desconhecido'}`)
        return
      }

      setVendas((lista) => lista.map((item) => item.id === data.id ? data : item))
      setVendaSelecionada(data)
      setForm(vendaVazia)
      setSituacaoPagamento('pago')
      setParcelamento('1x')
      setModoPagamento(false)
      setMostrarForm(false)
      return
    }

    if (form.id) {
      const vendaAtual = vendas.find((v) => v.id === form.id)
      if (vendaAtual?.nf_transmitida) {
        alert('Esta venda está bloqueada porque a NF foi transmitida. Somente o cancelamento da NF pode alterar esse estado.')
        return
      }
    }

    if (!form.contato_id) {
      alert('Selecione o cliente.')
      return
    }

    if (!form.vendedor_id || !form.vendedor_nome) {
      alert('Selecione o vendedor responsável pela venda.')
      return
    }

    const itensValidos = itensForm.filter((i) => i.produto_nome && Number(i.quantidade) > 0)
    if (!itensValidos.length) {
      alert('Adicione pelo menos um produto à venda.')
      return
    }

    const dataVenda = String(form.data_venda || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataVenda)) {
      alert('Informe a data da venda.')
      return
    }

    // Mantém a situação escolhida pelo usuário como a fonte única da verdade.
    // Isso evita que uma venda condicional seja gravada como "pago" por valor antigo/default.
    const situacaoFinal = ['pago', 'a_receber', 'condicional'].includes(situacaoPagamento)
      ? situacaoPagamento
      : 'pago'

    const payloadVenda = {
      contato_id: form.contato_id,
      vendedor_id: form.vendedor_id || null,
      vendedor_nome: form.vendedor_nome || null,
      data_venda: dataVenda,
      forma_pagamento: form.forma_pagamento || null,
      ...camposPagamento(situacaoFinal, dataVenda),
      desconto_venda: Number(form.desconto_venda || 0),
      observacoes: form.observacoes || null,
      nf_transmitida: Boolean(form.nf_transmitida),
      nf_cancelada: Boolean(form.nf_cancelada),
    }

    let vendaSalva

    if (form.id) {
      const { data, error } = await supabase
        .from('vendas')
        .update(payloadVenda)
        .eq('id', form.id)
        .select()
        .single()

      if (error || !data) {
        console.error('Erro ao atualizar venda:', error)
        alert(`Não foi possível atualizar a venda: ${error?.message || 'erro desconhecido'}`)
        return
      }
      vendaSalva = data

      const { error: erroExcluirItens } = await supabase
        .from('itens_venda')
        .delete()
        .eq('venda_id', form.id)

      if (erroExcluirItens) {
        alert(`A venda foi atualizada, mas os itens não puderam ser substituídos: ${erroExcluirItens.message}`)
        return
      }
    } else {
      const { data, error } = await supabase
        .from('vendas')
        .insert(payloadVenda)
        .select()
        .single()

      if (error || !data) {
        console.error('Erro ao salvar venda:', error)
        alert(`Não foi possível salvar a venda: ${error?.message || 'erro desconhecido'}`)
        return
      }
      vendaSalva = data
    }

    const { error: erroInserirItens } = await supabase.from('itens_venda').insert(
      itensValidos.map((i) => ({
        produto_id: i.produto_id || null,
        produto_nome: i.produto_nome,
        quantidade: Number(i.quantidade) || 0,
        valor_unitario: Number(i.valor_unitario) || 0,
        preco_base: Number(i.preco_base) || Number(i.valor_unitario) || 0,
        desconto_percentual: Number(i.desconto_percentual) || 0,
        tipo_cliente: i.tipo_cliente || 'cliente_final',
        quantidade_vendida: Number(i.quantidade_vendida || 0),
        quantidade_devolvida: Number(i.quantidade_devolvida || 0),
        venda_id: vendaSalva.id,
      })),
    )

    if (erroInserirItens) {
      console.error('Erro ao salvar itens da venda:', erroInserirItens)
      alert(`A venda foi gravada, mas os itens não puderam ser salvos: ${erroInserirItens.message}`)
      return
    }

    setForm(vendaVazia)
    setSituacaoPagamento('pago')
    setParcelamento('1x')
    setItensForm([{ produto_id: '', produto_nome: '', quantidade: 1, valor_unitario: 0, preco_base: 0, desconto_percentual: 0, tipo_cliente: 'cliente_final', quantidade_vendida: 0, quantidade_devolvida: 0 }])
    setModoPagamento(false)
    setMostrarForm(false)
    setVendaSelecionada(vendaSalva)
    await carregar()
  }

  async function alternarNfTransmitida(venda, valor) {
    if (venda.nf_transmitida || venda.nf_cancelada) return

    const { data, error } = await supabase
      .from('vendas')
      .update({ nf_transmitida: valor, nf_cancelada: valor ? false : venda.nf_cancelada })
      .eq('id', venda.id)
      .select('*, contatos(nome)')
      .single()

    if (error) {
      console.error('Erro ao atualizar NF:', error)
      alert(`Não foi possível atualizar a situação da NF: ${error.message}`)
      return
    }

    setVendas((lista) => lista.map((item) => item.id === venda.id ? data : item))
    setVendaSelecionada(data)
  }

  async function cancelarNf(venda) {
    if (!venda.nf_transmitida || venda.nf_cancelada) return
    const confirmar = window.confirm('Confirmar cancelamento da NF? A venda continuará registrada no histórico, mas a NF ficará marcada como cancelada.')
    if (!confirmar) return

    const { data, error } = await supabase
      .from('vendas')
      .update({ nf_cancelada: true })
      .eq('id', venda.id)
      .select('*, contatos(nome)')
      .single()

    if (error) {
      console.error('Erro ao cancelar NF:', error)
      alert(`Não foi possível cancelar a NF: ${error.message}`)
      return
    }

    setVendas((lista) => lista.map((item) => item.id === venda.id ? data : item))
    setVendaSelecionada(data)
  }

  // Registra pagamento sem editar a venda, então funciona mesmo com NF transmitida.
  // Só mexe nos campos de pagamento (situação, data e parcelas).
  async function registrarPagamento(venda, numeroParcela) {
    if (venda.nf_cancelada) return
    const dataHoje = hojeLocal()
    let payload

    if (venda.situacao_pagamento === 'a_receber') {
      const novas = parcelasDaVenda(venda).map((p) =>
        p.numero === numeroParcela ? { ...p, pago: true, pago_em: dataHoje } : p,
      )
      const tudoPago = novas.every((p) => p.pago)
      payload = {
        parcelas_json: novas,
        ...(tudoPago ? { situacao_pagamento: 'pago', data_pagamento: dataHoje } : {}),
      }
    } else if (venda.situacao_pagamento === 'condicional') {
      payload = { situacao_pagamento: 'pago', data_pagamento: dataHoje, parcelas_json: [] }
    } else {
      return
    }

    const { data, error } = await supabase
      .from('vendas')
      .update(payload)
      .eq('id', venda.id)
      .select('*, contatos(nome)')
      .single()

    if (error || !data) {
      console.error('Erro ao registrar pagamento:', error)
      alert(`Não foi possível registrar o pagamento: ${error?.message || 'erro desconhecido'}`)
      return
    }

    setVendas((lista) => lista.map((item) => item.id === venda.id ? data : item))
    setVendaSelecionada((atual) => (atual?.id === venda.id ? data : atual))
  }

  // Venda SEM NF: apaga a venda e os itens, como se nunca tivesse existido.
  async function cancelarVenda(venda) {
    if (venda.nf_transmitida) return
    const confirmar = window.confirm('Cancelar esta venda? Ela será apagada por completo (com todos os itens) e não poderá ser recuperada.')
    if (!confirmar) return

    const { error: erroItens } = await supabase
      .from('itens_venda')
      .delete()
      .eq('venda_id', venda.id)

    if (erroItens) {
      console.error('Erro ao apagar itens da venda:', erroItens)
      alert(`Não foi possível cancelar a venda: ${erroItens.message}`)
      return
    }

    const { error } = await supabase
      .from('vendas')
      .delete()
      .eq('id', venda.id)

    if (error) {
      console.error('Erro ao cancelar venda:', error)
      alert(`Não foi possível cancelar a venda: ${error.message}`)
      return
    }

    setVendas((lista) => lista.filter((item) => item.id !== venda.id))
    setItensPorVenda((atual) => {
      const novo = { ...atual }
      delete novo[venda.id]
      return novo
    })
    setVendaSelecionada(null)
  }

  const subtotalForm = itensForm.reduce(
    (s, i) =>
      s + (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0),
    0,
  )
  const descontoVenda = Math.max(0, Number(form.desconto_venda || 0))
  const totalLiquido = Math.max(0, subtotalForm - descontoVenda)
  const parcelasPreviewBase = montarParcelas(totalLiquido, parcelamento, form.data_venda)
  const parcelasPreview = (form.parcelas_json?.length === parcelasPreviewBase.length ? form.parcelas_json : parcelasPreviewBase)
  const totalForm = totalLiquido

  const totalVenda = (v) =>
    (itensPorVenda[v.id] || []).reduce(
      (s, i) => s + Number(i.quantidade || 0) * Number(i.valor_unitario || 0),
      0,
    )

  const parcelasDaVenda = (v) => {
    const parcelas = Array.isArray(v.parcelas_json) ? v.parcelas_json : []
    if (parcelas.length) return parcelas
    return [{
      numero: 1,
      percentual: 100,
      valor: totalVenda(v),
      vencimento: adicionarDias(String(v.data_venda || '').slice(0, 10), 30),
    }]
  }

  // Vendas com NF cancelada continuam no histórico, mas não entram nos totais.
  const vendasAtivas = vendas.filter((v) => !v.nf_cancelada)

  const totalGeral = vendasAtivas.reduce((s, v) => s + totalVenda(v), 0)
  const ticketMedio = vendasAtivas.length ? totalGeral / vendasAtivas.length : 0

  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)

  const totalMes = vendasAtivas
    .filter((v) => paraDataLocal(v.data_venda) >= inicioMes)
    .reduce((s, v) => s + totalVenda(v), 0)

  const itensVendidos = vendasAtivas.reduce(
    (s, v) =>
      s +
      (itensPorVenda[v.id] || []).reduce(
        (total, item) => total + Number(item.quantidade || 0),
        0,
      ),
    0,
  )

  const hoje = hojeLocal()
  const vendasDoMes = vendasAtivas.filter((v) => paraDataLocal(v.data_venda) >= inicioMes).length

  // Valor em condicional: vendas cuja situação é "condicional" (ainda sem pagamento definido).
  const valorCondicional = vendasAtivas
    .filter((v) => v.situacao_pagamento === 'condicional')
    .reduce((s, v) => s + totalVenda(v), 0)

  // Valor em atraso: parcelas de vendas "a receber" com vencimento anterior a hoje.
  // Vendas antigas sem parcelas usam data da venda + 30 dias como vencimento.
  const valorEmAtraso = vendasAtivas.reduce((soma, v) => {
    if (v.situacao_pagamento !== 'a_receber') return soma
    const parcelas = Array.isArray(v.parcelas_json) ? v.parcelas_json : []

    if (!parcelas.length) {
      const vencimento = adicionarDias(String(v.data_venda || '').slice(0, 10), 30)
      return vencimento && vencimento < hoje ? soma + totalVenda(v) : soma
    }

    return soma + parcelas.reduce((s, p) => {
      const vencimento = String(p.vencimento || '').slice(0, 10)
      return !p.pago && vencimento && vencimento < hoje ? s + Number(p.valor || 0) : s
    }, 0)
  }, 0)

  // Parcelas a receber que vencem hoje (ainda não pagas)
  const vencimentosHoje = vendasAtivas.flatMap((v) => {
    if (v.situacao_pagamento !== 'a_receber') return []
    const parcelas = parcelasDaVenda(v)
    return parcelas
      .filter((p) => !p.pago && String(p.vencimento || '').slice(0, 10) === hoje)
      .map((p) => ({ venda: v, parcela: p, totalParcelas: parcelas.length }))
  })
  const totalVencendoHoje = vencimentosHoje.reduce((s, i) => s + Number(i.parcela.valor || 0), 0)

  // Lista "Valor em atraso": uma linha por parcela vencida e não paga (mais antigas primeiro)
  const listaAtraso = vendasAtivas
    .flatMap((v) => {
      if (v.situacao_pagamento !== 'a_receber') return []
      const parcelas = parcelasDaVenda(v)
      return parcelas
        .filter((p) => {
          const venc = String(p.vencimento || '').slice(0, 10)
          return !p.pago && venc && venc < hoje
        })
        .map((p) => ({ venda: v, parcela: p, totalParcelas: parcelas.length }))
    })
    .sort((a, b) => String(a.parcela.vencimento).localeCompare(String(b.parcela.vencimento)))

  // Lista "Valor em condicional": uma linha por venda condicional (retorno mais próximo primeiro)
  const listaCondicional = vendasAtivas
    .filter((v) => v.situacao_pagamento === 'condicional')
    .sort((a, b) => String(a.data_retorno_condicional || '9999').localeCompare(String(b.data_retorno_condicional || '9999')))

  const indicadores = [
    { rotulo: 'Vendas do mês', icone: '🛒', valor: vendasDoMes },
    { rotulo: 'Total vendido', icone: '🪙', valor: formatarMoeda(totalMes) },
    { rotulo: 'Ticket médio', icone: '▥', valor: formatarMoeda(ticketMedio) },
    { rotulo: 'Itens vendidos', icone: '◇', valor: itensVendidos },
    { rotulo: 'Valor em atraso', icone: '⏳', valor: formatarMoeda(valorEmAtraso), alerta: valorEmAtraso > 0, lista: 'atraso' },
    { rotulo: 'Valor em condicional', icone: '↻', valor: formatarMoeda(valorCondicional), lista: 'condicional' },
  ]

  const vendasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    return vendas.filter((v) => {
      const nome = v.contatos?.nome?.toLowerCase() || ''
      const vendedor = v.vendedor_nome?.toLowerCase() || ''
      const correspondeBusca = !termo || nome.includes(termo) || vendedor.includes(termo)
      const correspondePagamento =
        !pagamentoFiltro || v.forma_pagamento === pagamentoFiltro

      let correspondePeriodo = true
      if (periodoFiltro === 'mes') {
        correspondePeriodo = paraDataLocal(v.data_venda) >= inicioMes
      }

      if (periodoFiltro === 'ultimos-30') {
        const limite = new Date()
        limite.setDate(limite.getDate() - 30)
        correspondePeriodo = paraDataLocal(v.data_venda) >= limite
      }

      return (
        correspondeBusca &&
        correspondePagamento &&
        correspondePeriodo
      )
    })
  }, [vendas, busca, pagamentoFiltro, periodoFiltro])

  const vendasPorMes = useMemo(() => {
    const agora = new Date()
    const nomesMeses = [
      'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
      'jul', 'ago', 'set', 'out', 'nov', 'dez',
    ]

    const resultado = Array.from({ length: 6 }, (_, index) => {
      const mesAtual = agora.getMonth() - (5 - index)
      const dataBase = new Date(agora.getFullYear(), mesAtual, 1)

      const total = vendasAtivas.reduce((s, v) => {
        const data = paraDataLocal(v.data_venda)
        if (
          data.getMonth() === dataBase.getMonth() &&
          data.getFullYear() === dataBase.getFullYear()
        ) {
          return s + totalVenda(v)
        }
        return s
      }, 0)

      return {
        nome: nomesMeses[dataBase.getMonth()],
        ano: dataBase.getFullYear(),
        total,
      }
    })

    return resultado
  }, [vendas, itensPorVenda]) // eslint-disable-line react-hooks/exhaustive-deps

  const maiorMes = Math.max(...vendasPorMes.map((m) => m.total), 1)

  const formasPagamento = useMemo(() => {
    const contagem = {}
    vendasAtivas.forEach((v) => {
      const nome = v.forma_pagamento || 'Não informado'
      contagem[nome] = (contagem[nome] || 0) + 1
    })

    return Object.entries(contagem).sort((a, b) => b[1] - a[1])
  }, [vendas]) // eslint-disable-line react-hooks/exhaustive-deps

  function abrirDetalhes(venda) {
    setVendaSelecionada(venda)
  }

  return (
    <div className="w-full min-h-0 pb-4">
      <style>{`
        .lm-scrollbar {
          scrollbar-width: auto;
          scrollbar-color: #B8782D #F3E8D9;
        }
        .lm-scrollbar::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }
        .lm-scrollbar::-webkit-scrollbar-track {
          background: #F3E8D9;
          border-radius: 8px;
        }
        .lm-scrollbar::-webkit-scrollbar-thumb {
          background: #B8782D;
          border-radius: 8px;
          border: 2px solid #F3E8D9;
        }
        .lm-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #9A5B20;
        }
        .modo-pagamento section:not(.secao-pagamento):not(.secao-resumo):not(.secao-itens) {
          pointer-events: none;
          opacity: 0.55;
        }
        /* Itens: dá para rolar e ver, mas não clicar nem editar */
        .modo-pagamento .secao-itens input,
        .modo-pagamento .secao-itens select,
        .modo-pagamento .secao-itens textarea,
        .modo-pagamento .secao-itens button {
          pointer-events: none;
          opacity: 0.6;
        }
        .modo-pagamento .secao-resumo input {
          pointer-events: none;
        }
      `}</style>
      {/* INDICADORES — 6 cards sempre na mesma linha (colunas fixas, sem depender de breakpoint) */}
      <section
        className="grid gap-[1px] mb-[1px]"
        style={{ gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}
      >
        {indicadores.map((card) => {
          const Tag = card.lista ? 'button' : 'div'
          return (
            <Tag
              key={card.rotulo}
              {...(card.lista ? { type: 'button', onClick: () => setListaAberta(card.lista) } : {})}
              className={`min-w-0 bg-white/95 border border-[#eadfce] rounded-2xl px-2.5 py-2 shadow-[0_6px_20px_rgba(77,45,18,0.04)] flex items-center gap-2 min-h-[70px] ${card.lista ? 'text-left cursor-pointer hover:shadow-[0_10px_26px_rgba(77,45,18,0.08)] transition-all' : ''}`}
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0 ${card.alerta ? 'bg-[#fbe4e4] text-[#a63d3d]' : 'bg-[#f5ecdd] text-[#9A5B20]'}`}>
                {card.icone}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[9px] uppercase tracking-[0.05em] text-mata-ink/55 truncate" title={card.rotulo}>
                  {card.rotulo}
                </p>
                <p className={`font-display text-[clamp(14px,1.35vw,20px)] leading-none mt-1 whitespace-nowrap ${card.alerta ? 'text-[#a63d3d]' : 'text-mata-ink'}`}>
                  {card.valor}
                </p>
              </div>
              {card.lista && <span className="text-[#9A5B20] text-xl opacity-70 shrink-0">›</span>}
            </Tag>
          )
        })}
        ))}
      </section>

      {/* COLUNA PRINCIPAL + COLUNA DIREITA
          Tudo usa o mesmo grid, para que gráfico/filtros/vendas fiquem
          perfeitamente alinhados entre si, e resumo/detalhes também. */}
      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.95fr)_minmax(360px,1fr)] xl:grid-rows-[auto_auto_minmax(0,1fr)] gap-[1px] items-stretch xl:h-[476px]">
        {/* ESQUERDA */}
        <div className="min-w-0 min-h-0 flex flex-col gap-[1px] xl:contents">
          {/* GRÁFICO */}
          <div className="bg-white/95 border border-[#eadfce] rounded-2xl px-5 py-2 h-[235px] shrink-0 shadow-[0_6px_20px_rgba(77,45,18,0.04)] xl:col-start-1 xl:row-start-1">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-3">
                <span className="text-[#9A5B20] text-xl">▣</span>
                <div>
                  <h2 className="font-display text-[22px] leading-none text-[#2f2118]">
                    Vendas por mês
                  </h2>
                  <p className="text-[11px] text-mata-ink/50 mt-1">
                    Últimos 6 meses
                  </p>
                </div>
              </div>

              <span className="rounded-xl border border-[#eadfce] px-3 py-1.5 text-[11px] text-[#5d5148] bg-[#fffdfa]">
                Total em R$
              </span>
            </div>

            <div className="h-[154px] flex items-end gap-4 px-6 pt-1 border-b border-[#ddcdbb]">
              {vendasPorMes.map((mes) => {
                const altura = mes.total
                  ? Math.max(10, (mes.total / maiorMes) * 118)
                  : 2

                return (
                  <div
                    key={mes.nome}
                    className="flex-1 h-full flex flex-col justify-end items-center gap-1"
                  >
                    <span className="text-[10px] text-[#6c625a]">
                      {mes.total ? formatarMoeda(mes.total) : ''}
                    </span>
                    <div
                      className="w-full max-w-[58px] rounded-t-lg bg-[#B8782D]"
                      style={{ height: `${altura}px` }}
                    />
                    <span className="text-[10px] text-[#5f554e]">
                      {mes.nome}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* FILTROS */}
          <div className="bg-white/95 border border-[#eadfce] rounded-2xl px-3 py-2 shrink-0 shadow-[0_6px_20px_rgba(77,45,18,0.04)] xl:col-start-1 xl:row-start-2">
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_190px_180px_auto] gap-2">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#806d5d]">
                  ⌕
                </span>
                <input
                  type="text"
                  placeholder="Localizar por cliente ou vendedor..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="w-full border border-[#eadfce] bg-[#fffdfa] rounded-xl pl-9 pr-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-[#B8782D]/20"
                />
              </div>

              <select
                value={pagamentoFiltro}
                onChange={(e) => setPagamentoFiltro(e.target.value)}
                className="w-full border border-[#eadfce] bg-[#fffdfa] rounded-xl px-3 py-2 text-[12px] outline-none"
              >
                <option value="">Todos os pagamentos</option>
                <option value="Pix">Pix</option>
                <option value="Dinheiro">Dinheiro</option>
                <option value="Cartão de crédito">Cartão de crédito</option>
                <option value="Cartão de débito">Cartão de débito</option>
                <option value="Boleto">Boleto</option>
                <option value="Transferência">Transferência</option>
              </select>

              <select
                value={periodoFiltro}
                onChange={(e) => setPeriodoFiltro(e.target.value)}
                className="w-full border border-[#eadfce] bg-[#fffdfa] rounded-xl px-3 py-2 text-[12px] outline-none"
              >
                <option value="">Todos os períodos</option>
                <option value="mes">Este mês</option>
                <option value="ultimos-30">Últimos 30 dias</option>
              </select>

              <div className="flex items-center justify-end px-2 text-[11px] text-mata-ink/55 whitespace-nowrap">
                {vendasFiltradas.length} registro(s)
              </div>
            </div>
          </div>

          {/* VENDAS */}
          <div className="bg-white/95 border border-[#eadfce] rounded-2xl overflow-hidden shadow-[0_6px_20px_rgba(77,45,18,0.04)] h-[215px] xl:h-auto xl:flex-1 xl:min-h-0 flex flex-col xl:col-start-1 xl:row-start-3">
            <div className="shrink-0 px-5 py-2 flex items-center justify-between border-b border-[#eee4d7]">
              <div className="flex items-center gap-3">
                <span className="text-[#9A5B20] text-lg">🛒</span>
                <h2 className="font-display text-[17px] text-[#2f2118]">
                  Vendas
                </h2>
              </div>
              <span className="text-[11px] text-mata-ink/50">
                {vendasFiltradas.length} registro(s)
              </span>
            </div>

            {carregando ? (
              <div className="px-4 py-8 text-sm text-mata-ink/50">
                Carregando…
              </div>
            ) : vendasFiltradas.length === 0 ? (
              <div className="px-4 py-8 text-sm text-mata-ink/50">
                {busca
                  ? 'Nenhum resultado para essa busca.'
                  : 'Nenhuma venda registrada ainda.'}
              </div>
            ) : (
              <div className="h-[170px] xl:h-auto xl:flex-1 xl:min-h-0 overflow-y-scroll overflow-x-auto lm-scrollbar" style={{ scrollbarWidth: "auto", scrollbarColor: "#B8782D #F3E8D9", scrollbarGutter: "stable" }}>
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-[1.2fr_1fr_1fr_1fr_.55fr_1fr_.8fr_.55fr] gap-2 px-5 py-1 bg-[#f7f0e7] text-[10px] uppercase tracking-[0.06em] text-[#76695e]">
                    <span>Cliente</span>
                    <span>Vendedor</span>
                    <span>Data</span>
                    <span>Pagamento</span>
                    <span>Itens</span>
                    <span>Total</span>
                    <span>Status</span>
                    <span>Ações</span>
                  </div>

                  {vendasFiltradas.map((venda) => {
                    const itens = itensPorVenda[venda.id] || []
                    const total = totalVenda(venda)
                    const qtdItens = itens.reduce(
                      (s, i) => s + Number(i.quantidade || 0),
                      0,
                    )

                    return (
                      <button
                        type="button"
                        key={venda.id}
                        onClick={() => abrirDetalhes(venda)}
                        className="w-full text-left grid grid-cols-[1.2fr_1fr_1fr_1fr_.55fr_1fr_.8fr_.55fr] gap-2 px-5 py-1.5 items-center border-b border-[#eee6dc] last:border-b-0 hover:bg-[#fffaf4] transition"
                      >
                        <span className="font-medium text-[12px] text-[#2f2118] truncate">
                          {venda.contatos?.nome || 'Sem nome'}
                        </span>
                        <span className="text-[11px] text-mata-ink/70 truncate">
                          {venda.vendedor_nome || 'Não informado'}
                        </span>
                        <span className="text-[11px] text-mata-ink/60">
                          {formatarData(venda.data_venda)}
                        </span>
                        <span className="text-[11px] text-mata-ink/70 truncate">
                          {venda.forma_pagamento || 'Não informado'}
                        </span>
                        <span className="text-[11px] text-mata-ink/70">
                          {qtdItens}
                        </span>
                        <span className="text-[12px] font-medium text-[#3a2a20]">
                          {formatarMoeda(total)}
                        </span>
                        <span>
                          <span className={`inline-flex rounded-full px-2 py-1 text-[9px] whitespace-nowrap ${
                            venda.nf_cancelada
                              ? 'bg-[#fbe4e4] text-[#a63d3d]'
                              : venda.nf_transmitida
                                ? 'bg-[#e5f4e6] text-[#4b7a4f]'
                                : 'bg-[#f4eadc] text-[#806348]'
                          }`}>
                            {venda.nf_cancelada ? 'NF cancelada' : venda.nf_transmitida ? 'NF transmitida' : 'NF pendente'}
                          </span>
                        </span>
                        <span className="text-[#9A5B20] text-sm">
                          Ver ›
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* DIREITA */}
        <aside className="min-w-0 min-h-0 flex flex-col gap-[1px] xl:contents">
          {/* RESUMO */}
          <div className="bg-white/95 border border-[#eadfce] rounded-2xl px-5 py-2 h-[235px] shrink-0 shadow-[0_6px_20px_rgba(77,45,18,0.04)] xl:h-[235px] xl:col-start-2 xl:row-start-1 xl:flex xl:flex-col xl:overflow-hidden">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[#9A5B20] text-lg">▣</span>
              <h2 className="font-display text-[17px] text-[#2f2118]">
                Resumo
              </h2>
            </div>

            <div className="divide-y divide-[#eee4d7] xl:flex-1 xl:flex xl:flex-col">
              <div className="flex items-center justify-between px-2 py-1 xl:flex-1">
                <span className="text-[12px] text-mata-ink/65">
                  Vendas realizadas
                </span>
                <strong className="font-display text-[18px] text-[#2f2118]">
                  {vendasAtivas.length}
                </strong>
              </div>

              <div className="flex items-center justify-between px-2 py-1 xl:flex-1">
                <span className="text-[12px] text-mata-ink/65">
                  Total acumulado
                </span>
                <strong className="font-display text-[17px] text-[#2f2118]">
                  {formatarMoeda(totalGeral)}
                </strong>
              </div>

              <div className="flex items-center justify-between px-2 py-1 xl:flex-1">
                <span className="text-[12px] text-mata-ink/65">
                  Ticket médio
                </span>
                <strong className="font-display text-[20px] text-[#2f2118]">
                  {formatarMoeda(ticketMedio)}
                </strong>
              </div>

              <div className="flex items-center justify-between px-2 py-1 xl:flex-1">
                <span className="text-[12px] text-mata-ink/65">
                  Principal pagamento
                </span>
                <strong className="font-display text-[18px] text-[#2f2118]">
                  {formasPagamento[0]?.[0] || '—'}
                </strong>
              </div>

              <button
                type="button"
                onClick={() => setMostrarVencimentos(true)}
                className="flex items-center justify-between px-2 py-1 xl:flex-1 text-left hover:bg-[#fff6ea]"
              >
                <span className="text-[12px] text-mata-ink/65">
                  Vencem hoje
                  <span className="block text-[9px] text-mata-ink/45">
                    {vencimentosHoje.length
                      ? `${vencimentosHoje.length} ${vencimentosHoje.length === 1 ? 'parcela' : 'parcelas'} — ver clientes`
                      : 'nenhum vencimento'}
                  </span>
                </span>
                <strong className={`font-display text-[18px] ${vencimentosHoje.length ? 'text-[#a63d3d]' : 'text-[#2f2118]'}`}>
                  {formatarMoeda(totalVencendoHoje)}
                </strong>
              </button>
            </div>
          </div>

          {/* DETALHES */}
          <div className="bg-white/95 border border-[#eadfce] rounded-2xl overflow-hidden shadow-[0_6px_20px_rgba(77,45,18,0.04)] h-[240px] xl:h-auto xl:flex-1 xl:min-h-0 flex flex-col xl:col-start-2 xl:row-start-2 xl:row-span-2">
            <div className="shrink-0 px-5 py-2 flex items-center justify-between border-b border-[#eee4d7] bg-white/95">
              <div className="flex items-center gap-3">
                <span className="text-[#9A5B20] text-lg">▣</span>
                <h2 className="font-display text-[20px] text-[#2f2118]">
                  Detalhes
                </h2>
              </div>

              {vendaSelecionada && (
                <div className="flex items-center justify-end gap-1.5 flex-nowrap shrink-0">
                  <button
                    type="button"
                    disabled={Boolean(vendaSelecionada.nf_cancelada)}
                    onClick={() => prepararEdicao(vendaSelecionada, { soPagamento: true })}
                    className="rounded-lg border border-[#8bb78f] px-2.5 py-1.5 text-[10px] whitespace-nowrap font-medium text-[#4b7a4f] hover:bg-[#f4faf3] disabled:opacity-40"
                  >
                    Pagamento
                  </button>
                  {!vendaSelecionada.nf_transmitida ? (
                    <>
                      <button
                        type="button"
                        onClick={() => prepararEdicao(vendaSelecionada)}
                        className="rounded-lg border border-[#c9955f] px-2.5 py-1.5 text-[10px] whitespace-nowrap font-medium text-[#8f4f22] hover:bg-[#fff6ea]"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => cancelarVenda(vendaSelecionada)}
                        className="rounded-lg border border-[#d78b8b] px-2.5 py-1.5 text-[10px] whitespace-nowrap font-medium text-[#a63d3d] hover:bg-[#fff2f2]"
                      >
                        Cancelar venda
                      </button>
                    </>
                  ) : !vendaSelecionada.nf_cancelada ? (
                    <button
                      type="button"
                      onClick={() => cancelarNf(vendaSelecionada)}
                      className="rounded-lg border border-[#d78b8b] px-2.5 py-1.5 text-[10px] whitespace-nowrap font-medium text-[#a63d3d] hover:bg-[#fff2f2]"
                    >
                      Cancelar NF
                    </button>
                  ) : (
                    <span className="rounded-lg bg-[#fbe4e4] px-2.5 py-1.5 text-[10px] whitespace-nowrap font-medium text-[#a63d3d]">
                      NF cancelada
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setVendaSelecionada(null)}
                    className="text-xl text-[#6f6258] hover:text-[#9A5B20]"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>

            <div className="h-[205px] xl:h-auto xl:flex-1 xl:min-h-0 overflow-y-auto lm-scrollbar" style={{ scrollbarWidth: "auto", scrollbarColor: "#B8782D #F3E8D9" }}>
            {!vendaSelecionada ? (
              <div className="min-h-full flex items-center justify-center px-8 text-center text-[12px] text-mata-ink/50">
                Selecione uma venda na lista para visualizar os detalhes.
              </div>
            ) : (
              <div className="p-3">
                <div className="flex items-center gap-3 pb-2 border-b border-[#eee4d7]">
                  <div className="w-8 h-8 rounded-full bg-[#f5ecdd] flex items-center justify-center text-[#9A5B20] font-semibold">
                    {(vendaSelecionada.contatos?.nome || 'S')
                      .charAt(0)
                      .toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-[14px] text-[#2f2118]">
                      {vendaSelecionada.contatos?.nome || 'Sem nome'}
                    </p>
                    <p className="text-[11px] text-mata-ink/50">Cliente</p>
                  </div>
                </div>

                <div className="space-y-1 py-2 border-b border-[#eee4d7]">
                  <div className="flex justify-between gap-3 text-[11px]">
                    <span className="text-mata-ink/55">Data da venda</span>
                    <strong className="text-[#2f2118]">
                      {formatarData(vendaSelecionada.data_venda)}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-3 text-[11px]">
                    <span className="text-mata-ink/55">Vendedor responsável</span>
                    <strong className="text-[#2f2118]">
                      {vendaSelecionada.vendedor_nome || 'Não informado'}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-3 text-[11px]">
                    <span className="text-mata-ink/55">Forma de pagamento</span>
                    <strong className="text-[#2f2118]">
                      {vendaSelecionada.forma_pagamento || 'Não informado'}
                    </strong>
                  </div>
                  <div className="flex justify-between gap-3 text-[11px]">
                    <span className="text-mata-ink/55">Status</span>
                    <span className="rounded-full bg-[#e5f4e6] px-2 py-1 text-[9px] text-[#4b7a4f]">
                      Concluída
                    </span>
                  </div>
                </div>

                <div className="mt-2 mb-2 rounded-xl border border-[#eadfce] bg-[#fffaf3] px-3 py-1.5 flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-[11px] font-medium text-[#4a372a] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(vendaSelecionada.nf_transmitida)}
                      disabled={Boolean(vendaSelecionada.nf_transmitida)}
                      onChange={(e) => alternarNfTransmitida(vendaSelecionada, e.target.checked)}
                      className="accent-[#B8782D]"
                    />
                    NF Transmitida
                  </label>
                  <span className={`rounded-full px-2 py-1 text-[9px] ${vendaSelecionada.nf_cancelada ? 'bg-[#fbe4e4] text-[#a63d3d]' : vendaSelecionada.nf_transmitida ? 'bg-[#e5f4e6] text-[#4b7a4f]' : 'bg-[#f4eadc] text-[#806348]'}`}>
                    {vendaSelecionada.nf_cancelada ? 'NF cancelada' : vendaSelecionada.nf_transmitida ? 'Registro bloqueado' : 'NF pendente'}
                  </span>
                </div>

                <div className="rounded-xl bg-[#f7efe3] px-3 py-1.5 flex items-center justify-between">
                  <span className="font-display text-[15px] text-[#7f481f]">
                    Total da venda
                  </span>
                  <strong className="font-display text-[19px] text-[#8f4f22]">
                    {formatarMoeda(totalVenda(vendaSelecionada))}
                  </strong>
                </div>

                {vendaSelecionada.observacoes && (
                  <p className="text-[10px] text-mata-ink/50 mt-2">
                    {vendaSelecionada.observacoes}
                  </p>
                )}
              </div>
            )}
            </div>
          </div>
        </aside>
      </section>

      {/* VENCIMENTOS DE HOJE */}
      {mostrarVencimentos && (
        <div
          className="fixed inset-0 bg-[#20140d]/55 backdrop-blur-[3px] flex items-center justify-center p-3 sm:p-4 z-50"
          onClick={() => setMostrarVencimentos(false)}
        >
          <div
            className="w-full max-w-[460px] max-h-[80vh] overflow-hidden rounded-2xl bg-[#fffdf9] shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 flex items-center justify-between border-b border-[#eee4d7]">
              <div>
                <h2 className="font-display text-[19px] text-[#2f2118]">Vencem hoje</h2>
                <p className="text-[10px] text-mata-ink/55">
                  {formatarData(hoje)} — {formatarMoeda(totalVencendoHoje)} a receber
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMostrarVencimentos(false)}
                className="text-xl text-[#6f6258] hover:text-[#9A5B20]"
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto divide-y divide-[#eee4d7]">
              {vencimentosHoje.length === 0 && (
                <p className="px-5 py-6 text-center text-[11px] text-mata-ink/55">
                  Nenhuma parcela vence hoje. 🎉
                </p>
              )}
              {vencimentosHoje.map(({ venda, parcela, totalParcelas }) => (
                <div key={`${venda.id}-${parcela.numero}`} className="px-5 py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-[#2f2118] truncate">
                      {venda.contatos?.nome || 'Sem nome'}
                    </p>
                    <p className="text-[10px] text-mata-ink/55">
                      {venda.forma_pagamento || 'Forma não informada'} — parcela {parcela.numero}/{totalParcelas}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <strong className="text-[12px] text-[#a63d3d]">{formatarMoeda(parcela.valor)}</strong>
                    <button
                      type="button"
                      onClick={() => { setVendaSelecionada(venda); setMostrarVencimentos(false) }}
                      className="rounded-lg border border-[#c9955f] px-2 py-1 text-[9px] font-medium text-[#8f4f22] hover:bg-[#fff6ea]"
                    >
                      Ver venda
                    </button>
                    <button
                      type="button"
                      onClick={() => registrarPagamento(venda, parcela.numero)}
                      className="rounded-lg border border-[#8bb78f] px-2 py-1 text-[9px] font-medium text-[#4b7a4f] hover:bg-[#f4faf3]"
                    >
                      Marcar paga
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* LISTA: VALOR EM ATRASO / VALOR EM CONDICIONAL */}
      {listaAberta && (
        <div
          className="fixed inset-0 bg-[#20140d]/55 backdrop-blur-[3px] flex items-center justify-center p-3 sm:p-4 z-50"
          onClick={() => setListaAberta(null)}
        >
          <div
            className="w-full max-w-[560px] max-h-[80vh] overflow-hidden rounded-2xl bg-[#fffdf9] shadow-xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-3 flex items-center justify-between border-b border-[#eee4d7]">
              <div>
                <h2 className="font-display text-[19px] text-[#2f2118]">
                  {listaAberta === 'atraso' ? '⏳ Valor em atraso' : '↻ Valor em condicional'}{' '}
                  <span className="text-mata-ink/40 text-[12px] font-sans">
                    ({listaAberta === 'atraso' ? listaAtraso.length : listaCondicional.length})
                  </span>
                </h2>
                <p className="text-[10px] text-mata-ink/55">
                  {listaAberta === 'atraso'
                    ? `${formatarMoeda(valorEmAtraso)} em parcelas vencidas`
                    : `${formatarMoeda(valorCondicional)} em produtos para avaliação`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setListaAberta(null)}
                className="text-xl text-[#6f6258] hover:text-[#9A5B20]"
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto divide-y divide-[#eee4d7]">
              {listaAberta === 'atraso' && listaAtraso.length === 0 && (
                <p className="px-5 py-6 text-center text-[11px] text-mata-ink/55">Nenhuma parcela em atraso. 🎉</p>
              )}
              {listaAberta === 'condicional' && listaCondicional.length === 0 && (
                <p className="px-5 py-6 text-center text-[11px] text-mata-ink/55">Nenhuma venda condicional no momento.</p>
              )}

              {listaAberta === 'atraso' && listaAtraso.map(({ venda, parcela, totalParcelas }) => {
                const venc = String(parcela.vencimento || '').slice(0, 10)
                const dias = Math.max(0, Math.round((paraDataLocal(hoje) - paraDataLocal(venc)) / 86400000))
                return (
                  <div key={`${venda.id}-${parcela.numero}`} className="px-5 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-[#2f2118] truncate">{venda.contatos?.nome || 'Sem nome'}</p>
                      <p className="text-[10px] text-[#a63d3d]/80">
                        Venceu em {formatarData(venc)} ({dias}d de atraso) — parcela {parcela.numero}/{totalParcelas}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <strong className="text-[12px] text-[#a63d3d]">{formatarMoeda(parcela.valor)}</strong>
                      <button
                        type="button"
                        onClick={() => { setVendaSelecionada(venda); setListaAberta(null) }}
                        className="rounded-lg border border-[#c9955f] px-2 py-1 text-[9px] font-medium text-[#8f4f22] hover:bg-[#fff6ea]"
                      >
                        Ver venda
                      </button>
                      <button
                        type="button"
                        onClick={() => registrarPagamento(venda, parcela.numero)}
                        className="rounded-lg border border-[#8bb78f] px-2 py-1 text-[9px] font-medium text-[#4b7a4f] hover:bg-[#f4faf3]"
                      >
                        Marcar paga
                      </button>
                    </div>
                  </div>
                )
              })}

              {listaAberta === 'condicional' && listaCondicional.map((venda) => {
                const retorno = String(venda.data_retorno_condicional || '').slice(0, 10)
                const atrasado = retorno && retorno < hoje
                return (
                  <div key={venda.id} className="px-5 py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-medium text-[#2f2118] truncate">{venda.contatos?.nome || 'Sem nome'}</p>
                      <p className={`text-[10px] ${atrasado ? 'text-[#a63d3d]/80' : 'text-mata-ink/55'}`}>
                        Venda de {formatarData(venda.data_venda)}
                        {retorno ? ` — retorno ${atrasado ? 'era ' : 'previsto '}${formatarData(retorno)}` : ' — sem data de retorno'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <strong className="text-[12px] text-[#2f2118]">{formatarMoeda(totalVenda(venda))}</strong>
                      <button
                        type="button"
                        onClick={() => { setVendaSelecionada(venda); setListaAberta(null) }}
                        className="rounded-lg border border-[#c9955f] px-2 py-1 text-[9px] font-medium text-[#8f4f22] hover:bg-[#fff6ea]"
                      >
                        Ver venda
                      </button>
                      <button
                        type="button"
                        onClick={() => registrarPagamento(venda)}
                        className="rounded-lg border border-[#8bb78f] px-2 py-1 text-[9px] font-medium text-[#4b7a4f] hover:bg-[#f4faf3]"
                      >
                        Marcar paga
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* NOVA VENDA */}
      {mostrarForm && (
        <div className="fixed inset-0 bg-[#20140d]/55 backdrop-blur-[3px] flex items-center justify-center p-3 sm:p-4 z-50">
          <form
            onSubmit={salvar}
            className="relative w-full max-w-[1260px] max-h-[calc(100vh-28px)] overflow-hidden rounded-[22px] border border-[#d9b98f] bg-[#fffdf9] shadow-[0_28px_80px_rgba(35,20,10,0.35)] flex flex-col"
          >
            <button
              type="button"
              onClick={() => { setMostrarForm(false); setModoPagamento(false) }}
              className="absolute top-4 right-5 z-30 text-3xl leading-none text-[#3f2718] hover:text-[#9A5B20] transition"
              aria-label="Fechar"
            >
              ×
            </button>

            <div className="relative shrink-0 px-5 sm:px-7 pt-4 pb-3 border-b border-[#eadfce] overflow-hidden">
              <div className="absolute -right-8 -top-10 w-56 h-56 opacity-[0.16] pointer-events-none">
                <div className="absolute right-14 top-10 w-[2px] h-40 bg-[#a66a32] rotate-[20deg] origin-bottom rounded-full" />
                <div className="absolute right-16 top-14 w-24 h-10 border border-[#a66a32] rounded-[100%_0] rotate-[25deg]" />
                <div className="absolute right-7 top-28 w-24 h-10 border border-[#a66a32] rounded-[100%_0] -rotate-[18deg]" />
              </div>

              <div className="pr-16">
                <h3 className="font-display text-[30px] sm:text-[34px] leading-none text-[#3c2417]">
                  {modoPagamento ? 'Pagamento da venda' : 'Nova venda'}
                </h3>
                <p className="mt-1.5 font-display text-[14px] text-[#9A5B20]">
                  {modoPagamento
                    ? 'NF transmitida: só é possível alterar o pagamento e as datas.'
                    : 'Registre a venda de forma rápida e prática.'}
                </p>
              </div>

              <p className="hidden sm:block absolute right-20 top-7 font-display italic text-[#b5763b] text-[17px] leading-tight text-center rotate-[-7deg]">
                Beleza que gera
                <br />
                boas histórias
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto lm-scrollbar px-4 sm:px-5 py-3">
              <div className={`grid grid-cols-1 lg:grid-cols-[minmax(0,1.12fr)_minmax(250px,.72fr)_minmax(430px,1.16fr)] lg:grid-rows-[220px_auto_auto] gap-3 items-stretch ${modoPagamento ? 'modo-pagamento' : ''}`}>
                {/* COLUNA ESQUERDA */}
                <>
                  {/* CLIENTE + VENDEDOR/DATA */}
                    <section className="lg:col-start-1 lg:row-start-1 h-full rounded-2xl border border-[#eadfce] bg-white px-4 py-3 shadow-[0_5px_18px_rgba(77,45,18,0.035)]">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xl text-[#9A5B20]">♟</span>
                          <h4 className="font-display text-[20px] text-[#2f2118]">Cliente</h4>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            window.location.href = '/cadastro'
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-[#c9955f] px-3 py-1.5 text-[11px] font-medium text-[#8f4f22] hover:bg-[#fff6ea]"
                        >
                          <span className="text-base">+</span>
                          Novo cliente
                        </button>
                      </div>

                      <div className="relative">
                        <select
                          required
                          value={form.contato_id}
                          onChange={(e) => {
                            const contatoId = e.target.value
                            setForm({ ...form, contato_id: contatoId })
                            setItensForm((itens) => itens.map((item) => {
                              if (!item.produto_id) return item
                              const produto = produtos.find((p) => p.id === item.produto_id)
                              const preco = calcularPrecoProduto(produto, contatoId)
                              return {
                                ...item,
                                valor_unitario: preco.valorUnitario,
                                preco_base: preco.precoBase,
                                desconto_percentual: preco.desconto,
                                tipo_cliente: preco.tipo,
                              }
                            }))
                          }}
                          className="w-full appearance-none border border-[#dec6a8] bg-[#fffdf9] rounded-xl px-3 py-2.5 pr-9 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
                        >
                          <option value="">Selecione o cliente</option>
                          {contatos.map((c) => (
                            <option key={c.id} value={c.id}>{c.nome}</option>
                          ))}
                        </select>
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#59483A] pointer-events-none">⌄</span>
                      </div>

                      {form.contato_id && (() => {
                        const perfil = obterPerfilCliente(form.contato_id)
                        const contato = perfil.contato
                        return (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 mt-2.5 text-[11px]">
                            <div><span className="text-[#8b796a]">Tipo</span><strong className="block text-[#2f2118] font-medium">{perfil.profissional ? (contato?.tipo === 'clinica' ? 'Clínica' : 'Revendedora') : 'Cliente final'}</strong></div>
                            <div><span className="text-[#8b796a]">CPF/CNPJ</span><strong className="block text-[#2f2118] font-medium">{contato?.cpf || contato?.cnpj || '—'}</strong></div>
                            <div><span className="text-[#8b796a]">Telefone</span><strong className="block text-[#2f2118] font-medium">{contato?.telefone || '—'}</strong></div>
                            <div><span className="text-[#8b796a]">Desconto padrão</span><strong className="inline-block mt-0.5 rounded-md bg-[#fff0d8] px-1.5 py-0.5 text-[#9A5B20] font-medium">{perfil.desconto}%</strong></div>
                          </div>
                        )
                      })()}
                    </section>

                    <div className="lg:col-start-2 lg:row-start-1 h-full flex flex-col gap-3">
                      <section className="flex-1 min-h-0 rounded-2xl border border-[#eadfce] bg-white px-4 py-3 shadow-[0_5px_18px_rgba(77,45,18,0.035)]">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl text-[#9A5B20]">♟</span>
                          <h4 className="font-display text-[20px] text-[#2f2118]">Vendedor</h4>
                        </div>
                        <select
                          required
                          value={form.vendedor_id}
                          onChange={(e) => {
                            const vendedorId = e.target.value
                            const vendedor = vendedores.find((v) => v.id === vendedorId)
                            setForm({ ...form, vendedor_id: vendedorId, vendedor_nome: vendedor?.nome || '' })
                          }}
                          className="w-full appearance-none border border-[#dec6a8] bg-[#fffdf9] rounded-xl px-3 py-2.5 text-sm outline-none"
                        >
                          <option value="">Selecione o vendedor</option>
                          {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nome}</option>)}
                        </select>
                      </section>

                      <section className="flex-1 min-h-0 rounded-2xl border border-[#eadfce] bg-white px-4 py-3 shadow-[0_5px_18px_rgba(77,45,18,0.035)]">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xl text-[#9A5B20]">▣</span>
                          <h4 className="font-display text-[20px] text-[#2f2118]">Data da venda</h4>
                        </div>
                        <input
                          type="date"
                          required
                          value={form.data_venda}
                          onChange={(e) => setForm({ ...form, data_venda: e.target.value, parcelas_json: [] })}
                          className="w-full border border-[#dec6a8] bg-[#fffdf9] rounded-xl px-3 py-2.5 text-sm outline-none"
                        />
                      </section>
                    </div>

                  {/* PAGAMENTO */}
                  <section className="secao-pagamento lg:col-start-1 lg:col-span-2 lg:row-start-2 rounded-2xl border border-[#eadfce] bg-white px-4 py-3.5 shadow-[0_5px_18px_rgba(77,45,18,0.035)]">
                    <div className="grid grid-cols-[190px_minmax(0,1fr)] gap-4">
                      <div className="pr-4 border-r border-[#eadfce]">
                        <div className="flex items-center gap-2 mb-2.5">
                          <span className="text-xl text-[#9A5B20]">▣</span>
                          <h4 className="font-display text-[20px] text-[#2f2118]">Pagamento</h4>
                        </div>
                        <p className="text-[11px] text-[#8b796a] mb-1.5">Forma de pagamento</p>
                        <div className="space-y-1">
                          {['Pix','Dinheiro','Cartão de crédito','Cartão de débito','Boleto','Transferência','Outro'].map((forma) => (
                            <label key={forma} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition ${form.forma_pagamento === forma ? 'border border-[#c9955f] bg-[#fff8ec]' : 'border border-transparent hover:bg-[#fffaf3]'}`}>
                              <input
                                type="radio"
                                name="forma_pagamento"
                                value={forma}
                                checked={form.forma_pagamento === forma}
                                disabled={modoPagamento}
                                onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })}
                                className="accent-[#9A5B20]"
                              />
                              <span className="text-[12px] text-[#3c2a1f]">{forma}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-2.5">
                          <span className="text-xl text-[#9A5B20]">◉</span>
                          <h4 className="font-display text-[20px] text-[#2f2118]">Situação do pagamento</h4>
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                          {[
                            ['pago', 'Pago — à vista', 'Pagamento recebido'],
                            ['a_receber', 'A receber — à prazo', 'Gerar parcelas'],
                            ['condicional', 'Condicional', 'Produtos para avaliação'],
                          ].map(([valor, titulo, subtitulo]) => (
                            <button
                              key={valor}
                              type="button"
                              onClick={() => atualizarSituacaoPagamento(valor)}
                              className={`text-left rounded-xl border px-3 py-2 transition ${situacaoPagamento === valor ? 'border-[#B8782D] bg-[#fff8ec] shadow-[0_4px_14px_rgba(154,91,32,0.08)]' : 'border-[#decfbd] bg-white hover:bg-[#fffaf3]'}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${situacaoPagamento === valor ? 'border-[#B8782D]' : 'border-[#cfc2b4]'}`}>
                                  {situacaoPagamento === valor && <span className="w-2.5 h-2.5 rounded-full bg-[#B8782D]" />}
                                </span>
                                <span className="text-[12px] font-medium text-[#2f2118]">{titulo}</span>
                              </div>
                              <span className="block ml-7 mt-0.5 text-[10px] text-[#8b796a]">{subtitulo}</span>
                            </button>
                          ))}
                        </div>

                        {situacaoPagamento === 'pago' && (
                          <div className="mt-2.5 rounded-xl border border-[#cfe1d1] bg-[#f4faf3] px-3 py-2 flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-medium text-[#52704f]">Data do pagamento</p>
                              <p className="text-[10px] text-[#769071]">Pagamento recebido à vista.</p>
                            </div>
                            <input
                              type="date"
                              value={form.data_pagamento || form.data_venda}
                              onChange={(e) => setForm({ ...form, data_pagamento: e.target.value })}
                              className="w-[155px] border border-[#c8ddc5] bg-white rounded-lg px-2.5 py-1.5 text-[11px] outline-none"
                            />
                          </div>
                        )}

                        {situacaoPagamento === 'a_receber' && (
                          <div className="mt-2.5 rounded-xl border border-[#decfbd] bg-[#fffaf3] p-2.5">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <div>
                                <p className="text-[11px] font-medium text-[#3c2a1f]">Parcelamento</p>
                                <p className="text-[9px] text-[#8b796a]">Vencimentos calculados a partir da data da venda.</p>
                              </div>
                              <div className="flex gap-1.5">
                                {[['1x', '01x — 30 dias'], ['2x', '02x — 30 e 60 dias']].map(([valor, label]) => (
                                  <button key={valor} type="button" disabled={modoPagamento} onClick={() => atualizarParcelamento(valor)} className={`rounded-lg border px-2.5 py-1.5 text-[10px] transition ${parcelamento === valor ? 'border-[#B8782D] bg-[#fff4e4] text-[#7b451e]' : 'border-[#decfbd] bg-white text-[#5d5148]'}`}>
                                    {label}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px 140px 70px', columnGap: 8 }} className="items-center px-2 py-1.5 rounded-lg bg-[#f1e8dc] text-[9px] text-[#5b4636] font-medium">
                              <span>Parcela</span><span className="text-right">Valor</span><span className="text-right">Vencimento</span><span className="text-center">Pagamento</span>
                            </div>
                            <div className="divide-y divide-[#eee3d5]">
                              {parcelasPreview.map((parcela) => (
                                <div key={parcela.numero} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 90px 140px 70px', columnGap: 8 }} className="items-center px-2 py-1.5">
                                  <span className="text-[10px] text-[#3f3025]">Parcela {parcela.numero}/{parcelasPreview.length} — {Math.round(parcela.percentual)}%</span>
                                  <span className="text-right text-[11px] font-medium text-[#2f2118]">{formatarMoeda(parcela.valor)}</span>
                                  <input type="date" value={parcela.vencimento} onChange={(e) => setForm({ ...form, parcelas_json: parcelasPreview.map((p) => p.numero === parcela.numero ? { ...p, vencimento: e.target.value } : p) })} className="w-full border border-[#decfbd] bg-white rounded-lg px-2 py-1.5 text-[10px] outline-none" />
                                  <label className="flex items-center justify-center cursor-pointer" title={parcela.pago ? `Paga em ${formatarData(parcela.pago_em)}` : 'Marcar como paga'}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(parcela.pago)}
                                      onChange={(e) => setForm({
                                        ...form,
                                        parcelas_json: parcelasPreview.map((p) => p.numero === parcela.numero
                                          ? { ...p, pago: e.target.checked, pago_em: e.target.checked ? (p.pago_em || hojeLocal()) : null }
                                          : p),
                                      })}
                                      className="accent-[#4b7a4f] w-4 h-4"
                                    />
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {situacaoPagamento === 'condicional' && (
                          <div className="mt-2.5 rounded-xl border border-[#e6d8c7] bg-[#fffaf3] px-3 py-2.5 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold text-[#7b542f]">Venda condicional</p>
                              <p className="text-[9px] text-[#8b796a]">Os produtos continuam na lista de itens da venda. O pagamento será definido após o retorno.</p>
                            </div>
                            <label className="shrink-0 flex items-center gap-2">
                              <span className="text-[9px] text-[#6d5c4c]">Retorno previsto</span>
                              <input
                                type="date"
                                value={form.data_retorno_condicional || ''}
                                onChange={(e) => setForm({ ...form, data_retorno_condicional: e.target.value })}
                                className="w-[130px] border border-[#decfbd] bg-white rounded-lg px-2 py-1.5 text-[10px] outline-none"
                              />
                            </label>
                          </div>
                        )}

                      </div>
                    </div>
                  </section>

                  {/* OBSERVAÇÕES */}
                  <section className="lg:col-start-1 lg:col-span-2 lg:row-start-3 rounded-2xl border border-[#eadfce] bg-white px-4 py-3 shadow-[0_5px_18px_rgba(77,45,18,0.035)]">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xl text-[#9A5B20]">▣</span>
                      <h4 className="font-display text-[19px] text-[#2f2118]">Observações</h4>
                      <span className="text-[10px] text-[#9b8a7c]">(opcional)</span>
                    </div>
                    <textarea
                      placeholder="Ex.: informações adicionais sobre a venda..."
                      value={form.observacoes}
                      onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                      className="w-full h-[62px] resize-none border border-[#dec6a8] bg-[#fffdf9] rounded-xl px-3 py-2 text-[12px] outline-none focus:ring-2 focus:ring-[#B8782D]/20"
                    />
                  </section>
                </>

                {/* COLUNA DIREITA */}
                <div className="contents">
                  <section className="secao-itens lg:col-start-3 lg:row-start-1 h-[230px] rounded-2xl border border-[#eadfce] bg-white overflow-hidden shadow-[0_5px_18px_rgba(77,45,18,0.035)]">
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl text-[#8f5725]">🛒</span>
                        <h4 className="font-display text-[21px] text-[#2f2118]">Itens da venda</h4>
                      </div>
                      <button type="button" onClick={adicionarLinha} className="inline-flex items-center gap-1.5 bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white rounded-xl px-3.5 py-2 text-[12px] shadow-[0_6px_16px_rgba(154,91,32,0.15)] hover:brightness-105 transition">
                        <span className="text-base leading-none">+</span>
                        Adicionar produto
                      </button>
                    </div>

                    <div className="mx-3 mb-2">
                      <div className="grid grid-cols-[minmax(0,1fr)_58px_80px_88px_22px] gap-1.5 px-2.5 py-2 rounded-lg bg-[#f1e8dc] text-[10px] text-[#543726] font-medium">
                        <span>Produto</span><span className="text-center">Qtd</span><span className="text-right">Valor</span><span className="text-right">Subtotal</span><span />
                      </div>

                      <div className="divide-y divide-[#eee3d5] max-h-[145px] overflow-y-auto lm-scrollbar">
                        {itensForm.map((item, idx) => {
                          const produtoSelecionado = produtos.find((p) => p.id === item.produto_id)
                          const imagem = obterImagemProduto(produtoSelecionado)
                          const subtotal = (Number(item.quantidade) || 0) * (Number(item.valor_unitario) || 0)

                          return (
                            <div key={idx} className="grid grid-cols-[minmax(0,1fr)_58px_80px_88px_22px] gap-1.5 items-center px-2.5 py-2 bg-white/65">
                              <div className="min-w-0 flex items-center gap-2">
                                <div className="w-10 h-10 rounded-lg overflow-hidden border border-[#eadfce] bg-[#f7efe3] shrink-0 flex items-center justify-center">
                                  {imagem ? <img src={imagem} alt={produtoSelecionado?.nome || 'Produto'} className="w-full h-full object-cover" /> : <span className="text-lg text-[#a36b36]">✦</span>}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <select value={item.produto_id} onChange={(e) => atualizarItem(idx, 'produto_id', e.target.value)} className="w-full bg-transparent text-[11px] font-medium text-[#2f2118] outline-none cursor-pointer truncate">
                                    <option value="">Selecione o produto</option>
                                    {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                                  </select>
                                  {produtoSelecionado && (
                                    <div className="text-[9px] text-[#8b796a] truncate">
                                      {produtoSelecionado.categoria || 'Produto LuzDaMata'}
                                      {Number(item.desconto_percentual || 0) > 0 && ` · desconto ${Number(item.desconto_percentual).toLocaleString('pt-BR')}%`}
                                    </div>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center justify-center overflow-hidden rounded-lg border border-[#dec6a8] bg-[#fffdf9] h-8">
                                <button type="button" onClick={() => diminuirQuantidade(idx)} className="w-5 h-full text-[#985b26] hover:bg-[#f6ecdf]">−</button>
                                <input type="number" min="1" value={item.quantidade} onChange={(e) => atualizarItem(idx, 'quantidade', Math.max(1, Number(e.target.value) || 1))} className="w-7 h-full text-center text-[11px] bg-white outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
                                <button type="button" onClick={() => aumentarQuantidade(idx)} className="w-5 h-full text-[#985b26] hover:bg-[#f6ecdf]">+</button>
                              </div>

                              <div className="text-right text-[11px] text-[#2d2119] whitespace-nowrap">{formatarMoeda(item.valor_unitario || 0)}</div>
                              <div className="text-right text-[11px] font-medium text-[#2d2119] whitespace-nowrap">{formatarMoeda(subtotal)}</div>
                              <button type="button" onClick={() => removerLinha(idx)} className="text-[#a65e25] hover:text-red-600 text-base" title="Remover item">×</button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </section>

                  {/* RESUMO */}
                  <section className="secao-resumo lg:col-start-3 lg:row-start-2 rounded-2xl border border-[#eadfce] bg-[#fffaf3] px-4 py-3 shadow-[0_5px_18px_rgba(77,45,18,0.035)]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl text-[#9A5B20]">▣</span>
                      <h4 className="font-display text-[20px] text-[#2f2118]">Resumo da venda</h4>
                    </div>

                    <div className="space-y-2 text-[12px]">
                      <div className="flex justify-between gap-3">
                        <span className="text-[#584536]">Subtotal</span>
                        <strong className="text-[#2f2118]">{formatarMoeda(subtotalForm)}</strong>
                      </div>

                      <div className="flex justify-between gap-3">
                        <span className="text-[#584536]">Desconto do cliente</span>
                        <strong className="text-[#3c8b4c]">- {formatarMoeda(itensForm.reduce((s, i) => s + Math.max(0, Number(i.preco_base || 0) - Number(i.valor_unitario || 0)) * Number(i.quantidade || 0), 0))}</strong>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[#584536]">Desconto da venda</span>
                        <div className="flex items-center border border-[#dec6a8] bg-white rounded-lg overflow-hidden w-[125px]">
                          <span className="pl-2 text-[#8b796a] text-[10px]">R$</span>
                          <input type="number" min="0" step="0.01" value={form.desconto_venda} onChange={(e) => setForm({ ...form, desconto_venda: Math.max(0, Number(e.target.value) || 0) })} className="w-full px-2 py-1.5 text-right text-[11px] bg-transparent outline-none" />
                        </div>
                      </div>

                      <div className="border-t border-[#ddc8ad] mt-2 pt-2.5 flex items-end justify-between gap-3">
                        <span className="font-display text-[20px] text-[#7f481f]">Total da venda</span>
                        <strong className="font-display text-[28px] leading-none text-[#8f4f22]">{formatarMoeda(totalForm)}</strong>
                      </div>
                    </div>

                    <button type="submit" className="w-full mt-3 inline-flex items-center justify-center gap-2 px-5 py-3 text-[14px] font-medium bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white rounded-xl shadow-[0_8px_20px_rgba(154,91,32,0.18)] hover:brightness-105 transition">
                      <span>▣</span>
                      {modoPagamento ? 'Salvar pagamento' : 'Finalizar venda'}
                    </button>
                  </section>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
