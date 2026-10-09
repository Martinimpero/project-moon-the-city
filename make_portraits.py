"""Draws a small emblem portrait (SVG) for every Threat in the library: a silhouette on a background in the colour of its Sin, with a mark that says
what it is (a hood, a badge, a flask...) and pips for how dangerous it is (the dice tier: Grade 9-8, 7-5, 4-2, 1). These are stand-ins, not illustrations:
replace any file in portraits/ with your own picture of the same name (SVG or PNG renamed) and the app uses it. Run from the webapp folder:
    python make_portraits.py
It reads the templates from js/threatdata.mjs and writes portraits/threat-<id>.svg."""
import json, pathlib, re

here = pathlib.Path(__file__).parent
data = json.loads(re.search(r"THREATS = (\[.*\]);", (here / "js/threatdata.mjs").read_text(encoding="utf-8"), re.S).group(1))
out = here / "portraits"; out.mkdir(exist_ok=True)

SIN = {"wrath": "#b3243a", "lust": "#d4472c", "sloth": "#d38a1c", "gluttony": "#2f9a57", "gloom": "#2f7fc4", "pride": "#4a47b5", "envy": "#8b4fc2", "": "#667085"}
INK = "#0d0e13"; LIGHT = "#f1e8cf"; GOLD = "#c9a227"

# marks: each is a small SVG fragment in the 160 x 200 picture, drawn over the silhouette. (Head centre is (80, 84), radius 30.)
M = {
 "hood": f'<path d="M44 96 Q46 44 80 40 Q114 44 116 96 Q98 70 80 70 Q62 70 44 96Z" fill="{INK}" stroke="{LIGHT}" stroke-width="2"/>',
 "cap": f'<path d="M50 78 Q54 50 80 50 Q106 50 110 78Z" fill="{INK}" stroke="{LIGHT}" stroke-width="2"/><rect x="48" y="76" width="64" height="7" rx="3" fill="{LIGHT}"/>',
 "brimhat": f'<ellipse cx="80" cy="66" rx="48" ry="9" fill="{INK}" stroke="{LIGHT}" stroke-width="2"/><path d="M56 66 Q58 38 80 38 Q102 38 104 66Z" fill="{INK}" stroke="{LIGHT}" stroke-width="2"/>',
 "helmet": f'<path d="M48 82 Q50 44 80 44 Q110 44 112 82Z" fill="{LIGHT}" stroke="{INK}" stroke-width="2"/><rect x="74" y="44" width="12" height="38" fill="{INK}" opacity=".35"/>',
 "visor": f'<path d="M50 80 Q52 46 80 46 Q108 46 110 80Z" fill="{INK}" stroke="{LIGHT}" stroke-width="2"/><rect x="56" y="70" width="48" height="10" rx="4" fill="{LIGHT}"/>',
 "glasses": f'<circle cx="68" cy="84" r="10" fill="none" stroke="{LIGHT}" stroke-width="3"/><circle cx="92" cy="84" r="10" fill="none" stroke="{LIGHT}" stroke-width="3"/><path d="M78 84 H82" stroke="{LIGHT}" stroke-width="3"/>',
 "goggles": f'<rect x="52" y="74" width="56" height="20" rx="10" fill="{LIGHT}" opacity=".9"/><circle cx="68" cy="84" r="7" fill="{INK}"/><circle cx="92" cy="84" r="7" fill="{INK}"/>',
 "monocle": f'<circle cx="92" cy="84" r="11" fill="none" stroke="{GOLD}" stroke-width="3"/><path d="M92 95 Q96 120 88 132" fill="none" stroke="{GOLD}" stroke-width="2"/>',
 "mask": f'<path d="M56 86 Q80 112 104 86 L104 104 Q80 124 56 104Z" fill="{LIGHT}" stroke="{INK}" stroke-width="2"/>',
 "cross": f'<rect x="73" y="132" width="14" height="40" rx="3" fill="{LIGHT}"/><rect x="60" y="145" width="40" height="14" rx="3" fill="{LIGHT}"/>',
 "badge": f'<path d="M96 138 L108 142 L108 158 Q108 168 96 174 Q84 168 84 158 L84 142Z" fill="{GOLD}" stroke="{INK}" stroke-width="2"/>',
 "star": f'<path d="M96 134 L100 146 L113 146 L103 154 L107 167 L96 159 L85 167 L89 154 L79 146 L92 146Z" fill="{GOLD}" stroke="{INK}" stroke-width="1.5"/>',
 "crown": f'<path d="M52 52 L62 30 L80 46 L98 30 L108 52Z" fill="{GOLD}" stroke="{INK}" stroke-width="2"/>',
 "knife": f'<path d="M112 150 L136 112 L142 118 L120 158Z" fill="{LIGHT}" stroke="{INK}" stroke-width="2"/><rect x="108" y="150" width="14" height="8" transform="rotate(-35 115 154)" fill="{GOLD}"/>',
 "hammer": f'<rect x="120" y="108" width="8" height="64" rx="3" fill="{LIGHT}" stroke="{INK}" stroke-width="2"/><rect x="108" y="100" width="32" height="18" rx="4" fill="{LIGHT}" stroke="{INK}" stroke-width="2"/>',
 "flask": f'<path d="M122 112 H134 V128 L146 156 Q148 166 138 166 H118 Q108 166 110 156 L122 128Z" fill="{LIGHT}" stroke="{INK}" stroke-width="2" opacity=".95"/><path d="M114 150 H142" stroke="{INK}" stroke-width="3"/>',
 "clipboard": f'<rect x="104" y="116" width="36" height="50" rx="4" fill="{LIGHT}" stroke="{INK}" stroke-width="2"/><rect x="114" y="112" width="16" height="8" rx="2" fill="{GOLD}"/><path d="M110 132 H134 M110 142 H134 M110 152 H126" stroke="{INK}" stroke-width="2"/>',
 "ledger": f'<rect x="100" y="120" width="42" height="46" rx="3" fill="{LIGHT}" stroke="{INK}" stroke-width="2"/><path d="M121 120 V166 M106 134 H116 M126 134 H136 M106 146 H116 M126 146 H136" stroke="{INK}" stroke-width="2"/>',
 "coin": f'<circle cx="120" cy="150" r="14" fill="{GOLD}" stroke="{INK}" stroke-width="2"/><path d="M120 142 V158 M114 148 H126" stroke="{INK}" stroke-width="2.5"/>',
 "tie": f'<path d="M80 124 L90 138 L84 172 L80 180 L76 172 L70 138Z" fill="{GOLD}" stroke="{INK}" stroke-width="2"/>',
 "collar": f'<path d="M52 128 L80 156 L108 128 L100 124 L80 142 L60 124Z" fill="{LIGHT}"/>',
 "eye": f'<path d="M58 132 Q80 112 102 132 Q80 152 58 132Z" fill="{LIGHT}" stroke="{INK}" stroke-width="2"/><circle cx="80" cy="132" r="8" fill="{INK}"/>',
 "scar": f'<path d="M92 66 L72 104" stroke="{LIGHT}" stroke-width="3" stroke-linecap="round"/><path d="M88 72 L96 76 M84 82 L92 86 M80 92 L88 96" stroke="{LIGHT}" stroke-width="2"/>',
 "aura": f'<circle cx="80" cy="96" r="62" fill="none" stroke="{GOLD}" stroke-width="3" stroke-dasharray="3 9" opacity=".9"/><circle cx="80" cy="96" r="74" fill="none" stroke="{LIGHT}" stroke-width="1.5" opacity=".5"/>',
 "cracks": f'<path d="M80 54 L74 70 L86 82 L72 98 L84 112 M104 70 L96 84 L106 96" fill="none" stroke="{LIGHT}" stroke-width="2.5"/>',
 "arms": f'<path d="M44 150 Q20 140 14 112 M116 150 Q140 140 146 112 M48 164 Q20 170 12 150 M112 164 Q140 170 148 150" fill="none" stroke="{INK}" stroke-width="9" stroke-linecap="round"/><path d="M44 150 Q20 140 14 112 M116 150 Q140 140 146 112" fill="none" stroke="{LIGHT}" stroke-width="2" stroke-linecap="round" opacity=".6"/>',
 "horns": f'<path d="M54 64 Q40 40 44 22 Q58 38 66 58Z M106 64 Q120 40 116 22 Q102 38 94 58Z" fill="{LIGHT}" stroke="{INK}" stroke-width="2"/>',
 "fists": f'<rect x="38" y="140" width="24" height="22" rx="8" fill="{LIGHT}" stroke="{INK}" stroke-width="2"/><rect x="98" y="140" width="24" height="22" rx="8" fill="{LIGHT}" stroke="{INK}" stroke-width="2"/>',
 "bars": f'<path d="M96 120 V176 M108 120 V176 M120 120 V176" stroke="{LIGHT}" stroke-width="4" opacity=".8"/>',
 "whistle": f'<circle cx="112" cy="146" r="10" fill="{LIGHT}" stroke="{INK}" stroke-width="2"/><rect x="96" y="141" width="18" height="9" rx="3" fill="{LIGHT}" stroke="{INK}" stroke-width="2"/>',
 "leash": f'<path d="M96 150 Q124 150 124 176 M124 176 L130 190" fill="none" stroke="{LIGHT}" stroke-width="4" stroke-linecap="round"/>',
 "file": f'<path d="M100 122 H132 L142 132 V168 H100Z" fill="{LIGHT}" stroke="{INK}" stroke-width="2"/><path d="M108 140 H134 M108 150 H134 M108 160 H124" stroke="{INK}" stroke-width="2"/>',
 "ring": f'<circle cx="80" cy="110" r="34" fill="none" stroke="{GOLD}" stroke-width="3"/>',
}
# what each Threat wears: a list of mark names
LOOK = {
 "street-thug": ["hood", "fists"], "row-lookout": ["cap", "whistle"], "syndicate-enforcer": ["cap", "fists"], "syndicate-collector": ["brimhat", "ledger"],
 "back-alley-surgeon": ["mask", "cross"], "syndicate-lieutenant": ["collar", "scar"], "fence": ["cap", "coin"], "crew-heavy": ["scar", "fists"],
 "knife-duelist": ["hood", "knife"], "back-alley-chemist": ["goggles", "flask"], "finger-s-hand": ["scar", "knife"], "syndicate-boss": ["brimhat", "tie", "crown"],
 "nest-security-guard": ["helmet", "badge"], "response-team": ["visor", "badge"], "wing-researcher": ["glasses", "clipboard"], "department-head": ["glasses", "tie"],
 "hr-specialist": ["collar", "file"], "wing-cleaner": ["mask", "hood"], "wing-medic": ["cross", "mask"], "containment-handler": ["helmet", "leash"],
 "security-captain": ["cap", "star"], "singularity-technician": ["goggles", "hammer"], "retrieval-specialist": ["visor", "eye"], "wing-director": ["tie", "crown"],
 "distorted-human-partial": ["horns", "cracks"], "fallen": ["cracks", "aura"], "e-g-o-wielder": ["aura", "knife"], "singularity-touched-employee": ["glasses", "aura"],
 "association-examiner": ["monocle", "file"], "fixer-rookie": ["cap", "badge"], "fixer-veteran": ["scar", "badge"], "workshop-smith": ["goggles", "hammer"],
 "street-prophet": ["hood", "eye"], "distorted-human-complete": ["horns", "arms", "cracks"], "information-broker": ["monocle", "ledger"],
 "color-fixer-template": ["aura", "crown"], "the-ash-verdict-color": ["aura", "crown", "scar"], "the-quiet-ledger-color": ["aura", "crown", "ledger"], "the-second-face-color": ["aura", "crown", "mask"],
}

def figure(dx=0, scale=1.0, dark=INK):
    """Head and shoulders, centred on x = 80 (moved by dx)."""
    return (f'<g transform="translate({dx} {200 - 200 * scale}) scale({scale})">'
            f'<path d="M14 200 Q16 140 52 128 L66 120 Q80 132 94 120 L108 128 Q144 140 146 200Z" fill="{dark}"/>'
            f'<rect x="68" y="108" width="24" height="22" fill="{dark}"/><circle cx="80" cy="84" r="30" fill="{dark}"/></g>')

def pips(grade):
    n = 1 if grade >= 8 else 2 if grade >= 5 else 3 if grade >= 2 else 4        # the dice tier: 3, 4, 6 or 8 dice
    return "".join(f'<path d="M{12 + i * 13} 14 l7 -8 l7 8 v6 l-7 -7 l-7 7z" fill="{GOLD}" stroke="{INK}" stroke-width="1"/>' for i in range(n))

def svg(t):
    col = SIN[t["sin"]]
    id_ = t["id"]
    body = figure(0, 1.0)
    if t["group"]:                                                        # a group is drawn as three figures
        body = figure(-46, 0.74, "#171821") + figure(46, 0.74, "#171821") + figure(0, 0.92)
    marks = "".join(M[m] for m in LOOK[id_])
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 200" width="160" height="200" role="img" aria-label="{t["name"]}">
<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{col}"/><stop offset="1" stop-color="#14151c"/></linearGradient>
<radialGradient id="glow" cx=".5" cy=".42" r=".55"><stop offset="0" stop-color="#ffffff" stop-opacity=".38"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
<pattern id="st" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="3" height="10" fill="#000" opacity=".10"/></pattern></defs>
<rect width="160" height="200" fill="url(#bg)"/><rect width="160" height="200" fill="url(#st)"/><rect width="160" height="200" fill="url(#glow)"/>
{body}{marks}{pips(t["grade"])}
<rect x="2" y="2" width="156" height="196" rx="6" fill="none" stroke="{GOLD}" stroke-width="3" opacity=".85"/></svg>
'''

for t in data:
    (out / f"threat-{t['id']}.svg").write_text(svg(t), encoding="utf-8")
print(len(data), "portraits written to", out)
missing = [t["id"] for t in data if t["id"] not in LOOK]
assert not missing, missing
