"""Vietnam phone extraction shared by Facebook comments and CRM leads."""

import re


PHONE_CANDIDATE_RE = re.compile(r'(?<!\d)(?:(?:\+|00)?84|0)(?:[\s.\-()]?\d){8,10}(?!\d)')
VIETNAM_MOBILE_RE = re.compile(r'^0(?:3|5|7|8|9)\d{8}$')
VIETNAM_LANDLINE_RE = re.compile(r'^02\d{8,9}$')


def normalize_phone(raw: str) -> str:
    digits = re.sub(r'\D', '', raw or '')
    if digits.startswith('0084'):
        digits = f'0{digits[4:]}'
    elif digits.startswith('84'):
        digits = f'0{digits[2:]}'
    if VIETNAM_MOBILE_RE.fullmatch(digits) or VIETNAM_LANDLINE_RE.fullmatch(digits):
        return digits
    return ''


def extract_phones(text: str) -> list[str]:
    seen: set[str] = set()
    phones: list[str] = []
    for match in PHONE_CANDIDATE_RE.finditer(text or ''):
        phone = normalize_phone(match.group())
        if phone and phone not in seen:
            seen.add(phone)
            phones.append(phone)
    return phones
