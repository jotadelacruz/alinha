import { formatBR } from './dateUtils';

function onlyDigits(str) {
  return (str || '').replace(/\D/g, '');
}

export function whatsappLink(phone, message) {
  const digits = onlyDigits(phone);
  const withCountryCode = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${withCountryCode}?text=${encodeURIComponent(message)}`;
}

export function confirmationMessage(clientName, dateIso, time) {
  const firstName = (clientName || '').split(' ')[0];
  return `Olá ${firstName}! Passando para confirmar sua consulta no dia ${formatBR(dateIso)} às ${time}. Pode confirmar presença?`;
}

const MONTH_NAMES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

function fmtBRLShort(v) {
  return (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Preenche o modelo de mensagem de cobrança definido em Configurações. Se o modelo estiver
 * vazio, usa uma mensagem padrão razoável. */
export function chargeMessage(template, { clientName, amount, referenceMonthIso, pixKey }) {
  const firstName = (clientName || '').split(' ')[0];
  const monthLabel = referenceMonthIso ? MONTH_NAMES[Number(referenceMonthIso.split('-')[1]) - 1] : '';
  const base =
    template && template.trim()
      ? template
      : 'Olá {nome}! Passando para lembrar que o pagamento da sessão de {mês} ainda está em aberto ({valor}). Você pode enviar via PIX: {chave pix}. Qualquer dúvida, estou à disposição!';

  return base
    .replaceAll('{nome}', firstName)
    .replaceAll('{mês}', monthLabel)
    .replaceAll('{valor}', fmtBRLShort(amount))
    .replaceAll('{chave pix}', pixKey || '—');
}
