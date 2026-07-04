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
