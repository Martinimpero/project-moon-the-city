"""
Traces the outline of every District on the City map picture (city/the-city.webp) and writes js/citycells.mjs.
Method: the borders on the map are thin bright lines, so a priority flood (a seeded watershed) grows each District outwards from its label and
stops where the lines are; the City's own edge is found the same way against seeds placed outside it. Each region's boundary is then walked and
simplified to a polygon. Needs Pillow and numpy.   Run from the webapp folder:   python tools/trace_city.py [--debug]
--debug also writes tools/city_trace_debug.png (the polygons drawn over the map) so the result can be checked by eye.
"""
import heapq, sys, os
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CENTRES = {
    "A": (557, 497), "B": (522, 425), "C": (643, 425), "D": (637, 553), "E": (487, 598), "F": (412, 455), "G": (490, 325), "H": (685, 328), "I": (772, 480),
    "J": (704, 655), "K": (521, 708), "L": (373, 633), "M": (293, 458), "N": (331, 273), "O": (486, 210), "P": (630, 208), "Q": (835, 293), "R": (913, 553),
    "S": (843, 745), "T": (657, 795), "U": (451, 813), "V": (257, 665), "W": (153, 448), "X": (182, 252), "Y": (397, 115)}
OUTSIDE = [(15, 15), (600, 15), (1100, 120), (1180, 450), (1150, 900), (700, 915), (300, 915), (20, 900), (20, 450), (60, 40), (1000, 30), (60, 760)]

im = Image.open(os.path.join(ROOT, "city", "the-city.webp")).convert("RGB")
W, H = im.size
rgb = np.asarray(im).astype(np.float32)
lum = rgb[..., 0] * 0.6 + rgb[..., 1] * 0.2 + rgb[..., 2] * 0.2
small = np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.2))).astype(np.float32)
big = np.asarray(Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.GaussianBlur(7))).astype(np.float32)
ridge = np.clip(small - big, 0, None)                                    # thin bright lines stand out from their surroundings
ridge = ridge / (ridge.max() + 1e-6)
cost = 0.02 + ridge ** 0.6 * 4.0

# Borders that are too faint for the flood to see are added by hand, read off the picture (a few points each).
WALLS = [[(133, 177), (230, 162), (299, 222)],          # X below, Y above
         [(568, 181), (627, 141), (710, 169)]]          # P below, Y above
wall_img = Image.new("L", (W, H), 0); wd = ImageDraw.Draw(wall_img)
for line in WALLS: wd.line(line, fill=255, width=4)
cost = (cost + (np.asarray(wall_img) > 0) * 30.0).astype(np.float32)     # float32 like the distances, or the flood stops early

# keep the letters and the "DISTRICT n" texts from acting as walls: the seeds are discs that cover them
labels = np.full((H, W), -1, np.int32)
names = list(CENTRES) + ["#"]
heap = []
def seed(x, y, k, r):
    for yy in range(max(0, y - r), min(H, y + r + 1)):
        for xx in range(max(0, x - r), min(W, x + r + 1)):
            if (xx - x) ** 2 + (yy - y) ** 2 <= r * r and labels[yy, xx] < 0:
                labels[yy, xx] = k; heapq.heappush(heap, (0.0, yy, xx))
for k, (l, (x, y)) in enumerate(CENTRES.items()):
    seed(x, y + 14, k, 34)
for x, y in OUTSIDE:
    seed(x, y, len(CENTRES), 10)
dist = np.full((H, W), np.inf, np.float32)
for _, y, x in heap: dist[y, x] = 0
while heap:
    d, y, x = heapq.heappop(heap)
    if d > dist[y, x]: continue
    k = labels[y, x]
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        ny, nx = y + dy, x + dx
        if 0 <= ny < H and 0 <= nx < W:
            nd = d + cost[ny, nx]
            if nd < dist[ny, nx]:
                dist[ny, nx] = nd; labels[ny, nx] = k; heapq.heappush(heap, (nd, ny, nx))

def largest_component(mask):
    seen = np.zeros_like(mask, bool); best = None
    for sy, sx in zip(*np.nonzero(mask)):
        if seen[sy, sx]: continue
        comp = []; stack = [(sy, sx)]; seen[sy, sx] = True
        while stack:
            y, x = stack.pop(); comp.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; stack.append((ny, nx))
        if best is None or len(comp) > len(best): best = comp
    out = np.zeros_like(mask);
    for y, x in best: out[y, x] = True
    return out

def fill_holes(mask):
    outside = np.zeros_like(mask); stack = [(0, 0)]
    pad = np.pad(mask, 1); outside = np.zeros_like(pad); stack = [(0, 0)]; outside[0, 0] = True
    while stack:
        y, x = stack.pop()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < pad.shape[0] and 0 <= nx < pad.shape[1] and not pad[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True; stack.append((ny, nx))
    return ~outside[1:-1, 1:-1]

def trace(mask):
    """Boundary of a filled single region as a list of (x, y) corner points (walks the pixel edges, clockwise)."""
    edges = {}
    ys, xs = np.nonzero(mask)
    m = np.pad(mask, 1)
    for y, x in zip(ys, xs):
        yy, xx = y + 1, x + 1
        if not m[yy - 1, xx]: edges[(x, y)] = (x + 1, y)              # top edge, going right
        if not m[yy, xx + 1]: edges[(x + 1, y)] = (x + 1, y + 1)      # right edge, going down
        if not m[yy + 1, xx]: edges[(x + 1, y + 1)] = (x, y + 1)      # bottom edge, going left
        if not m[yy, xx - 1]: edges[(x, y + 1)] = (x, y)              # left edge, going up
    start = min(edges); path = [start]; cur = edges[start]; guard = 0
    while cur != start and guard < 200000:
        path.append(cur); cur = edges[cur]; guard += 1
    return path

def simplify(pts, eps):
    """Douglas-Peucker on a closed polygon: split it at the point farthest from the first, simplify both halves."""
    def rdp(seq, lo, hi):
        ax, ay = seq[lo]; bx, by = seq[hi]; dx, dy = bx - ax, by - ay; n = (dx * dx + dy * dy) ** 0.5 or 1
        best, idx = 0, -1
        for i in range(lo + 1, hi):
            d = abs(dy * (seq[i][0] - ax) - dx * (seq[i][1] - ay)) / n
            if d > best: best, idx = d, i
        if best > eps: return rdp(seq, lo, idx)[:-1] + rdp(seq, idx, hi)
        return [seq[lo], seq[hi]]
    if len(pts) < 4: return pts
    loop = pts + [pts[0]]
    far = max(range(len(pts)), key=lambda i: (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2)
    return (rdp(loop, 0, far)[:-1] + rdp(loop, far, len(loop) - 1))[:-1]

cells = {}
for k, l in enumerate(CENTRES):
    raw = Image.fromarray(((labels == k) * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(15))      # smooth small notches left by the texture
    mask = fill_holes(largest_component(np.asarray(raw) > 127))
    poly = simplify(trace(mask), 2.2)
    cells[l] = [(int(x), int(y)) for x, y in poly]
    print(l, "pixels", int(mask.sum()), "points", len(poly))

def d_of(poly): return "M" + "L".join(f"{x} {y}" for x, y in poly) + "Z"
with open(os.path.join(ROOT, "js", "citycells.mjs"), "w", encoding="utf-8", newline="\n") as f:
    f.write("/** Each District's outline on city/the-city.webp (1200 x 928), traced from the picture by tools/trace_city.py. Do not edit by hand: run the tool. */\n")
    f.write("export const CELLS = {\n" + ",\n".join(f'  {l}: "{d_of(p)}"' for l, p in cells.items()) + "\n};\n")
    f.write("export const POINTS = {\n" + ",\n".join(f'  {l}: {[list(p) for p in poly]}'.replace("[[", "[[").replace("]]", "]]") for l, poly in cells.items()) + "\n};\n")

if "--debug" in sys.argv:
    dbg = im.copy(); dr = ImageDraw.Draw(dbg)
    for l, poly in cells.items():
        dr.line(poly + [poly[0]], fill=(255, 220, 60), width=2)
    dbg.save(os.path.join(HERE, "city_trace_debug.png"))
    print("debug picture written")
