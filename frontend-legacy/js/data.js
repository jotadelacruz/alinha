// ============================================================
// ALINHA — Camada de dados (Supabase)
// ============================================================
// Este módulo é a ÚNICA parte do app que conversa diretamente
// com o banco de dados. Todas as funções retornam objetos no
// mesmo formato (camelCase) que o app já usava com dados
// mockados — assim a lógica de UI não precisa mudar, só passa
// a chamar estas funções (assíncronas) em vez de mexer direto
// em arrays locais.
// ============================================================
import { supabase } from './supabase-client.js';

let currentUserId = null;

export function setCurrentUserId(id){ currentUserId = id; }
export function getCurrentUserId(){ return currentUserId; }

/* ============================================================
   PROFILE
   ============================================================ */
export async function loadProfile(){
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', currentUserId)
    .single();
  if(error) throw error;

  return {
    name: data.name,
    role: data.role,
    initials: data.initials || initialsFromName(data.name),
    photoDataUrl: data.photo_url,
    settings: {
      theme: data.theme,
      agenda: {
        workStart: data.work_start?.slice(0,5) || '08:00',
        workEnd: data.work_end?.slice(0,5) || '18:00',
        sessionDuration: data.session_duration,
        workDays: data.work_days || [],
      },
      notifications: {
        session: data.notif_session,
        payment: data.notif_payment,
        bills: data.notif_bills,
        weekly: data.notif_weekly,
      },
      office: {
        address: data.office_address || '',
        defaultValue: Number(data.default_session_value) || 210,
        pix: data.pix_key || '',
      },
      messageTemplates: {
        charge: data.message_template_charge || '',
        confirmation: data.message_template_confirmation || '',
        package: data.message_template_package || '',
      },
      hasProntuarioPassword: !!data.prontuario_password_hash,
      certificateLogoUrl: data.certificate_logo_url || null,
      packageAlertThreshold: data.package_alert_threshold != null ? data.package_alert_threshold : 2,
    },
  };
}

export async function updateProfile(fields){
  const payload = {};
  if('name' in fields) payload.name = fields.name;
  if('role' in fields) payload.role = fields.role;
  if('initials' in fields) payload.initials = fields.initials;
  if('photoDataUrl' in fields) payload.photo_url = fields.photoDataUrl;
  if('theme' in fields) payload.theme = fields.theme;
  if('workStart' in fields) payload.work_start = fields.workStart;
  if('workEnd' in fields) payload.work_end = fields.workEnd;
  if('sessionDuration' in fields) payload.session_duration = fields.sessionDuration;
  if('workDays' in fields) payload.work_days = fields.workDays;
  if('notifSession' in fields) payload.notif_session = fields.notifSession;
  if('notifPayment' in fields) payload.notif_payment = fields.notifPayment;
  if('notifBills' in fields) payload.notif_bills = fields.notifBills;
  if('notifWeekly' in fields) payload.notif_weekly = fields.notifWeekly;
  if('officeAddress' in fields) payload.office_address = fields.officeAddress;
  if('defaultSessionValue' in fields) payload.default_session_value = fields.defaultSessionValue;
  if('pixKey' in fields) payload.pix_key = fields.pixKey;
  if('messageTemplateCharge' in fields) payload.message_template_charge = fields.messageTemplateCharge;
  if('messageTemplateConfirmation' in fields) payload.message_template_confirmation = fields.messageTemplateConfirmation;
  if('messageTemplatePackage' in fields) payload.message_template_package = fields.messageTemplatePackage;
  if('certificateLogoUrl' in fields) payload.certificate_logo_url = fields.certificateLogoUrl;
  if('packageAlertThreshold' in fields) payload.package_alert_threshold = fields.packageAlertThreshold;

  const { error } = await supabase.from('profiles').update(payload).eq('id', currentUserId);
  if(error) throw error;
}

/** Define a senha de acesso aos prontuários (guardada como hash simples). */
export async function setProntuarioPassword(plainPassword){
  const hash = await sha256(plainPassword);
  const { error } = await supabase.from('profiles').update({ prontuario_password_hash: hash }).eq('id', currentUserId);
  if(error) throw error;
}

export async function verifyProntuarioPassword(plainPassword){
  const { data, error } = await supabase.from('profiles').select('prontuario_password_hash').eq('id', currentUserId).single();
  if(error) throw error;
  if(!data.prontuario_password_hash) return false;
  const hash = await sha256(plainPassword);
  return hash === data.prontuario_password_hash;
}

async function sha256(text){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

function initialsFromName(name){
  return (name || '').split(' ').filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();
}

/* ============================================================
   CLIENTS
   ============================================================ */
function mapClientFromDb(row){
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    email: row.email || '',
    since: row.since,
    frequency: row.frequency,
    day: row.fixed_day || '-',
    time: row.fixed_time?.slice(0,5) || '-',
    modality: row.modality,
    value: Number(row.session_value),
    status: row.status,
    notes: row.notes || '',
  };
}

export async function loadClients(){
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .order('created_at', { ascending: false });
  if(error) throw error;
  return data.map(mapClientFromDb);
}

export async function createClient(client){
  const { data, error } = await supabase.from('clients').insert({
    owner_id: currentUserId,
    name: client.name,
    phone: client.phone,
    email: client.email,
    frequency: client.frequency,
    fixed_day: client.day !== '-' ? client.day : null,
    fixed_time: client.time !== '-' ? client.time : null,
    modality: client.modality,
    session_value: client.value,
    status: client.status,
    notes: client.notes,
  }).select().single();
  if(error) throw error;
  return mapClientFromDb(data);
}

export async function updateClient(id, client){
  const { data, error } = await supabase.from('clients').update({
    name: client.name,
    phone: client.phone,
    email: client.email,
    frequency: client.frequency,
    fixed_day: client.day !== '-' ? client.day : null,
    fixed_time: client.time !== '-' ? client.time : null,
    modality: client.modality,
    session_value: client.value,
    status: client.status,
    notes: client.notes,
  }).eq('id', id).select().single();
  if(error) throw error;
  return mapClientFromDb(data);
}

export async function deleteClient(id){
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if(error) throw error;
}

/* ============================================================
   APPOINTMENTS
   ============================================================ */
function mapApptFromDb(row){
  return {
    id: row.id,
    clientId: row.client_id,
    dateISO: row.appointment_date,
    time: row.appointment_time?.slice(0,5),
    status: row.status,
    modality: row.modality,
    recurrenceId: row.recurrence_id,
  };
}

/** Carrega consultas dentro de um intervalo de datas (inclusive). */
export async function loadAppointments(fromISO, toISO){
  let query = supabase.from('appointments').select('*').order('appointment_date').order('appointment_time');
  if(fromISO) query = query.gte('appointment_date', fromISO);
  if(toISO) query = query.lte('appointment_date', toISO);
  const { data, error } = await query;
  if(error) throw error;
  return data.map(mapApptFromDb);
}

export async function createAppointment(appt){
  const { data, error } = await supabase.from('appointments').insert({
    owner_id: currentUserId,
    client_id: appt.clientId,
    appointment_date: appt.dateISO,
    appointment_time: appt.time,
    status: appt.status,
    modality: appt.modality,
    recurrence_id: appt.recurrenceId || null,
  }).select().single();
  if(error) throw error;
  return mapApptFromDb(data);
}

/** Insere várias consultas de uma vez (usado pela geração de recorrência). */
export async function createAppointmentsBulk(apptsArray){
  if(apptsArray.length === 0) return [];
  const rows = apptsArray.map(appt => ({
    owner_id: currentUserId,
    client_id: appt.clientId,
    appointment_date: appt.dateISO,
    appointment_time: appt.time,
    status: appt.status,
    modality: appt.modality,
    recurrence_id: appt.recurrenceId || null,
  }));
  const { data, error } = await supabase.from('appointments').insert(rows).select();
  if(error) throw error;
  return data.map(mapApptFromDb);
}

export async function updateAppointmentStatus(id, status){
  const { error } = await supabase.from('appointments').update({ status }).eq('id', id);
  if(error) throw error;
}

export async function deleteAppointment(id){
  const { error } = await supabase.from('appointments').delete().eq('id', id);
  if(error) throw error;
}

/** Cancela uma série recorrente a partir de uma data (inclusive). */
export async function deleteRecurrenceFrom(recurrenceId, fromISO){
  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('recurrence_id', recurrenceId)
    .gte('appointment_date', fromISO);
  if(error) throw error;
}

/** Verifica se já existe consulta em uma data/horário (evita conflito). */
export async function appointmentExists(dateISO, time){
  const { data, error } = await supabase
    .from('appointments')
    .select('id')
    .eq('appointment_date', dateISO)
    .eq('appointment_time', time)
    .limit(1);
  if(error) throw error;
  return data.length > 0;
}

/* ============================================================
   PAYMENTS
   ============================================================ */
function mapPaymentFromDb(row){
  let openSince = null;
  if(row.open_since_date){
    const days = Math.floor((Date.now() - new Date(row.open_since_date).getTime()) / 86400000);
    openSince = days;
  }
  return {
    id: row.id,
    clientId: row.client_id,
    sessions: row.sessions_count,
    status: row.status,
    openSince,
  };
}

export async function loadPayments(referenceMonthISO){
  let query = supabase.from('payments').select('*');
  if(referenceMonthISO) query = query.eq('reference_month', referenceMonthISO);
  const { data, error } = await query;
  if(error) throw error;
  return data.map(mapPaymentFromDb);
}

export async function upsertPayment({ clientId, referenceMonthISO, sessions, status, openSinceISO }){
  const { data: existing } = await supabase
    .from('payments')
    .select('id')
    .eq('client_id', clientId)
    .eq('reference_month', referenceMonthISO)
    .maybeSingle();

  const payload = {
    owner_id: currentUserId,
    client_id: clientId,
    reference_month: referenceMonthISO,
    sessions_count: sessions,
    status,
    open_since_date: status === 'pago' ? null : (openSinceISO || null),
    paid_at: status === 'pago' ? new Date().toISOString() : null,
  };

  if(existing){
    const { data, error } = await supabase.from('payments').update(payload).eq('id', existing.id).select().single();
    if(error) throw error;
    return mapPaymentFromDb(data);
  } else {
    const { data, error } = await supabase.from('payments').insert(payload).select().single();
    if(error) throw error;
    return mapPaymentFromDb(data);
  }
}

export async function markPaymentPaid(id){
  const { error } = await supabase.from('payments').update({ status: 'pago', open_since_date: null, paid_at: new Date().toISOString() }).eq('id', id);
  if(error) throw error;
}

/* ============================================================
   PAYMENT TRANSACTIONS (histórico real de recebimentos)
   ============================================================ */
function mapTransactionFromDb(row){
  return {
    id: row.id,
    clientId: row.client_id,
    referenceMonth: row.reference_month,
    amount: Number(row.amount),
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method,
    notes: row.notes || '',
  };
}

/** Carrega transações de um mês de referência (ou todas, se omitido). */
export async function loadPaymentTransactions(referenceMonthISO){
  let query = supabase.from('payment_transactions').select('*').order('payment_date', { ascending: false });
  if(referenceMonthISO) query = query.eq('reference_month', referenceMonthISO);
  const { data, error } = await query;
  if(error) throw error;
  return data.map(mapTransactionFromDb);
}

/** Carrega todas as transações de UM cliente (qualquer mês), para exibir o extrato completo. */
export async function loadClientPaymentTransactions(clientId){
  const { data, error } = await supabase
    .from('payment_transactions')
    .select('*')
    .eq('client_id', clientId)
    .order('payment_date', { ascending: false });
  if(error) throw error;
  return data.map(mapTransactionFromDb);
}

/** Registra um novo recebimento (nunca substitui — sempre soma ao histórico). */
export async function createPaymentTransaction({ clientId, referenceMonthISO, amount, paymentDate, paymentMethod, notes }){
  const { data, error } = await supabase.from('payment_transactions').insert({
    owner_id: currentUserId,
    client_id: clientId,
    reference_month: referenceMonthISO,
    amount,
    payment_date: paymentDate,
    payment_method: paymentMethod || 'PIX',
    notes: notes || '',
  }).select().single();
  if(error) throw error;
  return mapTransactionFromDb(data);
}

export async function deletePaymentTransaction(id){
  const { error } = await supabase.from('payment_transactions').delete().eq('id', id);
  if(error) throw error;
}

/* ============================================================
   CLIENT CREDITS (saldo a favor do cliente)
   ============================================================ */
function mapCreditFromDb(row){
  return { clientId: row.client_id, balance: Number(row.balance) };
}

export async function loadClientCredits(){
  const { data, error } = await supabase.from('client_credits').select('*');
  if(error) throw error;
  return data.map(mapCreditFromDb);
}

/** Define o saldo de crédito de um cliente (substitui o valor total, não soma). */
export async function setClientCredit(clientId, balance){
  const { data: existing } = await supabase
    .from('client_credits')
    .select('id')
    .eq('client_id', clientId)
    .maybeSingle();

  if(existing){
    const { data, error } = await supabase.from('client_credits').update({ balance }).eq('id', existing.id).select().single();
    if(error) throw error;
    return mapCreditFromDb(data);
  } else {
    const { data, error } = await supabase.from('client_credits').insert({
      owner_id: currentUserId, client_id: clientId, balance,
    }).select().single();
    if(error) throw error;
    return mapCreditFromDb(data);
  }
}

/* ============================================================
   BILLS (contas a pagar)
   ============================================================ */
function mapBillFromDb(row){
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    amount: Number(row.amount),
    dueDate: row.due_date,
    status: row.status,
    seriesId: row.series_id,
    isFixed: row.is_fixed,
  };
}

export async function loadBills(){
  const { data, error } = await supabase.from('bills').select('*').order('due_date');
  if(error) throw error;
  return data.map(mapBillFromDb);
}

export async function createBill(bill){
  const { data, error } = await supabase.from('bills').insert({
    owner_id: currentUserId,
    name: bill.name,
    category: bill.category,
    amount: bill.amount,
    due_date: bill.dueDate,
    status: bill.status,
    series_id: bill.seriesId,
    is_fixed: bill.isFixed,
  }).select().single();
  if(error) throw error;
  return mapBillFromDb(data);
}

export async function createBillsBulk(billsArray){
  if(billsArray.length === 0) return [];
  const rows = billsArray.map(b => ({
    owner_id: currentUserId, name: b.name, category: b.category, amount: b.amount,
    due_date: b.dueDate, status: b.status, series_id: b.seriesId, is_fixed: b.isFixed,
  }));
  const { data, error } = await supabase.from('bills').insert(rows).select();
  if(error) throw error;
  return data.map(mapBillFromDb);
}

export async function updateBillStatus(id, status){
  const { error } = await supabase.from('bills').update({ status }).eq('id', id);
  if(error) throw error;
}

export async function deleteBill(id){
  const { error } = await supabase.from('bills').delete().eq('id', id);
  if(error) throw error;
}

export async function deleteBillSeriesFrom(seriesId, fromDateISO){
  const { error } = await supabase.from('bills').delete().eq('series_id', seriesId).gte('due_date', fromDateISO);
  if(error) throw error;
}

/* ============================================================
   SESSION RECORDS (prontuários)
   ============================================================ */
function mapRecordFromDb(row){
  return {
    id: row.id,
    clientId: row.client_id,
    date: row.session_date,
    complaint: row.complaint || '',
    interventions: row.interventions || '',
    observations: row.observations || '',
    plan: row.plan || '',
    freeNotes: row.free_notes || '',
  };
}

export async function loadSessionRecords(clientId){
  let query = supabase.from('session_records').select('*').order('session_date', { ascending: false });
  if(clientId) query = query.eq('client_id', clientId);
  const { data, error } = await query;
  if(error) throw error;
  return data.map(mapRecordFromDb);
}

export async function createSessionRecord(record){
  const { data, error } = await supabase.from('session_records').insert({
    owner_id: currentUserId,
    client_id: record.clientId,
    session_date: record.date,
    complaint: record.complaint,
    interventions: record.interventions,
    observations: record.observations,
    plan: record.plan,
    free_notes: record.freeNotes,
  }).select().single();
  if(error) throw error;
  return mapRecordFromDb(data);
}

export async function deleteSessionRecord(id){
  const { error } = await supabase.from('session_records').delete().eq('id', id);
  if(error) throw error;
}

/* ============================================================
   PACKAGES (pacotes de sessões por cliente)
   ============================================================ */
function mapPackageFromDb(row){
  return {
    id: row.id,
    clientId: row.client_id,
    name: row.name,
    totalSessions: row.total_sessions,
    usedSessions: row.used_sessions,
    startDate: row.start_date,
    endDate: row.end_date,
    value: row.value != null ? Number(row.value) : null,
    status: row.status,
  };
}

export async function loadPackages(){
  const { data, error } = await supabase.from('packages').select('*').order('start_date', { ascending: false });
  if(error) throw error;
  return data.map(mapPackageFromDb);
}

export async function createPackage(pkg){
  const { data, error } = await supabase.from('packages').insert({
    owner_id: currentUserId,
    client_id: pkg.clientId,
    name: pkg.name,
    total_sessions: pkg.totalSessions,
    used_sessions: pkg.usedSessions || 0,
    start_date: pkg.startDate,
    end_date: pkg.endDate || null,
    value: pkg.value || null,
    status: pkg.status || 'ativo',
  }).select().single();
  if(error) throw error;
  return mapPackageFromDb(data);
}

export async function updatePackage(id, pkg){
  const { data, error } = await supabase.from('packages').update({
    name: pkg.name,
    total_sessions: pkg.totalSessions,
    used_sessions: pkg.usedSessions,
    start_date: pkg.startDate,
    end_date: pkg.endDate || null,
    value: pkg.value || null,
    status: pkg.status,
  }).eq('id', id).select().single();
  if(error) throw error;
  return mapPackageFromDb(data);
}

/** Incrementa em 1 o número de sessões usadas de um pacote (atalho usado ao marcar consulta como realizada). */
export async function incrementPackageUsedSessions(id, newUsedSessions){
  const { data, error } = await supabase.from('packages').update({ used_sessions: newUsedSessions }).eq('id', id).select().single();
  if(error) throw error;
  return mapPackageFromDb(data);
}

export async function deletePackage(id){
  const { error } = await supabase.from('packages').delete().eq('id', id);
  if(error) throw error;
}

/* ============================================================
   CERTIFICATES (atestados)
   ============================================================ */
function mapCertificateFromDb(row){
  return {
    id: row.id,
    clientId: row.client_id,
    clientNameSnapshot: row.client_name_snapshot,
    issueDate: row.issue_date,
    content: row.content,
  };
}

export async function loadCertificates(){
  const { data, error } = await supabase.from('certificates').select('*').order('issue_date', { ascending: false });
  if(error) throw error;
  return data.map(mapCertificateFromDb);
}

export async function createCertificate(cert){
  const { data, error } = await supabase.from('certificates').insert({
    owner_id: currentUserId,
    client_id: cert.clientId || null,
    client_name_snapshot: cert.clientNameSnapshot || null,
    issue_date: cert.issueDate,
    content: cert.content,
  }).select().single();
  if(error) throw error;
  return mapCertificateFromDb(data);
}

export async function updateCertificate(id, cert){
  const { data, error } = await supabase.from('certificates').update({
    client_id: cert.clientId || null,
    client_name_snapshot: cert.clientNameSnapshot || null,
    issue_date: cert.issueDate,
    content: cert.content,
  }).eq('id', id).select().single();
  if(error) throw error;
  return mapCertificateFromDb(data);
}

export async function deleteCertificate(id){
  const { error } = await supabase.from('certificates').delete().eq('id', id);
  if(error) throw error;
}

/**
 * Apaga TODOS os dados do usuário atual (clientes, consultas,
 * pagamentos, contas, prontuários, pacotes e atestados). Operação
 * irreversível — usada apenas pela "Zona de risco" em Configurações
 * > Dados. Não apaga o profile em si (preferências e login continuam).
 */
export async function deleteAllUserData(){
  const tables = ['session_records', 'certificates', 'packages', 'payment_transactions', 'client_credits', 'appointments', 'payments', 'bills', 'clients'];
  for(const table of tables){
    const { error } = await supabase.from(table).delete().eq('owner_id', currentUserId);
    if(error) throw error;
  }
}
