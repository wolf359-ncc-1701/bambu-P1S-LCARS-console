"""The console's Chinese fonts, cut down to the characters it uses and aligned with Antonio.

Run by hand after changing Chinese text (after scripts/build-zh-hant.py), then commit
the files it writes to src/lcars/fonts/:

    pip install fonttools brotli
    python scripts/build-cjk-fonts.py [--src DIR] [--label-scale 1.08]

Sources (OFL 1.1, kept outside the repo, default ../../font-work/src):
  label  WD-XL Lubrifont SC/TC (WDXLLubrifont{SC,TC}-Regular.ttf), one weight
  body   Glow Sans SC/TC Condensed (GlowSans{SC,TC}-Condensed-{Regular,Medium,Bold}.otf)

Every font is cut to Chinese characters only (no ASCII or Latin, so digits always come from
Antonio), then its outlines are scaled and raised so the ink centre of the Chinese sits at
430/1000 of the font size, the centre of Antonio's capitals and digits, and its line metrics
are set to Antonio's (1155/139, no line gap). Chinese and English then share one baseline
centre and one line box, and the CSS gives both the same font size.

Every font also carries the common characters of both scripts (GB 2312 level 1 and Big5
level 1) and every character of the HMS tables, so printer names, file names and printer
messages, in either script, do not fall back to another font in the middle of a word.
"""
import argparse
import glob
import io
import json
import os
import re
import sys

from fontTools import subset
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
FRONT = os.path.join(HERE, '..')
SRC_DIR = os.path.join(FRONT, 'src')
OUT = os.path.join(SRC_DIR, 'lcars', 'fonts')

# Antonio, in 1000ths of the font size
CENTRE = 430
ASCENT = 1155
DESCENT = 139
PROBE = '中国喷嘴温度一口噴溫'

# ▴ ▾ are in none of the fonts: they come from the system font
PUNCT = '，。：；？！、（）「」『』《》〈〉【】—…～'


def cjk(text):
    return {c for c in text if ord(c) >= 0x2E80 or c in PUNCT}


def read(p):
    return io.open(p, encoding='utf-8').read()


def block(path, start, end):
    s = read(path)
    a = s.index(start) + len(start)
    return s[a:s.index(end, a)]


def json_strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from json_strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from json_strings(v)


def collect():
    """(sc_ui, tc_ui, sc_dyn, tc_dyn): the console's own text, then text it only shows."""
    zh = block(os.path.join(SRC_DIR, 'i18n', 'index.ts'), '\n  zh: {', '\n  en: {')
    x = block(os.path.join(SRC_DIR, 'lcars', 'i18n.ts'), '\nconst zh = {', '\n}\n')
    hant = read(os.path.join(SRC_DIR, 'i18n', 'zhHant.ts'))
    hints = json.load(io.open(os.path.join(SRC_DIR, 'assets', 'hints.json'), encoding='utf-8'))['zh']
    code = ''
    for f in glob.glob(os.path.join(SRC_DIR, 'lcars', '**', '*.*'), recursive=True):
        if f.endswith(('.vue', '.ts')) and not f.endswith(('i18n.ts', '.test.ts')):
            # comments are not shown
            s = re.sub(r'/\*.*?\*/|//[^\n]*|<!--.*?-->', '', read(f), flags=re.S)
            code += s
    sc_ui = cjk(zh + x + ''.join(hints)) | cjk(code)
    tc_ui = cjk(hant) | cjk(code)

    hms = ''
    for name in ('devicehms_01S.json', 'erroractions_01S.json', 'filament.json'):
        p = os.path.join(SRC_DIR, 'assets', name)
        if os.path.exists(p):
            hms += ''.join(json_strings(json.load(io.open(p, encoding='utf-8'))))
    gb1 = ''.join(bytes([a, b]).decode('gb2312') for a in range(0xB0, 0xD8) for b in range(0xA1, 0xFF)
                  if not (a == 0xD7 and b > 0xF9))
    big5 = ''
    for a in range(0xA4, 0xC7):
        for b in list(range(0x40, 0x7F)) + list(range(0xA1, 0xFF)):
            if (a, b) > (0xC6, 0x7E):
                break
            try:
                big5 += bytes([a, b]).decode('big5')
            except UnicodeDecodeError:
                pass
    return sc_ui, tc_ui, cjk(gb1 + hms), cjk(big5)


def ranges(chars):
    """unicode-range value for a set of characters, runs merged."""
    cps = sorted(ord(c) for c in chars)
    out = []
    i = 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1:
            j += 1
        out.append(f'U+{cps[i]:X}' if i == j else f'U+{cps[i]:X}-{cps[j]:X}')
        i = j + 1
    return ', '.join(out)


CJK_RANGE = 'U+2014, U+2026, U+2E80-9FFF, U+F900-FAFF, U+FE10-FE1F, U+FE30-FE4F, U+FF00-FFEF'

# CSS faces: family, weight range in CSS, output key
FACES = [
    ('LCARS Label SC', '100 900', 'lcars-label-sc'),
    ('LCARS Hei SC', '400', 'lcars-hei-sc-400'),
    ('LCARS Hei SC', '500', 'lcars-hei-sc-500'),
    ('LCARS Hei SC', '600 900', 'lcars-hei-sc-700'),
    ('LCARS Label TC', '100 900', 'lcars-label-tc'),
    ('LCARS Hei TC', '400', 'lcars-hei-tc-400'),
    ('LCARS Hei TC', '500', 'lcars-hei-tc-500'),
    ('LCARS Hei TC', '600 900', 'lcars-hei-tc-700'),
]


def ink(gs, names):
    ys = []
    for g in names:
        bp = BoundsPen(gs)
        gs[g].draw(bp)
        if bp.bounds:
            ys.append(bp.bounds)
    return ys


def cut(font, chars):
    opts = subset.Options()
    opts.layout_features = []
    opts.drop_tables += ['GSUB', 'GPOS', 'GDEF', 'BASE', 'JSTF', 'vhea', 'vmtx', 'VORG', 'DSIG', 'kern', 'gasp', 'prep', 'fpgm', 'cvt ']
    opts.hinting = False
    opts.desubroutinize = True
    opts.notdef_outline = True
    opts.name_IDs = ['*']
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=[ord(c) for c in chars])
    sub.subset(font)


def build(src, out, family, weight, chars, scale, required, borrow=None):
    """borrow: a font of the same design to take characters this one lacks from
    (Glow Sans TC Condensed has no 值 告 填 清 真; the SC glyphs of these are the same shapes)."""
    font = TTFont(src)
    cmap = font.getBestCmap()
    have = {c for c in chars if ord(c) in cmap}
    lent = TTFont(borrow) if borrow else None
    lcmap = lent.getBestCmap() if lent else {}
    take = {c for c in chars if ord(c) not in cmap and ord(c) in lcmap}
    missing = sorted(c for c in required if ord(c) not in cmap and c not in take)

    # the ink centre of the source, from a few ordinary characters
    gs = font.getGlyphSet()
    probe = [cmap[ord(c)] for c in PROBE if ord(c) in cmap]
    b = ink(gs, probe)
    centre = sum((y0 + y1) / 2 for _, y0, _, y1 in b) / len(b)
    dy = round(CENTRE - scale * centre)

    cut(font, have)
    order = list(font.getGlyphOrder())
    cmap = dict(font.getBestCmap())
    # glyph name -> (glyph set, advance)
    src_of = {g: (font.getGlyphSet(), font['hmtx'].metrics[g][0]) for g in order}
    if take:
        cut(lent, take)
        lgs = lent.getGlyphSet()
        for u, g in lent.getBestCmap().items():
            name = 'b_' + g
            if name not in src_of:
                order.append(name)
                src_of[name] = (lgs, lent['hmtx'].metrics[g][0])
            cmap[u] = name
    tt = 'glyf' in font
    m = (scale, 0, 0, scale, 0, dy)

    fb = FontBuilder(1000, isTTF=tt)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    metrics = {}
    shapes = {}
    for g in order:
        gs, adv = src_of[g]
        rec = DecomposingRecordingPen(gs)
        gs[g[2:] if g.startswith('b_') else g].draw(rec)
        adv = round(adv * scale)
        pen = TTGlyphPen(None) if tt else T2CharStringPen(adv, None)
        rec.replay(TransformPen(pen, m))
        shapes[g] = pen.glyph() if tt else pen.getCharString()
        bp = BoundsPen(None)
        rec.replay(TransformPen(bp, m))
        metrics[g] = (adv, round(bp.bounds[0]) if bp.bounds else 0)
    if tt:
        fb.setupGlyf(shapes)
    else:
        fb.setupCFF(family.replace(' ', '') + f'-{weight}', {'FullName': family}, shapes, {})
    fb.setupHorizontalMetrics(metrics)
    fb.setupHorizontalHeader(ascent=ASCENT, descent=-DESCENT, lineGap=0)
    name = font['name']
    fb.setupNameTable({
        'copyright': (name.getDebugName(0) or '') + '. Cut down, scaled and realigned for the LCARS console.',
        'familyName': family,
        'styleName': 'Regular',
        'uniqueFontIdentifier': f'{family} {weight}',
        'fullName': family,
        'psName': family.replace(' ', '') + f'-{weight}',
        'version': name.getDebugName(5) or 'Version 1.0',
        'licenseDescription': 'This Font Software is licensed under the SIL Open Font License, Version 1.1.',
        'licenseInfoURL': 'https://openfontlicense.org',
    })
    fb.setupOS2(version=4, usWeightClass=weight, fsType=0, achVendID='NONE',
                sTypoAscender=ASCENT, sTypoDescender=-DESCENT, sTypoLineGap=0,
                usWinAscent=ASCENT, usWinDescent=DESCENT, fsSelection=0x40 | 0x80)
    fb.setupPost()
    if tt:
        fb.setupMaxp()
    fb.font.flavor = 'woff2'
    fb.save(out)

    # check the result: the ink centre of the probe characters
    done = TTFont(out)
    dgs = done.getGlyphSet()
    dmap = done.getBestCmap()
    after = ink(dgs, [dmap[ord(c)] for c in PROBE if ord(c) in dmap])
    c2 = sum((y0 + y1) / 2 for _, y0, _, y1 in after) / len(after)
    lo = min(y0 for _, y0, _, _ in after)
    hi = max(y1 for _, _, _, y1 in after)
    return {
        'file': os.path.basename(out), 'size': os.path.getsize(out), 'chars': len(dmap),
        'centre_src': round(centre), 'dy': dy, 'centre': round(c2, 1), 'ink': (round(lo), round(hi)),
        'missing': missing, 'borrowed': ''.join(sorted(take)), 'cmap': ''.join(sorted(chr(u) for u in dmap)),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--src', default=os.path.normpath(os.path.join(FRONT, '..', '..', 'font-work', 'src')))
    ap.add_argument('--label-scale', type=float, default=1.08)
    ap.add_argument('--only', choices=['label', 'hei'], help='make only these fonts (to try a label scale)')
    ap.add_argument('--out', default=OUT, help='write here instead (a trial: the coverage file is not written)')
    a = ap.parse_args()
    if not 1 <= a.label_scale <= 1.2:
        sys.exit('--label-scale should be between 1 and 1.2')

    sc_ui, tc_ui, sc_dyn, tc_dyn = collect()
    # Text the console only shows (printer and file names, HMS messages) can be in either
    # script whatever the language: a printer named 肥工航隊重工壹號 is shown as it is in
    # Simplified mode too. So every font, the label fonts as well, carries the common
    # characters of both scripts, or one name falls apart into two or three fonts.
    ui = sc_ui | tc_ui
    dyn = sc_dyn | tc_dyn
    jobs = [
        # out name, source, family, weight, characters, scale, must have
        ('lcars-label-sc', 'WDXLLubrifontSC-Regular.ttf', 'LCARS Label SC', 400, ui | dyn, a.label_scale, ui),
        ('lcars-label-tc', 'WDXLLubrifontTC-Regular.ttf', 'LCARS Label TC', 400, ui | dyn, a.label_scale, ui),
        ('lcars-hei-sc-400', 'GlowSansSC-Condensed-Regular.otf', 'LCARS Hei SC', 400, ui | dyn, 1, ui),
        ('lcars-hei-sc-500', 'GlowSansSC-Condensed-Medium.otf', 'LCARS Hei SC', 500, ui | dyn, 1, ui),
        ('lcars-hei-sc-700', 'GlowSansSC-Condensed-Bold.otf', 'LCARS Hei SC', 700, ui | dyn, 1, ui),
        ('lcars-hei-tc-400', 'GlowSansTC-Condensed-Regular.otf', 'LCARS Hei TC', 400, ui | dyn, 1, ui, 'GlowSansSC-Condensed-Regular.otf'),
        ('lcars-hei-tc-500', 'GlowSansTC-Condensed-Medium.otf', 'LCARS Hei TC', 500, ui | dyn, 1, ui, 'GlowSansSC-Condensed-Medium.otf'),
        ('lcars-hei-tc-700', 'GlowSansTC-Condensed-Bold.otf', 'LCARS Hei TC', 700, ui | dyn, 1, ui, 'GlowSansSC-Condensed-Bold.otf'),
    ]
    coverage = {'label_scale': a.label_scale}
    bad = False
    total = 0
    if a.only:
        jobs = [j for j in jobs if j[0].startswith('lcars-' + a.only)]
    # Each font is made twice: the console's own characters (small, wanted at once) and the
    # rest (the common characters for names and messages, fetched only when one is drawn).
    css = {}
    for key, src, family, weight, chars, scale, need, *lend in jobs:
        cmap = ''
        for part, cs, req in ((key, chars & ui, need), (key + '-x', chars - ui, set())):
            r = build(os.path.join(a.src, src), os.path.join(a.out, part + '.woff2'), family, weight, cs, scale, req,
                      os.path.join(a.src, lend[0]) if lend else None)
            total += r['size']
            # the -x part holds none of the probe characters: its shift is the same dy, checked above
            ok = part.endswith('-x') or abs(r['centre'] - CENTRE) <= 5
            print(f"{r['file']:24} {r['size'] / 1024:7.0f} KB {r['chars']:5} chars  "
                  f"centre {r['centre_src']} -> {r['centre']} (dy {r['dy']:+}, ink {r['ink'][0]}..{r['ink'][1]})"
                  f"{'' if ok else '  CENTRE OFF'}")
            if r['missing']:
                print(f"  missing {len(r['missing'])}: {''.join(r['missing'])}")
            bad = bad or not ok or bool(r['missing'])
            cmap += r['cmap']
            css[part] = r['cmap']
        coverage[key] = ''.join(sorted(set(cmap)))
    if not a.only and os.path.abspath(a.out) == os.path.abspath(OUT):
        io.open(os.path.join(OUT, 'cjk-coverage.json'), 'w', encoding='utf-8', newline='\n').write(
            json.dumps(coverage, ensure_ascii=False, indent=0) + '\n')
        # Both parts of a font cover the whole CJK range. Faces of one family whose ranges overlap
        # are tried last-declared first, and a face without the glyph passes the character on:
        # so the small part (declared second) draws the console's own text, and the -x part is
        # fetched only when a character it alone has is drawn.
        lines = ['/* Made by scripts/build-cjk-fonts.py: do not edit. For each font the small file is tried',
                 '   first; the -x file (names, file names, printer messages) is fetched only when needed. */']
        for family, w, key in FACES:
            for part in (key + '-x', key):
                lines.append(f"@font-face {{ font-family: '{family}'; font-weight: {w}; font-display: block; "
                             f"src: url(./{part}.woff2) format('woff2'); unicode-range: {CJK_RANGE}; }}")
        io.open(os.path.join(OUT, 'cjk-fonts.css'), 'w', encoding='utf-8', newline='\n').write('\n'.join(lines) + '\n')
    print(f'total {total / 1024 / 1024:.2f} MB')
    if bad:
        sys.exit('characters missing or centre off: see above')


if __name__ == '__main__':
    main()
