"""Validadores puros (sem I/O), fáceis de testar isoladamente."""

import re


def _check_digit(digits: list[int], weights: list[int]) -> int:
    total = sum(d * w for d, w in zip(digits, weights))
    remainder = total % 11
    return 0 if remainder < 2 else 11 - remainder


def _valid_cpf(digits: str) -> bool:
    if len(set(digits)) == 1:
        return False
    nums = [int(d) for d in digits]
    dv1 = _check_digit(nums[:9], list(range(10, 1, -1)))
    dv2 = _check_digit(nums[:9] + [dv1], list(range(11, 1, -1)))
    return nums[9] == dv1 and nums[10] == dv2


def _valid_cnpj(digits: str) -> bool:
    if len(set(digits)) == 1:
        return False
    nums = [int(d) for d in digits]
    weights1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    weights2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    dv1 = _check_digit(nums[:12], weights1)
    dv2 = _check_digit(nums[:12] + [dv1], weights2)
    return nums[12] == dv1 and nums[13] == dv2


def is_valid_cpf_cnpj(value: str) -> bool:
    """Valida dígito verificador de CPF (11 dígitos) ou CNPJ (14 dígitos).
    Aceita o valor com ou sem pontuação."""
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 11:
        return _valid_cpf(digits)
    if len(digits) == 14:
        return _valid_cnpj(digits)
    return False
