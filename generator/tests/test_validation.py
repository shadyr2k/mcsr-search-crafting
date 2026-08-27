import pytest

from mcsr_data.validation import Diagnostic, ValidationFailed, ValidationReport


def test_missing_name_is_an_error():
    report = ValidationReport()
    report.error("missing_translation", "minecraft:unknown", "No en_us name")

    with pytest.raises(ValidationFailed):
        report.raise_if_errors()


def test_diagnostics_are_sorted_by_severity_code_and_subject():
    report = ValidationReport()
    report.error("zebra", "minecraft:b", "second")
    report.warning("alpha", "minecraft:z", "first")
    report.error("alpha", "minecraft:a", "third")

    assert report.diagnostics == (
        Diagnostic("error", "alpha", "minecraft:a", "third"),
        Diagnostic("error", "zebra", "minecraft:b", "second"),
        Diagnostic("warning", "alpha", "minecraft:z", "first"),
    )


def test_validation_failure_has_a_deterministic_actionable_message():
    report = ValidationReport()
    report.error("missing_translation", "minecraft:unknown", "No en_us name")

    with pytest.raises(ValidationFailed, match="error missing_translation minecraft:unknown: No en_us name"):
        report.raise_if_errors()
