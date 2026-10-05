import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { formatarData } from '../lib/helpers'


function somenteNumeros(valor) {
  return String(valor || '').replace(/\D/g, '')
}

function formatarCPF(valor) {
  const n = somenteNumeros(valor).slice(0, 11)
  return n
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function formatarCNPJ(valor) {
  const n = somenteNumeros(valor).slice(0, 14)
  return n
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function documentoRepetido(valor) {
  return /^([0-9])\1+$/.test(valor)
}

function validarCPF(valor) {
  const cpf = somenteNumeros(valor)
  if (cpf.length !== 11 || documentoRepetido(cpf)) return false
  let soma = 0
  for (let i = 0; i < 9; i++) soma += Number(cpf[i]) * (10 - i)
  let resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  if (resto !== Number(cpf[9])) return false
  soma = 0
  for (let i = 0; i < 10; i++) soma += Number(cpf[i]) * (11 - i)
  resto = (soma * 10) % 11
  if (resto === 10) resto = 0
  return resto === Number(cpf[10])
}

function validarCNPJ(valor) {
  const cnpj = somenteNumeros(valor)
  if (cnpj.length !== 14 || documentoRepetido(cnpj)) return false
  const calcularDigito = (base) => {
    let peso = base.length - 7
    let soma = 0
    for (let i = 0; i < base.length; i++) {
      soma += Number(base[i]) * peso
      peso--
      if (peso < 2) peso = 9
    }
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  const d1 = calcularDigito(cnpj.slice(0, 12))
  const d2 = calcularDigito(cnpj.slice(0, 12) + d1)
  return d1 === Number(cnpj[12]) && d2 === Number(cnpj[13])
}

function formatarCEP(valor) {
  const n = somenteNumeros(valor).slice(0, 8)
  return n.length > 5 ? `${n.slice(0, 5)}-${n.slice(5)}` : n
}

function dataHoje() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}

function adicionarDias(dataISO, dias) {
  if (!dataISO) return null
  const [ano, mes, dia] = String(dataISO).slice(0, 10).split('-').map(Number)
  const data = new Date(Date.UTC(ano, mes - 1, dia))
  data.setUTCDate(data.getUTCDate() + dias)
  return data.toISOString().slice(0, 10)
}

const TIPOS_CONTATO = ['ligacao', 'whatsapp', 'visita', 'instagram', 'email', 'outro']
const LABEL_TIPO_CONTATO = {
  ligacao: 'Ligação',
  whatsapp: 'WhatsApp',
  visita: 'Visita',
  instagram: 'Instagram',
  email: 'E-mail',
  outro: 'Outro',
}

const vazio = {
  nome: '',
  tipo: 'cliente_final',
  cpf: '',
  telefone: '',
  email: '',
  cidade: '',
  estado: '',
  bairro: '',
  endereco: '',
  cep: '',
  numero: '',
  complemento: '',
  cnpj: '',
  desconto_percentual: 0,
  data_ultimo_contato: dataHoje(),
  tipos_contato: [],
  converteu_negocio: false,
  aguardando_retorno: true,
  data_proximo_contato: adicionarDias(dataHoje(), 5),
  instagram: '',
  observacoes: '',
  ativo: true,
  data_inativacao: null,
}

export default function Cadastro() {
  const location = useLocation()
  const navigate = useNavigate()
  const { setPageHeader } = useOutletContext()
  const [contatos, setContatos] = useState([])
  const [ultimoContato, setUltimoContato] = useState({}) // { contato_id: dataISO }
  const [aba, setAba] = useState('todos')
  const [mostrarInativos, setMostrarInativos] = useState(false)
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [form, setForm] = useState(vazio)
  const [editandoId, setEditandoId] = useState(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const [erroCep, setErroCep] = useState('')

  useEffect(() => {
    carregar()
  }, [])

  useEffect(() => {
    setPageHeader({
      title: 'Clientes',
      subtitle: 'Clientes, revendedoras e clínicas',
      actions: (
        <button
          type="button"
          onClick={() => {
            setForm({ ...vazio, tipo: 'cliente_final', data_ultimo_contato: dataHoje(), aguardando_retorno: true, data_proximo_contato: adicionarDias(dataHoje(), 5) })
            setEditandoId(null)
            setMostrarForm(true)
          }}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white px-5 py-2.5 rounded-xl text-sm font-medium shadow-[0_8px_20px_rgba(154,91,32,0.20)] hover:brightness-105 transition"
        >
          <span className="text-lg leading-none">+</span> Novo cadastro
        </button>
      ),
    })
    return () => setPageHeader({ title: '', subtitle: '', actions: null })
  }, [setPageHeader])

  // Se chegou aqui vindo do Dashboard (clique em "Ver cliente"),
  // abre direto a ficha de edição do contato indicado.
  useEffect(() => {
    const idParaAbrir = location.state?.editarContatoId
    if (idParaAbrir && contatos.length > 0) {
      const c = contatos.find((x) => x.id === idParaAbrir)
      if (c) {
        setAba('todos')
        abrirEdicao(c)
      }
      navigate(location.pathname, { replace: true, state: null })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contatos])

  async function carregar() {
    setCarregando(true)
    const { data: cData } = await supabase.from('contatos').select('*').order('nome')
    const { data: vData } = await supabase
      .from('visitas')
      .select('contato_id, data_visita')
      .not('contato_id', 'is', null)
      .order('data_visita', { ascending: false })
    const { data: vendaData } = await supabase
      .from('vendas')
      .select('contato_id, data_venda')
      .order('data_venda', { ascending: false })

    const ultimos = {}
    ;(cData || []).forEach((c) => {
      if (c.data_ultimo_contato) ultimos[c.id] = c.data_ultimo_contato
    })
    ;[...(vData || []), ...(vendaData || [])].forEach((r) => {
      const data = r.data_visita || r.data_venda
      if (!data) return
      if (!ultimos[r.contato_id] || new Date(data) > new Date(ultimos[r.contato_id])) {
        ultimos[r.contato_id] = data
      }
    })

    setContatos(cData || [])
    setUltimoContato(ultimos)
    setCarregando(false)
  }

  function abrirNovo() {
    setForm({ ...vazio, tipo: 'cliente_final', data_ultimo_contato: dataHoje(), aguardando_retorno: true, data_proximo_contato: adicionarDias(dataHoje(), 5) })
    setEditandoId(null)
    setMostrarForm(true)
  }

  function abrirEdicao(c) {
    setForm({
      ...vazio,
      ...c,
      tipos_contato: Array.isArray(c.tipos_contato) ? c.tipos_contato : [],
      converteu_negocio: c.converteu_negocio === true,
      aguardando_retorno: c.converteu_negocio === true ? false : c.aguardando_retorno !== false,
      data_proximo_contato: c.data_proximo_contato || (c.converteu_negocio ? adicionarDias(c.data_ultimo_contato || dataHoje(), 30) : adicionarDias(c.data_ultimo_contato || dataHoje(), 5)),
    })
    setEditandoId(c.id)
    setMostrarForm(true)
  }


  async function buscarCep(cepInformado) {
    const cep = somenteNumeros(cepInformado)
    setErroCep('')
    if (cep.length !== 8) return

    setBuscandoCep(true)
    try {
      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
      if (!resposta.ok) throw new Error('Falha na consulta')
      const dados = await resposta.json()

      if (dados.erro) {
        setErroCep('CEP não encontrado. Confira o número informado.')
        return
      }

      setForm((atual) => ({
        ...atual,
        cep: formatarCEP(dados.cep || cep),
        endereco: dados.logradouro || atual.endereco,
        bairro: dados.bairro || atual.bairro,
        cidade: dados.localidade || atual.cidade,
        estado: dados.uf || atual.estado,
      }))
    } catch {
      setErroCep('Não foi possível consultar o CEP agora.')
    } finally {
      setBuscandoCep(false)
    }
  }

  async function salvar(e) {
    e.preventDefault()

    const documento = form.tipo === 'clinica' ? form.cnpj : form.cpf
    const documentoValido = form.tipo === 'clinica' ? validarCNPJ(documento) : validarCPF(documento)

    if (!documento || !documentoValido) {
      alert(`Informe um ${form.tipo === 'clinica' ? 'CNPJ' : 'CPF'} válido.`)
      return
    }

    const converteu = form.converteu_negocio === true
    const aguardando = !converteu && form.aguardando_retorno !== false
    const dataBaseContato = form.data_ultimo_contato || dataHoje()
    const proximoContato = converteu
      ? adicionarDias(dataBaseContato, 30)
      : aguardando
        ? adicionarDias(dataBaseContato, 5)
        : null

    const payload = {
      ...form,
      cpf: form.tipo === 'clinica' ? null : somenteNumeros(form.cpf),
      cnpj: form.tipo === 'clinica' ? somenteNumeros(form.cnpj) : null,
      cep: somenteNumeros(form.cep),
      data_ultimo_contato: dataBaseContato,
      tipos_contato: Array.isArray(form.tipos_contato) ? form.tipos_contato : [],
      converteu_negocio: converteu,
      aguardando_retorno: aguardando,
      data_proximo_contato: proximoContato,
      estado: String(form.estado || '').toUpperCase(),
      desconto_percentual: Math.max(0, Math.min(100, Number(form.desconto_percentual || 0))),
    }

    const resposta = editandoId
      ? await supabase.from('contatos').update(payload).eq('id', editandoId)
      : await supabase.from('contatos').insert(payload)

    if (resposta.error) {
      alert(`Não foi possível salvar: ${resposta.error.message}`)
      return
    }

    setMostrarForm(false)
    carregar()
  }

  async function excluir(id) {
    if (!confirm('Excluir este cadastro?')) return
    await supabase.from('contatos').delete().eq('id', id)
    carregar()
  }

  async function alternarAtivo(c) {
    const vaiDesativar = c.ativo !== false
    await supabase
      .from('contatos')
      .update({
        ativo: !vaiDesativar,
        data_inativacao: vaiDesativar ? new Date().toISOString() : null,
      })
      .eq('id', c.id)
    carregar()
  }

  const contatosAtivos = contatos.filter((c) => c.ativo !== false)
  const clientesFinaisAtivos = contatosAtivos.filter((c) => c.tipo === 'cliente_final').length
  const profissionaisAtivos = contatosAtivos.filter((c) => ['revendedora', 'clinica'].includes(c.tipo)).length
  const hojeISO = dataHoje()
  // Contatos do mês: contatos ativos cujo último contato (cadastro, visita ou venda) caiu no mês atual.
  // Convertidos: desses, os que fecharam negócio.
  const agora = new Date()
  const noMesAtual = (data) => {
    if (!data) return false
    const texto = String(data)
    if (texto.length <= 10) return texto.slice(0, 7) === hojeISO.slice(0, 7)
    const d = new Date(texto)
    return d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth()
  }
  const contatosDoMesLista = contatosAtivos.filter((c) => noMesAtual(ultimoContato[c.id]))
  const contatosDoMes = contatosDoMesLista.length
  const convertidosDoMes = contatosDoMesLista.filter((c) => c.converteu_negocio === true).length
  const retornosPendentes = contatosAtivos.filter((c) => c.data_proximo_contato && c.data_proximo_contato <= hojeISO).length

  const buscaNormalizada = busca.trim().toLowerCase()
  const listaFiltrada = contatos.filter((c) => {
    if (aba !== 'todos' && c.tipo !== aba) return false
    if (!mostrarInativos && c.ativo === false) return false
    if (!buscaNormalizada) return true
    return (
      c.nome?.toLowerCase().includes(buscaNormalizada) ||
      c.telefone?.toLowerCase().includes(buscaNormalizada) ||
      c.cidade?.toLowerCase().includes(buscaNormalizada)
    )
  })

  return (
    <div className="w-full pb-3 space-y-[1px]">

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-[5px]">
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] flex items-center gap-2 xl:h-[80px]">
          <p className="text-xs text-mata-ink/50 uppercase tracking-wide">Clientes finais ativos</p>
          <p className="font-display text-2xl text-mata-ink mt-1">{clientesFinaisAtivos}</p>
        </div>
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] flex items-center gap-2 xl:h-[80px]">
          <p className="text-xs text-mata-ink/50 uppercase tracking-wide">Profissionais ativos</p>
          <p className="font-display text-2xl text-mata-ink mt-1">{profissionaisAtivos}</p>
        </div>
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] flex items-center gap-2 xl:h-[80px]">
          <p className="text-xs text-mata-ink/50 uppercase tracking-wide">Contatos do mês</p>
          <p className="font-display text-2xl text-mata-ink mt-1">{contatosDoMes}</p>
        </div>
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] flex items-center gap-2 xl:h-[80px]">
          <p className="text-xs text-mata-ink/50 uppercase tracking-wide">Convertidos</p>
          <p className="font-display text-2xl text-green-700 mt-1">{convertidosDoMes}</p>
        </div>
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl px-5 py-3 shadow-[0_10px_30px_rgba(77,45,18,0.05)] flex items-center gap-2 xl:h-[80px]">
          <p className="text-xs text-mata-ink/50 uppercase tracking-wide">Retornos pendentes</p>
          <p className="font-display text-2xl text-red-600 mt-1">{retornosPendentes}</p>
        </div>
      </section>

      <section className="bg-white/90 border border-[#eadfce] rounded-2xl px-4 py-3 shadow-[0_8px_26px_rgba(77,45,18,0.04)]">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar por nome, telefone ou cidade..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="w-full border border-[#eadfce] bg-[#fffdfa] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
            />
          </div>
          <div className="lg:w-56">
            <label className="sr-only">Filtrar por tipo</label>
            <select
              value={aba}
              onChange={(e) => setAba(e.target.value)}
              className="w-full border border-[#eadfce] bg-[#fffdfa] rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#B8782D]/20"
            >
              <option value="todos">Todos os clientes</option>
              <option value="cliente_final">Clientes finais</option>
              <option value="revendedora">Revendedoras</option>
              <option value="clinica">Clínicas</option>
            </select>
          </div>
          <label className="flex items-center gap-2 text-xs text-mata-ink/55 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={mostrarInativos}
              onChange={(e) => setMostrarInativos(e.target.checked)}
            />
            Mostrar inativos
          </label>
        </div>
      </section>

      {carregando ? (
        <p className="text-mata-ink/50 text-sm">Carregando…</p>
      ) : listaFiltrada.length === 0 ? (
        <p className="text-mata-ink/50 text-sm">
          {busca ? 'Nenhum resultado para essa busca.' : 'Nenhum cadastro ainda nesta categoria.'}
        </p>
      ) : (
        <div className="bg-white/90 border border-[#eadfce] rounded-2xl shadow-[0_8px_26px_rgba(77,45,18,0.04)] overflow-hidden">
          <div className="max-h-[calc(100vh-430px)] min-h-[220px] overflow-auto [scrollbar-width:thin] [scrollbar-color:#d9b98f_transparent]">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-[#f8f1e7] text-mata-ink/60 text-xs uppercase tracking-wide sticky top-0 z-10 shadow-[0_1px_0_#eadfce]">
              <tr>
                <th className="text-left px-4 py-3">Nome</th>
                <th className="text-left px-4 py-3">Contato</th>
                <th className="text-left px-4 py-3">Cidade</th>
                <th className="text-left px-4 py-3">Contato / próximo</th>
                <th className="text-right px-4 py-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {listaFiltrada.map((c) => {
                const ultima = ultimoContato[c.id]
                const proximo = c.data_proximo_contato
                const atrasado = Boolean(proximo && proximo <= hojeISO)
                const inativo = c.ativo === false
                return (
                  <tr key={c.id} className={`border-t border-mata-sand/70 ${inativo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">
                      {c.nome}
                      {inativo && (
                        <span className="ml-2 inline-block text-[10px] bg-mata-sand text-mata-ink/60 px-2 py-0.5 rounded-full">
                          Inativo{c.data_inativacao ? ` desde ${formatarData(c.data_inativacao)}` : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-mata-ink/70">{c.telefone || c.email || '—'}</td>
                    <td className="px-4 py-3 text-mata-ink/70">{c.cidade || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="text-mata-ink/70">
                        {ultima ? formatarData(ultima) : 'Sem registro'}
                      </div>
                      {!inativo && c.converteu_negocio ? (
                        <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${atrasado ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {atrasado ? 'Giro atrasado' : `Giro em ${proximo ? formatarData(proximo) : '30 dias'}`}
                        </span>
                      ) : !inativo && c.aguardando_retorno ? (
                        <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full ${atrasado ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          {atrasado ? 'Retorno atrasado' : `Retorno ${proximo ? formatarData(proximo) : 'em 5 dias'}`}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right space-x-3">
                      <button onClick={() => abrirEdicao(c)} className="text-mata-copper hover:underline">
                        Editar
                      </button>
                      <button onClick={() => alternarAtivo(c)} className="text-mata-ink/50 hover:underline">
                        {inativo ? 'Ativar' : 'Desativar'}
                      </button>
                      <button onClick={() => excluir(c.id)} className="text-mata-ink/40 hover:text-red-600">
                        Excluir
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {mostrarForm && (
        <div className="fixed inset-0 bg-[#1d120b]/45 backdrop-blur-[3px] flex items-center justify-center p-2 z-50 overflow-hidden">
          <form onSubmit={salvar} className="bg-[#fffdfa] border border-[#eadfce] rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden">
            <div className="px-4 py-2 border-b border-[#eadfce] bg-[#fffaf3] flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.16em] text-mata-copper font-semibold">Cadastro de cliente</p>
                <h3 className="font-display text-xl text-mata-ink mt-0.5">{editandoId ? 'Editar cadastro' : 'Novo cadastro'}</h3>
              </div>
              <button type="button" onClick={() => setMostrarForm(false)} className="w-8 h-8 shrink-0 rounded-full border border-[#eadfce] text-mata-ink/45 hover:text-mata-ink hover:bg-white transition" aria-label="Fechar">×</button>
            </div>

            <div className="px-4 py-2 space-y-2">
              <section>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-5 h-5 rounded-md bg-[#f3e7d7] text-mata-copper flex items-center justify-center text-[10px] font-semibold">1</span>
                  <div className="flex items-baseline gap-2">
                    <h4 className="font-semibold text-sm text-mata-ink">Identificação</h4>
                    <p className="text-[10px] text-mata-ink/40">Dados principais e contato.</p>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-1.5">
                  <label className="col-span-3 block">
                    <span className="block text-[11px] font-medium text-mata-ink/65 mb-0.5">Tipo</span>
                    <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value, cpf: e.target.value === 'clinica' ? '' : form.cpf, cnpj: e.target.value === 'clinica' ? form.cnpj : '' })} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-[#B8782D]/20">
                      <option value="cliente_final">Cliente final</option>
                      <option value="revendedora">Revendedora</option>
                      <option value="clinica">Clínica</option>
                    </select>
                  </label>
                  <label className="col-span-5 block">
                    <span className="block text-[11px] font-medium text-mata-ink/65 mb-1">{form.tipo === 'clinica' ? 'Razão social / Nome' : 'Nome completo'}</span>
                    <input required placeholder={form.tipo === 'clinica' ? 'Nome da clínica' : 'Nome do cliente'} value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-[#B8782D]/20" />
                  </label>
                  <label className="col-span-4 block">
                    <span className="block text-[11px] font-medium text-mata-ink/65 mb-1">{form.tipo === 'clinica' ? 'CNPJ' : 'CPF'}</span>
                    {form.tipo === 'clinica' ? (
                      <input required placeholder="00.000.000/0000-00" value={formatarCNPJ(form.cnpj)} onChange={(e) => setForm({ ...form, cnpj: somenteNumeros(e.target.value) })} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-[#B8782D]/20" />
                    ) : (
                      <input required placeholder="000.000.000-00" value={formatarCPF(form.cpf)} onChange={(e) => setForm({ ...form, cpf: somenteNumeros(e.target.value) })} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 text-[13px] outline-none focus:ring-2 focus:ring-[#B8782D]/20" />
                    )}
                  </label>

                  <label className="col-span-4 block">
                    <span className="block text-[11px] font-medium text-mata-ink/65 mb-0.5">Telefone</span>
                    <input placeholder="(00) 00000-0000" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 text-[13px]" />
                  </label>
                  <label className="col-span-4 block">
                    <span className="block text-[11px] font-medium text-mata-ink/65 mb-0.5">E-mail</span>
                    <input type="email" placeholder="cliente@email.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 text-[13px]" />
                  </label>
                  <label className="col-span-4 block">
                    <span className="block text-[11px] font-medium text-mata-ink/65 mb-0.5">Instagram</span>
                    <input placeholder="@usuario" value={form.instagram} onChange={(e) => setForm({ ...form, instagram: e.target.value })} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 text-[13px]" />
                  </label>

                  <label className="col-span-3 block">
                    <span className="block text-[11px] font-medium text-mata-ink/65 mb-0.5">Último contato</span>
                    <input type="date" value={form.data_ultimo_contato || ''} onChange={(e) => setForm({ ...form, data_ultimo_contato: e.target.value })} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 text-[13px]" />
                  </label>

                  <div className="col-span-9">
                    <span className="block text-[11px] font-medium text-mata-ink/65 mb-0.5">Tipo(s) de contato <span className="font-normal text-mata-ink/40">(marque um ou mais)</span></span>
                    <div className="flex items-center gap-3 flex-wrap min-h-[31px]">
                      {TIPOS_CONTATO.map((tipoContato) => (
                        <label key={tipoContato} className="inline-flex items-center gap-1.5 text-[12px] text-mata-ink/75 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={(form.tipos_contato || []).includes(tipoContato)}
                            onChange={(e) => {
                              const atuais = form.tipos_contato || []
                              const novos = e.target.checked ? [...atuais, tipoContato] : atuais.filter((x) => x !== tipoContato)
                              setForm({ ...form, tipos_contato: novos })
                            }}
                            className="accent-[#A96427]"
                          />
                          {LABEL_TIPO_CONTATO[tipoContato]}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="col-span-12 border-t border-[#eadfce] pt-1.5 grid grid-cols-12 items-center gap-2">
                    <div className="col-span-4 flex items-center gap-3">
                      <span className="text-[11px] font-medium text-mata-ink/65">Converteu em negócio?</span>
                      <label className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer">
                        <input type="radio" name="converteu" checked={form.converteu_negocio === true} onChange={() => setForm({ ...form, converteu_negocio: true, aguardando_retorno: false, data_proximo_contato: adicionarDias(form.data_ultimo_contato || dataHoje(), 30) })} className="accent-[#A96427]" />
                        Sim
                      </label>
                      <label className="inline-flex items-center gap-1.5 text-[12px] cursor-pointer">
                        <input type="radio" name="converteu" checked={form.converteu_negocio !== true} onChange={() => setForm({ ...form, converteu_negocio: false, aguardando_retorno: true, data_proximo_contato: adicionarDias(form.data_ultimo_contato || dataHoje(), 5) })} className="accent-[#A96427]" />
                        Não
                      </label>
                    </div>

                    <div className="col-span-8 flex items-center justify-end gap-3">
                      {!form.converteu_negocio ? (
                        <label className="inline-flex items-center gap-1.5 text-[11px] text-mata-ink/70 cursor-pointer whitespace-nowrap">
                          <input type="checkbox" checked={form.aguardando_retorno !== false} onChange={(e) => setForm({ ...form, aguardando_retorno: e.target.checked, data_proximo_contato: e.target.checked ? adicionarDias(form.data_ultimo_contato || dataHoje(), 5) : null })} className="accent-[#A96427]" />
                          Aguardando retorno · 5 dias
                        </label>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-green-700 whitespace-nowrap">
                          <span className="w-2 h-2 rounded-full bg-green-600" />
                          Giro da carteira · 30 dias
                        </span>
                      )}
                      <label className="inline-flex items-center gap-2 text-[11px] text-mata-ink/65 whitespace-nowrap">
                        <span>Próximo contato</span>
                        <input
                          type="date"
                          value={form.data_proximo_contato || ''}
                          onChange={(e) => setForm({ ...form, data_proximo_contato: e.target.value })}
                          className="border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 text-[12px] outline-none focus:ring-2 focus:ring-[#B8782D]/20"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </section>

              <section className="border-t border-[#eadfce] pt-2">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-5 h-5 rounded-md bg-[#f3e7d7] text-mata-copper flex items-center justify-center text-[10px] font-semibold">2</span>
                  <div className="flex items-baseline gap-2">
                    <h4 className="font-semibold text-sm text-mata-ink">Endereço</h4>
                    <p className="text-[10px] text-mata-ink/40">O CEP preenche rua, bairro, cidade e UF automaticamente.</p>
                  </div>
                </div>

                <div className="grid grid-cols-12 gap-1.5">
                  <label className="col-span-3 block">
                    <span className="block text-[11px] font-medium text-mata-ink/65 mb-0.5">CEP</span>
                    <div className="relative">
                      <input inputMode="numeric" maxLength={9} placeholder="00000-000" value={formatarCEP(form.cep)} onChange={(e) => { const cep = somenteNumeros(e.target.value).slice(0, 8); setForm({ ...form, cep }); setErroCep(''); if (cep.length === 8) buscarCep(cep) }} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 pr-8 text-[13px]" />
                      {buscandoCep && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-mata-copper">...</span>}
                    </div>
                    {erroCep && <span className="block text-[10px] text-red-600 mt-0.5">{erroCep}</span>}
                  </label>
                  <label className="col-span-5 block">
                    <span className="block text-[11px] font-medium text-mata-ink/65 mb-0.5">Cidade</span>
                    <input placeholder="Cidade" value={form.cidade} onChange={(e) => setForm({ ...form, cidade: e.target.value })} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 text-[13px]" />
                  </label>
                  <label className="col-span-1 block">
                    <span className="block text-[11px] font-medium text-mata-ink/65 mb-0.5">UF</span>
                    <input maxLength={2} placeholder="PR" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value.toUpperCase() })} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 text-[13px]" />
                  </label>
                  <label className="col-span-3 block">
                    <span className="block text-[11px] font-medium text-mata-ink/65 mb-0.5">Bairro</span>
                    <input placeholder="Bairro" value={form.bairro} onChange={(e) => setForm({ ...form, bairro: e.target.value })} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 text-[13px]" />
                  </label>

                  <label className="col-span-7 block">
                    <span className="block text-[11px] font-medium text-mata-ink/65 mb-0.5">Endereço</span>
                    <input placeholder="Rua, avenida..." value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 text-[13px]" />
                  </label>
                  <label className="col-span-2 block">
                    <span className="block text-[11px] font-medium text-mata-ink/65 mb-0.5">Número</span>
                    <input placeholder="Nº" value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 text-[13px]" />
                  </label>
                  <label className="col-span-3 block">
                    <span className="block text-[11px] font-medium text-mata-ink/65 mb-0.5">Complemento</span>
                    <input placeholder="Sala, bloco, apto..." value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-1.5 text-[13px]" />
                  </label>
                </div>
              </section>

              <section className="border-t border-[#eadfce] pt-2">
                <div className="grid grid-cols-12 gap-2 items-stretch">
                  <div className="col-span-5 rounded-xl border border-[#eadfce] bg-[#fffdfa] px-2.5 py-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-md bg-[#f3e7d7] text-mata-copper flex items-center justify-center text-[10px] font-semibold">3</span>
                      <h4 className="font-semibold text-sm text-mata-ink">Condição comercial</h4>
                      <span className="text-[10px] text-mata-ink/40">Aplicada nas vendas.</span>
                    </div>
                    <div className="grid grid-cols-7 gap-2 items-end">
                      <div className="col-span-4 rounded-lg bg-[#f8f1e7] border border-[#eadfce] px-3 py-2">
                        <p className="text-[9px] uppercase tracking-wide text-mata-ink/45">Tabela de preço</p>
                        <p className="font-semibold text-[13px] text-mata-ink">{form.tipo === 'cliente_final' ? 'Preço consumidor' : 'Preço profissional'}</p>
                      </div>
                      <label className="col-span-3 block">
                        <span className="block text-[10px] font-medium text-mata-ink/65 mb-0.5">Desconto adicional (%)</span>
                        <input type="number" min="0" max="100" step="0.01" value={form.desconto_percentual ?? 0} onChange={(e) => setForm({ ...form, desconto_percentual: e.target.value })} className="w-full border border-[#eadfce] bg-white rounded-lg px-2 py-2 text-[12px]" />
                      </label>
                    </div>
                  </div>

                  <div className="col-span-7 rounded-xl border border-[#eadfce] bg-[#fffdfa] px-2.5 py-2">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="w-5 h-5 rounded-md bg-[#f3e7d7] text-mata-copper flex items-center justify-center text-[10px] font-semibold">4</span>
                      <h4 className="font-semibold text-sm text-mata-ink">Observações</h4>
                    </div>
                    <textarea
                      placeholder="Informações adicionais sobre o cliente..."
                      value={form.observacoes}
                      onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                      className="w-full border border-[#eadfce] bg-white rounded-lg px-2.5 py-2 text-[12px] resize-none h-[58px] outline-none focus:ring-2 focus:ring-[#B8782D]/20"
                      maxLength={500}
                    />
                    <div className="text-right text-[9px] text-mata-ink/35 mt-0.5">{String(form.observacoes || '').length}/500</div>
                  </div>
                </div>
              </section>

              <div className="border-t border-[#eadfce] pt-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <label className="inline-flex items-center gap-2 text-[12px] text-mata-ink/80 cursor-pointer select-none whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={form.ativo !== false}
                      onChange={(e) => setForm({ ...form, ativo: e.target.checked, data_inativacao: e.target.checked ? null : form.data_inativacao || dataHoje() })}
                      className="w-4 h-4 accent-[#A96427]"
                    />
                    <strong>Cadastro ativo</strong>
                  </label>

                  {form.ativo === false && (
                    <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-2.5 py-1.5 text-[10px] text-red-600">
                      <span className="font-semibold">Cadastro inativo.</span>
                      <span>Data de inativação:</span>
                      <input
                        type="date"
                        value={(form.data_inativacao || dataHoje()).slice(0, 10)}
                        onChange={(e) => setForm({ ...form, data_inativacao: e.target.value })}
                        className="border border-red-200 rounded-md px-2 py-1 text-[11px] bg-white text-red-600 outline-none"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => setMostrarForm(false)} className="px-4 py-2 text-[13px] text-mata-ink/60 hover:text-mata-ink">Cancelar</button>
                  <button type="submit" className="px-5 py-2 text-[13px] bg-gradient-to-r from-[#9A5B20] to-[#B8782D] text-white rounded-lg shadow-[0_6px_16px_rgba(154,91,32,0.18)] hover:brightness-105 transition">Salvar cadastro</button>
                </div>
              </div>
            </div>

          </form>
        </div>
      )}
    </div>
  )
}
