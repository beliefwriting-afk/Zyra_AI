"""量測 tokens.css 裡每組「前景／背景」的 WCAG 對比。

    python tools/check-contrast.py

改完配色一定要跑這支。全過才算改完，不然「好看」是拿看不清楚換來的。

憑感覺說「應該夠清楚」是不可靠的——尤其是低飽和的柔和配色，
看起來舒服跟看得清楚是兩件事。這支程式把它變成數字。
"""
import re
import sys
from pathlib import Path

CSS = (Path(__file__).resolve().parent.parent / 'src/css/tokens.css').read_text(encoding='utf-8')


def block(selector: str) -> dict:
    i = CSS.index(selector)
    body = CSS[i:CSS.index('}', i)]
    return dict(re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', body))


LIGHT = block(':root{')
DARK = block(':root[data-theme="dark"]{')


def rgb(v: str, base=None):
    v = v.strip()
    if v.startswith('#'):
        h = v[1:]
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
    m = re.match(r'rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)', v)
    r, g, b = (float(m.group(i)) for i in (1, 2, 3))
    a = float(m.group(4) or 1)
    if a < 1 and base:                      # 半透明必須先疊在底色上才有意義
        return tuple(c * a + bc * (1 - a) for c, bc in zip((r, g, b), base))
    return (r, g, b)


def lum(c):
    def f(x):
        x /= 255
        return x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4
    r, g, b = (f(x) for x in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(fg, bg):
    a, b = lum(fg), lum(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


# (前景, 背景, 需要的門檻, 說明)
PAIRS = [
    ('ink', 'surface', 4.5, '主要文字'),
    ('ink', 'paper', 4.5, '主要文字（頁底）'),
    ('ink', 'surface-sunken', 4.5, '主要文字（欄位底）'),
    ('ink-soft', 'surface', 4.5, '次要文字'),
    ('ink-soft', 'surface-sunken', 4.5, '次要文字（欄位底）'),
    ('ink-faint', 'surface', 4.5, '提示文字'),
    ('ink-faint', 'surface-sunken', 4.5, '提示文字（欄位底）'),
    ('accent', 'surface', 4.5, '主色文字／連結'),
    ('accent', 'accent-soft', 4.5, '主色文字（淡底）'),
    ('accent-ink', 'accent', 4.5, '主要按鈕文字'),
    ('danger', 'surface', 4.5, '錯誤文字'),
    ('danger', 'danger-soft', 4.5, '錯誤文字（淡底）'),
    ('warn', 'warn-soft', 4.5, '警告文字（淡底）'),
    ('ok', 'ok-soft', 4.5, '成功文字（淡底）'),
    ('pri-urgent', 'surface', 4.5, '緊急標示'),
    ('pri-high', 'surface', 4.5, '高優先標示'),
    ('border-strong', 'surface', 3.0, '輸入框邊界（非文字）'),
]
for t in ('teal', 'gold', 'plum', 'slate', 'rose', 'moss'):
    PAIRS.append(('tag-%s' % t, 'tag-%s-soft' % t, 4.5, '標籤文字 %s' % t))

bad = 0
for name, tokens in (('亮色', LIGHT), ('深色', DARK)):
    print('\n=== %s ===' % name)
    for fg, bg, need, label in PAIRS:
        surface = rgb(tokens['--surface'])
        bg_rgb = rgb(tokens['--' + bg], surface)
        fg_rgb = rgb(tokens['--' + fg], bg_rgb)
        r = ratio(fg_rgb, bg_rgb)
        ok = r >= need
        if not ok:
            bad += 1
        print('  %s %5.2f (需 %.1f)  %-18s %s / %s' %
              ('ok  ' if ok else 'FAIL', r, need, label, fg, bg))

print('\n%s' % ('✓ 全部通過' if not bad else '✗ %d 組未達標' % bad))
sys.exit(1 if bad else 0)
