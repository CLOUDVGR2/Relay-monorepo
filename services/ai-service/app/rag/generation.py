"""Local answer generation using Ollama."""

import os

import httpx


class GenerationError(RuntimeError):
    """Raised when local answer generation fails."""


class OllamaGenerationClient:
    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout: float | None = None,
    ) -> None:
        self.base_url = (
            base_url or os.getenv(
                "OLLAMA_BASE_URL",
                "http://127.0.0.1:11434",
            )
        ).rstrip("/")
        self.model = (
            model
            or os.getenv(
                "OLLAMA_GENERATION_MODEL",
                "qwen2.5:3b-instruct",
            )
        ).strip()

        try:
            self.timeout = float(
                timeout
                if timeout is not None
                else os.getenv("OLLAMA_GENERATION_TIMEOUT", "45")
            )
        except (TypeError, ValueError) as exc:
            raise ValueError("Generation timeout must be a number") from exc

        if not self.base_url.startswith(("http://", "https://")):
            raise ValueError("base_url must use HTTP or HTTPS")

        if not self.model:
            raise ValueError("model must not be empty")

        if not 1 <= self.timeout <= 120:
            raise ValueError("Generation timeout must be between 1 and 120 seconds")

    async def generate(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
    ) -> str:
        if not isinstance(system_prompt, str) or not system_prompt.strip():
            raise ValueError("system_prompt must not be empty")

        if not isinstance(user_prompt, str) or not user_prompt.strip():
            raise ValueError("user_prompt must not be empty")

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
                    json={
                        "model": self.model,
                        "stream": False,
                        "messages": [
                            {
                                "role": "system",
                                "content": system_prompt,
                            },
                            {
                                "role": "user",
                                "content": user_prompt,
                            },
                        ],
                        "options": {
                            "temperature": 0.1,
                            "num_predict": 800,
                        },
                    },
                )
                response.raise_for_status()
                payload = response.json()
        except (httpx.HTTPError, ValueError) as exc:
            raise GenerationError(
                "Local answer generation request failed"
            ) from exc

        if not isinstance(payload, dict):
            raise GenerationError("Ollama returned an invalid response")

        message = payload.get("message")
        if not isinstance(message, dict):
            raise GenerationError("Ollama response did not contain a message")

        content = message.get("content")
        if not isinstance(content, str) or not content.strip():
            raise GenerationError("Ollama returned an empty answer")

        return content.strip()
