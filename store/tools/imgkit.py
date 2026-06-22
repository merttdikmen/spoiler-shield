#!/usr/bin/env python3
# Minimal pure-stdlib PNG kit: decode (8-bit, non-interlaced), crop, area-resize,
# composite, and encode as 24-bit RGB PNG (no alpha). No external deps.
import zlib, struct, sys

def read_png(path):
    with open(path, "rb") as f:
        data = f.read()
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a PNG"
    pos = 8
    w = h = bd = ct = inter = None
    idat = bytearray()
    pal = None
    while pos < len(data):
        ln = struct.unpack(">I", data[pos:pos+4])[0]
        typ = data[pos+4:pos+8]
        body = data[pos+8:pos+8+ln]
        if typ == b"IHDR":
            w, h, bd, ct, comp, filt, inter = struct.unpack(">IIBBBBB", body)
        elif typ == b"PLTE":
            pal = body
        elif typ == b"IDAT":
            idat += body
        elif typ == b"IEND":
            break
        pos += 12 + ln
    assert bd == 8, f"only 8-bit supported (got {bd})"
    assert inter == 0, "interlaced PNG not supported"
    raw = zlib.decompress(bytes(idat))
    if ct == 2: channels = 3
    elif ct == 6: channels = 4
    elif ct == 0: channels = 1
    elif ct == 3: channels = 1
    else: raise AssertionError(f"unsupported color type {ct}")
    bpp = channels
    stride = w * channels
    out = bytearray(stride * h)
    prior = bytearray(stride)
    p = 0
    for y in range(h):
        ft = raw[p]; p += 1
        line = bytearray(raw[p:p+stride]); p += stride
        if ft == 1:
            for i in range(bpp, stride): line[i] = (line[i] + line[i-bpp]) & 255
        elif ft == 2:
            for i in range(stride): line[i] = (line[i] + prior[i]) & 255
        elif ft == 3:
            for i in range(stride):
                a = line[i-bpp] if i >= bpp else 0
                line[i] = (line[i] + ((a + prior[i]) >> 1)) & 255
        elif ft == 4:
            for i in range(stride):
                a = line[i-bpp] if i >= bpp else 0
                b = prior[i]
                c = prior[i-bpp] if i >= bpp else 0
                pp = a + b - c
                pa = abs(pp-a); pb = abs(pp-b); pc = abs(pp-c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[i] = (line[i] + pr) & 255
        out[y*stride:(y+1)*stride] = line
        prior = line
    # normalize to RGB
    rgb = bytearray(w*h*3)
    if ct == 2:
        rgb[:] = out
    elif ct == 6:
        for i in range(w*h):
            rgb[i*3:i*3+3] = out[i*4:i*4+3]
    elif ct == 0:
        for i in range(w*h):
            v = out[i]; rgb[i*3]=v; rgb[i*3+1]=v; rgb[i*3+2]=v
    elif ct == 3:
        for i in range(w*h):
            idx = out[i]; rgb[i*3:i*3+3] = pal[idx*3:idx*3+3]
    return w, h, rgb

def write_png(path, w, h, rgb):
    def chunk(typ, body):
        c = struct.pack(">I", len(body)) + typ + body
        return c + struct.pack(">I", zlib.crc32(typ + body) & 0xffffffff)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    stride = w*3
    raw = bytearray((stride+1)*h)
    for y in range(h):
        raw[y*(stride+1)] = 0
        raw[y*(stride+1)+1:y*(stride+1)+1+stride] = rgb[y*stride:(y+1)*stride]
    comp = zlib.compress(bytes(raw), 9)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", comp))
        f.write(chunk(b"IEND", b""))

def crop(w, h, rgb, x, y, cw, ch):
    x = max(0, min(x, w)); y = max(0, min(y, h))
    cw = min(cw, w-x); ch = min(ch, h-y)
    out = bytearray(cw*ch*3)
    for j in range(ch):
        src = ((y+j)*w + x)*3
        out[j*cw*3:(j+1)*cw*3] = rgb[src:src+cw*3]
    return cw, ch, out

def resize(w, h, rgb, nw, nh):
    out = bytearray(nw*nh*3)
    sx = w/nw; sy = h/nh
    for oy in range(nh):
        y0 = int(oy*sy); y1 = int((oy+1)*sy)
        if y1 <= y0: y1 = y0+1
        if y1 > h: y1 = h
        for ox in range(nw):
            x0 = int(ox*sx); x1 = int((ox+1)*sx)
            if x1 <= x0: x1 = x0+1
            if x1 > w: x1 = w
            r=g=b=0; n=0
            for yy in range(y0, y1):
                base = (yy*w + x0)*3
                for _ in range(x0, x1):
                    r += rgb[base]; g += rgb[base+1]; b += rgb[base+2]
                    base += 3; n += 1
            o = (oy*nw+ox)*3
            out[o] = r//n; out[o+1] = g//n; out[o+2] = b//n
    return nw, nh, out

def paste(dw, dh, dst, sw, sh, src, x, y):
    for j in range(sh):
        ty = y+j
        if ty < 0 or ty >= dh: continue
        for i in range(sw):
            tx = x+i
            if tx < 0 or tx >= dw: continue
            s = (j*sw+i)*3; d = (ty*dw+tx)*3
            dst[d:d+3] = src[s:s+3]
