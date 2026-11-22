"""Draws the 1024 px app icon (a location target on the SITE14 orange) without any image library."""
import math, struct, sys, zlib

SIZE, SS = 1024, 2
BG, FG = (0xDB, 0x44, 0x06), (0xFF, 0xFF, 0xFF)
c = SIZE / 2

def coverage(x, y):
    r = math.hypot(x - c, y - c)
    ring = 250 <= r <= 330
    dot = r <= 120
    cross = (abs(x - c) <= 26 or abs(y - c) <= 26) and 330 <= r <= 420
    return ring or dot or cross

rows = []
for py in range(SIZE):
    row = bytearray([0])
    for px in range(SIZE):
        hit = sum(coverage(px + (i + .5) / SS, py + (j + .5) / SS) for i in range(SS) for j in range(SS)) / (SS * SS)
        row += bytes(round(BG[k] + (FG[k] - BG[k]) * hit) for k in range(3))
    rows.append(bytes(row))

def chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0)) \
    + chunk(b"IDAT", zlib.compress(b"".join(rows), 9)) + chunk(b"IEND", b"")
for path in sys.argv[1:]:
    open(path, "wb").write(png)
