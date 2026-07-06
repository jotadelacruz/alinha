import uuid

from sqlalchemy import (
    ARRAY,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    Text,
    Time,
    func,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    name: Mapped[str] = mapped_column(Text, default="")
    role: Mapped[str] = mapped_column(Text, default="Profissional")
    photo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    initials: Mapped[str | None] = mapped_column(Text, default="")
    theme: Mapped[str] = mapped_column(Text, default="light")
    color_theme: Mapped[str] = mapped_column(Text, default="azul")
    work_start: Mapped[str] = mapped_column(Time, default="08:00:00")
    work_end: Mapped[str] = mapped_column(Time, default="18:00:00")
    session_duration: Mapped[int] = mapped_column(Integer, default=50)
    work_days: Mapped[list[str]] = mapped_column(ARRAY(Text))
    notif_session: Mapped[bool] = mapped_column(Boolean, default=True)
    notif_payment: Mapped[bool] = mapped_column(Boolean, default=True)
    notif_bills: Mapped[bool] = mapped_column(Boolean, default=True)
    notif_weekly: Mapped[bool] = mapped_column(Boolean, default=False)
    office_address: Mapped[str | None] = mapped_column(Text, default="")
    office_cep: Mapped[str | None] = mapped_column(Text, nullable=True)
    cnpj: Mapped[str | None] = mapped_column(Text, nullable=True)
    default_session_value: Mapped[float] = mapped_column(Numeric, default=210)
    pix_key: Mapped[str | None] = mapped_column(Text, default="")
    message_template_charge: Mapped[str] = mapped_column(Text, default="")
    message_template_confirmation: Mapped[str] = mapped_column(Text, default="")
    message_template_package: Mapped[str] = mapped_column(Text, default="")
    prontuario_password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    certificate_logo_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    package_alert_threshold: Mapped[int] = mapped_column(Integer, default=2)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    name: Mapped[str] = mapped_column(Text)
    phone: Mapped[str | None] = mapped_column(Text, default="")
    email: Mapped[str | None] = mapped_column(Text, default="")
    since: Mapped[object] = mapped_column(Date)
    frequency: Mapped[str] = mapped_column(Text, default="Semanal")
    fixed_day: Mapped[str | None] = mapped_column(Text, nullable=True)
    fixed_time: Mapped[object | None] = mapped_column(Time, nullable=True)
    modality: Mapped[str] = mapped_column(Text, default="Presencial")
    session_value: Mapped[float] = mapped_column(Numeric, default=210)
    status: Mapped[str] = mapped_column(Text, default="ativo")
    notes: Mapped[str | None] = mapped_column(Text, default="")
    cpf: Mapped[str | None] = mapped_column(Text, nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    session_duration: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"))
    appointment_date: Mapped[object] = mapped_column(Date)
    appointment_time: Mapped[object] = mapped_column(Time)
    status: Mapped[str] = mapped_column(Text, default="confirmed")
    modality: Mapped[str] = mapped_column(Text, default="Presencial")
    recurrence_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Payment(Base):
    __tablename__ = "payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"))
    reference_month: Mapped[object] = mapped_column(Date)
    sessions_count: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(Text, default="aberto")
    open_since_date: Mapped[object | None] = mapped_column(Date, nullable=True)
    paid_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PaymentTransaction(Base):
    __tablename__ = "payment_transactions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"))
    reference_month: Mapped[object] = mapped_column(Date)
    amount: Mapped[float] = mapped_column(Numeric)
    payment_date: Mapped[object] = mapped_column(Date)
    payment_method: Mapped[str] = mapped_column(Text, default="PIX")
    notes: Mapped[str | None] = mapped_column(Text, default="")
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ClientCredit(Base):
    __tablename__ = "client_credits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"))
    balance: Mapped[float] = mapped_column(Numeric, default=0)
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Bill(Base):
    __tablename__ = "bills"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    name: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text, default="Outros")
    amount: Mapped[float] = mapped_column(Numeric)
    due_date: Mapped[object] = mapped_column(Date)
    status: Mapped[str] = mapped_column(Text, default="a-pagar")
    series_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_fixed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SessionRecord(Base):
    __tablename__ = "session_records"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"))
    session_date: Mapped[object] = mapped_column(Date)
    complaint: Mapped[str | None] = mapped_column(Text, default="")
    interventions: Mapped[str | None] = mapped_column(Text, default="")
    observations: Mapped[str | None] = mapped_column(Text, default="")
    plan: Mapped[str | None] = mapped_column(Text, default="")
    free_notes: Mapped[str | None] = mapped_column(Text, default="")
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Package(Base):
    __tablename__ = "packages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"))
    name: Mapped[str] = mapped_column(Text, default="Pacote de sessões")
    total_sessions: Mapped[int] = mapped_column(Integer)
    used_sessions: Mapped[int] = mapped_column(Integer, default=0)
    start_date: Mapped[object] = mapped_column(Date)
    end_date: Mapped[object | None] = mapped_column(Date, nullable=True)
    value: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    status: Mapped[str] = mapped_column(Text, default="ativo")
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Certificate(Base):
    __tablename__ = "certificates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    client_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"), nullable=True)
    client_name_snapshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    issue_date: Mapped[object] = mapped_column(Date)
    content: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ProntuarioAccessLog(Base):
    """LGPD: registro de auditoria de acesso a prontuário (não existe no schema legado)."""

    __tablename__ = "prontuario_access_log"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("profiles.id"))
    client_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clients.id"))
    action: Mapped[str] = mapped_column(Text)  # 'view' | 'create' | 'update' | 'delete' | 'password_verify_failed'
    session_record_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    created_at: Mapped[object] = mapped_column(DateTime(timezone=True), server_default=func.now())
