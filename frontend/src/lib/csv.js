import { TIME_SLOTS, WEEK_DAYS, isoDate } from './dateUtils';

/** Converte um array de objetos em texto CSV, escapando vírgulas, aspas e quebras de linha. */
export function buildCSV(headers, rows) {
  const escapeCell = (val) => {
    const s = val == null ? '' : String(val);
    if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.map(escapeCell).join(';')];
  rows.forEach((row) => lines.push(row.map(escapeCell).join(';')));
  return '﻿' + lines.join('\r\n'); // BOM no início para acentuação correta no Excel
}

export function downloadCSV(filename, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportClientsCSV(clients) {
  const headers = [
    'Nome',
    'Telefone',
    'E-mail',
    'CPF',
    'Endereço',
    'Cliente desde',
    'Frequência',
    'Dia fixo',
    'Horário fixo',
    'Modalidade',
    'Valor da sessão',
    'Duração personalizada (min)',
    'Status',
    'Observações',
  ];
  const rows = clients.map((c) => [
    c.name,
    c.phone || '',
    c.email || '',
    c.cpf || '',
    c.address || '',
    c.since,
    c.frequency,
    c.day || '',
    c.time || '',
    c.modality,
    c.value,
    c.sessionDuration || '',
    c.status === 'ativo' ? 'Ativo' : 'Em pausa',
    c.notes || '',
  ]);
  downloadCSV(`alinha-clientes-${isoDate(new Date())}.csv`, buildCSV(headers, rows));
}

const IMPORT_TEMPLATE_HEADERS = [
  'Nome',
  'Telefone',
  'E-mail',
  'CPF',
  'Endereço',
  'Frequência',
  'Dia fixo',
  'Horário fixo',
  'Modalidade',
  'Valor da sessão',
  'Duração personalizada (min)',
  'Status',
  'Observações',
];

export function downloadImportTemplate() {
  const exampleRow = [
    'Maria da Silva',
    '(51) 99999-0000',
    'maria@email.com',
    '123.456.789-00',
    'Rua das Flores, 123 - Porto Alegre/RS',
    'Semanal',
    'Segunda',
    '08:00',
    'Presencial',
    '210',
    '',
    'Ativo',
    'Cliente exemplo - pode apagar esta linha',
  ];
  downloadCSV('alinha-modelo-importacao-clientes.csv', buildCSV(IMPORT_TEMPLATE_HEADERS, [exampleRow]));
}

/** Faz o parsing de um texto CSV (separador ; ou ,) em um array de arrays, respeitando aspas. */
export function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split('\n')[0];
  const delimiter =
    text.indexOf(';') !== -1 && firstLine.split(';').length >= firstLine.split(',').length ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      // ignora, trata \n separadamente
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function normalizeHeader(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

const FREQUENCY_VALUES = ['Semanal', 'Quinzenal', 'Mensal', 'Pausada'];
const MODALITY_VALUES = ['Presencial', 'Online'];

/** Converte as linhas brutas do CSV em objetos de cliente prontos, junto com uma lista de avisos. */
export function parseClientRows(rows) {
  if (rows.length === 0) return { valid: [], skipped: [] };

  const headerRow = rows[0].map(normalizeHeader);
  const colIndex = (names) => {
    for (const name of names) {
      const idx = headerRow.indexOf(normalizeHeader(name));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idx = {
    name: colIndex(['Nome']),
    phone: colIndex(['Telefone']),
    email: colIndex(['E-mail', 'Email']),
    cpf: colIndex(['CPF']),
    address: colIndex(['Endereço', 'Endereco']),
    frequency: colIndex(['Frequência', 'Frequencia']),
    day: colIndex(['Dia fixo', 'Dia']),
    time: colIndex(['Horário fixo', 'Horario fixo', 'Horário', 'Horario']),
    modality: colIndex(['Modalidade']),
    value: colIndex(['Valor da sessão', 'Valor da sessao', 'Valor']),
    sessionDuration: colIndex(['Duração personalizada (min)', 'Duracao personalizada (min)', 'Duração personalizada', 'Duracao personalizada']),
    status: colIndex(['Status']),
    notes: colIndex(['Observações', 'Observacoes']),
  };

  if (idx.name === -1) {
    return { valid: [], skipped: [], headerError: true };
  }

  const dataRows = rows.slice(1);
  const valid = [];
  const skipped = [];

  dataRows.forEach((r, i) => {
    const lineNumber = i + 2; // +1 pelo cabeçalho, +1 porque planilhas começam contando do 1
    const name = (r[idx.name] || '').trim();
    if (!name) {
      skipped.push({ line: lineNumber, reason: 'Nome em branco' });
      return;
    }

    let frequency = (idx.frequency !== -1 ? r[idx.frequency] : '').trim();
    if (!FREQUENCY_VALUES.includes(frequency)) frequency = 'Semanal';

    let modality = (idx.modality !== -1 ? r[idx.modality] : '').trim();
    if (!MODALITY_VALUES.includes(modality)) modality = 'Presencial';

    let day = (idx.day !== -1 ? r[idx.day] : '').trim();
    if (!WEEK_DAYS.includes(day)) day = WEEK_DAYS[0];

    let time = (idx.time !== -1 ? r[idx.time] : '').trim();
    if (!TIME_SLOTS.includes(time)) time = TIME_SLOTS[0];

    const valueRaw = (idx.value !== -1 ? r[idx.value] : '').replace(',', '.').trim();
    const value = Number(valueRaw) > 0 ? Number(valueRaw) : 210;

    const statusRaw = (idx.status !== -1 ? r[idx.status] : '').trim().toLowerCase();
    const status = statusRaw === 'em pausa' || statusRaw === 'pausa' ? 'pausa' : 'ativo';

    const durationRaw = (idx.sessionDuration !== -1 ? r[idx.sessionDuration] : '').trim();
    const sessionDuration = Number(durationRaw) > 0 ? Number(durationRaw) : null;

    valid.push({
      name,
      phone: idx.phone !== -1 ? (r[idx.phone] || '').trim() : '',
      email: idx.email !== -1 ? (r[idx.email] || '').trim() : '',
      cpf: idx.cpf !== -1 ? (r[idx.cpf] || '').trim() : '',
      address: idx.address !== -1 ? (r[idx.address] || '').trim() : '',
      frequency,
      day: status === 'ativo' ? day : '-',
      time: status === 'ativo' ? time : '-',
      modality,
      value,
      sessionDuration,
      status,
      notes: idx.notes !== -1 ? (r[idx.notes] || '').trim() : '',
    });
  });

  return { valid, skipped };
}
