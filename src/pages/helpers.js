export function diasDesde(dataISO) {
  if (!dataISO) return null
  const data = new Date(dataISO)
  const hoje = new Date()
  const diffMs = hoje - data
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

export function formatarData(dataISO) {
  if (!dataISO) return '—'
  return new Date(dataISO).toLocaleDateString('pt-BR')
}

export function formatarDataHora(dataISO) {
  if (!dataISO) return '—'
  return new Date(dataISO).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export function formatarMoeda(valor) {
  return (valor ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// Retorna true se o contato está "atrasado" (30+ dias sem contato/venda)
export function estaAtrasado(ultimoContatoISO, limite = 30) {
  const dias = diasDesde(ultimoContatoISO)
  if (dias === null) return true
  return dias > limite
}

// Classifica o relacionamento com base no último contato/venda:
// 'em_dia' (até 15 dias), 'atencao' (16 a 30 dias) ou 'precisa_contato'
// (mais de 30 dias, ou nunca contatado).
export function categoriaRelacionamento(ultimoContatoISO) {
  const dias = diasDesde(ultimoContatoISO)
  if (dias === null) return 'precisa_contato'
  if (dias <= 15) return 'em_dia'
  if (dias <= 30) return 'atencao'
  return 'precisa_contato'
}

export const LABEL_CATEGORIA = {
  em_dia: 'Em dia',
  atencao: 'Atenção',
  precisa_contato: 'Precisa de contato',
}
