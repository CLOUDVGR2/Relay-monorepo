FROM python:3.14-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt pytest pytest-asyncio
COPY . .
RUN DATABASE_URL="postgresql+asyncpg://ci:ci@127.0.0.1:5432/ci_test" python -m pytest tests/ -v
RUN useradd --system --uid 10001 --user-group app && chown -R app:app /app
USER 10001:10001

CMD ["sh", "-c", "echo 'Python AI CI checks passed'"]
