#!/usr/bin/env python3
# Minimal TrueType renderer (glyf outlines) -> anti-aliased text, pure stdlib.
import struct

class Font:
    def __init__(self, path):
        self.d = open(path, "rb").read()
        n = struct.unpack(">H", self.d[4:6])[0]
        self.tab = {}
        o = 12
        for _ in range(n):
            tag = self.d[o:o+4].decode("latin1")
            off, ln = struct.unpack(">II", self.d[o+8:o+16])
            self.tab[tag] = (off, ln)
            o += 16
        assert "glyf" in self.tab and "loca" in self.tab, "not a glyf TTF: "+",".join(self.tab)
        head = self.tab["head"][0]
        self.upem = struct.unpack(">H", self.d[head+18:head+20])[0]
        self.locfmt = struct.unpack(">h", self.d[head+50:head+52])[0]
        maxp = self.tab["maxp"][0]
        self.nglyph = struct.unpack(">H", self.d[maxp+4:maxp+6])[0]
        hhea = self.tab["hhea"][0]
        self.ascent = struct.unpack(">h", self.d[hhea+4:hhea+6])[0]
        self.descent = struct.unpack(">h", self.d[hhea+6:hhea+8])[0]
        self.nhm = struct.unpack(">H", self.d[hhea+34:hhea+36])[0]
        self._loca()
        self._cmap()

    def _loca(self):
        off = self.tab["loca"][0]
        self.loca = []
        if self.locfmt == 0:
            for i in range(self.nglyph+1):
                self.loca.append(struct.unpack(">H", self.d[off+i*2:off+i*2+2])[0]*2)
        else:
            for i in range(self.nglyph+1):
                self.loca.append(struct.unpack(">I", self.d[off+i*4:off+i*4+4])[0])

    def adv(self, gi):
        off = self.tab["hmtx"][0]
        if gi >= self.nhm:
            gi = self.nhm-1
        return struct.unpack(">H", self.d[off+gi*4:off+gi*4+2])[0]

    def _cmap(self):
        base = self.tab["cmap"][0]
        ntab = struct.unpack(">H", self.d[base+2:base+4])[0]
        sub = None
        for i in range(ntab):
            pid, eid, o = struct.unpack(">HHI", self.d[base+4+i*8:base+4+i*8+8])
            if (pid == 3 and eid in (1, 0)) or pid == 0:
                sub = base+o
        assert sub is not None, "no unicode cmap"
        fmt = struct.unpack(">H", self.d[sub:sub+2])[0]
        self.cmap = {}
        if fmt == 4:
            segX2 = struct.unpack(">H", self.d[sub+6:sub+8])[0]
            seg = segX2//2
            p = sub+14
            end = [struct.unpack(">H", self.d[p+i*2:p+i*2+2])[0] for i in range(seg)]
            p += segX2+2
            start = [struct.unpack(">H", self.d[p+i*2:p+i*2+2])[0] for i in range(seg)]
            p += segX2
            delta = [struct.unpack(">h", self.d[p+i*2:p+i*2+2])[0] for i in range(seg)]
            p += segX2
            ro_pos = p
            rng = [struct.unpack(">H", self.d[p+i*2:p+i*2+2])[0] for i in range(seg)]
            for c in range(32, 127):
                for i in range(seg):
                    if end[i] >= c >= start[i]:
                        if rng[i] == 0:
                            g = (c+delta[i]) & 0xFFFF
                        else:
                            addr = ro_pos+i*2+rng[i]+2*(c-start[i])
                            g = struct.unpack(">H", self.d[addr:addr+2])[0]
                            if g: g = (g+delta[i]) & 0xFFFF
                        self.cmap[c] = g
                        break
        else:
            raise AssertionError("cmap fmt %d unsupported" % fmt)

    def glyph(self, gi):
        # returns list of contours; each contour = list of (x,y,on_curve)
        if gi+1 >= len(self.loca): return []
        o = self.tab["glyf"][0]+self.loca[gi]
        if self.loca[gi+1] == self.loca[gi]: return []
        nc = struct.unpack(">h", self.d[o:o+2])[0]
        if nc < 0:
            return self._composite(o+10)
        p = o+10
        ends = [struct.unpack(">H", self.d[p+i*2:p+i*2+2])[0] for i in range(nc)]
        p += nc*2
        npts = ends[-1]+1
        ilen = struct.unpack(">H", self.d[p:p+2])[0]
        p += 2+ilen
        flags = []
        while len(flags) < npts:
            f = self.d[p]; p += 1
            flags.append(f)
            if f & 0x08:
                r = self.d[p]; p += 1
                flags += [f]*r
        flags = flags[:npts]
        xs = []; x = 0
        for f in flags:
            if f & 0x02:
                dx = self.d[p]; p += 1
                x += dx if (f & 0x10) else -dx
            elif not (f & 0x10):
                x += struct.unpack(">h", self.d[p:p+2])[0]; p += 2
            xs.append(x)
        ys = []; y = 0
        for f in flags:
            if f & 0x04:
                dy = self.d[p]; p += 1
                y += dy if (f & 0x20) else -dy
            elif not (f & 0x20):
                y += struct.unpack(">h", self.d[p:p+2])[0]; p += 2
            ys.append(y)
        contours = []
        s = 0
        for e in ends:
            pts = [(xs[i], ys[i], bool(flags[i] & 1)) for i in range(s, e+1)]
            contours.append(pts)
            s = e+1
        return contours

    def _composite(self, p):
        out = []
        while True:
            flags, gi = struct.unpack(">HH", self.d[p:p+4]); p += 4
            if flags & 0x0001:  # words
                a1, a2 = struct.unpack(">hh", self.d[p:p+4]); p += 4
            else:
                a1, a2 = struct.unpack(">bb", self.d[p:p+2]); p += 2
            dx, dy = (a1, a2) if (flags & 0x0002) else (0, 0)
            if flags & 0x0008: p += 2
            elif flags & 0x0040: p += 4
            elif flags & 0x0080: p += 8
            for c in self.glyph(gi):
                out.append([(x+dx, y+dy, on) for (x, y, on) in c])
            if not (flags & 0x0020): break
        return out


def _flatten(contour, steps=10):
    # quadratic on/off-curve -> polyline (closed)
    n = len(contour)
    if n == 0: return []
    pts = contour[:]
    # ensure starts on-curve
    if not pts[0][2]:
        if pts[-1][2]:
            pts = [pts[-1]] + pts[:-1]
        else:
            mid = ((pts[0][0]+pts[-1][0])/2, (pts[0][1]+pts[-1][1])/2, True)
            pts = [mid] + pts
    out = []
    m = len(pts)
    cx = cy = None
    sx, sy = pts[0][0], pts[0][1]
    out.append((sx, sy))
    i = 1
    px, py = sx, sy
    while i <= m:
        x, y, on = pts[i % m]
        if on:
            if cx is None:
                out.append((x, y)); px, py = x, y
            else:
                for t in range(1, steps+1):
                    tt = t/steps
                    qx = (1-tt)**2*px + 2*(1-tt)*tt*cx + tt*tt*x
                    qy = (1-tt)**2*py + 2*(1-tt)*tt*cy + tt*tt*y
                    out.append((qx, qy))
                px, py = x, y; cx = cy = None
            i += 1
        else:
            if cx is None:
                cx, cy = x, y; i += 1
            else:
                mx, my = (cx+x)/2, (cy+y)/2
                for t in range(1, steps+1):
                    tt = t/steps
                    qx = (1-tt)**2*px + 2*(1-tt)*tt*cx + tt*tt*mx
                    qy = (1-tt)**2*py + 2*(1-tt)*tt*cy + tt*tt*my
                    out.append((qx, qy))
                px, py = mx, my; cx, cy = x, y; i += 1
    return out


def text_mask(font, text, px, ss=4, tracking=0.0):
    """Return (W, H, baseline_y, coverage bytearray[W*H]) at final resolution."""
    s = px/font.upem
    # layout width
    penf = 0.0
    glyph_polys = []  # (pen_x_units, contours_flattened_units)
    for ch in text:
        gi = font.cmap.get(ord(ch), 0)
        cs = [_flatten(c) for c in font.glyph(gi)]
        glyph_polys.append((penf, cs))
        penf += font.adv(gi) + tracking*font.upem
    W = int(penf*s) + 4
    asc = font.ascent*s; desc = -font.descent*s
    H = int(asc+desc) + 4
    baseline = asc + 2
    # supersample buffer
    SW, SH = W*ss, H*ss
    cov = bytearray(SW*SH)
    edges = []
    for penx, cs in glyph_polys:
        for poly in cs:
            P = [((penx+x)*s*ss + 2*ss, baseline*ss - y*s*ss + 2*0) for (x, y) in poly]
            # note: baseline in supersample
            for i in range(len(P)):
                x0, y0 = P[i]; x1, y1 = P[(i+1) % len(P)]
                if y0 == y1: continue
                edges.append((x0, y0, x1, y1))
    # fill via non-zero winding, scanline at supersample
    for yy in range(SH):
        yc = yy+0.5
        xs = []
        for (x0, y0, x1, y1) in edges:
            if (y0 <= yc < y1) or (y1 <= yc < y0):
                t = (yc-y0)/(y1-y0)
                xs.append((x0+t*(x1-x0), 1 if y1 > y0 else -1))
        if not xs: continue
        xs.sort()
        w = 0
        for k in range(len(xs)-1):
            w += xs[k][1]
            if w != 0:
                a = max(0, int(xs[k][0])); b = min(SW, int(xs[k+1][0]))
                row = yy*SW
                for xpix in range(a, b):
                    cov[row+xpix] = 255
    # downsample ss x ss -> coverage
    out = bytearray(W*H)
    for y in range(H):
        for x in range(W):
            acc = 0
            for dy in range(ss):
                base = (y*ss+dy)*SW + x*ss
                for dx in range(ss):
                    acc += cov[base+dx]
            out[y*W+x] = acc//(ss*ss)
    return W, H, int(baseline), out


def blend(img, IW, IH, mask, MW, MH, x, y, color, shadow=None):
    r, g, b = color
    if shadow:
        sx, sy, sc, sa = shadow  # offset x,y, (r,g,b), alpha 0..1
        for my in range(MH):
            ty = y+my+sy
            if ty < 0 or ty >= IH: continue
            for mx in range(MW):
                a = mask[my*MW+mx]
                if not a: continue
                tx = x+mx+sx
                if tx < 0 or tx >= IW: continue
                aa = (a/255)*sa
                o = (ty*IW+tx)*3
                img[o] = int(img[o]*(1-aa)+sc[0]*aa)
                img[o+1] = int(img[o+1]*(1-aa)+sc[1]*aa)
                img[o+2] = int(img[o+2]*(1-aa)+sc[2]*aa)
    for my in range(MH):
        ty = y+my
        if ty < 0 or ty >= IH: continue
        for mx in range(MW):
            a = mask[my*MW+mx]
            if not a: continue
            tx = x+mx
            if tx < 0 or tx >= IW: continue
            aa = a/255
            o = (ty*IW+tx)*3
            img[o] = int(img[o]*(1-aa)+r*aa)
            img[o+1] = int(img[o+1]*(1-aa)+g*aa)
            img[o+2] = int(img[o+2]*(1-aa)+b*aa)
