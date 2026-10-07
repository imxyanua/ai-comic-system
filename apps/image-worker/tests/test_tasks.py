import pytest

from worker import tasks


@pytest.fixture
def calls(monkeypatch):
    recorded = {"reports": [], "puts": []}

    def fake_report(job_id, body):
        recorded["reports"].append(body)

    def fake_put(storage_key, image):
        recorded["puts"].append(storage_key)

    monkeypatch.setenv("MOCK_INFERENCE", "1")
    monkeypatch.setattr(tasks, "report", fake_report)
    monkeypatch.setattr(tasks, "put_object", fake_put)
    monkeypatch.setattr(tasks.time, "sleep", lambda seconds: None)
    return recorded


def payload(prompt="a street"):
    return {"task_schema_version": 1, "prompt": prompt}


def test_mock_success_uploads_then_reports(calls):
    tasks.run_job("job-1", "panels/c/job-1.png", payload())
    assert calls["puts"] == ["panels/c/job-1.png"]
    assert [body["status"] for body in calls["reports"]] == ["running", "succeeded"]
    assert calls["reports"][-1]["size_bytes"] > 0


def test_mock_fail_marker_reports_failure_without_upload(calls):
    tasks.run_job("job-1", "panels/c/job-1.png", payload("rain [mock:fail]"))
    assert calls["puts"] == []
    assert calls["reports"][-1] == {
        "status": "failed",
        "error_code": "MOCK_FAILURE",
        "error_message": "Prompt có [mock:fail]",
    }


def test_unknown_schema_version_fails(calls):
    tasks.run_job("job-1", "k", {"task_schema_version": 2, "prompt": "x"})
    assert calls["reports"][-1]["error_code"] == "UNSUPPORTED_TASK_SCHEMA"


def test_cancelled_job_stops_before_upload(monkeypatch):
    puts = []

    def cancelled_report(job_id, body):
        raise tasks.JobCancelled()

    monkeypatch.setattr(tasks, "report", cancelled_report)
    monkeypatch.setattr(tasks, "put_object", lambda key, image: puts.append(key))
    tasks.generate_image(job_id="job-1", storage_key="k", task_schema_version=1, prompt="x")
    assert puts == []


def test_slow_marker_delays():
    assert tasks.mock_outcome("x [mock:slow]").delay_seconds == tasks.MOCK_SLOW_SECONDS
    assert tasks.mock_outcome("x").delay_seconds == 0


def test_report_raises_cancelled_on_409(monkeypatch):
    class Response:
        status_code = 409
        is_success = False
        text = "conflict"

    monkeypatch.setenv("API_INTERNAL_URL", "http://api")
    monkeypatch.setenv("INTERNAL_SERVICE_TOKEN", "t")
    monkeypatch.setattr(tasks.httpx, "patch", lambda *args, **kwargs: Response())
    with pytest.raises(tasks.JobCancelled):
        tasks.report("job-1", {"status": "running"})
