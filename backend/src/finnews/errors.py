from __future__ import annotations


class UpstreamNewsProviderError(RuntimeError):
    """Raised when the upstream news provider cannot be reached reliably."""

    def __init__(
        self,
        message: str,
        *,
        reason: str | None = None,
        status_code: int | None = None,
        provider: str = "axesso",
    ) -> None:
        super().__init__(message)
        self.reason = reason
        self.status_code = status_code
        self.provider = provider


class NewsDataParsingError(ValueError):
    """Raised when upstream payloads cannot be normalized safely."""
