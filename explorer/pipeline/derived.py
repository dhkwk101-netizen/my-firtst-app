import math
from decimal import Decimal, InvalidOperation


def calculate_per_capita(tax: Decimal | None, population: Decimal | None) -> Decimal | None:
    if tax is None or population is None:
        return None
    try:
        if population <= 0:
            return None
        return tax / population
    except (InvalidOperation, ZeroDivisionError):
        return None


def calculate_yoy(current: Decimal | None, previous: Decimal | None) -> Decimal | None:
    if current is None or previous is None:
        return None
    try:
        if previous <= 0:
            return None
        return ((current - previous) / previous) * Decimal("100")
    except (InvalidOperation, ZeroDivisionError):
        return None


def calculate_cagr(first: Decimal | None, last: Decimal | None, year_distance: int) -> Decimal | None:
    if first is None or last is None or year_distance <= 0:
        return None
    try:
        if first <= 0 or last <= 0:
            return None
        ratio = float(last / first)
        cagr_val = (math.pow(ratio, 1.0 / year_distance) - 1.0) * 100.0
        return Decimal(str(round(cagr_val, 6)))
    except (ValueError, ZeroDivisionError, OverflowError, InvalidOperation):
        return None
