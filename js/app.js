'use strict';

import { requireAuth, signOut, onAuthStateChange } from './auth.js';
import * as db from './data.js';

/* ============================================================
   DADOS
   ============================================================ */
const AVATAR_COLORS = ['#2B4C7E','#4F7A6B','#B5654A','#5B7AAE','#B8932F','#6B5B95','#8A6E5A'];
function colorFor(name){
  let sum = 0; for(const ch of name) sum += ch.charCodeAt(0);
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
}
function initials(name){
  return name.split(' ').filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();
}
function fmtBRL(n){ return 'R$ ' + Math.round(n).toLocaleString('pt-BR'); }
function fmtDate(iso){
  const d = new Date(iso+'T12:00:00');
  return d.toLocaleDateString('pt-BR', {month:'short', year:'numeric'}).replace('.','');
}
function escapeHtml(s){
  const div = document.createElement('div');
  div.textContent = s == null ? '' : String(s);
  return div.innerHTML;
}

const WEEK_DAYS = ['Segunda','Terça','Quarta','Quinta','Sexta'];
const TIME_SLOTS = ['08:00','09:00','10:00','11:00','14:00','15:00','16:00'];
const RECURRENCE_WEEKS_AHEAD = 4; // quantas semanas à frente gerar consultas recorrentes

/* ---------- utilitários de data ---------- */
// Data real do sistema (não mais fixada como no protótipo)
const TODAY = new Date();
TODAY.setHours(0,0,0,0);

function isoDate(d){
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function addDays(d, n){ const r = new Date(d); r.setDate(r.getDate()+n); return r; }
// Segunda-feira da semana que contém a data d
function mondayOf(d){
  const r = new Date(d);
  const dow = r.getDay(); // 0=domingo .. 6=sábado
  const diff = dow === 0 ? -6 : 1 - dow;
  return addDays(r, diff);
}
function nextWeekdayOnOrAfter(baseDate, dayName){
  const targetIdx = WEEK_DAYS.indexOf(dayName); // 0=Segunda..4=Sexta
  if(targetIdx === -1) return null;
  let d = new Date(baseDate);
  for(let i=0;i<14;i++){
    const idx = (d.getDay()+6)%7;
    if(idx === targetIdx) return d;
    d = addDays(d, 1);
  }
  return null;
}


// ============================================================
// ESTADO DE DADOS — agora alimentado pelo Supabase (ver data.js)
// As variáveis abaixo funcionam como um CACHE local: carregadas
// uma vez ao iniciar o app, e atualizadas a cada operação de
// criar/editar/excluir, sempre IMEDIATAMENTE após confirmar a
// alteração no banco (nunca otimisticamente antes).
// ============================================================
let clients = [];
let appointments = [];
let payments = [];
let bills = [];
let sessionRecords = [];
let packages = [];
let certificates = [];

const BILL_CATEGORIES = ['Aluguel','Água','Luz','Internet','Telefone','Material de consultório','Supervisão','Assinaturas/Software','Impostos','Outros'];

/** Mês de referência atual no formato YYYY-MM-01, usado para agrupar pagamentos. */
function currentReferenceMonthISO(){
  const d = new Date(TODAY.getFullYear(), TODAY.getMonth(), 1);
  return isoDate(d);
}

/**
 * Garante que toda conta fixa (is_fixed) tenha ocorrências geradas
 * cobrindo os próximos ~45 dias. Roda no carregamento e após criar
 * uma nova conta fixa. Equivalente à versão local do protótipo,
 * mas agora persistindo no banco via createBillsBulk.
 */
async function ensureUpcomingBillOccurrences(){
  const series = {};
  bills.forEach(b=>{
    if(!b.seriesId) return;
    if(!series[b.seriesId] || b.dueDate > series[b.seriesId].dueDate){
      series[b.seriesId] = b;
    }
  });

  const toCreate = [];
  Object.values(series).forEach(latest=>{
    if(!latest.isFixed) return;
    const latestDue = new Date(latest.dueDate+'T12:00:00');
    const horizon = addDays(TODAY, 45);
    let cursor = new Date(latestDue);
    while(cursor < horizon){
      cursor = new Date(cursor.getFullYear(), cursor.getMonth()+1, cursor.getDate());
      const dISO = isoDate(cursor);
      const exists = bills.some(b => b.seriesId === latest.seriesId && b.dueDate === dISO)
        || toCreate.some(b => b.seriesId === latest.seriesId && b.dueDate === dISO);
      if(!exists){
        toCreate.push({ name: latest.name, category: latest.category, amount: latest.amount, dueDate: dISO, status: 'a-pagar', seriesId: latest.seriesId, isFixed: true });
      }
    }
  });

  if(toCreate.length > 0){
    const created = await db.createBillsBulk(toCreate);
    bills.push(...created);
  }
}

/** Recalcula status "atrasado" no cache local (o banco mantém o status salvo, isto é só exibição). */
function refreshBillStatuses(){
  const todayISO = isoDate(TODAY);
  bills.forEach(b=>{
    if(b.status === 'pago') return;
    b.status = b.dueDate < todayISO ? 'atrasado' : 'a-pagar';
  });
}

/**
 * Garante recorrência automática de consultas para todos os
 * clientes ativos com dia/horário fixo, cobrindo as próximas
 * RECURRENCE_WEEKS_AHEAD semanas a partir de hoje.
 */
async function ensureUpcomingAppointments(){
  const monday = mondayOf(TODAY);
  const horizon = addDays(monday, RECURRENCE_WEEKS_AHEAD * 7);
  const toCreate = [];

  clients.forEach(client=>{
    if(client.status !== 'ativo') return;
    if(client.frequency !== 'Semanal' && client.frequency !== 'Quinzenal') return;
    if(!client.day || client.day === '-') return;

    const recurrenceId = 'rec-' + client.id;
    const stepDays = client.frequency === 'Quinzenal' ? 14 : 7;
    let firstOccurrence = nextWeekdayOnOrAfter(monday, client.day);
    if(!firstOccurrence) return;

    let cursor = new Date(firstOccurrence);
    while(cursor <= horizon){
      const dISO = isoDate(cursor);
      const alreadyExists = appointments.some(a => a.clientId === client.id && a.dateISO === dISO)
        || toCreate.some(a => a.clientId === client.id && a.dateISO === dISO);
      const slotTaken = appointments.some(a => a.dateISO === dISO && a.time === client.time)
        || toCreate.some(a => a.dateISO === dISO && a.time === client.time);
      if(!alreadyExists && !slotTaken){
        toCreate.push({ clientId: client.id, dateISO: dISO, time: client.time, status: 'confirmed', modality: client.modality, recurrenceId });
      }
      cursor = addDays(cursor, stepDays);
    }
  });

  if(toCreate.length > 0){
    const created = await db.createAppointmentsBulk(toCreate);
    appointments.push(...created);
  }
}

/**
 * Gera (e persiste) a recorrência de UM cliente específico a
 * partir de hoje. Usado ao criar/editar um cliente.
 */
async function generateRecurringAppointmentsForClient(client){
  const monday = mondayOf(TODAY);
  const horizon = addDays(monday, RECURRENCE_WEEKS_AHEAD * 7);
  const recurrenceId = 'rec-' + client.id;
  const stepDays = client.frequency === 'Quinzenal' ? 14 : 7;
  let firstOccurrence = nextWeekdayOnOrAfter(monday, client.day);
  if(!firstOccurrence) return 0;

  const toCreate = [];
  let cursor = new Date(firstOccurrence);
  while(cursor <= horizon){
    const dISO = isoDate(cursor);
    const alreadyExists = appointments.some(a => a.clientId === client.id && a.dateISO === dISO);
    const slotTaken = appointments.some(a => a.dateISO === dISO && a.time === client.time);
    if(!alreadyExists && !slotTaken){
      toCreate.push({ clientId: client.id, dateISO: dISO, time: client.time, status: 'confirmed', modality: client.modality, recurrenceId });
    }
    cursor = addDays(cursor, stepDays);
  }

  if(toCreate.length > 0){
    const created = await db.createAppointmentsBulk(toCreate);
    appointments.push(...created);
  }
  return toCreate.length;
}

/**
 * Carrega todos os dados do usuário logado a partir do Supabase.
 * Chamado uma vez ao iniciar o app (ver inicialização, no final
 * deste arquivo).
 */
async function loadAllData(){
  const monday = mondayOf(TODAY);
  const rangeFrom = isoDate(addDays(monday, -28)); // ~1 mês de histórico
  const rangeTo = isoDate(addDays(monday, (RECURRENCE_WEEKS_AHEAD + 2) * 7));

  const [clientsData, apptsData, paymentsData, billsData, packagesData] = await Promise.all([
    db.loadClients(),
    db.loadAppointments(rangeFrom, rangeTo),
    db.loadPayments(currentReferenceMonthISO()),
    db.loadBills(),
    db.loadPackages(),
  ]);

  clients = clientsData;
  appointments = apptsData;
  payments = paymentsData;
  bills = billsData;
  packages = packagesData;

  await ensureUpcomingAppointments();
  await ensureUpcomingBillOccurrences();
  refreshBillStatuses();
}

let state = {
  currentPage: 'agenda',
  agendaView: 'semana',
  finTab: 'por-cliente',
  clientFilter: 'todos',
  clientSearch: '',
  prontuarioSearch: '',
  prontuarioClientId: null,
  weekOffset: 0, // 0 = semana atual (a que contém TODAY), -1 = semana anterior, 1 = próxima, etc.
};

// Proteção por senha da área de Prontuários — agora validada contra
// o hash salvo em profiles.prontuario_password_hash (ver data.js).
// prontuarioPasswordIsSet indica se já existe senha definida no banco.
let prontuarioPasswordIsSet = false;
let prontuarioUnlockedFor = null; // controle local de sessão: já digitou a senha correta nesta visita

// Perfil profissional e preferências — carregados do banco em loadAllData()
let profile = {
  name: '',
  role: 'Profissional',
  initials: '',
  photoDataUrl: null,
  certificateLogoUrl: null,
};

let appSettings = {
  theme: 'light',
  agenda: { workStart:'08:00', workEnd:'18:00', sessionDuration:50, workDays:['Segunda','Terça','Quarta','Quinta','Sexta'] },
  notifications: { session:true, payment:true, bills:true, weekly:false },
  office: { address:'', defaultValue:210, pix:'' },
  packageAlertThreshold: 2,
  messageTemplates: {
    charge: `Olá, {primeiro_nome}! Tudo bem?

Passando para lembrar sobre o pagamento referente a {sessoes} {sessoes_palavra} realizadas, no valor de {valor}.

Qualquer dúvida, é só me chamar. Obrigada! 🌿

{profissional}`,
    confirmation: `Olá, {primeiro_nome}! Tudo bem?

Passando para confirmar sua sessão de {data} às {hora}{modalidade_texto}.

Caso precise remarcar, é só me avisar. Até lá! 🌿

{profissional}`,
    package: `Olá, {primeiro_nome}! Tudo bem?

Passando para avisar que seu pacote de sessões está chegando ao fim — restam {sessoes_restantes} {sessoes_restantes_palavra}.

Quando puder, me avisa se quer renovar para a gente já deixar as próximas sessões organizadas. 🌿

{profissional}`,
  },
};

const DEFAULT_MESSAGE_TEMPLATES = {
  charge: appSettings.messageTemplates.charge,
  confirmation: appSettings.messageTemplates.confirmation,
  package: appSettings.messageTemplates.package,
};

const TEMPLATE_PLACEHOLDERS_CHARGE = ['{primeiro_nome}','{nome_completo}','{sessoes}','{sessoes_palavra}','{valor}','{profissional}'];
const TEMPLATE_PLACEHOLDERS_CONFIRMATION = ['{primeiro_nome}','{nome_completo}','{data}','{hora}','{modalidade_texto}','{profissional}'];
const TEMPLATE_PLACEHOLDERS_PACKAGE = ['{primeiro_nome}','{nome_completo}','{sessoes_restantes}','{sessoes_restantes_palavra}','{profissional}'];

function profileFirstName(){
  return profile.name.split(' ')[0];
}

function applyProfileToUI(){
  document.getElementById('sidebar-name').textContent = profile.name || '...';
  document.getElementById('sidebar-role').textContent = profile.role;
  const sidebarAvatar = document.getElementById('sidebar-avatar');
  if(profile.photoDataUrl){
    sidebarAvatar.innerHTML = `<img src="${profile.photoDataUrl}" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">`;
  } else {
    sidebarAvatar.textContent = profile.initials || '··';
  }
}

/**
 * Carrega o perfil e as preferências do usuário do banco,
 * populando as variáveis locais "profile" e "appSettings".
 */
async function loadProfileAndSettings(){
  const data = await db.loadProfile();
  profile.name = data.name;
  profile.role = data.role;
  profile.initials = data.initials;
  profile.photoDataUrl = data.photoDataUrl;
  profile.certificateLogoUrl = data.settings.certificateLogoUrl;

  appSettings.theme = data.settings.theme;
  appSettings.agenda = data.settings.agenda;
  appSettings.notifications = data.settings.notifications;
  appSettings.office = data.settings.office;
  appSettings.packageAlertThreshold = data.settings.packageAlertThreshold;
  appSettings.messageTemplates.charge = data.settings.messageTemplates.charge || DEFAULT_MESSAGE_TEMPLATES.charge;
  appSettings.messageTemplates.confirmation = data.settings.messageTemplates.confirmation || DEFAULT_MESSAGE_TEMPLATES.confirmation;
  appSettings.messageTemplates.package = data.settings.messageTemplates.package || DEFAULT_MESSAGE_TEMPLATES.package;
  prontuarioPasswordIsSet = data.settings.hasProntuarioPassword;
}

/* ---------- Tema ---------- */
function applyTheme(){
  let effective = appSettings.theme;
  if(effective === 'system'){
    effective = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  if(effective === 'dark'){
    document.documentElement.setAttribute('data-theme', 'dark');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}
if(window.matchMedia){
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>{
    if(appSettings.theme === 'system') applyTheme();
  });
}

function clientById(id){ return clients.find(c => c.id === id); }

/* ============================================================
   TOAST
   ============================================================ */
let toastTimer = null;
function showToast(msg){
  const root = document.getElementById('toast-root');
  root.innerHTML = `<div class="toast">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg>
    ${escapeHtml(msg)}
  </div>`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ root.innerHTML = ''; }, 2600);
}

/* ============================================================
   NAVEGAÇÃO ENTRE PÁGINAS
   ============================================================ */
document.querySelectorAll('.nav-item[data-page]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    const page = btn.dataset.page;
    state.currentPage = page;
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.getElementById('page-'+page).classList.add('active');
    if(page === 'prontuarios'){
      state.prontuarioClientId = null;
      renderProntuarios();
    }
    if(page === 'atestados'){
      renderAtestados();
    }
    if(page === 'configuracoes'){
      renderConfiguracoes();
    }
    closeMobileMenu();
  });
});

/* ============================================================
   MENU MOBILE (drawer deslizante)
   ============================================================ */
function openMobileMenu(){
  document.querySelector('.sidebar').classList.add('open');
  document.getElementById('mobile-menu-overlay').classList.add('open');
}
function closeMobileMenu(){
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('mobile-menu-overlay').classList.remove('open');
}
function toggleMobileMenu(){
  const isOpen = document.querySelector('.sidebar').classList.contains('open');
  if(isOpen) closeMobileMenu(); else openMobileMenu();
}

document.getElementById('mobile-menu-toggle').addEventListener('click', toggleMobileMenu);
document.getElementById('mobile-menu-overlay').addEventListener('click', closeMobileMenu);
window.addEventListener('resize', ()=>{
  if(window.innerWidth > 720) closeMobileMenu();
});

/* ============================================================
   SAUDAÇÃO DINÂMICA
   ============================================================ */
(function(){
  const h = new Date().getHours();
  const el = document.getElementById('daypart-text');
  const dataFmt = new Intl.DateTimeFormat('pt-BR', {weekday:'long', day:'2-digit', month:'long'}).format(new Date());
  let saud = 'Boa tarde';
  if(h < 12) saud = 'Bom dia';
  else if(h >= 18) saud = 'Boa noite';
  el.textContent = saud + ' — ' + dataFmt;
})();

/* ============================================================
   AGENDA — RENDER
   ============================================================ */
function rowIndex(time){ return TIME_SLOTS.indexOf(time); }

// Retorna a segunda-feira da semana atualmente visível, considerando o offset de navegação
function currentVisibleMonday(){
  return addDays(mondayOf(TODAY), state.weekOffset * 7);
}

function renderWeekLabel(monday){
  const friday = addDays(monday, 4);
  const sameMonth = monday.getMonth() === friday.getMonth();
  const fmtDay = (d) => d.getDate();
  const monthName = (d) => d.toLocaleDateString('pt-BR', {month:'long'});
  const label = sameMonth
    ? `${fmtDay(monday)} – ${fmtDay(friday)} de ${monthName(friday)}`
    : `${fmtDay(monday)} de ${monthName(monday)} – ${fmtDay(friday)} de ${monthName(friday)}`;
  document.getElementById('week-label').textContent = label;
}

function renderWeekGrid(){
  const monday = currentVisibleMonday();
  renderWeekLabel(monday);

  const grid = document.getElementById('week-grid');
  const todayISO = isoDate(TODAY);

  let html = `<div class="head"></div>`;
  const weekDates = WEEK_DAYS.map((d,i)=> addDays(monday, i));
  weekDates.forEach((d,i)=>{
    const dISO = isoDate(d);
    html += `<div class="head ${dISO===todayISO ? 'today' : ''}">
      <div class="dow">${WEEK_DAYS[i].slice(0,3)}</div>
      <div class="dnum">${d.getDate()}</div>
    </div>`;
  });

  html += `<div class="time-col">`;
  TIME_SLOTS.forEach(t=>{ html += `<div class="time-cell">${t}</div>`; });
  html += `</div>`;

  weekDates.forEach((d,i)=>{
    const dISO = isoDate(d);
    html += `<div class="day-col bordered" data-date="${dISO}">`;
    TIME_SLOTS.forEach(t=>{
      html += `<div class="slot" data-date="${dISO}" data-time="${t}"></div>`;
    });
    const dayAppts = appointments.filter(a=>a.dateISO===dISO);
    dayAppts.forEach(a=>{
      const cl = clientById(a.clientId);
      if(!cl) return;
      const cls = a.modality==='Online' ? 'online' : (a.status==='pending' ? 'pending' : 'confirmed');
      const top = rowIndex(a.time)*64 + 6;
      const recIcon = a.recurrenceId ? `<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="vertical-align:-1px; opacity:.65; margin-right:3px;"><path d="M17 2.1l4 4-4 4"/><path d="M3 12.2v-2a4 4 0 014-4h14M7 21.9l-4-4 4-4"/><path d="M21 11.8v2a4 4 0 01-4 4H3"/></svg>` : '';
      html += `<div class="appt ${cls}" style="top:${top}px; height:56px;" data-appt-id="${a.id}">
        <div class="name">${recIcon}${escapeHtml(cl.name)}</div>
        <div class="time">${a.time}${a.modality==='Online' ? ' · Online' : ''}</div>
      </div>`;
    });
    html += `</div>`;
  });

  grid.innerHTML = html;

  grid.querySelectorAll('.slot').forEach(slot=>{
    slot.addEventListener('click', ()=>{
      const dISO = slot.dataset.date, time = slot.dataset.time;
      const occupied = appointments.some(a=>a.dateISO===dISO && a.time===time);
      if(!occupied) openApptModal({presetDateISO:dISO, presetTime:time});
    });
  });
  grid.querySelectorAll('.appt').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      const appt = appointments.find(a=>a.id===el.dataset.apptId);
      if(appt) openApptDetailModal(appt);
    });
  });
}

function renderAgendaList(){
  const monday = currentVisibleMonday();
  const weekDates = WEEK_DAYS.map((d,i)=> addDays(monday, i));
  const weekISOs = weekDates.map(isoDate);
  const todayISO = isoDate(TODAY);

  const container = document.getElementById('agenda-list-content');
  const weekAppts = appointments.filter(a => weekISOs.includes(a.dateISO));
  const sorted = [...weekAppts].sort((a,b)=>
    a.dateISO.localeCompare(b.dateISO) || a.time.localeCompare(b.time)
  );
  if(sorted.length===0){
    container.innerHTML = `<div class="empty-day">Nenhuma consulta agendada nesta semana.</div>`;
    return;
  }
  const grouped = {};
  sorted.forEach(a=>{ (grouped[a.dateISO] = grouped[a.dateISO] || []).push(a); });

  let html = '';
  weekDates.forEach((d, i)=>{
    const dISO = isoDate(d);
    const items = grouped[dISO];
    if(!items) return;
    const isToday = dISO === todayISO;
    html += `<div class="day-group-label">${WEEK_DAYS[i]}-feira, ${d.getDate()} de ${d.toLocaleDateString('pt-BR',{month:'long'})}${isToday ? ' — hoje' : ''}</div>`;
    items.forEach(a=>{
      const cl = clientById(a.clientId);
      if(!cl) return;
      const tagCls = a.modality==='Online' ? 'online' : (a.status==='pending' ? 'pending' : 'confirmed');
      const tagLabel = a.modality==='Online' ? 'Online' : (a.status==='pending' ? 'A confirmar' : 'Confirmada');
      const recIcon = a.recurrenceId ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="opacity:.55; flex-shrink:0;"><path d="M17 2.1l4 4-4 4"/><path d="M3 12.2v-2a4 4 0 014-4h14M7 21.9l-4-4 4-4"/><path d="M21 11.8v2a4 4 0 01-4 4H3"/></svg>` : '';
      html += `<div class="appt-row" data-appt-id="${a.id}">
        <div class="time-block">${a.time}<span class="duration">50 min</span></div>
        <span class="status-dot ${tagCls}"></span>
        <div style="flex:1; display:flex; align-items:center; gap:7px;">
          <div>
            <div class="client-name">${escapeHtml(cl.name)}</div>
            <div class="session-type">${escapeHtml(cl.frequency)} · ${a.modality}</div>
          </div>
          ${recIcon}
        </div>
        <span class="tag ${tagCls}">${tagLabel}</span>
      </div>`;
    });
  });
  container.innerHTML = html || `<div class="empty-day">Nenhuma consulta agendada nesta semana.</div>`;
  container.querySelectorAll('.appt-row').forEach(el=>{
    el.addEventListener('click', ()=>{
      const appt = appointments.find(a=>a.id===el.dataset.apptId);
      if(appt) openApptDetailModal(appt);
    });
  });
}

function renderAgenda(){
  renderWeekGrid();
  renderAgendaList();
}

document.getElementById('week-prev').addEventListener('click', ()=>{ state.weekOffset--; renderAgenda(); });
document.getElementById('week-next').addEventListener('click', ()=>{ state.weekOffset++; renderAgenda(); });
document.getElementById('week-today').addEventListener('click', ()=>{ state.weekOffset = 0; renderAgenda(); });

document.querySelectorAll('.view-toggle button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.view-toggle button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const isSemana = btn.dataset.view === 'semana';
    state.agendaView = btn.dataset.view;
    document.getElementById('view-semana').style.display = isSemana ? 'block' : 'none';
    document.getElementById('view-lista').style.display = isSemana ? 'none' : 'block';
  });
});

document.getElementById('btn-nova-consulta').addEventListener('click', ()=> openApptModal({}));

/* ============================================================
   CLIENTES — RENDER
   ============================================================ */
function renderClients(){
  const grid = document.getElementById('clients-grid');
  const search = state.clientSearch.toLowerCase();
  const filtered = clients.filter(c=>{
    const matchSearch = c.name.toLowerCase().includes(search);
    const matchFilter = state.clientFilter==='todos' || c.status===state.clientFilter;
    return matchSearch && matchFilter;
  });

  const activeCount = clients.filter(c=>c.status==='ativo').length;
  const pauseCount = clients.filter(c=>c.status==='pausa').length;
  document.getElementById('clients-count').textContent = `${activeCount} clientes ativos · ${pauseCount} em pausa`;

  if(filtered.length===0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <h3>Nenhum cliente encontrado</h3>
      <p>Tente ajustar a busca ou o filtro selecionado.</p>
    </div>`;
    return;
  }

  let html = '';
  filtered.forEach(c=>{
    const sinceFmt = fmtDate(c.since);
    const metaLine2 = c.status==='pausa'
      ? (c.notes || 'Em pausa')
      : `${c.frequency} · ${c.day.slice(0,3)} ${c.time}${c.modality==='Online' ? ' · Online' : ''}`;
    html += `<div class="client-card" data-client-id="${c.id}">
      <div class="client-top">
        <div class="client-avatar" style="background:${colorFor(c.name)};">${initials(c.name)}</div>
        <div>
          <div class="client-name">${escapeHtml(c.name)}</div>
          <div class="client-since">Cliente desde ${sinceFmt}</div>
        </div>
      </div>
      <div class="client-meta">
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.7a2 2 0 01-.4 2.1L8 9.9a16 16 0 006 6l1.4-1.4a2 2 0 012.1-.4c.9.3 1.8.5 2.7.6a2 2 0 011.8 2.1z"/></svg> ${escapeHtml(c.phone || 'Sem telefone')}</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg> ${escapeHtml(metaLine2)}</span>
      </div>
      <div class="client-footer">
        <span class="client-status ${c.status}">${c.status==='ativo' ? 'Ativo' : 'Em pausa'}</span>
        <div style="display:flex; align-items:center; gap:10px;">
          <button class="print-icon-btn" data-print-client="${c.id}" title="Imprimir ficha">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
          </button>
          <span class="next-session">${c.status==='ativo' ? `Sessão: ${c.day.slice(0,3)}` : 'Pausado'}</span>
        </div>
      </div>
    </div>`;
  });
  grid.innerHTML = html;
  grid.querySelectorAll('.client-card').forEach(el=>{
    el.addEventListener('click', (e)=>{
      if(e.target.closest('[data-print-client]')) return; // não abre o modal de edição ao clicar no ícone de imprimir
      const c = clientById(el.dataset.clientId);
      if(c) openClientModal(c);
    });
  });
  grid.querySelectorAll('[data-print-client]').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      printClientFicha(btn.dataset.printClient);
    });
  });
}

function printClientFicha(clientId){
  const c = clientById(clientId);
  if(!c) return;

  const upcomingAppts = appointments
    .filter(a => a.clientId === clientId && a.dateISO >= isoDate(TODAY))
    .sort((a,b)=> a.dateISO.localeCompare(b.dateISO))
    .slice(0,5);

  const apptsHtml = upcomingAppts.length
    ? `<div style="display:flex; flex-direction:column; gap:8px;">` + upcomingAppts.map(a=>{
        const d = new Date(a.dateISO+'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric'});
        return `<div style="display:flex; justify-content:space-between; font-size:13.5px; padding:8px 0; border-bottom:1px solid var(--paper-soft);">
          <span class="mono">${d}</span><span>${a.time} · ${a.modality}</span>
        </div>`;
      }).join('') + `</div>`
    : `<div class="records-empty">Nenhuma consulta futura agendada.</div>`;

  const area = document.getElementById('print-area');
  area.innerHTML = `
    <div class="print-header">
      <h1>Ficha de cliente</h1>
      <p>Gerado em ${TODAY.toLocaleDateString('pt-BR')} · ${escapeHtml(profile.name)}</p>
    </div>
    <div class="card info-list" style="flex-direction:row; flex-wrap:wrap; gap:28px; margin-bottom:18px;">
      <div class="info-row"><span class="label">Nome</span><span class="val">${escapeHtml(c.name)}</span></div>
      <div class="info-row"><span class="label">Telefone</span><span class="val">${escapeHtml(c.phone || '—')}</span></div>
      <div class="info-row"><span class="label">E-mail</span><span class="val">${escapeHtml(c.email || '—')}</span></div>
      <div class="info-row"><span class="label">Cliente desde</span><span class="val">${fmtDate(c.since)}</span></div>
      <div class="info-row"><span class="label">Frequência</span><span class="val">${escapeHtml(c.frequency)}</span></div>
      <div class="info-row"><span class="label">Dia / horário fixo</span><span class="val">${escapeHtml(c.day)}${c.day!=='-' ? ' · '+escapeHtml(c.time) : ''}</span></div>
      <div class="info-row"><span class="label">Modalidade</span><span class="val">${escapeHtml(c.modality)}</span></div>
      <div class="info-row"><span class="label">Valor da sessão</span><span class="val">${fmtBRL(c.value)}</span></div>
      <div class="info-row"><span class="label">Status</span><span class="val">${c.status==='ativo' ? 'Ativo' : 'Em pausa'}</span></div>
    </div>
    ${c.notes ? `<div class="card" style="padding:18px; margin-bottom:18px;"><h3 style="font-size:15px; margin-bottom:8px;">Observações</h3><p style="font-size:13.5px; line-height:1.5;">${escapeHtml(c.notes)}</p></div>` : ''}
    <div class="card" style="padding:18px;">
      <h3 style="font-size:15px; margin-bottom:8px;">Próximas consultas agendadas</h3>
      ${apptsHtml}
    </div>
  `;

  window.print();
}

/** Imprime apenas uma sessão específica do prontuário de um cliente. */
function printSingleRecord(client, record){
  if(!client || !record) return;
  const dateLabel = new Date(record.date+'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'long', year:'numeric'});

  const area = document.getElementById('print-area');
  area.innerHTML = `
    <div class="print-header">
      <h1>${escapeHtml(client.name)}</h1>
      <p>Registro de sessão · ${dateLabel} · Gerado em ${TODAY.toLocaleDateString('pt-BR')} · ${escapeHtml(profile.name)}</p>
    </div>
    <div class="card" style="padding:18px;">
      ${record.complaint ? `<div class="record-field"><div class="rf-label">Queixa principal</div><div class="rf-val">${escapeHtml(record.complaint)}</div></div>` : ''}
      ${record.interventions ? `<div class="record-field"><div class="rf-label">Intervenções</div><div class="rf-val">${escapeHtml(record.interventions)}</div></div>` : ''}
      ${record.observations ? `<div class="record-field"><div class="rf-label">Observações</div><div class="rf-val">${escapeHtml(record.observations)}</div></div>` : ''}
      ${record.plan ? `<div class="record-field"><div class="rf-label">Plano</div><div class="rf-val">${escapeHtml(record.plan)}</div></div>` : ''}
      ${record.freeNotes ? `<div class="record-field"><div class="rf-label">Notas adicionais</div><div class="rf-val">${escapeHtml(record.freeNotes)}</div></div>` : ''}
      ${(!record.complaint && !record.interventions && !record.observations && !record.plan && !record.freeNotes) ? `<div class="records-empty">Esta sessão não possui anotações registradas.</div>` : ''}
    </div>
  `;

  window.print();
}

/* ============================================================
   EXPORTAÇÃO EM PLANILHA (CSV)
   ============================================================ */

/** Converte um array de objetos em texto CSV, escapando vírgulas, aspas e quebras de linha. */
function buildCSV(headers, rows){
  const escapeCell = (val) => {
    const s = val == null ? '' : String(val);
    if(/[",\n;]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  };
  const lines = [headers.map(escapeCell).join(';')];
  rows.forEach(row => lines.push(row.map(escapeCell).join(';')));
  return '\uFEFF' + lines.join('\r\n'); // BOM no início para acentuação correta no Excel
}

function downloadCSV(filename, csvContent){
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

/** Exporta a lista completa de clientes como planilha CSV. */
function exportClientsCSV(){
  if(clients.length === 0){ showToast('Nenhum cliente para exportar'); return; }

  const headers = ['Nome','Telefone','E-mail','Cliente desde','Frequência','Dia fixo','Horário fixo','Modalidade','Valor da sessão','Status','Observações'];
  const rows = clients.map(c => [
    c.name, c.phone || '', c.email || '', fmtDate(c.since), c.frequency,
    c.day || '', c.time || '', c.modality, c.value, c.status==='ativo' ? 'Ativo' : 'Em pausa', c.notes || ''
  ]);

  const csv = buildCSV(headers, rows);
  downloadCSV(`alinha-clientes-${isoDate(TODAY)}.csv`, csv);
  showToast('Planilha de clientes exportada');
}

/** Exporta todas as sessões de prontuário de UM cliente como planilha CSV. */
function exportProntuarioCSV(client, records){
  if(!records || records.length === 0){ showToast('Este cliente ainda não tem sessões registradas'); return; }

  const headers = ['Data','Queixa principal','Intervenções','Observações','Plano','Notas adicionais'];
  const sorted = [...records].sort((a,b)=> a.date.localeCompare(b.date));
  const rows = sorted.map(r => [
    new Date(r.date+'T12:00:00').toLocaleDateString('pt-BR'),
    r.complaint || '', r.interventions || '', r.observations || '', r.plan || '', r.freeNotes || ''
  ]);

  const csv = buildCSV(headers, rows);
  const safeName = client.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'');
  downloadCSV(`alinha-prontuario-${safeName}-${isoDate(TODAY)}.csv`, csv);
  showToast('Planilha do prontuário exportada');
}

document.getElementById('client-search').addEventListener('input', (e)=>{
  state.clientSearch = e.target.value;
  renderClients();
});
document.querySelectorAll('[data-filter]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('[data-filter]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.clientFilter = btn.dataset.filter;
    renderClients();
  });
});
document.getElementById('btn-novo-cliente').addEventListener('click', ()=> openClientModal(null));
document.getElementById('btn-export-clients').addEventListener('click', exportClientsCSV);

/* ============================================================
   FINANCEIRO — RENDER
   ============================================================ */
function computeFinance(){
  let totalRecebido = 0, totalAberto = 0, totalSessoes = 0;
  payments.forEach(p=>{
    const cl = clientById(p.clientId);
    if(!cl) return;
    const total = p.sessions * cl.value;
    totalSessoes += p.sessions;
    if(p.status==='pago') totalRecebido += total;
    else if(p.status==='parcial'){ totalRecebido += Math.round(total*0.5); totalAberto += Math.round(total*0.5); }
    else if(p.status==='aberto') totalAberto += total;
  });
  const ticketMedio = totalSessoes>0 ? Math.round((totalRecebido+totalAberto)/totalSessoes) : 0;
  return {totalRecebido, totalAberto, totalSessoes, ticketMedio};
}

function renderKPIs(){
  const {totalRecebido, totalAberto, totalSessoes, ticketMedio} = computeFinance();
  const openCount = payments.filter(p=>p.status==='aberto'||p.status==='parcial').length;
  document.getElementById('kpi-row').innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">Recebido em junho</div>
      <div class="kpi-value mono">${fmtBRL(totalRecebido)}</div>
      <div class="kpi-trend">↑ 12% vs. maio</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Em aberto</div>
      <div class="kpi-value mono" style="color:var(--alert);">${fmtBRL(totalAberto)}</div>
      <div class="kpi-trend down">${openCount} clientes pendentes</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Sessões realizadas</div>
      <div class="kpi-value">${totalSessoes}</div>
      <div class="kpi-trend">neste mês</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Ticket médio</div>
      <div class="kpi-value mono">${fmtBRL(ticketMedio)}</div>
      <div class="kpi-trend">por sessão</div>
    </div>
  `;
}

function renderOpenList(){
  const {totalAberto} = computeFinance();
  document.getElementById('open-total').textContent = fmtBRL(totalAberto);
  const list = document.getElementById('open-list');
  const openPayments = payments.filter(p=>p.status==='aberto'||p.status==='parcial');
  if(openPayments.length===0){
    list.innerHTML = `<div style="font-size:13px; color:var(--ink-soft); text-align:center; padding:20px 0;">Nenhuma pendência no momento 🎉</div>`;
    return;
  }
  let html = '';
  openPayments.forEach(p=>{
    const cl = clientById(p.clientId);
    if(!cl) return;
    const amt = p.status==='parcial' ? Math.round(p.sessions*cl.value*0.5) : p.sessions*cl.value;
    html += `<div class="open-item">
      <div>
        <div class="name">${escapeHtml(cl.name)}</div>
        <div class="since">Em aberto há ${p.openSince} dias</div>
      </div>
      <div style="display:flex; align-items:center; gap:10px;">
        <div class="amt">${fmtBRL(amt)}</div>
        <button class="btn btn-ghost btn-sm" data-mark-paid="${p.id}">Marcar pago</button>
      </div>
    </div>`;
  });
  list.innerHTML = html;
  list.querySelectorAll('[data-mark-paid]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      markPaid(btn.dataset.markPaid);
    });
  });
}

function renderFinTabContent(){
  const container = document.getElementById('fin-tab-content');
  if(state.finTab === 'por-cliente'){
    let rows = '';
    payments.forEach(p=>{
      const cl = clientById(p.clientId);
      if(!cl) return;
      const total = p.sessions*cl.value;
      const label = p.status==='pago' ? 'Pago' : p.status==='parcial' ? 'Parcial' : 'Em aberto';
      const actionBtn = p.status!=='pago'
        ? `<button class="btn btn-ghost btn-sm" data-charge="${p.id}">Cobrar</button>`
        : `<button class="btn btn-ghost btn-sm">Ver detalhes</button>`;
      rows += `<tr>
        <td><div class="row-client"><div class="mini-avatar" style="background:${colorFor(cl.name)};">${initials(cl.name)}</div>${escapeHtml(cl.name)}</div></td>
        <td>${p.sessions} sessões</td>
        <td class="value-mono">${fmtBRL(cl.value)}</td>
        <td class="value-mono">${fmtBRL(total)}</td>
        <td><span class="pay-status ${p.status}">● ${label}</span></td>
        <td>${actionBtn}</td>
      </tr>`;
    });
    container.innerHTML = `<div class="card" style="overflow:hidden;">
      <table>
        <thead><tr><th>Cliente</th><th>Sessões no mês</th><th>Valor da sessão</th><th>Total do mês</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
    container.querySelectorAll('[data-charge]').forEach(btn=>{
      btn.addEventListener('click', ()=> openChargeModal(btn.dataset.charge));
    });
  } else if(state.finTab === 'contas-pagar'){
    renderContasPagar(container);
  } else if(state.finTab === 'historico'){
    container.innerHTML = `<div class="card" style="padding:40px 20px; text-align:center; color:var(--ink-soft); font-size:13.5px;">
      O histórico completo de pagamentos por sessão aparecerá aqui conforme os recebimentos forem registrados.
    </div>`;
  } else {
    container.innerHTML = `<div class="card" style="padding:40px 20px; text-align:center; color:var(--ink-soft); font-size:13.5px;">
      Emissão e controle de notas fiscais — em breve.
    </div>`;
  }
}

function computeBillsTotals(){
  const now = TODAY;
  const monthPrefix = isoDate(now).slice(0,7); // YYYY-MM
  const monthBills = bills.filter(b => b.dueDate.slice(0,7) === monthPrefix);
  const totalPago = monthBills.filter(b=>b.status==='pago').reduce((s,b)=>s+b.amount,0);
  const totalAPagar = monthBills.filter(b=>b.status==='a-pagar').reduce((s,b)=>s+b.amount,0);
  const totalAtrasado = monthBills.filter(b=>b.status==='atrasado').reduce((s,b)=>s+b.amount,0);
  const countAtrasado = bills.filter(b=>b.status==='atrasado').length;
  return { totalPago, totalAPagar, totalAtrasado, countAtrasado };
}

const BILL_ICONS = {
  'Aluguel': '<path d="M3 10l9-7 9 7v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M9 22V12h6v10"/>',
  'Água': '<path d="M12 2.7s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z"/>',
  'Luz': '<path d="M13 2L4 14h6l-1 8 9-12h-6z"/>',
  'Internet': '<path d="M5 13a10 10 0 0114 0M8.5 16.5a5 5 0 017 0M12 20h.01"/>',
  'Telefone': '<path d="M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3 19.5 19.5 0 01-6-6 19.8 19.8 0 01-3-8.7A2 2 0 014.1 2h3a2 2 0 012 1.7c.1.9.3 1.8.6 2.7a2 2 0 01-.4 2.1L8 9.9a16 16 0 006 6l1.4-1.4a2 2 0 012.1-.4c.9.3 1.8.5 2.7.6a2 2 0 011.8 2.1z"/>',
};
const BILL_ICON_DEFAULT = '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18"/>';

function renderContasPagar(container){
  const { totalPago, totalAPagar, totalAtrasado, countAtrasado } = computeBillsTotals();
  const monthLabel = TODAY.toLocaleDateString('pt-BR', {month:'long'});

  const sorted = [...bills].sort((a,b)=> a.dueDate.localeCompare(b.dueDate));

  let rows = '';
  sorted.forEach(b=>{
    const dateLabel = new Date(b.dueDate+'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'short'});
    const label = b.status==='pago' ? 'Pago' : b.status==='atrasado' ? 'Atrasada' : 'A pagar';
    const icon = BILL_ICONS[b.category] || BILL_ICON_DEFAULT;
    const actionBtn = b.status!=='pago'
      ? `<button class="btn btn-ghost btn-sm" data-pay-bill="${b.id}">Marcar paga</button>`
      : `<button class="btn-danger-text" data-undo-bill="${b.id}">Desfazer</button>`;
    rows += `<tr>
      <td><div class="row-client"><div class="bill-row-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">${icon}</svg></div>
        <div>
          <div>${escapeHtml(b.name)}</div>
          ${b.isFixed ? `<div class="bill-fixed-tag"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 2.1l4 4-4 4"/><path d="M3 12.2v-2a4 4 0 014-4h14M7 21.9l-4-4 4-4"/><path d="M21 11.8v2a4 4 0 01-4 4H3"/></svg> Fixa mensal</div>` : ''}
        </div>
      </div></td>
      <td>${escapeHtml(b.category)}</td>
      <td>${dateLabel}</td>
      <td class="value-mono">${fmtBRL(b.amount)}</td>
      <td><span class="pay-status ${b.status}">● ${label}</span></td>
      <td style="display:flex; gap:8px;">${actionBtn} <button class="btn-danger-text" data-delete-bill="${b.id}">Excluir</button></td>
    </tr>`;
  });

  container.innerHTML = `
    <div class="bills-kpi-row">
      <div class="kpi-card">
        <div class="kpi-label">Pago em ${monthLabel}</div>
        <div class="kpi-value mono">${fmtBRL(totalPago)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">A pagar em ${monthLabel}</div>
        <div class="kpi-value mono">${fmtBRL(totalAPagar)}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Atrasadas</div>
        <div class="kpi-value mono" style="color:var(--alert);">${fmtBRL(totalAtrasado)}</div>
        <div class="kpi-trend down">${countAtrasado} ${countAtrasado===1 ? 'conta' : 'contas'}</div>
      </div>
    </div>

    <div style="display:flex; justify-content:flex-end; margin-bottom:14px;">
      <button class="btn btn-primary btn-sm" id="btn-nova-conta">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
        Nova conta
      </button>
    </div>

    <div class="card" style="overflow:hidden;">
      <table>
        <thead><tr><th>Conta</th><th>Categoria</th><th>Vencimento</th><th>Valor</th><th>Status</th><th></th></tr></thead>
        <tbody>${rows || `<tr><td colspan="6" style="text-align:center; color:var(--ink-soft); padding:30px;">Nenhuma conta cadastrada ainda.</td></tr>`}</tbody>
      </table>
    </div>
  `;

  document.getElementById('btn-nova-conta').addEventListener('click', openBillModal);
  container.querySelectorAll('[data-pay-bill]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.payBill;
      const b = bills.find(x=>x.id===id);
      if(!b) return;
      const previousStatus = b.status;
      b.status = 'pago';
      renderFinTabContent();
      try{
        await db.updateBillStatus(id, 'pago');
        showToast('Conta marcada como paga');
      } catch(err){
        console.error(err);
        b.status = previousStatus;
        renderFinTabContent();
        showToast('Erro ao atualizar conta. Tente novamente.');
      }
    });
  });
  container.querySelectorAll('[data-undo-bill]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.undoBill;
      const b = bills.find(x=>x.id===id);
      if(!b) return;
      const previousStatus = b.status;
      const newStatus = b.dueDate < isoDate(TODAY) ? 'atrasado' : 'a-pagar';
      b.status = newStatus;
      renderFinTabContent();
      try{
        await db.updateBillStatus(id, newStatus);
        showToast('Pagamento desfeito');
      } catch(err){
        console.error(err);
        b.status = previousStatus;
        renderFinTabContent();
        showToast('Erro ao desfazer pagamento. Tente novamente.');
      }
    });
  });
  container.querySelectorAll('[data-delete-bill]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.deleteBill;
      const bill = bills.find(b=>b.id===id);
      if(!bill) return;
      try{
        if(bill.isFixed && bill.seriesId){
          await db.deleteBillSeriesFrom(bill.seriesId, bill.dueDate);
          bills = bills.filter(b => !(b.seriesId === bill.seriesId && b.dueDate >= bill.dueDate));
          showToast('Conta excluída — futuras ocorrências da série também removidas');
        } else {
          await db.deleteBill(id);
          bills = bills.filter(b=>b.id!==id);
          showToast('Conta excluída');
        }
        renderFinTabContent();
      } catch(err){
        console.error(err);
        showToast('Erro ao excluir conta. Tente novamente.');
      }
    });
  });
}

function openBillModal(){
  const todayISO = isoDate(TODAY);
  const categoryOptions = BILL_CATEGORIES.map(c=>`<option>${c}</option>`).join('');

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-overlay" id="overlay-bill">
      <div class="modal">
        <div class="modal-header">
          <h2>Nova conta a pagar</h2>
          <button class="modal-close" id="close-bill-modal">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form id="form-bill">
          <div class="modal-body">
            <div class="field">
              <label>Nome da conta</label>
              <input required id="b-name" placeholder="Ex: Aluguel da sala">
            </div>
            <div class="field-row">
              <div class="field"><label>Categoria</label><select id="b-category">${categoryOptions}</select></div>
              <div class="field"><label>Valor (R$)</label><input type="number" min="0" id="b-amount" placeholder="200"></div>
            </div>
            <div class="field">
              <label>Data de vencimento</label>
              <input type="date" id="b-date" value="${todayISO}">
            </div>
            <div class="field">
              <label>Recorrência</label>
              <div class="radio-group" id="b-fixed-group">
                <div class="radio-pill selected" data-value="true">Fixa todo mês</div>
                <div class="radio-pill" data-value="false">Avulsa (só este mês)</div>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" id="cancel-bill">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar conta</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;

  let isFixed = true;
  document.querySelectorAll('#b-fixed-group .radio-pill').forEach(p=>{
    p.addEventListener('click', ()=>{
      document.querySelectorAll('#b-fixed-group .radio-pill').forEach(x=>x.classList.remove('selected'));
      p.classList.add('selected');
      isFixed = p.dataset.value === 'true';
    });
  });

  document.getElementById('close-bill-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-bill').addEventListener('click', closeModal);
  document.getElementById('overlay-bill').addEventListener('click', (e)=>{
    if(e.target.id==='overlay-bill') closeModal();
  });

  document.getElementById('form-bill').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = document.getElementById('b-name').value.trim();
    const amount = Number(document.getElementById('b-amount').value) || 0;
    const dueDate = document.getElementById('b-date').value || todayISO;
    if(!name || amount <= 0) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try{
      const seriesId = isFixed ? crypto.randomUUID() : null;
      const created = await db.createBill({
        name, category: document.getElementById('b-category').value,
        amount, dueDate, status: dueDate < todayISO ? 'atrasado' : 'a-pagar',
        seriesId, isFixed
      });
      bills.push(created);

      if(isFixed) await ensureUpcomingBillOccurrences();

      closeModal();
      renderFinTabContent();
      showToast('Conta cadastrada' + (isFixed ? ' — vai se repetir todo mês' : ''));
    } catch(err){
      console.error(err);
      submitBtn.disabled = false;
      showToast('Erro ao cadastrar conta. Tente novamente.');
    }
  });
}

function renderFinanceiro(){
  renderKPIs();
  renderOpenList();
  renderFinTabContent();
}

async function markPaid(paymentId){
  const p = payments.find(p=>p.id===paymentId);
  if(!p) return;
  const previousStatus = p.status, previousOpenSince = p.openSince;
  p.status='pago'; p.openSince=null;
  renderFinanceiro();
  try{
    await db.markPaymentPaid(paymentId);
    showToast('Recebimento marcado como pago');
  } catch(err){
    console.error(err);
    p.status = previousStatus; p.openSince = previousOpenSince;
    renderFinanceiro();
    showToast('Erro ao marcar pagamento. Tente novamente.');
  }
}

document.querySelectorAll('.fin-tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.fin-tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.finTab = btn.dataset.tab;
    renderFinTabContent();
  });
});

document.getElementById('btn-novo-recebimento').addEventListener('click', ()=> openPaymentModal());

/* ============================================================
   MODAIS
   ============================================================ */
function closeModal(){
  document.getElementById('modal-root').innerHTML = '';
  document.getElementById('modal-root-2').innerHTML = ''; // garante que nenhum modal secundário fique "fantasma"
}

function closeModal2(){
  document.getElementById('modal-root-2').innerHTML = '';
}

function openClientModal(client){
  const isEdit = !!client;
  const c = client || {
    id:null, name:'', phone:'', email:'', frequency:'Semanal', day:'Segunda', time:'08:00',
    modality:'Presencial', value:210, status:'ativo', notes:'', since:null
  };

  const dayOptions = WEEK_DAYS.map(d=>`<option ${d===c.day?'selected':''}>${d}</option>`).join('');
  const timeOptions = TIME_SLOTS.map(t=>`<option ${t===c.time?'selected':''}>${t}</option>`).join('');

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-overlay" id="overlay-client">
      <div class="modal">
        <div class="modal-header">
          <h2>${isEdit ? 'Editar cliente' : 'Novo cliente'}</h2>
          <button class="modal-close" id="close-client-modal">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form id="form-client">
          <div class="modal-body">
            <div class="field">
              <label>Nome completo</label>
              <input required id="f-name" value="${escapeHtml(c.name)}" placeholder="Ex: Maria da Silva">
            </div>
            <div class="field-row">
              <div class="field"><label>Telefone</label><input id="f-phone" value="${escapeHtml(c.phone)}" placeholder="(51) 99999-0000"></div>
              <div class="field"><label>E-mail</label><input type="email" id="f-email" value="${escapeHtml(c.email)}" placeholder="email@exemplo.com"></div>
            </div>
            <div class="field-row">
              <div class="field">
                <label>Frequência</label>
                <select id="f-frequency">
                  ${['Semanal','Quinzenal','Mensal','Pausada'].map(f=>`<option ${f===c.frequency?'selected':''}>${f}</option>`).join('')}
                </select>
              </div>
              <div class="field"><label>Valor da sessão (R$)</label><input type="number" min="0" id="f-value" value="${c.value}"></div>
            </div>
            <div class="field-row">
              <div class="field"><label>Dia da semana</label><select id="f-day">${dayOptions}</select></div>
              <div class="field"><label>Horário</label><select id="f-time">${timeOptions}</select></div>
            </div>
            <div class="field">
              <label>Modalidade</label>
              <div class="radio-group" id="f-modality-group">
                <div class="radio-pill ${c.modality==='Presencial'?'selected':''}" data-value="Presencial">Presencial</div>
                <div class="radio-pill ${c.modality==='Online'?'selected':''}" data-value="Online">Online</div>
              </div>
            </div>
            <div class="field">
              <label>Status</label>
              <div class="radio-group" id="f-status-group">
                <div class="radio-pill ${c.status==='ativo'?'selected':''}" data-value="ativo">Ativo</div>
                <div class="radio-pill ${c.status==='pausa'?'selected':''}" data-value="pausa">Em pausa</div>
              </div>
            </div>
            <div class="field">
              <label>Observações (opcional)</label>
              <textarea rows="2" id="f-notes" placeholder="Anotações gerais sobre o cliente...">${escapeHtml(c.notes)}</textarea>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" id="cancel-client">Cancelar</button>
              <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar alterações' : 'Cadastrar cliente'}</button>
            </div>
          </div>
        </form>
        ${isEdit ? `<div class="modal-body" style="padding-top:0;"><div id="client-packages-slot" class="packages-section"></div></div>` : ''}
      </div>
    </div>
  `;

  if(isEdit){
    renderPackagesSection(c.id, 'client-packages-slot');
  }

  let selectedModality = c.modality;
  let selectedStatus = c.status;
  document.querySelectorAll('#f-modality-group .radio-pill').forEach(p=>{
    p.addEventListener('click', ()=>{
      document.querySelectorAll('#f-modality-group .radio-pill').forEach(x=>x.classList.remove('selected'));
      p.classList.add('selected');
      selectedModality = p.dataset.value;
    });
  });
  document.querySelectorAll('#f-status-group .radio-pill').forEach(p=>{
    p.addEventListener('click', ()=>{
      document.querySelectorAll('#f-status-group .radio-pill').forEach(x=>x.classList.remove('selected'));
      p.classList.add('selected');
      selectedStatus = p.dataset.value;
    });
  });

  document.getElementById('close-client-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-client').addEventListener('click', closeModal);
  document.getElementById('overlay-client').addEventListener('click', (e)=>{
    if(e.target.id==='overlay-client') closeModal();
  });

  document.getElementById('form-client').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const name = document.getElementById('f-name').value.trim();
    if(!name) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const formData = {
      name,
      phone: document.getElementById('f-phone').value.trim(),
      email: document.getElementById('f-email').value.trim(),
      frequency: document.getElementById('f-frequency').value,
      day: document.getElementById('f-day').value,
      time: document.getElementById('f-time').value,
      modality: selectedModality,
      value: Number(document.getElementById('f-value').value) || 0,
      status: selectedStatus,
      notes: document.getElementById('f-notes').value.trim(),
    };

    const recurrenceRelevantChanged = !isEdit || (
      c.day !== formData.day || c.time !== formData.time || c.frequency !== formData.frequency ||
      c.modality !== formData.modality || c.status !== formData.status
    );

    try{
      let savedClient;
      if(isEdit){
        savedClient = await db.updateClient(c.id, formData);
        const idx = clients.findIndex(x=>x.id===c.id);
        clients[idx] = savedClient;
      } else {
        savedClient = await db.createClient(formData);
        clients.unshift(savedClient);
      }

      let recurrenceMsg = '';
      if(recurrenceRelevantChanged){
        const todayISO = isoDate(TODAY);
        const recurrenceId = 'rec-' + savedClient.id;
        // Remove ocorrências futuras da série antiga (mantém o histórico passado intacto)
        await db.deleteRecurrenceFrom(recurrenceId, todayISO);
        appointments = appointments.filter(a => !(a.recurrenceId === recurrenceId && a.dateISO >= todayISO));

        if(savedClient.status === 'ativo' && (savedClient.frequency === 'Semanal' || savedClient.frequency === 'Quinzenal') && savedClient.day && savedClient.day !== '-'){
          const createdCount = await generateRecurringAppointmentsForClient(savedClient);
          if(createdCount > 0) recurrenceMsg = ` — ${createdCount} consultas recorrentes geradas para as próximas ${RECURRENCE_WEEKS_AHEAD} semanas`;
        }
      }

      closeModal();
      renderClients();
      renderAgenda();
      showToast((isEdit ? 'Cliente atualizado' : 'Cliente cadastrado com sucesso') + recurrenceMsg);
    } catch(err){
      console.error(err);
      submitBtn.disabled = false;
      showToast('Erro ao salvar cliente. Tente novamente.');
    }
  });
}

function openApptModal({presetDateISO, presetTime}){
  if(clients.length===0){ showToast('Cadastre um cliente primeiro'); return; }
  const date0 = presetDateISO || isoDate(nextWeekdayOnOrAfter(TODAY, 'Segunda'));
  const time0 = presetTime || '08:00';

  const clientOptions = clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  const timeOptions = TIME_SLOTS.map(t=>`<option ${t===time0?'selected':''}>${t}</option>`).join('');

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-overlay" id="overlay-appt">
      <div class="modal">
        <div class="modal-header">
          <h2>Nova consulta</h2>
          <button class="modal-close" id="close-appt-modal">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form id="form-appt">
          <div class="modal-body">
            <div class="field"><label>Cliente</label><select id="a-client">${clientOptions}</select></div>
            <div class="field-row">
              <div class="field"><label>Data</label><input type="date" id="a-date" value="${date0}"></div>
              <div class="field"><label>Horário</label><select id="a-time">${timeOptions}</select></div>
            </div>
            <div class="field">
              <label>Modalidade</label>
              <div class="radio-group" id="a-modality-group">
                <div class="radio-pill selected" data-value="Presencial">Presencial</div>
                <div class="radio-pill" data-value="Online">Online</div>
              </div>
            </div>
            <div class="field">
              <label>Status</label>
              <div class="radio-group" id="a-status-group">
                <div class="radio-pill selected" data-value="confirmed">Confirmada</div>
                <div class="radio-pill" data-value="pending">Aguardando confirmação</div>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" id="cancel-appt">Cancelar</button>
              <button type="submit" class="btn btn-primary">Agendar consulta</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;

  let selModality = 'Presencial';
  let selStatus = 'confirmed';
  document.querySelectorAll('#a-modality-group .radio-pill').forEach(p=>{
    p.addEventListener('click', ()=>{
      document.querySelectorAll('#a-modality-group .radio-pill').forEach(x=>x.classList.remove('selected'));
      p.classList.add('selected');
      selModality = p.dataset.value;
    });
  });
  document.querySelectorAll('#a-status-group .radio-pill').forEach(p=>{
    p.addEventListener('click', ()=>{
      document.querySelectorAll('#a-status-group .radio-pill').forEach(x=>x.classList.remove('selected'));
      p.classList.add('selected');
      selStatus = p.dataset.value;
    });
  });

  document.getElementById('close-appt-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-appt').addEventListener('click', closeModal);
  document.getElementById('overlay-appt').addEventListener('click', (e)=>{
    if(e.target.id==='overlay-appt') closeModal();
  });

  document.getElementById('form-appt').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const clientId = document.getElementById('a-client').value;
    const dateISO = document.getElementById('a-date').value;
    const time = document.getElementById('a-time').value;
    if(!dateISO){ showToast('Escolha uma data'); return; }

    const conflict = appointments.some(a=>a.dateISO===dateISO && a.time===time);
    if(conflict){ showToast('Já existe uma consulta nesse horário'); return; }

    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try{
      const created = await db.createAppointment({ clientId, dateISO, time, status: selStatus, modality: selModality, recurrenceId: null });
      appointments.push(created);
      closeModal();
      renderAgenda();
      showToast('Consulta agendada');
    } catch(err){
      console.error(err);
      submitBtn.disabled = false;
      if(err.code === '23505') showToast('Já existe uma consulta nesse horário');
      else showToast('Erro ao agendar consulta. Tente novamente.');
    }
  });
}

function openApptDetailModal(appt){
  const cl = clientById(appt.clientId);
  if(!cl) return;

  const apptDate = new Date(appt.dateISO+'T12:00:00');
  const dateLabel = apptDate.toLocaleDateString('pt-BR', {weekday:'long', day:'2-digit', month:'long'});
  const isRecurring = !!appt.recurrenceId;

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-overlay" id="overlay-detail">
      <div class="modal" style="max-width:380px;">
        <div class="modal-header">
          <h2>Consulta</h2>
          <button class="modal-close" id="close-detail-modal">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div style="display:flex; align-items:center; gap:12px;">
            <div class="client-avatar" style="background:${colorFor(cl.name)};">${initials(cl.name)}</div>
            <div>
              <div class="client-name">${escapeHtml(cl.name)}</div>
              <div class="client-since">${dateLabel} · ${appt.time}</div>
            </div>
          </div>
          ${isRecurring ? `<div style="display:flex; align-items:center; gap:7px; font-size:12.5px; color:var(--ink-soft); background:var(--paper-soft); padding:8px 12px; border-radius:8px;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M17 2.1l4 4-4 4"/><path d="M3 12.2v-2a4 4 0 014-4h14M7 21.9l-4-4 4-4"/><path d="M21 11.8v2a4 4 0 01-4 4H3"/></svg>
            Faz parte de uma série recorrente (${cl.frequency.toLowerCase()})
          </div>` : ''}
          <button type="button" class="btn btn-whatsapp" id="confirm-whatsapp" style="width:100%; justify-content:center;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.77.46 3.45 1.27 4.92L2 22l5.3-1.39a9.9 9.9 0 004.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.02h-.01a8.1 8.1 0 01-4.13-1.13l-.3-.17-3.07.8.82-3-.2-.31a8.07 8.07 0 01-1.25-4.3c0-4.48 3.65-8.13 8.14-8.13 2.17 0 4.21.85 5.75 2.38a8.07 8.07 0 012.38 5.75c0 4.49-3.65 8.11-8.13 8.11zm4.46-6.08c-.25-.12-1.45-.71-1.67-.8-.22-.08-.39-.12-.55.13-.16.24-.63.79-.78.96-.14.16-.29.18-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.22-1.45-1.37-1.7-.14-.24-.02-.37.11-.5.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.31-.22.24-.86.84-.86 2.05 0 1.21.88 2.37 1 2.54.12.16 1.73 2.64 4.2 3.7.59.25 1.04.4 1.4.52.59.19 1.12.16 1.55.1.47-.07 1.45-.59 1.65-1.16.21-.57.21-1.06.14-1.16-.06-.1-.22-.16-.47-.28z"/></svg>
            Confirmar pelo WhatsApp
          </button>
          <div class="field">
            <label>Status</label>
            <div class="radio-group" id="d-status-group">
              <div class="radio-pill ${appt.status==='confirmed'?'selected':''}" data-value="confirmed">Confirmada</div>
              <div class="radio-pill ${appt.status==='pending'?'selected':''}" data-value="pending">A confirmar</div>
            </div>
          </div>
          <div class="modal-actions" style="justify-content:space-between; flex-wrap:wrap;">
            <button type="button" class="btn-danger-text" id="delete-appt">Cancelar esta consulta</button>
            <button type="button" class="btn btn-ghost" id="close-detail-2">Fechar</button>
          </div>
          ${isRecurring ? `<div class="modal-actions" style="margin-top:-6px;">
            <button type="button" class="btn-danger-text" id="delete-series">Cancelar toda a série recorrente futura</button>
          </div>` : ''}
        </div>
      </div>
    </div>
  `;

  document.querySelectorAll('#d-status-group .radio-pill').forEach(p=>{
    p.addEventListener('click', async ()=>{
      document.querySelectorAll('#d-status-group .radio-pill').forEach(x=>x.classList.remove('selected'));
      p.classList.add('selected');
      const a = appointments.find(x=>x.id===appt.id);
      if(a){
        const previousStatus = a.status;
        a.status = p.dataset.value;
        renderAgenda();
        try{
          await db.updateAppointmentStatus(appt.id, p.dataset.value);
        } catch(err){
          console.error(err);
          a.status = previousStatus;
          renderAgenda();
          showToast('Erro ao atualizar status. Tente novamente.');
        }
      }
    });
  });

  document.getElementById('confirm-whatsapp').addEventListener('click', ()=>{
    const message = buildConfirmationMessage(cl, appt);
    const phoneDigits = (cl.phone || '').replace(/\D/g, '');
    if(!phoneDigits){ showToast('Este cliente não tem telefone cadastrado'); return; }
    const waPhone = '55' + phoneDigits.replace(/^55/, '');
    const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');
  });

  document.getElementById('close-detail-modal').addEventListener('click', closeModal);
  document.getElementById('close-detail-2').addEventListener('click', closeModal);
  document.getElementById('overlay-detail').addEventListener('click', (e)=>{
    if(e.target.id==='overlay-detail') closeModal();
  });
  const seriesBtn = document.getElementById('delete-series');
  if(seriesBtn){
    seriesBtn.addEventListener('click', async ()=>{
      seriesBtn.disabled = true;
      try{
        await db.deleteRecurrenceFrom(appt.recurrenceId, appt.dateISO);
        appointments = appointments.filter(a => !(a.recurrenceId === appt.recurrenceId && a.dateISO >= appt.dateISO));
        closeModal();
        renderAgenda();
        showToast('Série recorrente cancelada a partir desta data');
      } catch(err){
        console.error(err);
        seriesBtn.disabled = false;
        showToast('Erro ao cancelar série. Tente novamente.');
      }
    });
  }
  document.getElementById('delete-appt').addEventListener('click', async ()=>{
    const btn = document.getElementById('delete-appt');
    btn.disabled = true;
    try{
      await db.deleteAppointment(appt.id);
      appointments = appointments.filter(a=>a.id!==appt.id);
      closeModal();
      renderAgenda();
      showToast('Consulta cancelada');
    } catch(err){
      console.error(err);
      btn.disabled = false;
      showToast('Erro ao cancelar consulta. Tente novamente.');
    }
  });
}

function openPaymentModal(){
  if(clients.length===0){ showToast('Cadastre um cliente primeiro'); return; }
  const clientOptions = clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-overlay" id="overlay-payment">
      <div class="modal">
        <div class="modal-header">
          <h2>Registrar recebimento</h2>
          <button class="modal-close" id="close-payment-modal">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form id="form-payment">
          <div class="modal-body">
            <div class="field"><label>Cliente</label><select id="p-client">${clientOptions}</select></div>
            <div class="field"><label>Valor recebido (R$)</label><input type="number" min="0" id="p-amount" placeholder="210"></div>
            <div class="field">
              <label>Marcar como</label>
              <div class="radio-group" id="p-status-group">
                <div class="radio-pill selected" data-value="pago">Pago integral</div>
                <div class="radio-pill" data-value="parcial">Pagamento parcial</div>
              </div>
            </div>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" id="cancel-payment">Cancelar</button>
              <button type="submit" class="btn btn-primary">Registrar</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;

  let selStatus = 'pago';
  document.querySelectorAll('#p-status-group .radio-pill').forEach(p=>{
    p.addEventListener('click', ()=>{
      document.querySelectorAll('#p-status-group .radio-pill').forEach(x=>x.classList.remove('selected'));
      p.classList.add('selected');
      selStatus = p.dataset.value;
    });
  });

  document.getElementById('close-payment-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-payment').addEventListener('click', closeModal);
  document.getElementById('overlay-payment').addEventListener('click', (e)=>{
    if(e.target.id==='overlay-payment') closeModal();
  });

  document.getElementById('form-payment').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const clientId = document.getElementById('p-client').value;
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try{
      const existing = payments.find(p=>p.clientId===clientId);
      const saved = await db.upsertPayment({
        clientId,
        referenceMonthISO: currentReferenceMonthISO(),
        sessions: existing ? existing.sessions : 1,
        status: selStatus,
        openSinceISO: existing ? isoDate(TODAY) : null,
      });

      if(existing){
        const idx = payments.findIndex(p=>p.clientId===clientId);
        payments[idx] = saved;
      } else {
        payments.push(saved);
      }
      closeModal();
      renderFinanceiro();
      showToast('Recebimento registrado');
    } catch(err){
      console.error(err);
      submitBtn.disabled = false;
      showToast('Erro ao registrar recebimento. Tente novamente.');
    }
  });
}

/* ============================================================
   MODAL DE COBRANÇA
   ============================================================ */
function fillTemplate(template, values){
  let result = template;
  Object.entries(values).forEach(([key, val])=>{
    result = result.split('{'+key+'}').join(val);
  });
  return result;
}

function buildChargeMessage(client, payment){
  const total = payment.sessions * client.value;
  const amount = payment.status === 'parcial' ? Math.round(total*0.5) : total;
  const sessionWord = payment.sessions === 1 ? 'sessão' : 'sessões';

  return fillTemplate(appSettings.messageTemplates.charge, {
    primeiro_nome: client.name.split(' ')[0],
    nome_completo: client.name,
    sessoes: String(payment.sessions),
    sessoes_palavra: sessionWord,
    valor: fmtBRL(amount),
    profissional: profile.name,
  });
}

function buildConfirmationMessage(client, appt){
  const apptDate = new Date(appt.dateISO+'T12:00:00');
  const dateLabel = apptDate.toLocaleDateString('pt-BR', {weekday:'long', day:'2-digit', month:'long'});
  const modalidadeTexto = appt.modality === 'Online' ? ' (online)' : '';

  return fillTemplate(appSettings.messageTemplates.confirmation, {
    primeiro_nome: client.name.split(' ')[0],
    nome_completo: client.name,
    data: dateLabel,
    hora: appt.time,
    modalidade_texto: modalidadeTexto,
    profissional: profile.name,
  });
}

function openChargeModal(paymentId){
  const payment = payments.find(p=>p.id===paymentId);
  if(!payment) return;
  const client = clientById(payment.clientId);
  if(!client) return;

  const message = buildChargeMessage(client, payment);
  const phoneDigits = (client.phone || '').replace(/\D/g, '');
  const waPhone = phoneDigits ? ('55' + phoneDigits.replace(/^55/, '')) : '';
  const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;

  document.getElementById('modal-root').innerHTML = `
    <div class="modal-overlay" id="overlay-charge">
      <div class="modal">
        <div class="modal-header">
          <h2>Cobrar ${escapeHtml(client.name.split(' ')[0])}</h2>
          <button class="modal-close" id="close-charge-modal">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Mensagem de cobrança</label>
            <div class="charge-preview" id="charge-text">${escapeHtml(message)}</div>
          </div>
          ${!waPhone ? `<div style="font-size:12.5px; color:var(--alert);">Este cliente não tem telefone cadastrado — adicione um número para enviar pelo WhatsApp.</div>` : ''}
          <div class="charge-actions">
            <button type="button" class="btn btn-ghost" id="copy-charge">Copiar texto</button>
            <button type="button" class="btn btn-whatsapp" id="send-whatsapp" ${!waPhone ? 'disabled style="opacity:.5; cursor:default;"' : ''}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.77.46 3.45 1.27 4.92L2 22l5.3-1.39a9.9 9.9 0 004.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.02h-.01a8.1 8.1 0 01-4.13-1.13l-.3-.17-3.07.8.82-3-.2-.31a8.07 8.07 0 01-1.25-4.3c0-4.48 3.65-8.13 8.14-8.13 2.17 0 4.21.85 5.75 2.38a8.07 8.07 0 012.38 5.75c0 4.49-3.65 8.11-8.13 8.11zm4.46-6.08c-.25-.12-1.45-.71-1.67-.8-.22-.08-.39-.12-.55.13-.16.24-.63.79-.78.96-.14.16-.29.18-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.22-1.45-1.37-1.7-.14-.24-.02-.37.11-.5.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.31-.22.24-.86.84-.86 2.05 0 1.21.88 2.37 1 2.54.12.16 1.73 2.64 4.2 3.7.59.25 1.04.4 1.4.52.59.19 1.12.16 1.55.1.47-.07 1.45-.59 1.65-1.16.21-.57.21-1.06.14-1.16-.06-.1-.22-.16-.47-.28z"/></svg>
              Abrir no WhatsApp
            </button>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" id="close-charge-2">Fechar</button>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('close-charge-modal').addEventListener('click', closeModal);
  document.getElementById('close-charge-2').addEventListener('click', closeModal);
  document.getElementById('overlay-charge').addEventListener('click', (e)=>{
    if(e.target.id==='overlay-charge') closeModal();
  });
  document.getElementById('copy-charge').addEventListener('click', ()=>{
    const text = document.getElementById('charge-text').textContent;
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).then(()=> showToast('Texto copiado')).catch(()=> fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  });
  if(waPhone){
    document.getElementById('send-whatsapp').addEventListener('click', ()=>{
      window.open(waUrl, '_blank');
    });
  }
}

function fallbackCopy(text){
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try{ document.execCommand('copy'); showToast('Texto copiado'); }
  catch(e){ showToast('Não foi possível copiar automaticamente'); }
  document.body.removeChild(ta);
}

/* ============================================================
   PRONTUÁRIOS — PROTEÇÃO POR SENHA
   ============================================================ */
// Renderiza a tela de senha dentro de um container específico (substitui o conteúdo dele)
function renderPasswordGate(container, targetLabel, onSuccess, onCancel){
  const isFirstTime = !prontuarioPasswordIsSet;

  container.innerHTML = `
    <div class="password-gate">
      <div class="gate-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      </div>
      <h2>${isFirstTime ? 'Criar senha de acesso' : 'Acesso protegido'}</h2>
      <p>${isFirstTime
        ? 'Esta é a primeira vez que você acessa os Prontuários. Defina uma senha para proteger ' + escapeHtml(targetLabel) + '.'
        : 'Digite a senha para abrir ' + escapeHtml(targetLabel) + '.'}</p>
      <div class="field">
        <input type="password" id="gate-password" placeholder="${isFirstTime ? 'Crie sua senha' : 'Digite a senha'}" autocomplete="off">
      </div>
      ${isFirstTime ? `
      <div class="field">
        <input type="password" id="gate-password-confirm" placeholder="Confirme a senha" autocomplete="off">
      </div>` : ''}
      <div class="password-error" id="gate-error"></div>
      <div class="modal-actions" style="justify-content:center;">
        <button type="button" class="btn btn-ghost" id="gate-cancel">Voltar</button>
        <button type="button" class="btn btn-primary" id="gate-submit">${isFirstTime ? 'Criar senha e continuar' : 'Desbloquear'}</button>
      </div>
    </div>
  `;

  const pwInput = document.getElementById('gate-password');
  pwInput.focus();
  const errorEl = document.getElementById('gate-error');
  const submitBtn = document.getElementById('gate-submit');

  const submit = async () => {
    const val = pwInput.value;
    if(!val){ errorEl.textContent = 'Digite uma senha.'; return; }

    submitBtn.disabled = true;
    try{
      if(isFirstTime){
        const confirmVal = document.getElementById('gate-password-confirm').value;
        if(val.length < 4){ errorEl.textContent = 'Use ao menos 4 caracteres.'; submitBtn.disabled = false; return; }
        if(val !== confirmVal){ errorEl.textContent = 'As senhas não coincidem.'; submitBtn.disabled = false; return; }
        await db.setProntuarioPassword(val);
        prontuarioPasswordIsSet = true;
        onSuccess();
      } else {
        const isValid = await db.verifyProntuarioPassword(val);
        if(!isValid){
          errorEl.textContent = 'Senha incorreta. Tente novamente.';
          pwInput.value = '';
          pwInput.focus();
          submitBtn.disabled = false;
          return;
        }
        onSuccess();
      }
    } catch(err){
      console.error(err);
      errorEl.textContent = 'Erro ao verificar senha. Tente novamente.';
      submitBtn.disabled = false;
    }
  };

  submitBtn.addEventListener('click', submit);
  pwInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') submit(); });
  const confirmInput = document.getElementById('gate-password-confirm');
  if(confirmInput) confirmInput.addEventListener('keydown', (e)=>{ if(e.key==='Enter') submit(); });

  document.getElementById('gate-cancel').addEventListener('click', onCancel);
}

/* ============================================================
   PRONTUÁRIOS — LISTA
   ============================================================ */
function renderProntuarios(){
  document.getElementById('prontuario-list-view').style.display = 'block';
  document.getElementById('prontuario-detail-view').style.display = 'none';
  document.getElementById('prontuario-detail-view').innerHTML = '';
  document.getElementById('prontuario-compilado-view').style.display = 'none';
  document.getElementById('prontuario-compilado-view').innerHTML = '';

  const grid = document.getElementById('prontuario-grid');
  const search = state.prontuarioSearch.toLowerCase();
  const filtered = clients.filter(c => c.name.toLowerCase().includes(search));

  if(filtered.length === 0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <h3>Nenhum cliente encontrado</h3>
      <p>Tente ajustar a busca.</p>
    </div>`;
    return;
  }

  let html = '';
  filtered.forEach(c=>{
    const recordCount = sessionRecords.filter(r=>r.clientId===c.id).length;
    html += `<div class="client-card" data-pront-id="${c.id}">
      <div class="client-top">
        <div class="client-avatar" style="background:${colorFor(c.name)};">${initials(c.name)}</div>
        <div>
          <div class="client-name">${escapeHtml(c.name)}</div>
          <div class="client-since">Cliente desde ${fmtDate(c.since)}</div>
        </div>
      </div>
      <div class="client-meta">
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z"/><path d="M19 11a7 7 0 01-14 0M12 18v3"/></svg> ${recordCount} ${recordCount===1 ? 'registro de sessão' : 'registros de sessão'}</span>
      </div>
      <div class="client-footer">
        <span class="client-status ${c.status}">${c.status==='ativo' ? 'Ativo' : 'Em pausa'}</span>
        <span class="next-session">Ver prontuário →</span>
      </div>
    </div>`;
  });
  grid.innerHTML = html;
  grid.querySelectorAll('[data-pront-id]').forEach(el=>{
    el.addEventListener('click', ()=> tryOpenClientProntuario(el.dataset.prontId));
  });
}

document.getElementById('prontuario-search').addEventListener('input', (e)=>{
  state.prontuarioSearch = e.target.value;
  renderProntuarios();
});

document.getElementById('btn-ver-compilado').addEventListener('click', ()=> tryOpenCompilado());

/* ============================================================
   PRONTUÁRIOS — GATE POR CLIENTE
   ============================================================ */
function tryOpenClientProntuario(clientId){
  const c = clientById(clientId);
  if(!c) return;

  document.getElementById('prontuario-list-view').style.display = 'none';
  const detail = document.getElementById('prontuario-detail-view');
  detail.style.display = 'block';

  renderPasswordGate(
    detail,
    'o prontuário de ' + c.name.split(' ')[0],
    ()=> renderClientProntuario(clientId),
    ()=>{ state.prontuarioClientId = null; renderProntuarios(); }
  );
}

async function renderClientProntuario(clientId){
  const c = clientById(clientId);
  if(!c) return;
  state.prontuarioClientId = clientId;

  const detail = document.getElementById('prontuario-detail-view');
  detail.innerHTML = `<div style="padding:60px; text-align:center; color:var(--ink-soft);">Carregando prontuário...</div>`;

  let records;
  try{
    records = await db.loadSessionRecords(clientId);
    // Atualiza o cache local (substitui apenas os registros deste cliente)
    sessionRecords = sessionRecords.filter(r => r.clientId !== clientId).concat(records);
  } catch(err){
    console.error(err);
    detail.innerHTML = `<div style="padding:60px; text-align:center; color:var(--alert);">Erro ao carregar prontuário. Tente novamente.</div>`;
    return;
  }

  detail.innerHTML = `
    <div class="prontuario-header no-print">
      <button class="back-btn" id="back-to-prontuarios">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="prontuario-id">
        <div class="client-avatar" style="background:${colorFor(c.name)};">${initials(c.name)}</div>
        <div>
          <h1>${escapeHtml(c.name)}</h1>
          <p>Cliente desde ${fmtDate(c.since)} · ${c.status==='ativo' ? 'Ativo' : 'Em pausa'}</p>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" id="btn-export-prontuario">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M7 10l5 5 5-5M12 15V3"/></svg>
        Exportar planilha
      </button>
      <button class="btn btn-ghost btn-sm" id="btn-print-prontuario">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
        Imprimir tudo
      </button>
      <button class="btn btn-primary btn-sm" id="btn-nova-sessao">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
        Nova sessão
      </button>
    </div>

    <div id="printable-prontuario">
      <div class="print-only print-header">
        <h1>${escapeHtml(c.name)}</h1>
        <p>Prontuário clínico · Gerado em ${TODAY.toLocaleDateString('pt-BR')} · ${escapeHtml(profile.name)}</p>
      </div>

      <div class="card info-list" style="margin-bottom:18px; flex-direction:row; flex-wrap:wrap; gap:28px;">
        <div class="info-row"><span class="label">Telefone</span><span class="val">${escapeHtml(c.phone || '—')}</span></div>
        <div class="info-row"><span class="label">Frequência</span><span class="val">${escapeHtml(c.frequency)}</span></div>
        <div class="info-row"><span class="label">Modalidade</span><span class="val">${escapeHtml(c.modality)}</span></div>
        <div class="info-row"><span class="label">Valor da sessão</span><span class="val">${fmtBRL(c.value)}</span></div>
      </div>

      <div id="session-form-slot" class="no-print"></div>

      <div id="packages-slot" class="packages-section no-print"></div>

      <div class="records-header">
        <h3>Registros de sessão (${records.length})</h3>
      </div>
      <div id="records-list"></div>
    </div>
  `;

  document.getElementById('btn-print-prontuario').addEventListener('click', ()=> window.print());
  document.getElementById('btn-export-prontuario').addEventListener('click', ()=> exportProntuarioCSV(c, records));

  document.getElementById('back-to-prontuarios').addEventListener('click', ()=>{
    state.prontuarioClientId = null;
    renderProntuarios();
  });

  document.getElementById('btn-nova-sessao').addEventListener('click', ()=> showSessionForm(clientId));

  renderRecordsList(clientId);
  renderPackagesSection(clientId);
}

/* ============================================================
   PACOTES DE SESSÕES
   ============================================================ */

/** Quantas sessões restam num pacote. */
function packageRemaining(pkg){
  return Math.max(0, pkg.totalSessions - pkg.usedSessions);
}

/** Retorna true se o pacote está ativo e dentro (ou abaixo) do limite de alerta configurado. */
function isPackageLow(pkg){
  if(pkg.status !== 'ativo') return false;
  return packageRemaining(pkg) <= appSettings.packageAlertThreshold;
}

/** Lista de {client, package} para todos os pacotes ativos e baixos de todos os clientes. */
function getLowPackagesWithClients(){
  return packages
    .filter(isPackageLow)
    .map(pkg => ({ pkg, client: clientById(pkg.clientId) }))
    .filter(x => !!x.client)
    .sort((a,b) => packageRemaining(a.pkg) - packageRemaining(b.pkg));
}

function renderPackagesSection(clientId, slotId){
  slotId = slotId || 'packages-slot';
  const slot = document.getElementById(slotId);
  if(!slot) return;

  const clientPackages = packages
    .filter(p => p.clientId === clientId)
    .sort((a,b) => b.startDate.localeCompare(a.startDate));

  let html = `
    <div class="records-header">
      <h3>Pacotes de sessões</h3>
      <button class="btn btn-ghost btn-sm" id="btn-novo-pacote">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>
        Novo pacote
      </button>
    </div>
  `;

  if(clientPackages.length === 0){
    html += `<div class="records-empty">Nenhum pacote cadastrado para este cliente ainda.</div>`;
  } else {
    clientPackages.forEach(pkg=>{
      const remaining = packageRemaining(pkg);
      const pct = Math.min(100, Math.round((pkg.usedSessions / pkg.totalSessions) * 100));
      const fillClass = remaining === 0 ? 'critical' : (remaining <= appSettings.packageAlertThreshold ? 'low' : '');
      const dateRange = pkg.endDate
        ? `${fmtDateShort(pkg.startDate)} – ${fmtDateShort(pkg.endDate)}`
        : `Iniciado em ${fmtDateShort(pkg.startDate)}`;
      const statusLabel = pkg.status === 'ativo' ? '' : (pkg.status === 'encerrado' ? ' · Encerrado' : ' · Cancelado');

      html += `
        <div class="package-card status-${pkg.status}">
          <div class="package-top">
            <div>
              <div class="package-name">${escapeHtml(pkg.name)}</div>
              <div class="package-dates">${dateRange}${statusLabel}</div>
            </div>
            ${pkg.value != null ? `<div class="value-mono" style="font-size:13.5px;">${fmtBRL(pkg.value)}</div>` : ''}
          </div>
          <div class="package-progress-track">
            <div class="package-progress-fill ${fillClass}" style="width:${pct}%;"></div>
          </div>
          <div class="package-meta">
            <span>${pkg.usedSessions} de ${pkg.totalSessions} sessões usadas</span>
            <span>${remaining} ${remaining===1 ? 'restante' : 'restantes'}</span>
          </div>
          <div class="package-actions">
            ${pkg.status==='ativo' ? `<button class="btn btn-ghost btn-sm" data-use-session="${pkg.id}">+1 sessão usada</button>` : ''}
            <button class="btn btn-ghost btn-sm" data-edit-package="${pkg.id}">Editar</button>
            <button class="btn-danger-text" data-delete-package="${pkg.id}">Excluir</button>
          </div>
        </div>
      `;
    });
  }

  slot.innerHTML = html;

  document.getElementById('btn-novo-pacote').addEventListener('click', ()=> openPackageModal(clientId, null, slotId));

  slot.querySelectorAll('[data-use-session]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const pkg = packages.find(p=>p.id===btn.dataset.useSession);
      if(!pkg) return;
      btn.disabled = true;
      const newUsed = Math.min(pkg.totalSessions, pkg.usedSessions + 1);
      try{
        const updated = await db.incrementPackageUsedSessions(pkg.id, newUsed);
        const idx = packages.findIndex(p=>p.id===pkg.id);
        packages[idx] = updated;
        renderPackagesSection(clientId, slotId);
        renderPackageAlert();
        showToast('Sessão registrada no pacote');
      } catch(err){
        console.error(err);
        btn.disabled = false;
        showToast('Erro ao atualizar pacote. Tente novamente.');
      }
    });
  });

  slot.querySelectorAll('[data-edit-package]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const pkg = packages.find(p=>p.id===btn.dataset.editPackage);
      if(pkg) openPackageModal(clientId, pkg, slotId);
    });
  });

  slot.querySelectorAll('[data-delete-package]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.deletePackage;
      btn.disabled = true;
      try{
        await db.deletePackage(id);
        packages = packages.filter(p=>p.id!==id);
        renderPackagesSection(clientId, slotId);
        renderPackageAlert();
        showToast('Pacote excluído');
      } catch(err){
        console.error(err);
        btn.disabled = false;
        showToast('Erro ao excluir pacote. Tente novamente.');
      }
    });
  });
}

function fmtDateShort(iso){
  return new Date(iso+'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'numeric'});
}

function openPackageModal(clientId, existingPkg, slotId){
  slotId = slotId || 'packages-slot';
  const isEdit = !!existingPkg;
  const p = existingPkg || { name:'Pacote de sessões', totalSessions:10, usedSessions:0, startDate: isoDate(TODAY), endDate:'', value:'', status:'ativo' };

  document.getElementById('modal-root-2').innerHTML = `
    <div class="modal-overlay" id="overlay-package">
      <div class="modal">
        <div class="modal-header">
          <h2>${isEdit ? 'Editar pacote' : 'Novo pacote'}</h2>
          <button class="modal-close" id="close-package-modal">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form id="form-package">
          <div class="modal-body">
            <div class="field" style="margin-bottom:14px;">
              <label>Nome do pacote</label>
              <input type="text" id="pkg-name" value="${escapeHtml(p.name)}" placeholder="Ex: Pacote de 10 sessões">
            </div>
            <div class="field-row" style="margin-bottom:14px;">
              <div class="field"><label>Total de sessões</label><input type="number" min="1" id="pkg-total" value="${p.totalSessions}"></div>
              <div class="field"><label>Sessões já usadas</label><input type="number" min="0" id="pkg-used" value="${p.usedSessions}"></div>
            </div>
            <div class="field-row" style="margin-bottom:14px;">
              <div class="field"><label>Data inicial</label><input type="date" id="pkg-start" value="${p.startDate}"></div>
              <div class="field"><label>Data final (opcional)</label><input type="date" id="pkg-end" value="${p.endDate || ''}"></div>
            </div>
            <div class="field" style="margin-bottom:14px;">
              <label>Valor do pacote (opcional)</label>
              <input type="number" min="0" id="pkg-value" value="${p.value != null ? p.value : ''}" placeholder="Ex: 1800">
            </div>
            ${isEdit ? `
            <div class="field" style="margin-bottom:4px;">
              <label>Status</label>
              <div class="radio-group" id="pkg-status-group">
                <div class="radio-pill ${p.status==='ativo'?'selected':''}" data-value="ativo">Ativo</div>
                <div class="radio-pill ${p.status==='encerrado'?'selected':''}" data-value="encerrado">Encerrado</div>
                <div class="radio-pill ${p.status==='cancelado'?'selected':''}" data-value="cancelado">Cancelado</div>
              </div>
            </div>` : ''}
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" id="cancel-package">Cancelar</button>
              <button type="submit" class="btn btn-primary">${isEdit ? 'Salvar alterações' : 'Criar pacote'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;

  let selStatus = p.status;
  document.querySelectorAll('#pkg-status-group .radio-pill').forEach(pill=>{
    pill.addEventListener('click', ()=>{
      document.querySelectorAll('#pkg-status-group .radio-pill').forEach(x=>x.classList.remove('selected'));
      pill.classList.add('selected');
      selStatus = pill.dataset.value;
    });
  });

  document.getElementById('close-package-modal').addEventListener('click', closeModal2);
  document.getElementById('cancel-package').addEventListener('click', closeModal2);
  document.getElementById('overlay-package').addEventListener('click', (e)=>{ if(e.target.id==='overlay-package') closeModal2(); });

  document.getElementById('form-package').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const formData = {
      clientId,
      name: document.getElementById('pkg-name').value.trim() || 'Pacote de sessões',
      totalSessions: Math.max(1, Number(document.getElementById('pkg-total').value) || 1),
      usedSessions: Math.max(0, Number(document.getElementById('pkg-used').value) || 0),
      startDate: document.getElementById('pkg-start').value || isoDate(TODAY),
      endDate: document.getElementById('pkg-end').value || null,
      value: document.getElementById('pkg-value').value ? Number(document.getElementById('pkg-value').value) : null,
      status: isEdit ? selStatus : 'ativo',
    };

    try{
      if(isEdit){
        const updated = await db.updatePackage(existingPkg.id, formData);
        const idx = packages.findIndex(x=>x.id===existingPkg.id);
        packages[idx] = updated;
        showToast('Pacote atualizado');
      } else {
        const created = await db.createPackage(formData);
        packages.unshift(created);
        showToast('Pacote criado');
      }
      closeModal2();
      renderPackagesSection(clientId, slotId);
      renderPackageAlert();
    } catch(err){
      console.error(err);
      submitBtn.disabled = false;
      showToast('Erro ao salvar pacote. Tente novamente.');
    }
  });
}

/* ---------- Cartão de alerta na Agenda ---------- */
function renderPackageAlert(){
  const slot = document.getElementById('package-alert-slot');
  if(!slot) return;

  const lowOnes = getLowPackagesWithClients();
  if(lowOnes.length === 0){ slot.innerHTML = ''; return; }

  let itemsHtml = '';
  lowOnes.forEach(({pkg, client})=>{
    const remaining = packageRemaining(pkg);
    itemsHtml += `
      <div class="package-alert-item">
        <div>
          <div class="client-name">${escapeHtml(client.name)}</div>
          <div class="package-remaining">${remaining === 0 ? 'Pacote esgotado' : `${remaining} ${remaining===1?'sessão restante':'sessões restantes'}`} · ${escapeHtml(pkg.name)}</div>
        </div>
        <button class="btn btn-whatsapp btn-sm" data-package-message="${pkg.id}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.77.46 3.45 1.27 4.92L2 22l5.3-1.39a9.9 9.9 0 004.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.02h-.01a8.1 8.1 0 01-4.13-1.13l-.3-.17-3.07.8.82-3-.2-.31a8.07 8.07 0 01-1.25-4.3c0-4.48 3.65-8.13 8.14-8.13 2.17 0 4.21.85 5.75 2.38a8.07 8.07 0 012.38 5.75c0 4.49-3.65 8.11-8.13 8.11zm4.46-6.08c-.25-.12-1.45-.71-1.67-.8-.22-.08-.39-.12-.55.13-.16.24-.63.79-.78.96-.14.16-.29.18-.53.06-.25-.12-1.04-.38-1.98-1.22-.73-.65-1.22-1.45-1.37-1.7-.14-.24-.02-.37.11-.5.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.55-1.33-.76-1.82-.2-.48-.4-.41-.55-.42h-.47c-.16 0-.43.06-.65.31-.22.24-.86.84-.86 2.05 0 1.21.88 2.37 1 2.54.12.16 1.73 2.64 4.2 3.7.59.25 1.04.4 1.4.52.59.19 1.12.16 1.55.1.47-.07 1.45-.59 1.65-1.16.21-.57.21-1.06.14-1.16-.06-.1-.22-.16-.47-.28z"/></svg>
          Avisar
        </button>
      </div>
    `;
  });

  slot.innerHTML = `
    <div class="package-alert-card">
      <div class="package-alert-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 9v4M12 17h.01M10.3 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.7 3.86a2 2 0 00-3.4 0z"/></svg>
        ${lowOnes.length} ${lowOnes.length===1 ? 'pacote precisa' : 'pacotes precisam'} de atenção
      </div>
      ${itemsHtml}
    </div>
  `;

  slot.querySelectorAll('[data-package-message]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const pkg = packages.find(p=>p.id===btn.dataset.packageMessage);
      const client = clientById(pkg.clientId);
      sendPackageWhatsAppMessage(client, pkg);
    });
  });
}

function sendPackageWhatsAppMessage(client, pkg){
  if(!client) return;
  const phoneDigits = (client.phone || '').replace(/\D/g, '');
  if(!phoneDigits){ showToast('Este cliente não tem telefone cadastrado'); return; }

  const remaining = packageRemaining(pkg);
  const message = fillTemplate(appSettings.messageTemplates.package, {
    primeiro_nome: client.name.split(' ')[0],
    nome_completo: client.name,
    sessoes_restantes: String(remaining),
    sessoes_restantes_palavra: remaining === 1 ? 'sessão' : 'sessões',
    profissional: profile.name,
  });

  const waPhone = '55' + phoneDigits.replace(/^55/, '');
  const waUrl = `https://wa.me/${waPhone}?text=${encodeURIComponent(message)}`;
  window.open(waUrl, '_blank');
}

/* ============================================================
   ATESTADOS
   ============================================================ */
function renderAtestados(){
  document.getElementById('atestado-list-view').style.display = 'block';
  document.getElementById('atestado-editor-view').style.display = 'none';

  const grid = document.getElementById('atestado-grid');
  grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--ink-soft);">Carregando atestados...</div>`;

  db.loadCertificates().then(data=>{
    certificates = data;
    renderAtestadoGrid();
  }).catch(err=>{
    console.error(err);
    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:40px; color:var(--alert);">Erro ao carregar atestados. Tente novamente.</div>`;
  });

  document.getElementById('btn-novo-atestado').onclick = () => openAtestadoEditor(null);
}

function renderAtestadoGrid(){
  const grid = document.getElementById('atestado-grid');

  if(certificates.length === 0){
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">
      <h3>Nenhum atestado emitido ainda</h3>
      <p>Clique em "Novo atestado" para criar o primeiro.</p>
    </div>`;
    return;
  }

  const sorted = [...certificates].sort((a,b)=> b.issueDate.localeCompare(a.issueDate));
  let html = '';
  sorted.forEach(cert=>{
    const name = cert.clientNameSnapshot || 'Sem cliente vinculado';
    const dateLabel = new Date(cert.issueDate+'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'short', year:'numeric'});
    const preview = (cert.content || '').replace(/\s+/g,' ').trim().slice(0, 90);
    html += `<div class="client-card" data-open-cert="${cert.id}">
      <div class="client-top">
        <div class="client-avatar" style="background:${colorFor(name)};">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
        </div>
        <div>
          <div class="client-name">${escapeHtml(name)}</div>
          <div class="client-since">Emitido em ${dateLabel}</div>
        </div>
      </div>
      <div class="client-meta">
        <span>${escapeHtml(preview) || 'Sem conteúdo ainda'}${preview.length>=90?'…':''}</span>
      </div>
    </div>`;
  });
  grid.innerHTML = html;
  grid.querySelectorAll('[data-open-cert]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const cert = certificates.find(c=>c.id===el.dataset.openCert);
      if(cert) openAtestadoEditor(cert);
    });
  });
}

function openAtestadoEditor(existingCert){
  const isEdit = !!existingCert;
  document.getElementById('atestado-list-view').style.display = 'none';
  const view = document.getElementById('atestado-editor-view');
  view.style.display = 'block';

  const clientOptions = `<option value="">— Sem cliente vinculado —</option>` +
    clients.map(c => `<option value="${c.id}" ${existingCert && existingCert.clientId===c.id ? 'selected':''}>${escapeHtml(c.name)}</option>`).join('');

  const defaultContent = `Atesto, para os devidos fins, que ${'{cliente}'} esteve sob meus cuidados profissionais, necessitando de afastamento de suas atividades pelo período que se fizer necessário.`;
  const today = isoDate(TODAY);

  view.innerHTML = `
    <div class="prontuario-header no-print">
      <button class="back-btn" id="back-to-atestados">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="prontuario-id">
        <h1>${isEdit ? 'Editar atestado' : 'Novo atestado'}</h1>
      </div>
      ${isEdit ? `<button class="btn-danger-text" id="btn-delete-certificate">Excluir</button>` : ''}
      <button class="btn btn-ghost btn-sm" id="btn-print-certificate">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
        Imprimir
      </button>
      <button class="btn btn-primary btn-sm" id="btn-save-certificate">Salvar</button>
    </div>

    <div class="certificate-meta-fields no-print">
      <div class="field">
        <label>Cliente (opcional)</label>
        <select id="cert-client">${clientOptions}</select>
      </div>
      <div class="field" style="max-width:180px;">
        <label>Data de emissão</label>
        <input type="date" id="cert-date" value="${existingCert ? existingCert.issueDate : today}">
      </div>
    </div>

    <div id="printable-certificate">
      <div class="certificate-paper card">
        <div class="certificate-logo-area" id="certificate-print-logo">
          ${profile.certificateLogoUrl ? `<img src="${profile.certificateLogoUrl}" alt="Logo">` : ''}
        </div>
        <div class="certificate-issuer">
          ${escapeHtml(profile.name)}${profile.role ? ' · '+escapeHtml(profile.role) : ''}
        </div>
        <textarea class="certificate-textarea no-print" id="cert-content" placeholder="Digite o texto do atestado...">${escapeHtml(existingCert ? existingCert.content : defaultContent)}</textarea>
        <div class="certificate-textarea print-only" id="cert-content-print" style="white-space:pre-wrap;"></div>
      </div>
    </div>
  `;

  const textarea = document.getElementById('cert-content');
  const printDiv = document.getElementById('cert-content-print');
  const syncPrintContent = () => { printDiv.textContent = textarea.value; };
  syncPrintContent();
  textarea.addEventListener('input', syncPrintContent);

  document.getElementById('back-to-atestados').addEventListener('click', ()=> renderAtestados());

  document.getElementById('btn-print-certificate').addEventListener('click', ()=>{
    syncPrintContent();
    window.print();
  });

  document.getElementById('btn-save-certificate').addEventListener('click', async ()=>{
    const btn = document.getElementById('btn-save-certificate');
    btn.disabled = true;

    const clientIdVal = document.getElementById('cert-client').value || null;
    const client = clientIdVal ? clientById(clientIdVal) : null;
    const certData = {
      clientId: clientIdVal,
      clientNameSnapshot: client ? client.name : null,
      issueDate: document.getElementById('cert-date').value || today,
      content: textarea.value,
    };

    try{
      if(isEdit){
        const updated = await db.updateCertificate(existingCert.id, certData);
        const idx = certificates.findIndex(c=>c.id===existingCert.id);
        certificates[idx] = updated;
        showToast('Atestado atualizado');
      } else {
        const created = await db.createCertificate(certData);
        certificates.unshift(created);
        showToast('Atestado salvo');
      }
      renderAtestados();
    } catch(err){
      console.error(err);
      btn.disabled = false;
      showToast('Erro ao salvar atestado. Tente novamente.');
    }
  });

  const deleteBtn = document.getElementById('btn-delete-certificate');
  if(deleteBtn){
    deleteBtn.addEventListener('click', async ()=>{
      deleteBtn.disabled = true;
      try{
        await db.deleteCertificate(existingCert.id);
        certificates = certificates.filter(c=>c.id!==existingCert.id);
        showToast('Atestado excluído');
        renderAtestados();
      } catch(err){
        console.error(err);
        deleteBtn.disabled = false;
        showToast('Erro ao excluir atestado. Tente novamente.');
      }
    });
  }
}

function renderRecordsList(clientId){
  const records = sessionRecords
    .filter(r => r.clientId === clientId)
    .sort((a,b)=> b.date.localeCompare(a.date));
  const list = document.getElementById('records-list');
  if(!list) return;

  if(records.length === 0){
    list.innerHTML = `<div class="records-empty">Nenhuma sessão registrada ainda. Clique em "Nova sessão" para começar.</div>`;
    return;
  }

  let html = '';
  records.forEach(r=>{
    const dateLabel = new Date(r.date+'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'long', year:'numeric'});
    html += `<div class="record-card">
      <div class="record-top">
        <span class="record-date">${dateLabel}</span>
        <div style="display:flex; gap:14px; align-items:center;">
          <button class="btn-icon" data-print-record="${r.id}" title="Imprimir esta sessão">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/><path d="M6 14h12v8H6z"/></svg>
          </button>
          <button class="btn-danger-text" data-delete-record="${r.id}">Excluir</button>
        </div>
      </div>
      ${r.complaint ? `<div class="record-field"><div class="rf-label">Queixa principal</div><div class="rf-val">${escapeHtml(r.complaint)}</div></div>` : ''}
      ${r.interventions ? `<div class="record-field"><div class="rf-label">Intervenções</div><div class="rf-val">${escapeHtml(r.interventions)}</div></div>` : ''}
      ${r.observations ? `<div class="record-field"><div class="rf-label">Observações</div><div class="rf-val">${escapeHtml(r.observations)}</div></div>` : ''}
      ${r.plan ? `<div class="record-field"><div class="rf-label">Plano</div><div class="rf-val">${escapeHtml(r.plan)}</div></div>` : ''}
      ${r.freeNotes ? `<div class="record-field"><div class="rf-label">Notas adicionais</div><div class="rf-val">${escapeHtml(r.freeNotes)}</div></div>` : ''}
    </div>`;
  });
  list.innerHTML = html;
  list.querySelectorAll('[data-print-record]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const record = records.find(r=>r.id===btn.dataset.printRecord);
      if(record) printSingleRecord(clientById(clientId), record);
    });
  });
  list.querySelectorAll('[data-delete-record]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const id = btn.dataset.deleteRecord;
      btn.disabled = true;
      try{
        await db.deleteSessionRecord(id);
        sessionRecords = sessionRecords.filter(r=>r.id!==id);
        renderRecordsList(clientId);
        renderProntuarios();
        showToast('Registro de sessão excluído');
      } catch(err){
        console.error(err);
        btn.disabled = false;
        showToast('Erro ao excluir registro. Tente novamente.');
      }
    });
  });
}

function showSessionForm(clientId){
  const slot = document.getElementById('session-form-slot');
  if(!slot) return;
  const today = new Date().toISOString().slice(0,10);

  slot.innerHTML = `
    <div class="card session-form-card">
      <h3>Nova sessão</h3>
      <form id="form-session">
        <div class="field" style="margin-bottom:14px;">
          <label>Data da sessão</label>
          <input type="date" id="s-date" value="${today}" required>
        </div>
        <div class="field" style="margin-bottom:14px;">
          <label>Queixa principal</label>
          <textarea rows="2" id="s-complaint" placeholder="O que o cliente trouxe para esta sessão..."></textarea>
        </div>
        <div class="field" style="margin-bottom:14px;">
          <label>Intervenções</label>
          <textarea rows="2" id="s-interventions" placeholder="Técnicas e abordagens utilizadas..."></textarea>
        </div>
        <div class="field" style="margin-bottom:14px;">
          <label>Observações</label>
          <textarea rows="2" id="s-observations" placeholder="Observações clínicas sobre a sessão..."></textarea>
        </div>
        <div class="field" style="margin-bottom:14px;">
          <label>Plano</label>
          <textarea rows="2" id="s-plan" placeholder="Encaminhamentos e plano para próximas sessões..."></textarea>
        </div>
        <div class="field" style="margin-bottom:16px;">
          <label>Notas adicionais (opcional)</label>
          <textarea rows="3" id="s-free" placeholder="Qualquer outra anotação livre..."></textarea>
        </div>
        <div class="modal-actions" style="margin-top:0;">
          <button type="button" class="btn btn-ghost" id="cancel-session-form">Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar sessão</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('cancel-session-form').addEventListener('click', ()=>{ slot.innerHTML = ''; });

  document.getElementById('form-session').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const recordData = {
      clientId,
      date: document.getElementById('s-date').value || today,
      complaint: document.getElementById('s-complaint').value.trim(),
      interventions: document.getElementById('s-interventions').value.trim(),
      observations: document.getElementById('s-observations').value.trim(),
      plan: document.getElementById('s-plan').value.trim(),
      freeNotes: document.getElementById('s-free').value.trim(),
    };

    try{
      const created = await db.createSessionRecord(recordData);
      sessionRecords.unshift(created);
      slot.innerHTML = '';
      renderRecordsList(clientId);
      renderProntuarios();
      showToast('Sessão registrada no prontuário');
    } catch(err){
      console.error(err);
      submitBtn.disabled = false;
      showToast('Erro ao salvar sessão. Tente novamente.');
    }
  });
}

/* ============================================================
   PRONTUÁRIOS — COMPILADO GERAL
   ============================================================ */
function tryOpenCompilado(){
  document.getElementById('prontuario-list-view').style.display = 'none';
  document.getElementById('prontuario-detail-view').style.display = 'none';
  const compilado = document.getElementById('prontuario-compilado-view');
  compilado.style.display = 'block';

  renderPasswordGate(
    compilado,
    'o compilado geral de prontuários',
    renderCompiladoGeral,
    ()=> renderProntuarios()
  );
}

async function renderCompiladoGeral(){
  const compilado = document.getElementById('prontuario-compilado-view');
  compilado.innerHTML = `<div style="padding:60px; text-align:center; color:var(--ink-soft);">Carregando registros...</div>`;

  let allRecords;
  try{
    allRecords = await db.loadSessionRecords(); // sem filtro de cliente = todos
    sessionRecords = allRecords;
  } catch(err){
    console.error(err);
    compilado.innerHTML = `<div style="padding:60px; text-align:center; color:var(--alert);">Erro ao carregar prontuários. Tente novamente.</div>`;
    return;
  }

  const totalRecords = sessionRecords.length;

  let blocksHtml = '';
  clients.forEach(c=>{
    const records = sessionRecords
      .filter(r => r.clientId === c.id)
      .sort((a,b)=> b.date.localeCompare(a.date));
    if(records.length === 0) return;

    let recordsHtml = '';
    records.forEach(r=>{
      const dateLabel = new Date(r.date+'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'long', year:'numeric'});
      recordsHtml += `<div class="record-card">
        <div class="record-top"><span class="record-date">${dateLabel}</span></div>
        ${r.complaint ? `<div class="record-field"><div class="rf-label">Queixa principal</div><div class="rf-val">${escapeHtml(r.complaint)}</div></div>` : ''}
        ${r.interventions ? `<div class="record-field"><div class="rf-label">Intervenções</div><div class="rf-val">${escapeHtml(r.interventions)}</div></div>` : ''}
        ${r.observations ? `<div class="record-field"><div class="rf-label">Observações</div><div class="rf-val">${escapeHtml(r.observations)}</div></div>` : ''}
        ${r.plan ? `<div class="record-field"><div class="rf-label">Plano</div><div class="rf-val">${escapeHtml(r.plan)}</div></div>` : ''}
        ${r.freeNotes ? `<div class="record-field"><div class="rf-label">Notas adicionais</div><div class="rf-val">${escapeHtml(r.freeNotes)}</div></div>` : ''}
      </div>`;
    });

    blocksHtml += `<div class="compilado-client-block">
      <div class="compilado-client-header">
        <div class="client-avatar" style="background:${colorFor(c.name)};">${initials(c.name)}</div>
        <div>
          <div class="client-name">${escapeHtml(c.name)}</div>
          <div class="client-since">${records.length} ${records.length===1 ? 'registro' : 'registros'} de sessão</div>
        </div>
      </div>
      ${recordsHtml}
    </div>`;
  });

  if(totalRecords === 0){
    blocksHtml = `<div class="records-empty">Nenhum registro de sessão foi criado ainda em nenhum prontuário.</div>`;
  }

  compilado.innerHTML = `
    <div class="prontuario-header">
      <button class="back-btn" id="back-from-compilado">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
      </button>
      <div class="prontuario-id">
        <div>
          <h1>Compilado geral</h1>
          <p>${totalRecords} ${totalRecords===1 ? 'registro de sessão' : 'registros de sessão'} em todos os prontuários</p>
        </div>
      </div>
    </div>
    ${blocksHtml}
  `;

  document.getElementById('back-from-compilado').addEventListener('click', ()=> renderProntuarios());
}

/* ============================================================
   CONFIGURAÇÕES
   ============================================================ */
function renderConfiguracoes(){
  setupSettingsNav();
  renderSettingsPerfil();
  renderSettingsAparencia();
  renderSettingsAgenda();
  renderSettingsNotificacoes();
  renderSettingsConsultorio();
  renderSettingsMensagens();
  renderSettingsSeguranca();
  renderSettingsDados();
}

function setupSettingsNav(){
  document.querySelectorAll('.settings-nav-item').forEach(btn=>{
    btn.onclick = () => {
      document.querySelectorAll('.settings-nav-item').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.settings-tab-panel').forEach(p=> p.style.display = 'none');
      document.getElementById('settings-tab-'+btn.dataset.settingsTab).style.display = 'block';
      if(btn.dataset.settingsTab === 'seguranca') renderSettingsSeguranca();
    };
  });
}

/* ---------- Perfil ---------- */
function renderSettingsPerfil(){
  document.getElementById('set-name').value = profile.name;
  document.getElementById('set-role').value = profile.role;
  document.getElementById('set-initials').value = profile.initials;
  updateSettingsAvatarPreview();

  const fileInput = document.getElementById('avatar-file-input');
  const btnUpload = document.getElementById('btn-upload-photo');
  const btnRemove = document.getElementById('btn-remove-photo');

  btnUpload.onclick = () => fileInput.click();

  fileInput.onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    if(!file.type.startsWith('image/')){ showToast('Selecione um arquivo de imagem'); return; }
    if(file.size > 2 * 1024 * 1024){ showToast('Escolha uma imagem de até 2MB'); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const previousPhoto = profile.photoDataUrl;
      profile.photoDataUrl = ev.target.result;
      updateSettingsAvatarPreview();
      applyProfileToUI();
      try{
        await db.updateProfile({ photoDataUrl: profile.photoDataUrl });
        showToast('Foto atualizada');
      } catch(err){
        console.error(err);
        profile.photoDataUrl = previousPhoto;
        updateSettingsAvatarPreview();
        applyProfileToUI();
        showToast('Erro ao salvar foto. Tente novamente.');
      }
    };
    reader.readAsDataURL(file);
  };

  btnRemove.onclick = async () => {
    const previousPhoto = profile.photoDataUrl;
    profile.photoDataUrl = null;
    fileInput.value = '';
    updateSettingsAvatarPreview();
    applyProfileToUI();
    try{
      await db.updateProfile({ photoDataUrl: null });
      showToast('Foto removida');
    } catch(err){
      console.error(err);
      profile.photoDataUrl = previousPhoto;
      updateSettingsAvatarPreview();
      applyProfileToUI();
      showToast('Erro ao remover foto. Tente novamente.');
    }
  };

  const form = document.getElementById('form-settings-profile');
  const saveHint = document.getElementById('settings-save-hint');

  ['set-name','set-role','set-initials'].forEach(id=>{
    document.getElementById(id).oninput = () => {
      saveHint.classList.remove('saved');
      saveHint.innerHTML = 'Alterações não salvas';
    };
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = document.getElementById('set-name').value.trim();
    const role = document.getElementById('set-role').value.trim();
    let initialsVal = document.getElementById('set-initials').value.trim().toUpperCase();
    if(!name){ showToast('Informe seu nome'); return; }
    if(!initialsVal){ initialsVal = initials0FromName(name); }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    try{
      await db.updateProfile({ name, role: role || 'Profissional', initials: initialsVal.slice(0,2) });

      profile.name = name;
      profile.role = role || 'Profissional';
      profile.initials = initialsVal.slice(0,2);

      document.getElementById('set-initials').value = profile.initials;
      updateSettingsAvatarPreview();
      applyProfileToUI();

      saveHint.classList.add('saved');
      saveHint.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg> Salvo`;
      showToast('Perfil atualizado');
    } catch(err){
      console.error(err);
      showToast('Erro ao salvar perfil. Tente novamente.');
    } finally {
      submitBtn.disabled = false;
    }
  };

  /* ---------- Logo do atestado ---------- */
  updateCertificateLogoPreview();
  const certLogoInput = document.getElementById('certificate-logo-input');
  const btnUploadCertLogo = document.getElementById('btn-upload-certificate-logo');
  const btnRemoveCertLogo = document.getElementById('btn-remove-certificate-logo');

  btnUploadCertLogo.onclick = () => certLogoInput.click();

  certLogoInput.onchange = (e) => {
    const file = e.target.files[0];
    if(!file) return;
    if(!file.type.startsWith('image/')){ showToast('Selecione um arquivo de imagem'); return; }
    if(file.size > 2 * 1024 * 1024){ showToast('Escolha uma imagem de até 2MB'); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const previous = profile.certificateLogoUrl;
      profile.certificateLogoUrl = ev.target.result;
      updateCertificateLogoPreview();
      try{
        await db.updateProfile({ certificateLogoUrl: profile.certificateLogoUrl });
        showToast('Logo atualizada');
      } catch(err){
        console.error(err);
        profile.certificateLogoUrl = previous;
        updateCertificateLogoPreview();
        showToast('Erro ao salvar logo. Tente novamente.');
      }
    };
    reader.readAsDataURL(file);
  };

  btnRemoveCertLogo.onclick = async () => {
    const previous = profile.certificateLogoUrl;
    profile.certificateLogoUrl = null;
    certLogoInput.value = '';
    updateCertificateLogoPreview();
    try{
      await db.updateProfile({ certificateLogoUrl: null });
      showToast('Logo removida');
    } catch(err){
      console.error(err);
      profile.certificateLogoUrl = previous;
      updateCertificateLogoPreview();
      showToast('Erro ao remover logo. Tente novamente.');
    }
  };
}

function updateCertificateLogoPreview(){
  const preview = document.getElementById('certificate-logo-preview');
  const removeBtn = document.getElementById('btn-remove-certificate-logo');
  if(!preview) return;
  if(profile.certificateLogoUrl){
    preview.innerHTML = `<img src="${profile.certificateLogoUrl}" alt="Logo do atestado" style="object-fit:contain; padding:6px;">`;
    removeBtn.style.display = 'inline-flex';
  } else {
    preview.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>`;
    removeBtn.style.display = 'none';
  }
}

function initials0FromName(name){
  return name.split(' ').filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();
}

function updateSettingsAvatarPreview(){
  const preview = document.getElementById('settings-avatar-preview');
  const removeBtn = document.getElementById('btn-remove-photo');
  if(profile.photoDataUrl){
    preview.innerHTML = `<img src="${profile.photoDataUrl}" alt="Foto de perfil">`;
    removeBtn.style.display = 'inline-flex';
  } else {
    preview.textContent = document.getElementById('set-initials').value || profile.initials;
    removeBtn.style.display = 'none';
  }
}

/* ---------- Aparência ---------- */
function renderSettingsAparencia(){
  document.querySelectorAll('#theme-options .theme-option').forEach(opt=>{
    opt.classList.toggle('selected', opt.dataset.themeValue === appSettings.theme);
    opt.onclick = async () => {
      const previousTheme = appSettings.theme;
      appSettings.theme = opt.dataset.themeValue;
      document.querySelectorAll('#theme-options .theme-option').forEach(o=>o.classList.remove('selected'));
      opt.classList.add('selected');
      applyTheme();
      try{
        await db.updateProfile({ theme: appSettings.theme });
        showToast('Tema atualizado');
      } catch(err){
        console.error(err);
        appSettings.theme = previousTheme;
        applyTheme();
        showToast('Erro ao salvar tema. Tente novamente.');
      }
    };
  });
}

/* ---------- Agenda ---------- */
function renderSettingsAgenda(){
  document.getElementById('set-work-start').value = appSettings.agenda.workStart;
  document.getElementById('set-work-end').value = appSettings.agenda.workEnd;
  document.getElementById('set-session-duration').value = String(appSettings.agenda.sessionDuration);

  document.querySelectorAll('#set-work-days .radio-pill').forEach(pill=>{
    pill.classList.toggle('selected', appSettings.agenda.workDays.includes(pill.dataset.day));
    pill.onclick = () => {
      pill.classList.toggle('selected');
      const day = pill.dataset.day;
      if(pill.classList.contains('selected')){
        if(!appSettings.agenda.workDays.includes(day)) appSettings.agenda.workDays.push(day);
      } else {
        appSettings.agenda.workDays = appSettings.agenda.workDays.filter(d=>d!==day);
      }
    };
  });

  const form = document.getElementById('form-settings-agenda');
  const saveHint = document.getElementById('agenda-save-hint');

  [document.getElementById('set-work-start'), document.getElementById('set-work-end'), document.getElementById('set-session-duration')].forEach(el=>{
    el.oninput = () => { saveHint.classList.remove('saved'); saveHint.innerHTML = 'Alterações não salvas'; };
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const workStart = document.getElementById('set-work-start').value || '08:00';
    const workEnd = document.getElementById('set-work-end').value || '18:00';
    const sessionDuration = Number(document.getElementById('set-session-duration').value) || 50;

    try{
      await db.updateProfile({ workStart, workEnd, sessionDuration, workDays: appSettings.agenda.workDays });
      appSettings.agenda.workStart = workStart;
      appSettings.agenda.workEnd = workEnd;
      appSettings.agenda.sessionDuration = sessionDuration;

      saveHint.classList.add('saved');
      saveHint.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg> Salvo`;
      showToast('Preferências de agenda salvas');
    } catch(err){
      console.error(err);
      showToast('Erro ao salvar preferências. Tente novamente.');
    } finally {
      submitBtn.disabled = false;
    }
  };

  /* ---------- Limite de alerta de pacotes ---------- */
  document.getElementById('set-package-threshold').value = String(appSettings.packageAlertThreshold);
  const pkgForm = document.getElementById('form-settings-packages');
  const pkgSaveHint = document.getElementById('packages-save-hint');

  document.getElementById('set-package-threshold').oninput = () => {
    pkgSaveHint.classList.remove('saved');
    pkgSaveHint.innerHTML = 'Alterações não salvas';
  };

  pkgForm.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = pkgForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const threshold = Number(document.getElementById('set-package-threshold').value) || 2;

    try{
      await db.updateProfile({ packageAlertThreshold: threshold });
      appSettings.packageAlertThreshold = threshold;
      pkgSaveHint.classList.add('saved');
      pkgSaveHint.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg> Salvo`;
      showToast('Preferência de alerta salva');
      renderPackageAlert();
    } catch(err){
      console.error(err);
      showToast('Erro ao salvar preferência. Tente novamente.');
    } finally {
      submitBtn.disabled = false;
    }
  };
}

/* ---------- Notificações ---------- */
function renderSettingsNotificacoes(){
  const map = {
    'notif-session': { key:'session', field:'notifSession' },
    'notif-payment': { key:'payment', field:'notifPayment' },
    'notif-bills': { key:'bills', field:'notifBills' },
    'notif-weekly': { key:'weekly', field:'notifWeekly' },
  };
  Object.entries(map).forEach(([id, { key, field }])=>{
    const el = document.getElementById(id);
    el.checked = appSettings.notifications[key];
    el.onchange = async () => {
      const previousVal = appSettings.notifications[key];
      appSettings.notifications[key] = el.checked;
      try{
        await db.updateProfile({ [field]: el.checked });
        showToast(el.checked ? 'Notificação ativada' : 'Notificação desativada');
      } catch(err){
        console.error(err);
        appSettings.notifications[key] = previousVal;
        el.checked = previousVal;
        showToast('Erro ao salvar preferência. Tente novamente.');
      }
    };
  });
}

/* ---------- Consultório ---------- */
function renderSettingsConsultorio(){
  document.getElementById('set-address').value = appSettings.office.address;
  document.getElementById('set-default-value').value = appSettings.office.defaultValue;
  document.getElementById('set-pix').value = appSettings.office.pix;

  const form = document.getElementById('form-settings-office');
  const saveHint = document.getElementById('office-save-hint');

  ['set-address','set-default-value','set-pix'].forEach(id=>{
    document.getElementById(id).oninput = () => { saveHint.classList.remove('saved'); saveHint.innerHTML = 'Alterações não salvas'; };
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;

    const officeAddress = document.getElementById('set-address').value.trim();
    const defaultSessionValue = Number(document.getElementById('set-default-value').value) || 210;
    const pixKey = document.getElementById('set-pix').value.trim();

    try{
      await db.updateProfile({ officeAddress, defaultSessionValue, pixKey });
      appSettings.office.address = officeAddress;
      appSettings.office.defaultValue = defaultSessionValue;
      appSettings.office.pix = pixKey;

      saveHint.classList.add('saved');
      saveHint.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg> Salvo`;
      showToast('Dados do consultório salvos');
    } catch(err){
      console.error(err);
      showToast('Erro ao salvar dados. Tente novamente.');
    } finally {
      submitBtn.disabled = false;
    }
  };
}

/* ---------- Mensagens (templates editáveis) ---------- */

function setupTemplateEditor({ formId, textareaId, hintId, resetBtnId, placeholderListId, placeholders, templateKey }){
  const textarea = document.getElementById(textareaId);
  const hint = document.getElementById(hintId);
  const form = document.getElementById(formId);

  textarea.value = appSettings.messageTemplates[templateKey];

  const placeholderList = document.getElementById(placeholderListId);
  placeholderList.innerHTML = placeholders.map(p =>
    `<button type="button" class="template-placeholder-chip" data-insert="${p}">${p}</button>`
  ).join('');
  placeholderList.querySelectorAll('[data-insert]').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const insertText = chip.dataset.insert;
      const start = textarea.selectionStart, end = textarea.selectionEnd;
      textarea.value = textarea.value.slice(0,start) + insertText + textarea.value.slice(end);
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + insertText.length;
      hint.classList.remove('saved');
      hint.innerHTML = 'Alterações não salvas';
    });
  });

  textarea.oninput = () => { hint.classList.remove('saved'); hint.innerHTML = 'Alterações não salvas'; };

  const dbFieldMap = { charge: 'messageTemplateCharge', confirmation: 'messageTemplateConfirmation', package: 'messageTemplatePackage' };

  form.onsubmit = async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try{
      await db.updateProfile({ [dbFieldMap[templateKey]]: textarea.value });
      appSettings.messageTemplates[templateKey] = textarea.value;
      hint.classList.add('saved');
      hint.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg> Salvo`;
      showToast('Modelo de mensagem salvo');
    } catch(err){
      console.error(err);
      showToast('Erro ao salvar modelo. Tente novamente.');
    } finally {
      submitBtn.disabled = false;
    }
  };

  document.getElementById(resetBtnId).onclick = async () => {
    const btn = document.getElementById(resetBtnId);
    btn.disabled = true;
    try{
      await db.updateProfile({ [dbFieldMap[templateKey]]: DEFAULT_MESSAGE_TEMPLATES[templateKey] });
      textarea.value = DEFAULT_MESSAGE_TEMPLATES[templateKey];
      appSettings.messageTemplates[templateKey] = DEFAULT_MESSAGE_TEMPLATES[templateKey];
      hint.classList.add('saved');
      hint.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg> Salvo`;
      showToast('Modelo restaurado para o padrão');
    } catch(err){
      console.error(err);
      showToast('Erro ao restaurar modelo. Tente novamente.');
    } finally {
      btn.disabled = false;
    }
  };
}

function renderSettingsMensagens(){
  setupTemplateEditor({
    formId: 'form-template-charge', textareaId: 'tpl-charge', hintId: 'tpl-charge-hint',
    resetBtnId: 'tpl-charge-reset', placeholderListId: 'tpl-charge-placeholders',
    placeholders: TEMPLATE_PLACEHOLDERS_CHARGE, templateKey: 'charge'
  });
  setupTemplateEditor({
    formId: 'form-template-confirmation', textareaId: 'tpl-confirmation', hintId: 'tpl-confirmation-hint',
    resetBtnId: 'tpl-confirmation-reset', placeholderListId: 'tpl-confirmation-placeholders',
    placeholders: TEMPLATE_PLACEHOLDERS_CONFIRMATION, templateKey: 'confirmation'
  });
  setupTemplateEditor({
    formId: 'form-template-package', textareaId: 'tpl-package', hintId: 'tpl-package-hint',
    resetBtnId: 'tpl-package-reset', placeholderListId: 'tpl-package-placeholders',
    placeholders: TEMPLATE_PLACEHOLDERS_PACKAGE, templateKey: 'package'
  });
}

/* ---------- Segurança ---------- */
function renderSettingsSeguranca(){
  const statusText = document.getElementById('security-status-text');
  const actionArea = document.getElementById('security-action-area');

  if(!prontuarioPasswordIsSet){
    statusText.textContent = 'Nenhuma senha definida ainda. Ela será criada na primeira vez que você abrir um prontuário.';
    actionArea.innerHTML = '';
    return;
  }

  statusText.textContent = 'A área de Prontuários está protegida por senha.';
  actionArea.innerHTML = `<button class="btn btn-ghost btn-sm" id="btn-change-password">Trocar senha</button>`;

  document.getElementById('btn-change-password').onclick = () => {
    openChangePasswordModal();
  };
}

function openChangePasswordModal(){
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-overlay" id="overlay-change-pw">
      <div class="modal">
        <div class="modal-header">
          <h2>Trocar senha</h2>
          <button class="modal-close" id="close-change-pw">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <form id="form-change-pw">
          <div class="modal-body">
            <div class="field"><label>Senha atual</label><input type="password" id="cp-current" autocomplete="off"></div>
            <div class="field"><label>Nova senha</label><input type="password" id="cp-new" autocomplete="off"></div>
            <div class="field"><label>Confirme a nova senha</label><input type="password" id="cp-confirm" autocomplete="off"></div>
            <div class="password-error" id="cp-error"></div>
            <div class="modal-actions">
              <button type="button" class="btn btn-ghost" id="cancel-change-pw">Cancelar</button>
              <button type="submit" class="btn btn-primary">Salvar nova senha</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;
  document.getElementById('close-change-pw').addEventListener('click', closeModal);
  document.getElementById('cancel-change-pw').addEventListener('click', closeModal);
  document.getElementById('overlay-change-pw').addEventListener('click', (e)=>{ if(e.target.id==='overlay-change-pw') closeModal(); });

  document.getElementById('form-change-pw').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const current = document.getElementById('cp-current').value;
    const novaSenha = document.getElementById('cp-new').value;
    const confirm = document.getElementById('cp-confirm').value;
    const errorEl = document.getElementById('cp-error');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    if(novaSenha.length < 4){ errorEl.textContent = 'A nova senha deve ter ao menos 4 caracteres.'; return; }
    if(novaSenha !== confirm){ errorEl.textContent = 'As senhas não coincidem.'; return; }

    submitBtn.disabled = true;
    try{
      const isValid = await db.verifyProntuarioPassword(current);
      if(!isValid){ errorEl.textContent = 'Senha atual incorreta.'; submitBtn.disabled = false; return; }

      await db.setProntuarioPassword(novaSenha);
      closeModal();
      showToast('Senha atualizada');
    } catch(err){
      console.error(err);
      errorEl.textContent = 'Erro ao atualizar senha. Tente novamente.';
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Dados e backup ---------- */
function renderSettingsDados(){
  document.getElementById('btn-export-data').onclick = exportBackupJSON;
  document.getElementById('btn-clear-data').onclick = confirmClearAllData;
}

function exportBackupJSON(){
  const payload = {
    exportedAt: new Date().toISOString(),
    profile, appSettings,
    clients, appointments, payments, bills, sessionRecords, packages, certificates,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `alinha-backup-${isoDate(TODAY)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Backup baixado');
}

function confirmClearAllData(){
  document.getElementById('modal-root').innerHTML = `
    <div class="modal-overlay" id="overlay-clear-data">
      <div class="modal" style="max-width:380px;">
        <div class="modal-header">
          <h2>Limpar todos os dados?</h2>
          <button class="modal-close" id="close-clear-data">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div class="modal-body">
          <p style="font-size:13.5px; color:var(--ink-soft); line-height:1.5;">
            Isso vai apagar todos os clientes, consultas, prontuários e dados financeiros cadastrados nesta sessão. Essa ação não pode ser desfeita. Considere baixar um backup antes.
          </p>
          <div class="modal-actions" style="justify-content:space-between;">
            <button type="button" class="btn btn-ghost" id="cancel-clear-data">Cancelar</button>
            <button type="button" class="btn-danger-text" id="confirm-clear-data" style="font-weight:700;">Sim, apagar tudo</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('close-clear-data').addEventListener('click', closeModal);
  document.getElementById('cancel-clear-data').addEventListener('click', closeModal);
  document.getElementById('overlay-clear-data').addEventListener('click', (e)=>{ if(e.target.id==='overlay-clear-data') closeModal(); });
  document.getElementById('confirm-clear-data').addEventListener('click', async ()=>{
    const btn = document.getElementById('confirm-clear-data');
    btn.disabled = true;
    btn.textContent = 'Apagando...';
    try{
      await db.deleteAllUserData();
      clients = [];
      appointments = [];
      payments = [];
      bills = [];
      sessionRecords = [];
      packages = [];
      certificates = [];
      closeModal();
      renderClients();
      renderAgenda();
      renderPackageAlert();
      renderFinanceiro();
      showToast('Todos os dados foram apagados');
    } catch(err){
      console.error(err);
      btn.disabled = false;
      btn.textContent = 'Sim, apagar tudo';
      showToast('Erro ao apagar dados. Tente novamente.');
    }
  });
}

/* ============================================================
   INICIALIZAÇÃO
   ============================================================ */
async function initApp(){
  // 1. Garante que existe sessão ativa; senão, redireciona para login
  const session = await requireAuth();
  if(!session) return; // requireAuth já redireciona

  db.setCurrentUserId(session.user.id);

  // 2. Reage a logout em outra aba / expiração de sessão
  onAuthStateChange((event)=>{
    if(event === 'SIGNED_OUT'){
      window.location.href = '/login.html';
    }
  });

  // 3. Botão de logout
  document.getElementById('btn-logout').addEventListener('click', async ()=>{
    await signOut();
    window.location.href = '/login.html';
  });

  // 4. Carrega todos os dados do usuário
  try{
    await loadProfileAndSettings();
    await loadAllData();
  } catch(err){
    console.error('Erro ao carregar dados do app:', err);
    document.getElementById('app-loading').innerHTML = `
      <p style="color:var(--alert); max-width:320px; text-align:center;">
        Não foi possível carregar seus dados. Verifique sua conexão e recarregue a página.
      </p>
    `;
    return;
  }

  // 5. Aplica tema e perfil, renderiza as telas principais
  applyTheme();
  applyProfileToUI();
  renderAgenda();
  renderPackageAlert();
  renderClients();
  renderFinanceiro();

  // 6. Esconde a tela de carregamento e mostra o app
  document.getElementById('app-loading').style.display = 'none';
  document.querySelector('.app').classList.add('ready');
}

initApp();
