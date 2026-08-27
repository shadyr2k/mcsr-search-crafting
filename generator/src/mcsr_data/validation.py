from dataclasses import dataclass


@dataclass(frozen=True, order=True)
class Diagnostic:
    severity: str
    code: str
    subject: str
    message: str


class ValidationFailed(ValueError):
    """Raised when a validation report contains errors."""

    def __init__(self, diagnostics: tuple[Diagnostic, ...]) -> None:
        self.diagnostics = diagnostics
        super().__init__("\n".join(
            f"{diagnostic.severity} {diagnostic.code} {diagnostic.subject}: {diagnostic.message}"
            for diagnostic in diagnostics
        ))


class ValidationReport:
    def __init__(self) -> None:
        self._diagnostics: list[Diagnostic] = []

    @property
    def diagnostics(self) -> tuple[Diagnostic, ...]:
        return tuple(sorted(self._diagnostics))

    def error(self, code: str, subject: str, message: str) -> None:
        self._add("error", code, subject, message)

    def warning(self, code: str, subject: str, message: str) -> None:
        self._add("warning", code, subject, message)

    def raise_if_errors(self) -> None:
        errors = tuple(diagnostic for diagnostic in self.diagnostics if diagnostic.severity == "error")
        if errors:
            raise ValidationFailed(errors)

    def _add(self, severity: str, code: str, subject: str, message: str) -> None:
        self._diagnostics.append(Diagnostic(severity, code, subject, message))
