"""Rate limit em memória, por processo — NÃO é robusto contra múltiplas instâncias
do backend nem sobrevive a um restart. É só uma resistência mínima para o endpoint
público de cadastro+assinatura (/billing/signup-and-subscribe), não uma solução
de produção completa. Se o backend algum dia rodar com mais de um worker/instância,
isto precisa virar um rate limit compartilhado (Redis, etc.)."""

import threading
import time

from fastapi import HTTPException

_lock = threading.Lock()
_attempts: dict[str, list[float]] = {}


def check_rate_limit(key: str, max_attempts: int = 10, window_seconds: int = 3600) -> None:
    now = time.time()
    with _lock:
        timestamps = [t for t in _attempts.get(key, []) if now - t < window_seconds]
        if len(timestamps) >= max_attempts:
            _attempts[key] = timestamps
            raise HTTPException(429, "Muitas tentativas. Aguarde um pouco antes de tentar de novo.")
        timestamps.append(now)
        _attempts[key] = timestamps
