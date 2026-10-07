"""Runs the real Diffusers SDXL pipeline on CPU with a tiny test model. Needs torch and diffusers (Dockerfile.gpu)."""

import io
import os

import pytest

pytestmark = pytest.mark.skipif(os.environ.get("RUN_SDXL_CPU") != "1", reason="set RUN_SDXL_CPU=1 inside the GPU image")


def test_tiny_sdxl_generates_png_of_requested_size(monkeypatch):
    from PIL import Image

    from worker import inference

    monkeypatch.setenv("INFERENCE_DEVICE", "cpu")
    monkeypatch.setenv("SDXL_MODEL_ID", os.environ.get("SDXL_MODEL_ID", "hf-internal-testing/tiny-stable-diffusion-xl-pipe"))
    png = inference.generate_png(prompt="a rainy street", negative_prompt="blurry", seed=1, width=64, height=64, steps=2)
    assert png.startswith(b"\x89PNG\r\n\x1a\n")
    assert Image.open(io.BytesIO(png)).size == (64, 64)

    again = inference.generate_png(prompt="a rainy street", negative_prompt="blurry", seed=1, width=64, height=64, steps=2)
    assert again == png
