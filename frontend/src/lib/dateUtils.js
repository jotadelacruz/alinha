export const WEEK_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];
export const ALL_WEEK_DAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
export const TIME_SLOTS = ['08:00', '09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];

/**
 * Gera os horários (de hora em hora) entre o início e o fim do expediente configurados
 * em Configurações > Agenda. Se o fim for igual ou "menor" que o início (ex.: começar às
 * 01:00 e terminar à 00:00), trata o fim como virada de dia, cobrindo as 24h.
 */
export function buildTimeSlots(workStart, workEnd, stepMinutes = 60) {
  if (!workStart || !workEnd) return TIME_SLOTS;
  const toMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const startMin = toMinutes(workStart);
  let endMin = toMinutes(workEnd);
  if (endMin <= startMin) endMin += 24 * 60;

  const slots = [];
  for (let min = startMin; min < endMin; min += stepMinutes) {
    const wrapped = min % (24 * 60);
    const h = String(Math.floor(wrapped / 60)).padStart(2, '0');
    const m = String(wrapped % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
  }
  return slots.length > 0 ? slots : TIME_SLOTS;
}

export function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function mondayOf(d) {
  const r = new Date(d);
  const dow = r.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(r, diff);
}

/** Formata uma data ISO (YYYY-MM-DD) no padrão brasileiro DD/MM/AAAA. */
export function formatBR(isoStr) {
  if (!isoStr) return '';
  const [y, m, d] = isoStr.split('-');
  return `${d}/${m}/${y}`;
}

/** Nome do dia de semana (Segunda..Sexta) de uma data ISO, ou null pra fim de semana. */
export function weekdayNameOf(isoStr) {
  if (!isoStr) return null;
  const d = new Date(`${isoStr}T00:00:00`);
  const idx = d.getDay() - 1; // getDay(): 0=Dom..6=Sáb; WEEK_DAYS: 0=Segunda..4=Sexta
  return idx >= 0 && idx <= 4 ? WEEK_DAYS[idx] : null;
}
