"""Independent X4 XSD controls; read-only corpus, no game or mod writes."""
import hashlib
import json
import os
from pathlib import Path
from lxml import etree

root = Path(os.environ['X4_REFERENCE_ROOT'])
schemas = {name: etree.XMLSchema(etree.parse(str(root / 'libraries' / f'{name}.xsd')))
           for name in ('md', 'aiscripts')}
safe = '<get_safe_pos result="$pos" sector="$sector" object="$sector" min="1km" max="2km" radius="1m" allowyaxis="true"/>'
md = lambda actions: f'<mdscript name="ForgeLab"><cues><cue name="Init"><actions>{actions}</actions></cue></cues></mdscript>'
ai = lambda actions: f'<aiscript name="forge_lab" version="1"><attention min="unknown"><actions>{actions}</actions></attention></aiscript>'
cases = [
    ('aiscript get_safe_pos', 'aiscripts', ai(safe), True),
    ('aiscript unknown action', 'aiscripts', ai('<forge_invalid_action/>'), False),
    ('aiscript illegal attribute', 'aiscripts', ai(safe.replace('allowyaxis="true"', 'forge_invalid="true"')), False),
    ('MD legal debug action', 'md', md('<debug_text text="0"/>'), True),
    ('MD delay is not an action', 'md', md('<delay exact="1s"/>'), False),
    ('products guard is schema legal', 'md', md('<do_if value="$Station.products?"/>'), True),
    ('cancel target disjunction is not enforced by XSD', 'md', md('<cancel_conversation/>'), True),
]
checks = []
for name, domain, source, expected in cases:
    actual = schemas[domain].validate(etree.fromstring(source.encode()))
    checks.append(dict(name=name, pass_=actual == expected, valid=actual, expected=expected,
                       diagnostics=[str(e) for e in schemas[domain].error_log]))
counts = {}
for folder in ('md', 'aiscripts'):
    counts[folder] = sum(len(etree.parse(str(p)).xpath('//get_safe_pos')) for p in (root / folder).glob('*.xml'))
proof = dict(passed=all(c['pass_'] for c in checks), checks=checks, vanillaSafePosCounts=counts,
             authorityHashes={str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                              for p in [root / 'libraries' / f'{n}.xsd' for n in ('md', 'aiscripts', 'common')]})
print(json.dumps(proof, indent=2))
raise SystemExit(0 if proof['passed'] else 1)
