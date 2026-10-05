import * as XLSX from 'xlsx'
import { formatarData } from './helpers'

// Gera e baixa um .xlsx com abas de Compradores, Revendedores, Visitas,
// Vendas e Itens vendidos. Toda vez que a pessoa clicar em "Exportar",
// um novo arquivo é gerado com os dados atuais (mesmo nome de arquivo,
// o navegador substitui o download anterior na pasta de Downloads).
export function exportarParaExcel({ contatos, visitas, vendas, itensPorVenda }) {
  const wb = XLSX.utils.book_new()

  const compradores = contatos.filter((c) => c.tipo === 'comprador')
  const revendedores = contatos.filter((c) => c.tipo === 'revendedor')

  const linhaContato = (c) => ({
    Nome: c.nome,
    Telefone: c.telefone || '',
    Email: c.email || '',
    Cidade: c.cidade || '',
    Observações: c.observacoes || '',
    'Cadastrado em': formatarData(c.criado_em),
  })

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(compradores.map(linhaContato)),
    'Compradores'
  )
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(revendedores.map(linhaContato)),
    'Revendedores'
  )

  const linhasVisitas = visitas.map((v) => ({
    Data: formatarData(v.data_visita),
    Contato: v.nome_lead || v.contatos?.nome || '',
    Tipo: v.tipo_contato === 'presencial' ? 'Presencial' : 'Videoconferência',
    Convertido: v.convertido ? 'Sim' : 'Não',
    'Convertido em': v.tipo_conversao || '',
    Observações: v.observacoes || '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasVisitas), 'Visitas')

  const linhasVendas = vendas.map((v) => ({
    Data: formatarData(v.data_venda),
    Cliente: v.contatos?.nome || '',
    'Forma de pagamento': v.forma_pagamento || '',
    Total: (itensPorVenda[v.id] || []).reduce(
      (soma, i) => soma + i.quantidade * i.valor_unitario,
      0
    ),
    Observações: v.observacoes || '',
  }))
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasVendas), 'Vendas')

  const linhasItens = []
  vendas.forEach((v) => {
    ;(itensPorVenda[v.id] || []).forEach((i) => {
      linhasItens.push({
        Data: formatarData(v.data_venda),
        Cliente: v.contatos?.nome || '',
        Produto: i.produto_nome,
        Quantidade: i.quantidade,
        'Valor unitário': i.valor_unitario,
        Subtotal: i.quantidade * i.valor_unitario,
      })
    })
  })
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasItens), 'Itens vendidos')

  // Nome de arquivo fixo — ao exportar de novo, o navegador substitui
  // (ou adiciona "(1)") o arquivo anterior na pasta de downloads.
  XLSX.writeFile(wb, 'crm-luzdamata.xlsx')
}
