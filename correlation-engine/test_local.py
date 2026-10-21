import os
import sys

# Ensure correlation-engine directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from db import init_db, save_incident, get_incidents, get_summary
from rules import normalize_service, rule_memory_failure, rule_crashloop, rule_security_threat, rule_performance_degradation
from correlator import run_correlation

def test_all():
    print(">>> Testing service normalization...")
    assert normalize_service("backend-79f98444dc-z98qk") == "backend"
    assert normalize_service("backend") == "backend"
    print("[OK] Normalization passed.")

    print(">>> Testing Rule: rule_memory_failure...")
    test_events = [
        {
            "id": "1",
            "source": "prometheus",
            "service": "backend",
            "severity": "warning",
            "timestamp": "2026-10-21T12:00:00",
            "data": {"metric": "memory", "value_bytes": 195000000}
        },
        {
            "id": "2",
            "source": "loki",
            "service": "backend",
            "severity": "error",
            "timestamp": "2026-10-21T12:00:05",
            "data": {"log": "Allocation failed - JavaScript heap out of memory"}
        },
        {
            "id": "3",
            "source": "k8s",
            "service": "backend",
            "severity": "critical",
            "timestamp": "2026-10-21T12:00:10",
            "data": {"terminated_reason": "OOMKilled", "restart_count": 2}
        }
    ]
    res = rule_memory_failure(test_events)
    assert res is not None, "Rule memory failure should match!"
    assert res["incident_type"] == "memory_failure"
    assert len(res["evidence"]) == 3
    print("[OK] Rule memory failure passed:", res["title"])

    print(">>> Testing Rule: rule_security_threat...")
    falco_events = [
        {
            "id": "4",
            "source": "falco",
            "service": "backend",
            "severity": "notice",
            "timestamp": "2026-10-21T12:05:00",
            "data": {"rule": "Terminal shell in container"}
        }
    ]
    sec_res = rule_security_threat(falco_events)
    assert sec_res is not None
    assert sec_res["incident_type"] == "security_threat"
    print("[OK] Rule security threat passed:", sec_res["title"])

    print(">>> Testing In-Memory DB & Correlation Loop...")
    init_db()
    corr_res = run_correlation()
    print("[OK] Initial correlation idle run:", corr_res["status"])

    print("\nALL LOCAL TESTS PASSED SUCCESSFULLY! [OK]")

if __name__ == "__main__":
    test_all()
