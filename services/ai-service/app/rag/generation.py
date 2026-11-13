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

class LiteLLMGenerationClient:
    """JSON generation through LiteLLM, supporting hosted and local providers."""

    def __init__(
        self,
        model: str | None = None,
        timeout: float | None = None,
        api_key: str | None = None,
        api_base: str | None = None,
    ) -> None:
        self.model = (
            model or os.getenv("LITELLM_MODEL", "openai/gpt-4o-mini")
        ).strip()
        self.api_key = (
            api_key if api_key is not None else os.getenv("AI_PROVIDER_API_KEY", "")
        ).strip()
        self.api_base = (
            api_base if api_base is not None else os.getenv("LITELLM_API_BASE", "")
        ).strip() or None

        try:
            self.timeout = float(
                timeout if timeout is not None
                else os.getenv("LITELLM_TIMEOUT", "45")
            )
        except (TypeError, ValueError) as exc:
            raise ValueError("Generation timeout must be a number") from exc

        if not self.model:
            raise ValueError("model must not be empty")
        if not 1 <= self.timeout <= 120:
            raise ValueError("Generation timeout must be between 1 and 120 seconds")
        if self.api_base and not self.api_base.startswith(("http://", "https://")):
            raise ValueError("api_base must use HTTP or HTTPS")

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
            from litellm import acompletion

            response = await acompletion(
                model=self.model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                response_format={"type": "json_object"},
                timeout=self.timeout,
                api_key=self.api_key or None,
                api_base=self.api_base,
                temperature=0.1,
                max_tokens=800,
            )
        except Exception as exc:
            raise GenerationError(
                "AI provider generation request failed"
            ) from exc

        try:
            choice = response.choices[0]
            content = choice.message.content
        except (AttributeError, IndexError, KeyError, TypeError) as exc:
            raise GenerationError(
                "AI provider returned an invalid response"
            ) from exc

        if not isinstance(content, str) or not content.strip():
            raise GenerationError("AI provider returned an empty answer")

        return content.strip()


def get_generation_client():
    """Select the answer-generation provider from AI_PROVIDER."""
    if os.getenv("AI_PROVIDER", "mock").strip().lower() == "litellm":
        return LiteLLMGenerationClient()
    return OllamaGenerationClient()
