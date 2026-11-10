"""Strict, bounded contracts for multi-agent tasks and plans."""

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field, model_validator


MAX_PLAN_STEPS = 12
MAX_STEP_DEPENDENCIES = MAX_PLAN_STEPS - 1
MAX_TASK_PROMPT_CHARS = 4_000
MAX_STEP_OUTPUT_CHARS = 8_000


class StrictModel(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        validate_assignment=True,
    )


class AgentRole(StrEnum):
    PLANNER = "planner"
    RESEARCHER = "researcher"
    EXECUTOR = "executor"
    MEMORY = "memory"
    WRITER = "writer"
    ANALYST = "analyst"
    REVIEWER = "reviewer"
    COORDINATOR = "coordinator"


EXECUTABLE_AGENT_ROLES = frozenset({
    AgentRole.RESEARCHER,
    AgentRole.EXECUTOR,
    AgentRole.MEMORY,
    AgentRole.WRITER,
    AgentRole.ANALYST,
})


class TaskStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class StepStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class TaskRequest(StrictModel):
    prompt: str = Field(
        min_length=1,
        max_length=MAX_TASK_PROMPT_CHARS,
    )
    max_steps: int = Field(default=8, ge=1, le=MAX_PLAN_STEPS)
    timeout_seconds: float = Field(default=180.0, gt=0, le=240)


class PlanStep(StrictModel):
    id: str = Field(pattern=r"^[a-z][a-z0-9_-]{0,63}$")
    role: AgentRole = AgentRole.EXECUTOR
    depends_on: list[str] = Field(
        default_factory=list,
        max_length=MAX_STEP_DEPENDENCIES,
    )
    objective: str = Field(min_length=1, max_length=1_000)
    expected_output: str = Field(min_length=1, max_length=500)


class TaskPlan(StrictModel):
    steps: list[PlanStep] = Field(min_length=1, max_length=MAX_PLAN_STEPS)

    @model_validator(mode="after")
    def validate_dependencies(self):
        for step in self.steps:
            if step.role not in EXECUTABLE_AGENT_ROLES:
                raise ValueError(
                    f"Role {step.role.value} cannot be used as an executable plan step"
                )

        by_id = {step.id: step for step in self.steps}

        if len(by_id) != len(self.steps):
            raise ValueError("Plan step IDs must be unique")

        for step in self.steps:
            if len(step.depends_on) != len(set(step.depends_on)):
                raise ValueError(
                    f"Step {step.id} contains duplicate dependencies"
                )

            if step.id in step.depends_on:
                raise ValueError(f"Step {step.id} cannot depend on itself")

            unknown = set(step.depends_on) - by_id.keys()
            if unknown:
                raise ValueError(
                    f"Step {step.id} references an unknown dependency"
                )

        # Reject cycles before execution. This traversal is bounded by the
        # plan's maximum of 12 steps.
        visiting: set[str] = set()
        visited: set[str] = set()

        def visit(step_id: str) -> None:
            if step_id in visiting:
                raise ValueError("Plan dependencies must be acyclic")
            if step_id in visited:
                return

            visiting.add(step_id)
            for dependency in by_id[step_id].depends_on:
                visit(dependency)
            visiting.remove(step_id)
            visited.add(step_id)

        for step in self.steps:
            visit(step.id)

        return self


class StepResult(StrictModel):
    step_id: str = Field(min_length=1, max_length=64)
    role: AgentRole
    status: StepStatus
    output: str | None = Field(default=None, max_length=MAX_STEP_OUTPUT_CHARS)
    error_code: str | None = Field(default=None, max_length=80)


class ReviewResult(StrictModel):
    approved: bool
    final_answer: str | None = Field(default=None, max_length=8_000)
    feedback: str = Field(default="", max_length=2_000)


class SpecialistOutput(StrictModel):
    """Validated, bounded output shared by specialist agents."""

    content: str = Field(min_length=1, max_length=MAX_STEP_OUTPUT_CHARS)
    caveats: list[str] = Field(default_factory=list, max_length=12)
    evidence_refs: list[str] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def validate_metadata(self):
        if any(not item.strip() or len(item) > 500 for item in self.caveats):
            raise ValueError("Specialist caveats must be non-empty and bounded")
        if any(not item.strip() or len(item) > 200 for item in self.evidence_refs):
            raise ValueError("Specialist evidence references must be non-empty and bounded")
        return self


class TaskResult(StrictModel):
    status: TaskStatus
    steps: list[StepResult] = Field(max_length=MAX_PLAN_STEPS)
    final_output: str | None = Field(default=None, max_length=MAX_STEP_OUTPUT_CHARS)
    error_message: str | None = Field(default=None, max_length=500)
