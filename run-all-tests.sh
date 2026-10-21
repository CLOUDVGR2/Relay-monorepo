#!/bin/bash

failures=0
passed=0
skipped=0

run_check() {
  name="$1"
  shift

  echo
  echo "========================================"
  echo "RUNNING: $name"
  echo "========================================"

  "$@"
  result=$?

  if [ "$result" -eq 0 ]; then
    echo "PASS: $name"
    passed=$((passed + 1))
  else
    echo "FAIL: $name (exit $result)"
    failures=$((failures + 1))
  fi
}

# Official project test suite:
# Nest backend, frontend, Python AI, Go API, and Go worker.
run_check "Official project test:all" npm run test:all

# Express backend integration tests.
if [ -f services/express-api/package.json ] &&
   node -e 'process.exit(require("./services/express-api/package.json").scripts?.["test:integration"] ? 0 : 1)'; then
  run_check "Express backend integration" \
    npm run test:integration --prefix services/express-api
else
  echo "SKIP: Express backend integration script not found"
  skipped=$((skipped + 1))
fi

# Root integration and end-to-end tests.
if [ -d tests/integration ]; then
  run_check "Root integration tests" \
    ./services/nest-api/node_modules/.bin/vitest run --globals --root . tests/integration/*.test.js
else
  echo "SKIP: Root integration tests"
  skipped=$((skipped + 1))
fi

if [ -f tests/e2e/full-flow.test.js ]; then
  run_check "Root full-flow E2E" \
    ./services/nest-api/node_modules/.bin/vitest run --globals --root . tests/e2e/full-flow.test.js
else
  echo "SKIP: Root full-flow E2E"
  skipped=$((skipped + 1))
fi

# Nest API end-to-end tests.
if [ -f services/nest-api/package.json ] &&
   node -e 'process.exit(require("./services/nest-api/package.json").scripts?.["test:e2e"] ? 0 : 1)'; then
  run_check "Nest API E2E" npm run test:e2e:nest-api
else
  echo "SKIP: Nest API E2E script not found"
  skipped=$((skipped + 1))
fi

# Frontend Playwright end-to-end tests.
if [ -f apps/web/package.json ] &&
   node -e 'process.exit(require("./apps/web/package.json").scripts?.["test:e2e"] ? 0 : 1)'; then
  run_check "Frontend Playwright E2E" npm run test:e2e:web
else
  echo "SKIP: Frontend E2E script not found"
  skipped=$((skipped + 1))
fi

echo
echo "========================================"
echo "FINAL TEST SUMMARY"
echo "========================================"
echo "Passed:  $passed"
echo "Failed:  $failures"
echo "Skipped: $skipped"
echo "========================================"

if [ "$failures" -gt 0 ]; then
  exit 1
fi
