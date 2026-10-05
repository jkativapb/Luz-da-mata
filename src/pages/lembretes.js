// src/lib/lembretes.js
// Telefone e mensagem de lembrete de reunião (WhatsApp)

const DIAS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
]

export function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '')
}

// Remove o 55 caso o número tenha sido colado com o código do país
function semPais(valor) {
  const d = somenteDigitos(valor)
  return d.startsWith('55') && d.length >= 12 ? d.slice(2) : d
}

// (46) 99999-9999 — usado nos inputs, enquanto a pessoa digita
export function formatarTelefone(valor) {
  const d = semPais(valor).slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

// DDD + número (10 ou 11 dígitos)
export function telefoneValido(valor) {
  const d = semPais(valor)
  return d.length === 10 || d.length === 11
}

// 5546999999999 — formato usado pelo wa.me e por APIs de WhatsApp
export function telefoneParaWhatsapp(valor) {
  const d = semPais(valor)
  return d ? `55${d}` : ''
}

export function montarMensagemLembrete({ nome, dataVisita, tipoContato }) {
  const data = new Date(dataVisita)
  const primeiroNome = String(nome || '').trim().split(/\s+/)[0] || ''
  const dia = `${DIAS[data.getDay()]}, ${String(data.getDate()).padStart(2, '0')}/${String(
    data.getMonth() + 1
  ).padStart(2, '0')}`
  const hora = `${String(data.getHours()).padStart(2, '0')}:${String(data.getMinutes()).padStart(2, '0')}`
  const video = tipoContato === 'videoconferencia'

  const linhas = [
    `Olá, ${primeiroNome}! Tudo bem?`,
    `Passando para lembrar da sua reunião com a LuzDaMata, no dia ${dia}, às ${hora}, ${
      video ? 'por videoconferência' : 'presencialmente'
    }.`,
  ]
  if (video) linhas.push('O link será encaminhado próximo ao horário da reunião.')
  linhas.push('Até lá!')
  return linhas.join('\n')
}

export function linkWhatsapp(telefone, mensagem) {
  return `https://wa.me/${telefoneParaWhatsapp(telefone)}?text=${encodeURIComponent(mensagem)}`
}
