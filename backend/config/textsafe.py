"""Plain-text clean-up for things people type that are stored and shown again.

Everything is escaped when shown (React on the website, Django templates in
the admin), so this is a second layer: control characters are removed and,
for short labels, angle brackets too, so markup is never stored at all.
"""

import re

# Control characters except tab, newline and carriage return (written as
# escapes, so the file itself stays plain text).
CONTROL = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')


def clean_text(value, max_len, allow_markup_chars=False):
    """A trimmed, length-limited string without control characters."""
    text = CONTROL.sub('', str(value or '')).strip()
    if not allow_markup_chars:
        text = text.replace('<', '').replace('>', '')
    return text[:max_len]
