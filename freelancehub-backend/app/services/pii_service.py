import json
import os
import re


SYSTEM_PROMPT = """Tu es un filtre de securite pour une plateforme freelance.
Analyse le message et detecte toute donnee personnelle (PII).

Detecte :
- Adresse email (ex: jean@gmail.com, 'mon mail c est jean arobase gmail point com')
- Numero de telephone (tous formats : +213, 06, 07...)
- Nom complet (prenom + nom ensemble)
- Numero de carte bancaire ou IBAN
- Adresse postale
- Liens externes et comptes sociaux : site web, WhatsApp, Telegram, LinkedIn, Instagram...
- Tentatives de contournement en langage naturel

Reponds UNIQUEMENT en JSON valide, sans texte autour :
{
  "contains_pii": true | false,
  "pii_types": ["email", "phone", "name", ...],
  "explanation": "Explication courte en francais pour l'utilisateur",
  "severity": "low" | "medium" | "high"
}"""

EMAIL_RE = re.compile(
    r'\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b',
    re.IGNORECASE,
)
OBFUSCATED_EMAIL_RE = re.compile(
    r'\b[\w.+-]+\s*(?:point|dot|\.)\s*[\w.+-]+\s*(?:arobase|at|@)\s*[\w.-]+\b'
    r'|\b[\w.+-]+\s*(?:arobase|at)\s*[\w.-]+\s*(?:point|dot)\s*[a-z]{2,}\b',
    re.IGNORECASE,
)
GMAIL_OBFUSCATED_RE = re.compile(
    r'\b[\w.+-]+\s*(?:arobase|at|@)\s*(?:g\s*mail|gmail|google\s*mail)\s*(?:point|dot|\.)\s*com\b',
    re.IGNORECASE,
)
PHONE_RE = re.compile(
    r'(?<!\w)(?:\+?\d[\d\s().-]{7,}\d|0[567]\s*(?:[\s.-]?\d{2}){4})(?!\w)'
)
PHONE_WORD_RE = re.compile(
    r'\b(?:zero|z[eé]ro|un|one|deux|two|trois|three|quatre|four|cinq|five|six|sept|seven|huit|eight|neuf|nine|'
    r'double|triple|plus)\b(?:[\s,.-]+(?:zero|z[eé]ro|un|one|deux|two|trois|three|quatre|four|cinq|five|six|'
    r'sept|seven|huit|eight|neuf|nine|double|triple)){5,}',
    re.IGNORECASE,
)
URL_RE = re.compile(
    r'(?<!@)\b(?:https?://|www\.)[^\s<>()]+'
    r'|(?<!@)\b[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:com|net|org|io|co|fr|dz|tn|ma|ly|me|dev|app|ai|info|biz)\b(?:/[^\s<>()]*)?',
    re.IGNORECASE,
)
SOCIAL_LINK_RE = re.compile(
    r'\b(?:https?://|www\.)?\S*(?:wa\.me|whatsapp|telegram|t\.me|linkedin|instagram|insta|facebook|fb\.com|snapchat)\S*\b',
    re.IGNORECASE,
)
SOCIAL_HANDLE_RE = re.compile(
    r'\b(?:instagram|insta|telegram|linkedin|facebook|snapchat|tiktok|twitter|whatsapp)\b\s*[:/@-]*\s*@?[a-z0-9_.-]{3,30}\b'
    r'|(?<!\w)@[a-z0-9_.]{3,30}\b',
    re.IGNORECASE,
)
IBAN_RE = re.compile(r'\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b', re.IGNORECASE)
CARD_RE = re.compile(r'\b(?:\d[ -]*?){13,19}\b')


def _looks_like_card_number(value: str) -> bool:
    digits = re.sub(r'\D', '', value)
    if not 13 <= len(digits) <= 19:
        return False

    total = 0
    reverse_digits = digits[::-1]
    for index, digit in enumerate(reverse_digits):
        number = int(digit)
        if index % 2 == 1:
            number *= 2
            if number > 9:
                number -= 9
        total += number
    return total % 10 == 0


def _rule_based_analysis(text: str) -> dict:
    pii_types = []

    def add(kind: str) -> None:
        if kind not in pii_types:
            pii_types.append(kind)

    if EMAIL_RE.search(text) or OBFUSCATED_EMAIL_RE.search(text) or GMAIL_OBFUSCATED_RE.search(text):
        add('email')
    if PHONE_RE.search(text) or PHONE_WORD_RE.search(text):
        add('phone')
    if URL_RE.search(text) or SOCIAL_LINK_RE.search(text):
        add('link')
    if SOCIAL_HANDLE_RE.search(text):
        add('social')
    if IBAN_RE.search(text):
        add('iban')
    if any(_looks_like_card_number(match.group(0)) for match in CARD_RE.finditer(text)):
        add('card')

    if not pii_types:
        return _empty_result()

    severity = 'high' if any(kind in pii_types for kind in ['email', 'phone', 'iban', 'card']) else 'medium'
    labels = {
        'email': 'une adresse email',
        'phone': 'un numero de telephone',
        'link': 'un lien externe ou reseau social',
        'social': 'un compte social',
        'iban': 'un IBAN',
        'card': 'un numero de carte bancaire',
    }
    found = ', '.join(labels.get(kind, kind) for kind in pii_types)
    return {
        'contains_pii': True,
        'pii_types': pii_types,
        'explanation': f'Votre message contient {found}. Pour votre securite, gardez les echanges sur la plateforme.',
        'severity': severity,
    }


def _client():
    from openai import OpenAI

    return OpenAI(
        api_key=os.getenv('GROQ_API_KEY'),
        base_url='https://api.groq.com/openai/v1',
    )


def _empty_result() -> dict:
    return {
        'contains_pii': False,
        'pii_types': [],
        'explanation': '',
        'severity': 'none',
    }


def analyze_message(text: str) -> dict:
    rule_result = _rule_based_analysis(text or '')
    if rule_result.get('contains_pii'):
        return rule_result

    if not os.getenv('GROQ_API_KEY'):
        print('[PII Error] GROQ_API_KEY is missing')
        return _empty_result()

    try:
        response = _client().chat.completions.create(
            model='llama-3.3-70b-versatile',
            max_tokens=300,
            temperature=0,
            messages=[
                {'role': 'system', 'content': SYSTEM_PROMPT},
                {'role': 'user', 'content': text},
            ],
        )
        raw = response.choices[0].message.content.strip()
        raw = raw.removeprefix('```json').removeprefix('```')
        raw = raw.removesuffix('```').strip()
        result = json.loads(raw)
        return {
            'contains_pii': bool(result.get('contains_pii')),
            'pii_types': result.get('pii_types') or [],
            'explanation': result.get('explanation') or '',
            'severity': result.get('severity') or 'none',
        }
    except json.JSONDecodeError:
        return _empty_result()
    except Exception as exc:
        print(f'[PII Error] {exc}')
        return _empty_result()


def pii_error_response(analysis: dict) -> dict:
    return {
        'error': analysis.get('explanation') or 'Votre message contient des coordonnees personnelles.',
        'code': 'PII_DETECTED',
        'pii': {
            'contains_pii': True,
            'pii_types': analysis.get('pii_types') or [],
            'severity': analysis.get('severity') or 'medium',
        },
    }
