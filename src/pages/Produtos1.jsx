import { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { supabase } from '../supabaseClient'

const produtoVazio = {
  nome: '',
  categoria: '',
  preco: '',
  ativo: true,
  foto_url: '',
}

function formatarMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export default function Produtos() {
  const { setPageHeader } = useOutletContext()

  const [produtos, setProdutos] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const [busca, setBusca] = useState('')
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [mostrarInativos, setMostrarInativos] = useState(false)

  const [mostrarForm, setMostrarForm] = useState(false)
  const [editandoId, setEditandoId] = useState(null)
  const [form, setForm] = useState(produtoVazio)
  const [erroForm, setErroForm] = useState('')

  const [fotoArquivo, setFotoArquivo] = useState(null)
  const [fotoPreview, setFotoPreview] = useState('')

  useEffect(() => {
    carregar()
  }, [])

  useEffect(() => {
    setPageHeader({
      title: 'Produtos',
      subtitle: 'Catálogo e cadastro de produtos',
      actions: (
        <button
          type="button"
          onClick={abrirNovo}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-[0_8px_20px_rgba(154,91,32,0.20)] hover:brightness-105 transition"
        >
          <span className="text-lg leading-none">+</span>
          Novo produto
        </button>
      ),
    })

    return () => setPageHeader({ title: '', subtitle: '', actions: null })
  }, [setPageHeader])

  async function carregar() {
    setCarregando(true)

    const { data, error } = await supabase
      .from('produtos')
      .select('*')
      .order('categoria', { ascending: true })
      .order('nome', { ascending: true })

    if (error) {
      console.error('Erro ao carregar produtos:', error)
    }

    setProdutos(data || [])
    setCarregando(false)
  }

  function abrirNovo() {
    setEditandoId(null)
    setForm(produtoVazio)
    setErroForm('')
    setFotoArquivo(null)
    setFotoPreview('')
    setMostrarForm(true)
  }

  function abrirEdicao(produto) {
    setEditandoId(produto.id)
    setForm({
      nome: produto.nome || '',
      categoria: produto.categoria || '',
      preco: produto.preco ?? '',
      ativo: produto.ativo !== false,
      foto_url: produto.foto_url || '',
    })
    setErroForm('')
    setFotoArquivo(null)
    setFotoPreview(produto.foto_url || '')
    setMostrarForm(true)
  }

  function fecharForm() {
    setMostrarForm(false)
    setEditandoId(null)
    setForm(produtoVazio)
    setErroForm('')
    setFotoArquivo(null)
    setFotoPreview('')
  }

  function selecionarFoto(e) {
    const arquivo = e.target.files?.[0]
    if (!arquivo) return

    if (!arquivo.type.startsWith('image/')) {
      setErroForm('Selecione uma imagem válida.')
      return
    }

    if (arquivo.size > 5 * 1024 * 1024) {
      setErroForm('A imagem deve ter no máximo 5 MB.')
      return
    }

    setErroForm('')
    setFotoArquivo(arquivo)

    const preview = URL.createObjectURL(arquivo)
    setFotoPreview(preview)
  }

  async function enviarFoto(userId) {
    if (!fotoArquivo) return form.foto_url || null

    const extensao = fotoArquivo.name.split('.').pop()?.toLowerCase() || 'jpg'
    const nomeBase = fotoArquivo.name
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .toLowerCase()

    const caminho = `${userId}/${Date.now()}-${nomeBase}.${extensao}`

    const { error: uploadError } = await supabase.storage
      .from('produtos')
      .upload(caminho, fotoArquivo, {
        cacheControl: '3600',
        upsert: false,
      })

    if (uploadError) throw uploadError

    const { data } = supabase.storage.from('produtos').getPublicUrl(caminho)
    return data.publicUrl
  }

  async function salvar(e) {
    e.preventDefault()
    setErroForm('')

    if (!form.nome.trim()) {
      setErroForm('Informe o nome do produto.')
      return
    }

    if (!form.categoria.trim()) {
      setErroForm('Informe a categoria do produto.')
      return
    }

    const preco = Number(String(form.preco).replace(',', '.'))

    if (Number.isNaN(preco) || preco < 0) {
      setErroForm('Informe um preço válido.')
      return
    }

    try {
      setSalvando(true)

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError || !user) {
        throw new Error('Usuário não autenticado.')
      }

      const foto_url = await enviarFoto(user.id)

      const payload = {
        nome: form.nome.trim(),
        categoria: form.categoria.trim(),
        preco,
        ativo: form.ativo,
        foto_url,
        owner_id: user.id,
      }

      const resposta = editandoId
        ? await supabase
            .from('produtos')
            .update(payload)
            .eq('id', editandoId)
            .select()
            .single()
        : await supabase
            .from('produtos')
            .insert(payload)
            .select()
            .single()

      if (resposta.error) {
        throw resposta.error
      }

      fecharForm()
      await carregar()
    } catch (error) {
      console.error('Erro ao salvar produto:', error)
      setErroForm(`Não foi possível salvar o produto: ${error.message}`)
    } finally {
      setSalvando(false)
    }
  }

  async function alternarAtivo(produto) {
    const { error } = await supabase
      .from('produtos')
      .update({ ativo: produto.ativo === false })
      .eq('id', produto.id)

    if (error) {
      console.error('Erro ao alterar status do produto:', error)
      return
    }

    await carregar()
  }

  const categorias = useMemo(() => {
    return [...new Set(produtos.map((p) => p.categoria).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [produtos])

  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()

    return produtos.filter((produto) => {
      if (!mostrarInativos && produto.ativo === false) return false
      if (filtroCategoria && produto.categoria !== filtroCategoria) return false

      if (!termo) return true

      return (
        produto.nome?.toLowerCase().includes(termo) ||
        produto.categoria?.toLowerCase().includes(termo)
      )
    })
  }, [produtos, busca, filtroCategoria, mostrarInativos])

  const ativos = produtos.filter((p) => p.ativo !== false).length
  const inativos = produtos.length - ativos

  return (
    <div className="w-full pb-3 space-y-[5px]">

      {/* Indicadores */}
      <section
        className="grid gap-[5px]"
        style={{
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        }}
      >
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] h-[80px] flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#f5ecdd] text-[#9A5B20] flex items-center justify-center text-xl shrink-0">
            ◇
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-mata-ink/50">
              Produtos cadastrados
            </p>
            <p className="font-display text-2xl text-mata-ink">
              {produtos.length}
            </p>
          </div>
        </div>

        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] h-[80px] flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#eef5e8] text-mata-moss flex items-center justify-center text-xl shrink-0">
            ✓
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-mata-ink/50">
              Ativos
            </p>
            <p className="font-display text-2xl text-mata-moss">
              {ativos}
            </p>
          </div>
        </div>

        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] h-[80px] flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#f3f0ec] text-mata-ink/45 flex items-center justify-center text-xl shrink-0">
            ○
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.08em] text-mata-ink/50">
              Inativos
            </p>
            <p className="font-display text-2xl text-mata-ink/60">
              {inativos}
            </p>
          </div>
        </div>
      </section>

      {/* Localizar / filtro */}
      <section
        className="bg-white/90 border border-[#eadfce] rounded-2xl px-3 py-2 shadow-[0_8px_26px_rgba(77,45,18,0.04)] grid gap-[5px]"
        style={{
          gridTemplateColumns: 'minmax(0, 1.45fr) minmax(220px, .75fr) auto',
        }}
      >
        <input
          type="text"
          placeholder="Localizar por nome ou categoria..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full border border-[#eadfce] bg-[#fffdfa] rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
        />

        <select
          value={filtroCategoria}
          onChange={(e) => setFiltroCategoria(e.target.value)}
          className="w-full border border-[#eadfce] bg-[#fffdfa] rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
        >
          <option value="">Todas as categorias</option>
          {categorias.map((categoria) => (
            <option key={categoria} value={categoria}>
              {categoria}
            </option>
          ))}
        </select>

        <label className="px-3 flex items-center gap-2 text-xs text-mata-ink/60 whitespace-nowrap">
          <input
            type="checkbox"
            checked={mostrarInativos}
            onChange={(e) => setMostrarInativos(e.target.checked)}
          />
          Mostrar inativos
        </label>
      </section>

      {/* Catálogo */}
      <section className="bg-white/90 border border-[#eadfce] rounded-2xl shadow-[0_8px_26px_rgba(77,45,18,0.04)] overflow-hidden">
        <div className="px-4 py-3 flex items-center justify-between border-b border-[#eadfce]">
          <div className="flex items-center gap-2">
            <span className="text-[#9A5B20]">◇</span>
            <h3 className="font-display text-xl text-mata-ink">
              Catálogo de produtos
            </h3>
          </div>

          <span className="text-xs text-mata-ink/45">
            {produtosFiltrados.length} registro(s)
          </span>
        </div>

        {carregando ? (
          <p className="p-5 text-sm text-mata-ink/50">
            Carregando…
          </p>
        ) : produtosFiltrados.length === 0 ? (
          <p className="p-5 text-sm text-mata-ink/50">
            Nenhum produto encontrado.
          </p>
        ) : (
          <div className="max-h-[465px] overflow-y-auto">
            <div
              className="hidden md:grid gap-3 px-4 py-2 border-b border-[#eadfce] bg-[#fbf7f0]/65 text-[10px] uppercase tracking-[0.08em] text-mata-ink/45 sticky top-0 z-10"
              style={{
                gridTemplateColumns:
                  '62px minmax(0, 2fr) minmax(130px, 1.2fr) 120px 90px 170px',
              }}
            >
              <span>Foto</span>
              <span>Produto</span>
              <span>Categoria</span>
              <span>Preço</span>
              <span>Status</span>
              <span className="text-right">Ações</span>
            </div>

            <div className="divide-y divide-[#eadfce]">
              {produtosFiltrados.map((produto) => (
                <div
                  key={produto.id}
                  className="grid items-center gap-3 px-4 py-2.5 hover:bg-[#fbf7f0]/70 transition"
                  style={{
                    gridTemplateColumns:
                      '62px minmax(0, 2fr) minmax(130px, 1.2fr) 120px 90px 170px',
                  }}
                >
                  <div className="w-12 h-12 rounded-xl overflow-hidden border border-[#eadfce] bg-[#fbf7f0] flex items-center justify-center">
                    {produto.foto_url ? (
                      <img
                        src={produto.foto_url}
                        alt={produto.nome}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-[#B8782D] text-lg">
                        ◇
                      </span>
                    )}
                  </div>

                  <div className="min-w-0">
                    <p className="font-medium text-sm text-mata-ink truncate">
                      {produto.nome}
                    </p>
                  </div>

                  <span className="text-sm text-mata-ink/60 truncate">
                    {produto.categoria || '—'}
                  </span>

                  <span className="font-display text-base text-[#9A5B20] whitespace-nowrap">
                    {formatarMoeda(produto.preco)}
                  </span>

                  <span
                    className={`inline-flex justify-center text-[10px] px-2.5 py-1 rounded-full ${
                      produto.ativo !== false
                        ? 'bg-green-100 text-green-700'
                        : 'bg-zinc-200 text-zinc-600'
                    }`}
                  >
                    {produto.ativo !== false ? 'Ativo' : 'Inativo'}
                  </span>

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => abrirEdicao(produto)}
                      className="px-3 py-1.5 rounded-xl border border-[#d9b98d] text-[#9A5B20] text-xs hover:bg-[#f8efe3]"
                    >
                      Editar
                    </button>

                    <button
                      type="button"
                      onClick={() => alternarAtivo(produto)}
                      className="px-3 py-1.5 rounded-xl border border-[#eadfce] text-mata-ink/55 text-xs hover:bg-[#f8efe3]"
                    >
                      {produto.ativo !== false ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Cadastro / edição de produto */}
      {mostrarForm && (
        <div className="fixed inset-0 z-50 bg-[#1d120b]/45 backdrop-blur-[2px] flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <form
            onSubmit={salvar}
            className="bg-[#fffdfa] border border-[#eadfce] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-6"
          >
            <div className="px-6 py-4 border-b border-[#eadfce] flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.08em] text-mata-ink/45">
                  {editandoId ? 'Editar produto' : 'Novo produto'}
                </p>

                <h3 className="font-display text-2xl text-mata-ink mt-1">
                  {editandoId
                    ? form.nome || 'Produto'
                    : 'Cadastrar produto'}
                </h3>
              </div>

              <button
                type="button"
                onClick={fecharForm}
                className="w-9 h-9 rounded-full border border-[#eadfce] text-mata-ink/50 hover:bg-[#f8efe3]"
              >
                ✕
              </button>
            </div>

            <div
              className="p-6 grid gap-6"
              style={{
                gridTemplateColumns: '190px minmax(0, 1fr)',
              }}
            >
              {/* Foto */}
              <div>
                <label className="text-xs text-mata-ink/60">
                  Foto do produto
                </label>

                <div className="mt-2 aspect-square rounded-2xl border border-dashed border-[#d9b98d] bg-[#fbf7f0] overflow-hidden flex items-center justify-center">
                  {fotoPreview ? (
                    <img
                      src={fotoPreview}
                      alt="Prévia do produto"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center px-4">
                      <div className="text-3xl text-[#B8782D] mb-2">
                        ◇
                      </div>
                      <p className="text-xs text-mata-ink/45">
                        Nenhuma foto selecionada
                      </p>
                    </div>
                  )}
                </div>

                <label className="mt-3 block">
                  <span className="block w-full text-center px-3 py-2 rounded-xl border border-[#d9b98d] text-[#9A5B20] text-xs cursor-pointer hover:bg-[#f8efe3]">
                    Escolher foto
                  </span>

                  <input
                    type="file"
                    accept="image/*"
                    onChange={selecionarFoto}
                    className="hidden"
                  />
                </label>

                <p className="text-[10px] text-mata-ink/40 mt-2 text-center">
                  JPG, PNG ou WEBP · máximo 5 MB
                </p>
              </div>

              {/* Dados */}
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-mata-ink/60">
                    Nome do produto *
                  </label>

                  <input
                    required
                    value={form.nome}
                    onChange={(e) =>
                      setForm({ ...form, nome: e.target.value })
                    }
                    className="w-full mt-1 border border-[#eadfce] bg-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
                    placeholder="Ex.: Hidratante corporal"
                  />
                </div>

                <div>
                  <label className="text-xs text-mata-ink/60">
                    Categoria *
                  </label>

                  <input
                    required
                    value={form.categoria}
                    onChange={(e) =>
                      setForm({ ...form, categoria: e.target.value })
                    }
                    className="w-full mt-1 border border-[#eadfce] bg-white rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
                    placeholder="Ex.: Corpo, Rosto, Cabelo"
                    list="categorias-produto"
                  />

                  <datalist id="categorias-produto">
                    {categorias.map((categoria) => (
                      <option
                        key={categoria}
                        value={categoria}
                      />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="text-xs text-mata-ink/60">
                    Preço *
                  </label>

                  <div className="relative mt-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-mata-ink/45">
                      R$
                    </span>

                    <input
                      required
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.preco}
                      onChange={(e) =>
                        setForm({ ...form, preco: e.target.value })
                      }
                      className="w-full border border-[#eadfce] bg-white rounded-xl pl-10 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
                      placeholder="0,00"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-mata-ink/70 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        ativo: e.target.checked,
                      })
                    }
                  />
                  Produto ativo
                </label>

                {erroForm && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                    {erroForm}
                  </p>
                )}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-[#eadfce] flex justify-end gap-2 bg-[#fbf7f0]/65">
              <button
                type="button"
                onClick={fecharForm}
                className="px-4 py-2 text-sm text-mata-ink/60"
              >
                Cancelar
              </button>

              <button
                type="submit"
                disabled={salvando}
                className="px-5 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-[#9A5B20] to-[#B8782D] shadow-[0_8px_20px_rgba(154,91,32,0.18)] hover:brightness-105 transition disabled:opacity-50"
              >
                {salvando
                  ? 'Salvando...'
                  : editandoId
                    ? 'Salvar alterações'
                    : 'Cadastrar produto'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
