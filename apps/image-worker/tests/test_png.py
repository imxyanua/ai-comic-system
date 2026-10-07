from worker.png import solid_png


def test_solid_png_has_png_signature():
    image = solid_png(8, 8)
    assert image.startswith(b"\x89PNG\r\n\x1a\n")
    assert len(image) > 32
