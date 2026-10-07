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


@celery_app.task(name="panel.generate_image")
def generate_image(**kwargs: object) -> None:
    job_id = str(kwargs.get("job_id") or "")
    storage_key = str(kwargs.get("storage_key") or "")
    schema_version = kwargs.get("task_schema_version")
    if not job_id or not storage_key:
        log.error("task missing job_id or storage_key")
        return
    log.info("job_id=%s start", job_id)
    report(job_id, {"status": "running"})
    if os.environ.get("MOCK_INFERENCE", "1") != "1":
        report(
            job_id,
            {
                "status": "failed",
                "error_code": "SDXL_NOT_READY",
                "error_message": "SDXL thuộc milestone sau. Dùng mock worker.",
            },
        )
        return
    if schema_version != 1:
        report(
            job_id,
            {
                "status": "failed",
                "error_code": "UNSUPPORTED_TASK_SCHEMA",
                "error_message": "task_schema_version không được hỗ trợ",
            },
        )
        return
    image = solid_png(64, 64)
    try:
        put_object(storage_key, image)
    except Exception as error:
        log.exception("job_id=%s upload failed", job_id)
        report(
            job_id,
            {
                "status": "failed",
                "error_code": "UPLOAD_FAILED",
                "error_message": str(error),
            },
        )
        return
    report(job_id, {"status": "succeeded", "size_bytes": len(image)})
    log.info("job_id=%s succeeded", job_id)


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
                data=_bytes_stream(image),
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
    url = f"{os.environ['API_INTERNAL_URL'].rstrip('/')}/internal/v1/jobs/{job_id}"
    token = os.environ["INTERNAL_SERVICE_TOKEN"]
    last_error: Exception | None = None
    for attempt in range(CALLBACK_ATTEMPTS):
        try:
            response = httpx.patch(
                url,
                json=body,
                headers={"X-Service-Token": token},
                timeout=10,
            )
            response.raise_for_status()
            return
        except Exception as error:
            last_error = error
            log.warning("job_id=%s callback attempt %s failed", job_id, attempt + 1)
            if attempt + 1 < CALLBACK_ATTEMPTS:
                time.sleep(2)
    log.error("job_id=%s callback gave up: %s", job_id, last_error)


def _bytes_stream(image: bytes):
    import io

    return io.BytesIO(image)
