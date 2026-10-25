"""Validated request and response models for conversation analysis."""

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


class ConversationAnalysisMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sender: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=1, max_length=5000)

    @field_validator("sender", "text")
    @classmethod
    def reject_blank_values(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("value must not be empty")
        return value


class ConversationAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: list[ConversationAnalysisMessage] = Field(
        min_length=1, max_length=100
    )

    @model_validator(mode="after")
    def bound_total_transcript(self):
        total = sum(
            len(message.sender) + len(message.text)
            for message in self.messages
        )
        if total > 50000:
            raise ValueError("transcript exceeds the maximum allowed size")
        return self


class ConversationActionItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task: str = Field(min_length=1, max_length=1000)
    owner: str | None = Field(default=None, max_length=200)
    due_date: str | None = Field(default=None, max_length=100)


class ConversationAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    summary: str = Field(min_length=1, max_length=4000)
    decisions: list[str] = Field(default_factory=list, max_length=30)
    action_items: list[ConversationActionItem] = Field(
        default_factory=list, max_length=50
    )

    @field_validator("summary")
    @classmethod
    def validate_summary(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("summary must not be empty")
        return value

    @field_validator("decisions")
    @classmethod
    def validate_decisions(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values]
        if any(not value for value in cleaned):
            raise ValueError("decisions must not contain blank values")
        return cleaned
