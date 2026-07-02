import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import Certificate
from app.schemas.schemas import CertificateCreate, CertificateOut

router = APIRouter(prefix="/certificates", tags=["certificates"])


def _to_out(c: Certificate) -> CertificateOut:
    return CertificateOut(
        id=c.id, client_id=c.client_id, client_name_snapshot=c.client_name_snapshot, issue_date=c.issue_date,
        content=c.content,
    )


@router.get("", response_model=list[CertificateOut], response_model_by_alias=True)
def list_certificates(user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    certs = db.query(Certificate).filter(Certificate.owner_id == user_id).order_by(Certificate.issue_date.desc()).all()
    return [_to_out(c) for c in certs]


@router.post("", response_model=CertificateOut, response_model_by_alias=True)
def create_certificate(
    body: CertificateCreate, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    cert = Certificate(
        owner_id=user_id, client_id=body.client_id, client_name_snapshot=body.client_name_snapshot,
        issue_date=body.issue_date, content=body.content,
    )
    db.add(cert)
    db.commit()
    db.refresh(cert)
    return _to_out(cert)


@router.put("/{certificate_id}", response_model=CertificateOut, response_model_by_alias=True)
def update_certificate(
    certificate_id: uuid.UUID, body: CertificateCreate, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    cert = db.query(Certificate).filter(Certificate.id == certificate_id, Certificate.owner_id == user_id).first()
    if not cert:
        raise HTTPException(404, "Atestado não encontrado")
    cert.client_id = body.client_id
    cert.client_name_snapshot = body.client_name_snapshot
    cert.issue_date = body.issue_date
    cert.content = body.content
    db.commit()
    db.refresh(cert)
    return _to_out(cert)


@router.delete("/{certificate_id}")
def delete_certificate(certificate_id: uuid.UUID, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    cert = db.query(Certificate).filter(Certificate.id == certificate_id, Certificate.owner_id == user_id).first()
    if cert:
        db.delete(cert)
        db.commit()
    return {"ok": True}
