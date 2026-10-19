// Regras financeiras compartilhadas entre Dashboard e Vendas.
export function totalLiquidoVenda(venda, itensPorVenda) {
  const bruto = (itensPorVenda[venda.id] || []).reduce(
    (soma, item) => soma + Number(item.quantidade || 0) * Number(item.valor_unitario || 0), 0
  )
  return Math.max(0, bruto - Math.max(0, Number(venda.desconto_venda || 0)))
}

export function vendaValidaHistorico(venda, contatosPorId) {
  const contato = contatosPorId[venda.contato_id]
  if (!contato) return false
  if (contato.ativo !== false) return true
  if (!contato.data_inativacao) return false
  return String(venda.data_venda || '').slice(0, 10) <= String(contato.data_inativacao).slice(0, 10)
}

export function vendasFinanceiras(vendas, contatos) {
  const contatosPorId = Object.fromEntries(contatos.map((c) => [c.id, c]))
  return vendas.filter((v) => v.nf_cancelada !== true && vendaValidaHistorico(v, contatosPorId))
}

export function vendasEfetivadasFinanceiras(vendas, contatos) {
  return vendasFinanceiras(vendas, contatos).filter((v) => v.situacao_pagamento !== 'condicional')
}
