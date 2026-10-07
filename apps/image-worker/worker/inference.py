"""SDXL inference with Diffusers. torch and diffusers are imported lazily so the mock worker does not need them."""

import io
import logging
import os
import threading

log = logging.getLogger(__name__)

DEFAULT_MODEL_ID = "stabilityai/stable-diffusion-xl-base-1.0"

_pipeline = None
_lock = threading.Lock()


class InferenceOutOfMemory(Exception):
    pass


def device() -> str:
    return os.environ.get("INFERENCE_DEVICE", "cuda")


def load_pipeline():
    import torch
    from diffusers import StableDiffusionXLPipeline

    model_id = os.environ.get("SDXL_MODEL_ID", DEFAULT_MODEL_ID)
    on_gpu = device().startswith("cuda")
    kwargs = {"torch_dtype": torch.float16 if on_gpu else torch.float32}
    if on_gpu and os.environ.get("SDXL_FP16_VARIANT", "1") == "1":
        kwargs["variant"] = "fp16"
    log.info("loading %s on %s", model_id, device())
    pipeline = StableDiffusionXLPipeline.from_pretrained(model_id, **kwargs).to(device())
    pipeline.set_progress_bar_config(disable=True)
    return pipeline


def get_pipeline():
    global _pipeline
    with _lock:
        if _pipeline is None:
            _pipeline = load_pipeline()
        return _pipeline


def generate_png(prompt: str, negative_prompt: str, seed: int, width: int, height: int, steps: int) -> bytes:
    import torch

    pipeline = get_pipeline()
    generator_device = device() if device().startswith("cuda") else "cpu"
    generator = torch.Generator(device=generator_device).manual_seed(seed)
    try:
        image = pipeline(
            prompt=prompt,
            negative_prompt=negative_prompt,
            width=width - width % 8,
            height=height - height % 8,
            num_inference_steps=steps,
            generator=generator,
        ).images[0]
    except torch.cuda.OutOfMemoryError as error:
        torch.cuda.empty_cache()
        raise InferenceOutOfMemory(str(error)) from error
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()
