import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.routers import (
    admin,
    appointments,
    bills,
    certificates,
    clients,
    data,
    packages,
    payments,
    profile,
    receipts,
    session_records,
)

logger = logging.getLogger("alinha")

app = FastAPI(title="Alinha API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # Sem isto, exceções não tratadas escapam do CORSMiddleware e o navegador
    # reporta "Failed to fetch" em vez do erro 500 de verdade.
    logger.exception("Erro não tratado em %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Erro interno do servidor"})

app.include_router(profile.router)
app.include_router(clients.router)
app.include_router(appointments.router)
app.include_router(payments.router)
app.include_router(bills.router)
app.include_router(session_records.router)
app.include_router(packages.router)
app.include_router(certificates.router)
app.include_router(receipts.router)
app.include_router(admin.router)
app.include_router(data.router)


@app.get("/health")
def health():
    return {"status": "ok"}
