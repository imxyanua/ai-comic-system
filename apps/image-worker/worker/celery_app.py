import os

from celery import Celery

celery_app = Celery("image_worker", broker=os.environ["CELERY_BROKER_URL"])
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    task_ignore_result=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    worker_concurrency=1,
    task_time_limit=600,
    broker_connection_retry_on_startup=True,
    imports=("worker.tasks",),
)
