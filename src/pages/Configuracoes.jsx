import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const hojeLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dataBR = (valor) => {
  if (!valor) return '—'
  const [a, m, d] = String(valor).slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
const plural = (n) => `${n} ${n === 1 ? 'unidade' : 'unidades'}`

export default function Configuracoes() {
  const { setPageHeader } = useOutletContext()
  const [produtos, setProdutos] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [vendas, setVendas] = useState([])
  const [itens, setItens] = useState([])
  const [lotes, setLotes] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [produtoAberto, setProdutoAberto] = useState(null)
  const [tipoHistorico, setTipoHistorico] = useState('estoque')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const formVazio = { id: null, produto_id: '', quantidade_inicial: 1, data_registro: hojeLocal() }
  const [form, setForm] = useState(formVazio)

  useEffect(() => {
    setPageHeader({ title: 'Configurações', subtitle: 'Controle pessoal de produtos', actions: null })
    carregar()
    return () => setPageHeader({ title: '', subtitle: '', actions: null })
  }, [setPageHeader])

  async function carregar() {
    setCarregando(true)
    setErro('')
    const [p, v, ven, i, l] = await Promise.all([
      supabase.from('produtos').select('id, nome, ativo').eq('ativo', true).order('nome'),
      supabase.from('vendas').select('id, contato_id, vendedor_id, vendedor_nome, data_venda, situacao_pagamento, nf_cancelada, contatos(nome)').order('data_venda', { ascending: false }),
      supabase.from('vendedores').select('id, nome, ativo').eq('ativo', true).order('nome'),
      supabase.from('itens_venda').select('id, venda_id, produto_id, produto_nome, quantidade'),
      supabase.from('controle_estoque_pessoal').select('*').order('data_registro', { ascending: false }),
    ])
    const falha = [p, v, ven, i, l].find((r) => r.error)
    if (falha) {
      console.error('Erro ao carregar controle pessoal:', falha.error)
      setErro(falha.error.message?.includes('controle_estoque_pessoal')
        ? 'Falta criar a tabela do controle pessoal no Supabase. Execute o SQL fornecido junto com este arquivo.'
        : `Não foi possível carregar os dados: ${falha.error.message}`)
    }
    setProdutos(p.data || [])
    setVendas(v.data || [])
    setVendedores(ven.data || [])
    const jane = (ven.data || []).find((v) => String(v.nome || '').trim().toLowerCase() === 'jane' || String(v.nome || '').trim().toLowerCase().startsWith('jane '))
    if (jane) setForm((atual) => ({ ...atual }))
    setItens(i.data || [])
    setLotes(l.data || [])
    setCarregando(false)
  }

  const linhas = useMemo(() => {
    const jane = vendedores.find((v) => String(v.nome || '').trim().toLowerCase() === 'jane' || String(v.nome || '').trim().toLowerCase().startsWith('jane '))
    const janeId = jane?.id
    const ativas = vendas.filter((v) => !v.nf_cancelada)
    const saidas = []
    for (const lote of lotes) {
      // O estoque pessoal pertence à Jane. O fornecedor/lote não determina
      // quem vendeu: somente vendas registradas com Jane como vendedora baixam este estoque.
      const vendaIds = new Set(ativas.filter((v) => janeId && String(v.vendedor_id) === String(janeId)).map((v) => v.id))
      const itensDoProduto = itens.filter((i) => vendaIds.has(i.venda_id) && (
        (i.produto_id && String(i.produto_id) === String(lote.produto_id)) ||
        (!i.produto_id && String(i.produto_nome || '').trim().toLowerCase() === String(lote.produto_nome || '').trim().toLowerCase())
      ))
      const destinoPorVenda = new Map()
      for (const item of itensDoProduto) {
        const venda = ativas.find((v) => v.id === item.venda_id)
        if (!venda) continue
        const key = venda.id
        const atual = destinoPorVenda.get(key) || { venda, quantidade: 0 }
        atual.quantidade += Number(item.quantidade || 0)
        destinoPorVenda.set(key, atual)
      }
      const destinos = [...destinoPorVenda.values()].map(({ venda, quantidade }) => ({
        venda_id: venda.id,
        produto_id: lote.produto_id,
        produto_nome: lote.produto_nome,
        cliente: venda.contatos?.nome || 'Cliente',
        data: venda.data_venda,
        situacao: venda.situacao_pagamento === 'condicional' ? 'Condicional' : 'Venda',
        quantidade,
        vendedor_id: lote.vendedor_id,
      }))
      saidas.push({ ...lote, destinos })
    }
    return saidas
  }, [lotes, vendas, itens, vendedores])

  const resumoProdutos = useMemo(() => {
    return produtos.map((produto) => {
      const lotesProduto = linhas.filter((l) => String(l.produto_id) === String(produto.id))
      const estoque = lotesProduto.reduce((s, l) => s + Number(l.quantidade_inicial || 0), 0)
      const destinosMap = new Map()
      lotesProduto.forEach((l) => l.destinos.forEach((d) => {
        const k = `${d.venda_id}-${d.produto_id || d.produto_nome}`
        if (!destinosMap.has(k)) destinosMap.set(k, d)
      }))
      const destinos = [...destinosMap.values()]
      const destinados = destinos.reduce((s, d) => s + Number(d.quantidade || 0), 0)
      return { produto, estoque, destinados, disponiveis: Math.max(0, estoque - destinados), destinos, lotes: lotesProduto }
    }).filter((p) => p.estoque > 0 || p.destinados > 0)
  }, [produtos, linhas])

  function editarLote(lote) {
    setForm({ id: lote.id, produto_id: lote.produto_id || '', quantidade_inicial: Number(lote.quantidade_inicial || 1), data_registro: String(lote.data_registro || hojeLocal()).slice(0, 10) })
    setErro('')
    setMostrarForm(true)
  }

  async function salvarLote(e) {
    e.preventDefault()
    const produto = produtos.find((p) => String(p.id) === String(form.produto_id))
    const vendedoraJane = vendedores.find((v) => String(v.nome || '').trim().toLowerCase() === 'jane' || String(v.nome || '').trim().toLowerCase().startsWith('jane '))
    if (!produto || (!form.id && !vendedoraJane?.id) || Number(form.quantidade_inicial) <= 0) {
      setErro('Selecione um produto, informe uma quantidade válida e confirme que Jane está cadastrada como vendedora.')
      return
    }
    setSalvando(true)
    setErro('')
    const payload = {
      produto_id: produto.id,
      produto_nome: produto.nome,
      quantidade_inicial: Number(form.quantidade_inicial),
      data_registro: form.data_registro || hojeLocal(),
    }
    if (!form.id) payload.vendedor_id = vendedoraJane.id
    const resultado = form.id
      ? await supabase.from('controle_estoque_pessoal').update(payload).eq('id', form.id)
      : await supabase.from('controle_estoque_pessoal').insert(payload)
    const err = resultado.error
    setSalvando(false)
    if (err) {
      setErro(`Não foi possível registrar o lote: ${err.message}`)
      return
    }
    setMostrarForm(false)
    setForm({ ...formVazio, data_registro: hojeLocal() })
    await carregar()
  }

  const produtoSelecionado = resumoProdutos.find((p) => String(p.produto.id) === String(produtoAberto))

  return (
    <div className="w-full pb-5 space-y-4">
      <div className="rounded-2xl border border-[#eadfce] bg-gradient-to-r from-[#f8f0e5] to-[#fffdf9] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[#ead6bd] flex items-center justify-center text-3xl text-[#6d4524]">◇</div>
          <div>
            <p className="font-display text-2xl sm:text-3xl text-[#2f2118]">Controle de Produtos</p>
            <p className="text-sm text-[#806e5d] mt-1">Meu controle pessoal de produtos. Clique no card para ver os nomes dos clientes.</p>
          </div>
        </div>
        <button onClick={() => { setForm({ ...formVazio, data_registro: hojeLocal() }); setErro(''); setMostrarForm(true) }} className="shrink-0 rounded-xl bg-gradient-to-r from-[#8d5527] to-[#ad753d] text-white px-4 py-2.5 text-sm font-medium shadow-sm hover:brightness-105">+ Registrar produtos</button>
      </div>

      {erro && <div className="rounded-xl border border-[#e6c6b8] bg-[#fff5f1] px-4 py-3 text-sm text-[#8d3d2b]">{erro}</div>}

      {carregando ? <div className="rounded-2xl border border-[#eadfce] bg-white p-8 text-center text-sm text-[#8b796a]">Carregando controle de produtos…</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
          {resumoProdutos.map(({ produto, estoque, destinados, disponiveis }) => (
            <div key={produto.id} className="rounded-2xl border border-[#eadfce] bg-[#fffdfa] p-4 shadow-[0_5px_18px_rgba(77,45,18,0.035)]">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#eee4d7]">
                <h3 className="font-display text-[15px] leading-tight whitespace-nowrap text-[#2f2118]">{produto.nome}</h3>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <button type="button" onClick={() => { setProdutoAberto(produto.id); setTipoHistorico('estoque') }} className="rounded-xl bg-[#f4ece2] p-2.5 text-center min-w-0 hover:ring-1 hover:ring-[#c9a47c] transition"><p className="text-[11px] sm:text-xs text-[#6f5b49]">Meu Estoque</p><p className="font-display text-3xl text-[#2f2118] mt-1">{estoque}</p><p className="text-[10px] text-[#806e5d]">{estoque === 1 ? 'unidade' : 'unidades'}</p></button>
                <button type="button" onClick={() => { setProdutoAberto(produto.id); setTipoHistorico('destinos') }} className="rounded-xl bg-[#faead8] p-2.5 text-center min-w-0 hover:ring-1 hover:ring-[#d8b28b] transition"><p className="text-[11px] sm:text-xs text-[#805226]">Destinados</p><p className="font-display text-3xl text-[#805226] mt-1">{destinados}</p><p className="text-[10px] text-[#805226]">vendidos + cond.</p></button>
                <div className="rounded-xl bg-[#e9eddf] p-2.5 text-center min-w-0"><p className="text-[11px] sm:text-xs text-[#405638]">Disponíveis</p><p className="font-display text-3xl text-[#234b27] mt-1">{disponiveis}</p><p className="text-[10px] text-[#405638]">{disponiveis === 1 ? 'unidade' : 'unidades'}</p></div>
              </div>
            </div>
          ))}
          {!resumoProdutos.length && <div className="md:col-span-2 2xl:col-span-3 rounded-2xl border border-dashed border-[#d9c6b0] bg-white/70 p-10 text-center"><p className="font-display text-xl text-[#4b3828]">Nenhum produto registrado ainda</p><p className="text-sm text-[#8b796a] mt-2">Use “Registrar produtos” para informar o lote inicial que você pegou.</p></div>}
        </div>
      )}

      {mostrarForm && <div className="fixed inset-0 z-50 bg-[#20140d]/50 backdrop-blur-sm flex items-center justify-center p-3" onClick={() => setMostrarForm(false)}><form onSubmit={salvarLote} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-2xl border border-[#eadfce] bg-[#fffdf9] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#eadfce] flex items-center justify-between"><div><p className="font-display text-xl text-[#2f2118]">{form.id ? 'Editar Meu Estoque' : 'Registrar Meu Estoque'}</p><p className="text-xs text-[#8b796a] mt-1">Informe o produto e a quantidade que você recebeu.</p></div><button type="button" onClick={() => setMostrarForm(false)} className="text-xl text-[#806e5d]">×</button></div>
        <div className="p-5 space-y-4">
          <label className="block text-sm text-[#6f5b49]">Produto<select required value={form.produto_id} onChange={(e) => setForm({ ...form, produto_id: e.target.value })} className="mt-1 w-full rounded-xl border border-[#dec6a8] bg-white px-3 py-2.5 text-sm"><option value="">Selecione o produto</option>{produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
          
          <div className="grid grid-cols-2 gap-3"><label className="block text-sm text-[#6f5b49]">Quantidade que peguei<input type="number" min="1" step="1" required value={form.quantidade_inicial} onChange={(e) => setForm({ ...form, quantidade_inicial: e.target.value })} className="mt-1 w-full rounded-xl border border-[#dec6a8] bg-white px-3 py-2.5 text-sm" /></label><label className="block text-sm text-[#6f5b49]">Data do registro<input type="date" required value={form.data_registro} onChange={(e) => setForm({ ...form, data_registro: e.target.value })} className="mt-1 w-full rounded-xl border border-[#dec6a8] bg-white px-3 py-2.5 text-sm" /></label></div>
        </div>
        <div className="px-5 py-4 bg-[#faf5ee] border-t border-[#eadfce] flex justify-end gap-2"><button type="button" onClick={() => setMostrarForm(false)} className="rounded-xl border border-[#dec6a8] px-4 py-2 text-sm text-[#6f5b49]">Cancelar</button><button disabled={salvando} className="rounded-xl bg-[#8d5527] px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{salvando ? 'Salvando…' : form.id ? 'Salvar alterações' : 'Salvar lote'}</button></div>
      </form></div>}

      {produtoSelecionado && <div className="fixed inset-0 z-50 bg-[#20140d]/55 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5" onClick={() => setProdutoAberto(null)}><div onClick={(e) => e.stopPropagation()} className="w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-2xl border border-[#eadfce] bg-[#fffdf9] shadow-2xl flex flex-col">
        <div className="px-5 py-4 border-b border-[#eadfce] flex items-start justify-between gap-3"><div><button type="button" onClick={() => setProdutoAberto(null)} className="text-xs text-[#8d5527] mb-2">← Voltar aos produtos</button><h2 className="font-display text-2xl text-[#2f2118]">{produtoSelecionado.produto.nome}</h2><p className="text-xs text-[#8b796a] mt-1">{tipoHistorico === 'estoque' ? 'Histórico de entradas no estoque' : 'Histórico de destinações'}</p></div><button type="button" onClick={() => setProdutoAberto(null)} className="text-xl text-[#806e5d]">×</button></div>
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {tipoHistorico === 'estoque' && <div className="rounded-xl border border-[#eadfce] overflow-hidden"><div className="px-4 py-3 bg-[#faf5ee] font-display text-lg text-[#3c2b1d]">Lotes do Meu Estoque</div><div className="divide-y divide-[#eee4d7]">{produtoSelecionado.lotes.slice().sort((a,b) => String(b.data_registro).localeCompare(String(a.data_registro))).map((lote) => <div key={lote.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-medium text-[#3c2b1d]">{plural(Number(lote.quantidade_inicial || 0))}</p><p className="text-xs text-[#8b796a]">Data em que peguei: {dataBR(lote.data_registro)}</p></div><button type="button" onClick={() => editarLote(lote)} className="rounded-lg border border-[#dec6a8] px-3 py-1.5 text-sm text-[#8d5527] hover:bg-[#faf5ee]">Editar</button></div>)}{!produtoSelecionado.lotes.length && <p className="px-4 py-6 text-center text-sm text-[#8b796a]">Nenhuma entrada registrada.</p>}</div></div>}
          {tipoHistorico === 'destinos' && <div className="rounded-xl border border-[#eadfce] overflow-hidden"><div className="px-4 py-3 bg-[#faf5ee] font-display text-lg text-[#3c2b1d]">Vendas e condicionais deste produto</div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-white text-[#806e5d]"><tr><th className="text-left font-medium px-4 py-3">Data</th><th className="text-left font-medium px-4 py-3">Cliente</th><th className="text-left font-medium px-4 py-3">Situação</th><th className="text-right font-medium px-4 py-3">Quantidade</th></tr></thead><tbody className="divide-y divide-[#eee4d7]">{produtoSelecionado.destinos.slice().sort((a,b) => String(b.data).localeCompare(String(a.data))).map((d, idx) => <tr key={`${d.venda_id}-${idx}`}><td className="px-4 py-3 whitespace-nowrap">{dataBR(d.data)}</td><td className="px-4 py-3">{d.cliente}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs ${d.situacao === 'Condicional' ? 'bg-[#faead8] text-[#805226]' : 'bg-[#e9eddf] text-[#405638]'}`}>{d.situacao}</span></td><td className="px-4 py-3 text-right">{plural(d.quantidade)}</td></tr>)}{!produtoSelecionado.destinos.length && <tr><td colSpan="4" className="px-4 py-8 text-center text-[#8b796a]">Nenhuma venda ou condicional registrada para este produto.</td></tr>}</tbody></table></div></div>}
          {tipoHistorico === 'destinos' && <p className="text-xs text-[#8b796a]">São consideradas vendas e condicionais não canceladas em que Jane é a vendedora. Disponíveis é calculado automaticamente: estoque recebido menos unidades destinadas.</p>}
        </div>
      </div></div>}
    </div>
  )
}
