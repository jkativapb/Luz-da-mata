// src/components/EquipeVendedores.jsx
// Cadastro de Vendedores / Equipe (nome + WhatsApp) para usar em Configurações.
// Vendas e Visitas mostram só o nome; o telefone é usado nos lembretes.
import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { formatarTelefone, somenteDigitos, telefoneValido } from '../lib/lembretes'

const vazio = { id: null, nome: '', telefone: '', recebe_lembretes: true }

export default function EquipeVendedores() {
  const [lista, setLista] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState(vazio)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  async function carregar() {
    setCarregando(true)
    const { data, error } = await supabase.from('vendedores').select('*').order('nome')
    if (error) setErro('Não foi possível carregar a equipe. Confira se o SQL das colunas novas foi executado.')
    setLista(data || [])
    setCarregando(false)
  }

  useEffect(() => {
    carregar()
  }, [])

  async function salvar(e) {
    e.preventDefault()
    setErro('')

    const nome = form.nome.trim()
    const telefone = somenteDigitos(form.telefone)

    if (!nome) {
      setErro('Informe o nome.')
      return
    }
    if (telefone && !telefoneValido(telefone)) {
      setErro('Informe o WhatsApp com DDD, por exemplo (46) 99999-9999.')
      return
    }
    if (form.recebe_lembretes && !telefone) {
      setErro('Informe o WhatsApp ou desmarque "Recebe lembretes".')
      return
    }

    setSalvando(true)
    const dados = {
      nome,
      telefone: telefone || null,
      recebe_lembretes: form.recebe_lembretes,
    }
    const { error } = form.id
      ? await supabase.from('vendedores').update(dados).eq('id', form.id)
      : await supabase.from('vendedores').insert({ ...dados, ativo: true })
    setSalvando(false)

    if (error) {
      setErro('Não foi possível salvar. Tente novamente.')
      return
    }
    setForm(vazio)
    carregar()
  }

  function editar(v) {
    setErro('')
    setForm({
      id: v.id,
      nome: v.nome || '',
      telefone: formatarTelefone(v.telefone),
      recebe_lembretes: v.recebe_lembretes !== false,
    })
  }

  async function alternarAtivo(v) {
    const { error } = await supabase.from('vendedores').update({ ativo: !v.ativo }).eq('id', v.id)
    if (error) {
      setErro('Não foi possível atualizar. Tente novamente.')
      return
    }
    if (form.id === v.id) setForm(vazio)
    carregar()
  }

  return (
    <section className="bg-white/95 border border-[#eadfce] rounded-2xl p-5 shadow-[0_6px_20px_rgba(77,45,18,0.04)]">
      <h2 className="font-display text-xl text-[#2f2118]">Vendedores / Equipe</h2>
      <p className="text-xs text-mata-ink/60 mt-1">
        Aparecem pelo nome em Vendas e Visitas. O WhatsApp é usado para enviar os lembretes da equipe.
      </p>

      <form onSubmit={salvar} className="mt-4 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_200px_auto] gap-2 items-end">
        <div>
          <label className="text-xs text-mata-ink/60">Nome</label>
          <input
            value={form.nome}
            onChange={(e) => setForm({ ...form, nome: e.target.value })}
            className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm mt-1 bg-[#fffdfa]"
          />
        </div>
        <div>
          <label className="text-xs text-mata-ink/60">WhatsApp</label>
          <input
            inputMode="tel"
            placeholder="(46) 99999-9999"
            value={form.telefone}
            onChange={(e) => setForm({ ...form, telefone: formatarTelefone(e.target.value) })}
            className="w-full border border-[#eadfce] rounded-xl px-3 py-2 text-sm mt-1 bg-[#fffdfa]"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={salvando}
            className="px-4 py-2 rounded-xl bg-mata-copper text-white text-sm disabled:opacity-60"
          >
            {form.id ? 'Salvar alterações' : 'Adicionar'}
          </button>
          {form.id && (
            <button
              type="button"
              onClick={() => {
                setForm(vazio)
                setErro('')
              }}
              className="px-3 py-2 text-sm text-mata-ink/60"
            >
              Cancelar
            </button>
          )}
        </div>

        <label className="sm:col-span-3 flex items-center gap-2 text-sm text-mata-ink/70">
          <input
            type="checkbox"
            checked={form.recebe_lembretes}
            onChange={(e) => setForm({ ...form, recebe_lembretes: e.target.checked })}
          />
          Recebe lembretes de visitas
        </label>
      </form>

      {erro && <p className="text-xs text-red-600 mt-2">{erro}</p>}

      <div className="mt-4 divide-y divide-[#eee4d7] border-t border-[#eee4d7]">
        {carregando ? (
          <p className="py-4 text-sm text-mata-ink/50">Carregando…</p>
        ) : lista.length === 0 ? (
          <p className="py-4 text-sm text-mata-ink/50">Nenhum vendedor cadastrado ainda.</p>
        ) : (
          lista.map((v) => (
            <div key={v.id} className={`flex items-center justify-between gap-3 py-2.5 ${v.ativo === false ? 'opacity-50' : ''}`}>
              <div className="min-w-0">
                <p className="text-sm text-[#2f2118] truncate">{v.nome}</p>
                <p className="text-xs text-mata-ink/55">
                  {v.telefone ? formatarTelefone(v.telefone) : 'Sem WhatsApp'}
                  {v.ativo === false
                    ? ' · Inativo'
                    : v.recebe_lembretes === false
                    ? ' · Não recebe lembretes'
                    : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => editar(v)}
                  className="rounded-lg border border-[#c9955f] px-2.5 py-1.5 text-xs text-[#8f4f22] hover:bg-[#fff6ea]"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => alternarAtivo(v)}
                  className="rounded-lg border border-[#eadfce] px-2.5 py-1.5 text-xs text-mata-ink/70 hover:bg-[#fffdfa]"
                >
                  {v.ativo === false ? 'Reativar' : 'Desativar'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
