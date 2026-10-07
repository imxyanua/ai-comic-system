import struct
import zlib


def solid_png(width: int, height: int, rgba: tuple[int, int, int, int] = (36, 74, 138, 255)) -> bytes:
    if width < 1 or height < 1:
        raise ValueError("width and height must be positive")

    def chunk(tag: bytes, data: bytes) -> bytes:
        crc = zlib.crc32(tag + data) & 0xFFFFFFFF
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)

    row = b"\x00" + bytes(rgba) * width
    raw = row * height
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
