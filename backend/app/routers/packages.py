import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.auth import get_current_user_id
from app.core.database import get_db
from app.models.models import Package
from app.schemas.schemas import PackageCreate, PackageOut

router = APIRouter(prefix="/packages", tags=["packages"])


def _to_out(p: Package) -> PackageOut:
    return PackageOut(
        id=p.id, client_id=p.client_id, name=p.name, total_sessions=p.total_sessions, used_sessions=p.used_sessions,
        start_date=p.start_date, end_date=p.end_date, value=float(p.value) if p.value is not None else None,
        status=p.status,
    )


@router.get("", response_model=list[PackageOut], response_model_by_alias=True)
def list_packages(user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    packages = db.query(Package).filter(Package.owner_id == user_id).order_by(Package.start_date.desc()).all()
    return [_to_out(p) for p in packages]


@router.post("", response_model=PackageOut, response_model_by_alias=True)
def create_package(body: PackageCreate, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    pkg = Package(
        owner_id=user_id, client_id=body.client_id, name=body.name, total_sessions=body.total_sessions,
        used_sessions=body.used_sessions, start_date=body.start_date, end_date=body.end_date, value=body.value,
        status=body.status,
    )
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return _to_out(pkg)


@router.put("/{package_id}", response_model=PackageOut, response_model_by_alias=True)
def update_package(
    package_id: uuid.UUID, body: PackageCreate, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)
):
    pkg = db.query(Package).filter(Package.id == package_id, Package.owner_id == user_id).first()
    if not pkg:
        raise HTTPException(404, "Pacote não encontrado")
    pkg.name = body.name
    pkg.total_sessions = body.total_sessions
    pkg.used_sessions = body.used_sessions
    pkg.start_date = body.start_date
    pkg.end_date = body.end_date
    pkg.value = body.value
    pkg.status = body.status
    db.commit()
    db.refresh(pkg)
    return _to_out(pkg)


@router.delete("/{package_id}")
def delete_package(package_id: uuid.UUID, user_id: uuid.UUID = Depends(get_current_user_id), db: Session = Depends(get_db)):
    pkg = db.query(Package).filter(Package.id == package_id, Package.owner_id == user_id).first()
    if pkg:
        db.delete(pkg)
        db.commit()
    return {"ok": True}
