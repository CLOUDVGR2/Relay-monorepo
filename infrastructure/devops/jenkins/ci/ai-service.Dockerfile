FROM python:3.14-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt pytest pytest-asyncio
COPY . .
RUN DATABASE_URL="postgresql+asyncpg://ci:ci@127.0.0.1:5432/ci_test" python -m pytest tests/ -v
CMD ["sh", "-c", "echo 'Python AI CI checks passed'"]
