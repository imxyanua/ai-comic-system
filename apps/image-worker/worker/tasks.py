import hashlib
import io
import logging
import os
import time

import httpx
from minio import Minio

from worker.celery_app import celery_app
from worker.png import solid_png

log = logging.getLogger(__name__)

PUT_ATTEMPTS = 2
CALLBACK_ATTEMPTS = 3
MOCK_FAIL_MARKER = "[mock:fail]"
MOCK_SLOW_MARKER = "[mock:slow]"
MOCK_SLOW_SECONDS = 6


class JobCancelled(Exception):
    pass


@celery_app.task(name="panel.generate_image")
def generate_image(**kwargs: object) -> None:
    job_id = str(kwargs.get("job_id") or "")
    storage_key = str(kwargs.get("storage_key") or "")
    if not job_id or not storage_key:
        log.error("task missing job_id or storage_key")
        return
    try:
        run_job(job_id, storage_key, kwargs)
    except JobCancelled:
        log.info("job_id=%s cancelled, stopping", job_id)


def run_job(job_id: str, storage_key: str, payload: dict[str, object]) -> None:
    log.info("job_id=%s start", job_id)
    report(job_id, {"status": "running"})
    if payload.get("task_schema_version") != 1:
        fail(job_id, "UNSUPPORTED_TASK_SCHEMA", "task_schema_version không được hỗ trợ")
        return
    if os.environ.get("MOCK_INFERENCE", "1") != "1":
        fail(job_id, "SDXL_NOT_READY", "SDXL thuộc milestone sau. Dùng mock worker.")
        return

    outcome = mock_outcome(str(payload.get("prompt") or ""))
    if outcome.delay_seconds:
        time.sleep(outcome.delay_seconds)
    if outcome.fail:
        fail(job_id, "MOCK_FAILURE", "Prompt có [mock:fail]")
        return

    image = solid_png(64, 64, mock_color(str(payload.get("prompt") or "")))
    try:
        put_object(storage_key, image)
    except Exception as error:
        log.exception("job_id=%s upload failed", job_id)
        fail(job_id, "UPLOAD_FAILED", str(error))
        return
    report(job_id, {"status": "succeeded", "size_bytes": len(image)})
    log.info("job_id=%s succeeded", job_id)


class MockOutcome:
    def __init__(self, fail: bool, delay_seconds: int) -> None:
        self.fail = fail
        self.delay_seconds = delay_seconds


def mock_outcome(prompt: str) -> MockOutcome:
    return MockOutcome(
        fail=MOCK_FAIL_MARKER in prompt,
        delay_seconds=MOCK_SLOW_SECONDS if MOCK_SLOW_MARKER in prompt else 0,
    )


def mock_color(prompt: str) -> tuple[int, int, int, int]:
    """Different prompts give different mock images, so tests can tell panels apart."""
    digest = hashlib.sha256(prompt.encode("utf-8")).digest()
    return (digest[0], digest[1], digest[2], 255)


def fail(job_id: str, code: str, message: str) -> None:
    report(job_id, {"status": "failed", "error_code": code, "error_message": message})


def put_object(storage_key: str, image: bytes) -> None:
    client = Minio(
        os.environ["MINIO_ENDPOINT"],
        access_key=os.environ["MINIO_ACCESS_KEY"],
        secret_key=os.environ["MINIO_SECRET_KEY"],
        secure=os.environ.get("MINIO_USE_SSL", "false").lower() == "true",
    )
    bucket = os.environ["MINIO_BUCKET"]
    last_error: Exception | None = None
    for attempt in range(PUT_ATTEMPTS):
        try:
            client.put_object(
                bucket,
                storage_key,
                data=io.BytesIO(image),
                length=len(image),
                content_type="image/png",
            )
            return
        except Exception as error:
            last_error = error
            log.warning("upload attempt %s failed: %s", attempt + 1, error)
    assert last_error is not None
    raise last_error


def report(job_id: str, body: dict[str, object]) -> None:
    """PATCH the job on the API. Raises JobCancelled when the API rejects the update with 409."""
    url = f"{os.environ['API_INTERNAL_URL'].rstrip('/')}/internal/v1/jobs/{job_id}"
    token = os.environ["INTERNAL_SERVICE_TOKEN"]
    last_error: Exception | None = None
    for attempt in range(CALLBACK_ATTEMPTS):
        try:
            response = httpx.patch(url, json=body, headers={"X-Service-Token": token}, timeout=10)
        except httpx.HTTPError as error:
            last_error = error
        else:
            if response.status_code == 409:
                raise JobCancelled()
            if response.is_success:
                return
            last_error = RuntimeError(f"HTTP {response.status_code}: {response.text}")
        log.warning("job_id=%s callback attempt %s failed: %s", job_id, attempt + 1, last_error)
        if attempt + 1 < CALLBACK_ATTEMPTS:
            time.sleep(2)
    log.error("job_id=%s callback gave up: %s", job_id, last_error)
