"""Schemas Pydantic. Campos expostos em camelCase para bater com o formato
que `frontend-legacy/js/data.js` já usava (minimiza mudança do lado do frontend)."""

import datetime
import uuid

from pydantic import BaseModel, ConfigDict


def to_camel(snake: str) -> str:
    first, *rest = snake.split("_")
    return first + "".join(word.capitalize() for word in rest)


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---------- Profile ----------
class AgendaSettings(CamelModel):
    work_start: str
    work_end: str
    session_duration: int
    work_days: list[str]


class NotificationSettings(CamelModel):
    session: bool
    payment: bool
    bills: bool
    weekly: bool


class OfficeSettings(CamelModel):
    address: str
    cep: str
    cnpj: str
    default_value: float
    pix: str


class MessageTemplateSettings(CamelModel):
    charge: str
    confirmation: str
    package: str


class ProfileSettings(CamelModel):
    theme: str
    color_theme: str
    agenda: AgendaSettings
    notifications: NotificationSettings
    office: OfficeSettings
    message_templates: MessageTemplateSettings
    has_prontuario_password: bool
    certificate_logo_url: str | None
    package_alert_threshold: int


class ProfileOut(CamelModel):
    name: str
    role: str
    initials: str
    photo_data_url: str | None
    settings: ProfileSettings


class ProfileUpdate(CamelModel):
    name: str | None = None
    role: str | None = None
    initials: str | None = None
    photo_data_url: str | None = None
    theme: str | None = None
    color_theme: str | None = None
    work_start: str | None = None
    work_end: str | None = None
    session_duration: int | None = None
    work_days: list[str] | None = None
    notif_session: bool | None = None
    notif_payment: bool | None = None
    notif_bills: bool | None = None
    notif_weekly: bool | None = None
    office_address: str | None = None
    office_cep: str | None = None
    cnpj: str | None = None
    default_session_value: float | None = None
    pix_key: str | None = None
    message_template_charge: str | None = None
    message_template_confirmation: str | None = None
    message_template_package: str | None = None
    certificate_logo_url: str | None = None
    package_alert_threshold: int | None = None


class ProntuarioPasswordIn(CamelModel):
    password: str


# ---------- Clients ----------
class ClientBase(CamelModel):
    name: str
    phone: str = ""
    email: str = ""
    frequency: str = "Semanal"
    day: str = "-"
    time: str = "-"
    modality: str = "Presencial"
    value: float
    status: str = "ativo"
    notes: str = ""
    cpf: str = ""
    address: str = ""
    session_duration: int | None = None


class ClientCreate(ClientBase):
    pass


class ClientOut(ClientBase):
    id: uuid.UUID
    since: datetime.date


class ClientStatusIn(CamelModel):
    status: str


# ---------- Appointments ----------
class AppointmentBase(CamelModel):
    client_id: uuid.UUID
    date_iso: datetime.date
    time: str
    status: str = "confirmed"
    modality: str = "Presencial"
    recurrence_id: str | None = None


class AppointmentCreate(AppointmentBase):
    pass


class AppointmentOut(AppointmentBase):
    id: uuid.UUID


class AppointmentStatusUpdate(CamelModel):
    status: str


# ---------- Payments ----------
class PaymentUpsert(CamelModel):
    client_id: uuid.UUID
    reference_month_iso: datetime.date
    sessions: int
    status: str
    open_since_iso: datetime.date | None = None


class PaymentOut(CamelModel):
    id: uuid.UUID
    client_id: uuid.UUID
    sessions: int
    status: str
    open_since: int | None


class PaymentTransactionCreate(CamelModel):
    client_id: uuid.UUID
    reference_month_iso: datetime.date
    amount: float
    payment_date: datetime.date
    payment_method: str = "PIX"
    notes: str = ""


class PaymentTransactionOut(CamelModel):
    id: uuid.UUID
    client_id: uuid.UUID
    reference_month: datetime.date
    amount: float
    payment_date: datetime.date
    payment_method: str
    notes: str


class ClientFinanceOut(CamelModel):
    client_id: uuid.UUID
    reference_month: datetime.date
    sessions: int
    due: float
    received: float
    credit_applied: float
    balance: float
    status: str


class FinanceSummaryOut(CamelModel):
    total_recebido: float
    total_aberto: float
    total_sessoes: int
    ticket_medio: float


# ---------- Client credits ----------
class ClientCreditOut(CamelModel):
    client_id: uuid.UUID
    balance: float


class ClientCreditSet(CamelModel):
    balance: float


# ---------- Bills ----------
class BillBase(CamelModel):
    name: str
    category: str = "Outros"
    amount: float
    due_date: datetime.date
    status: str = "a-pagar"
    series_id: str | None = None
    is_fixed: bool = False


class BillCreate(BillBase):
    pass


class BillOut(BillBase):
    id: uuid.UUID


class BillStatusUpdate(CamelModel):
    status: str


# ---------- Session records ----------
class SessionRecordBase(CamelModel):
    client_id: uuid.UUID
    date: datetime.date
    complaint: str = ""
    interventions: str = ""
    observations: str = ""
    plan: str = ""
    free_notes: str = ""


class SessionRecordCreate(SessionRecordBase):
    pass


class SessionRecordOut(SessionRecordBase):
    id: uuid.UUID


# ---------- Packages ----------
class PackageBase(CamelModel):
    client_id: uuid.UUID
    name: str = "Pacote de sessões"
    total_sessions: int
    used_sessions: int = 0
    start_date: datetime.date
    end_date: datetime.date | None = None
    value: float | None = None
    status: str = "ativo"


class PackageCreate(PackageBase):
    pass


class PackageOut(PackageBase):
    id: uuid.UUID


# ---------- Certificates ----------
class CertificateBase(CamelModel):
    client_id: uuid.UUID | None = None
    client_name_snapshot: str | None = None
    issue_date: datetime.date
    content: str


class CertificateCreate(CertificateBase):
    pass


class CertificateOut(CertificateBase):
    id: uuid.UUID
