pipeline {
    agent any

    options {
        skipDefaultCheckout(true)
        timestamps()
        disableConcurrentBuilds()
        timeout(time: 45, unit: 'MINUTES')
    }

    environment {
        CI_EXPRESS_API_IMAGE = 'relay-ci-express-api:local'
        CI_WEB_IMAGE = 'relay-ci-web:local'
        CI_API_GATEWAY_IMAGE = 'relay-ci-api-gateway:local'
        CI_JOBS_API_IMAGE = 'relay-ci-jobs-api:local'
        CI_JOBS_WORKER_IMAGE = 'relay-ci-jobs-worker:local'
        CI_NEST_API_IMAGE = 'relay-ci-nest-api:local'
        CI_AI_SERVICE_IMAGE = 'relay-ci-ai-service:local'
        CI_NETWORK = "relay-ci-${BUILD_NUMBER}"
        CI_NEST_DB = "relay-ci-postgres-${BUILD_NUMBER}"
        CI_NEST_DB_HOST = "relay-ci-postgres-${BUILD_NUMBER}"
        CI_NEST_DATABASE_URL = "postgresql://relay_ci:relay_ci_test_only@relay-ci-postgres-${BUILD_NUMBER}:5432/relay_nest_test"
        CI_MONGO = "relay-ci-mongo-${BUILD_NUMBER}"
        CI_REDIS = "relay-ci-redis-${BUILD_NUMBER}"
        CI_EXPRESS_SERVER = "relay-ci-express-${BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
                sh '''
                    set -eu
                    test -f compose.yaml
                    test -f infrastructure/devops/jenkins/ci/express-api.Dockerfile
                    test -f infrastructure/devops/jenkins/ci/web.Dockerfile
                    test -f infrastructure/devops/jenkins/ci/api-gateway.Dockerfile
                    test -f infrastructure/devops/jenkins/ci/jobs-api.Dockerfile
                    test -f infrastructure/devops/jenkins/ci/jobs-worker.Dockerfile
                    test -f infrastructure/devops/jenkins/ci/nest-api.Dockerfile
                    test -f infrastructure/devops/jenkins/ci/ai-service.Dockerfile
                    echo "Repository and all six CI runner definitions found."
                '''
            }
        }

        stage('Build and test Web') {
            steps {
                sh '''
                    set -eu
                    docker build --pull=false \
                      -f infrastructure/devops/jenkins/ci/web.Dockerfile \
                      -t "$CI_WEB_IMAGE" .
                '''
            }
        }

        stage('Build and test Go API Gateway') {
            steps {
                sh '''
                    set -eu
                    docker build --pull=false \
                      -f infrastructure/devops/jenkins/ci/api-gateway.Dockerfile \
                      -t "$CI_API_GATEWAY_IMAGE" ./services/api-gateway
                '''
            }
        }

        stage('Build and test Jobs API') {
            steps {
                sh '''
                    set -eu
                    docker build --pull=false \
                      -f infrastructure/devops/jenkins/ci/jobs-api.Dockerfile \
                      -t "$CI_JOBS_API_IMAGE" ./services/jobs-api
                '''
            }
        }

        stage('Build and test Jobs Worker') {
            steps {
                sh '''
                    set -eu
                    docker build --pull=false \
                      -f infrastructure/devops/jenkins/ci/jobs-worker.Dockerfile \
                      -t "$CI_JOBS_WORKER_IMAGE" ./services/jobs-worker
                '''
            }
        }

        stage('Build and test AI Service') {
            steps {
                sh '''
                    set -eu
                    docker build --pull=false \
                      -f infrastructure/devops/jenkins/ci/ai-service.Dockerfile \
                      -t "$CI_AI_SERVICE_IMAGE" ./services/ai-service
                '''
            }
        }

        stage('Build NestJS API') {
            steps {
                sh '''
                    set -eu
                    docker build --pull=false \
                      -f infrastructure/devops/jenkins/ci/nest-api.Dockerfile \
                      -t "$CI_NEST_API_IMAGE" .
                '''
            }
        }

        stage('Test NestJS API with isolated PostgreSQL') {
            steps {
                sh '''
                    set -eu

                    docker network inspect "$CI_NETWORK" >/dev/null 2>&1 || \
                      docker network create "$CI_NETWORK"

                    docker run -d --rm \
                      --name "$CI_NEST_DB" \
                      --network "$CI_NETWORK" \
                      --network-alias "$CI_NEST_DB_HOST" \
                      -e POSTGRES_DB=relay_nest_test \
                      -e POSTGRES_USER=relay_ci \
                      -e POSTGRES_PASSWORD=relay_ci_test_only \
                      --health-cmd="pg_isready -U relay_ci -d relay_nest_test" \
                      --health-interval=2s \
                      --health-timeout=3s \
                      --health-retries=30 \
                      postgres:17

                    ready=0
                    for attempt in $(seq 1 60); do
                      status=$(docker inspect --format='{{.State.Health.Status}}' "$CI_NEST_DB" 2>/dev/null || true)
                      if [ "$status" = "healthy" ]; then
                        ready=1
                        break
                      fi
                      if [ "$status" = "unhealthy" ]; then
                        docker logs "$CI_NEST_DB"
                        exit 1
                      fi
                      sleep 2
                    done

                    if [ "$ready" -ne 1 ]; then
                      docker logs "$CI_NEST_DB"
                      echo "Isolated NestJS test database did not become healthy."
                      exit 1
                    fi

                    docker run --rm \
                      --network "$CI_NETWORK" \
                      -e DATABASE_URL="$CI_NEST_DATABASE_URL" \
                      "$CI_NEST_API_IMAGE" pnpm --filter @relay/nest-api exec prisma migrate deploy

                    docker run --rm \
                      --network "$CI_NETWORK" \
                      -e DATABASE_URL="$CI_NEST_DATABASE_URL" \
                      "$CI_NEST_API_IMAGE" pnpm --filter @relay/nest-api run test
                '''
            }
        }

        stage('Build Express API integration image') {
            steps {
                sh '''
                    set -eu
                    docker build --pull=false \
                      -f infrastructure/devops/jenkins/ci/express-api.Dockerfile \
                      -t "$CI_EXPRESS_API_IMAGE" .
                '''
            }
        }

        stage('Express API integration tests') {
            steps {
                sh '''
                    set -eu

                    docker network inspect "$CI_NETWORK" >/dev/null 2>&1 || \
                      docker network create "$CI_NETWORK"

                    docker run -d --rm \
                      --name "$CI_MONGO" \
                      --network "$CI_NETWORK" \
                      --network-alias mongo \
                      mongo:8.0

                    docker run -d --rm \
                      --name "$CI_REDIS" \
                      --network "$CI_NETWORK" \
                      --network-alias redis \
                      redis:7-alpine

                    mongo_ready=0
                    for attempt in $(seq 1 60); do
                      if docker exec "$CI_MONGO" mongosh --quiet --eval 'db.adminCommand("ping").ok' 2>/dev/null | grep -q '^1$'; then
                        mongo_ready=1
                        break
                      fi
                      sleep 2
                    done

                    if [ "$mongo_ready" -ne 1 ]; then
                      docker logs "$CI_MONGO"
                      echo "Isolated MongoDB did not become ready."
                      exit 1
                    fi

                    redis_ready=0
                    for attempt in $(seq 1 30); do
                      if [ "$(docker exec "$CI_REDIS" redis-cli ping 2>/dev/null || true)" = "PONG" ]; then
                        redis_ready=1
                        break
                      fi
                      sleep 2
                    done

                    if [ "$redis_ready" -ne 1 ]; then
                      docker logs "$CI_REDIS"
                      echo "Isolated Redis did not become ready."
                      exit 1
                    fi

                    docker run -d --rm \
                      --name "$CI_EXPRESS_SERVER" \
                      --network "$CI_NETWORK" \
                      --network-alias express \
                      -e NODE_ENV=test \
                      -e PORT=5001 \
                      -e MONGODB_URI=mongodb://mongo:27017/relay_express_health_test \
                      -e REDIS_URL=redis://redis:6379 \
                      -e JWT_SECRET=relay-ci-test-jwt-secret-only \
                      -e CLIENT_URL=http://localhost:5173 \
                      -e PYTHON_AI_INTERNAL_TOKEN=relay-ci-test-ai-token-only \
                      -e CALL_EVENTS_INTERNAL_TOKEN=call-events-integration-internal-token-only \
                      "$CI_EXPRESS_API_IMAGE" \
                      pnpm --filter @relay/express-api run start

                    express_ready=0
                    for attempt in $(seq 1 60); do
                      if docker exec "$CI_EXPRESS_SERVER" node -e 'fetch("http://127.0.0.1:5001/api/health/ready").then(response => process.exit(response.status === 200 ? 0 : 1)).catch(() => process.exit(1))' >/dev/null 2>&1; then
                        express_ready=1
                        break
                      fi
                      if ! docker inspect "$CI_EXPRESS_SERVER" >/dev/null 2>&1; then
                        break
                      fi
                      sleep 2
                    done

                    if [ "$express_ready" -ne 1 ]; then
                      docker logs "$CI_EXPRESS_SERVER" 2>&1 || true
                      echo "Isolated Express API did not become ready."
                      exit 1
                    fi

                    docker run --rm \
                      --network "$CI_NETWORK" \
                      -e EXPRESS_TEST_BASE_URL=http://express:5001 \
                      -e EXPRESS_TEST_MONGO_URI=mongodb://mongo:27017/relay_call_events_integration_test \
                      -e REDIS_URL=redis://redis:6379 \
                      -e CLIENT_URL=http://localhost:5173 \
                      -e CALL_EVENTS_INTERNAL_TOKEN=call-events-integration-internal-token-only \
                      "$CI_EXPRESS_API_IMAGE"
                '''
            }
        }
    }

    post {
        always {
            sh '''
                docker rm -f "$CI_EXPRESS_SERVER" "$CI_MONGO" "$CI_REDIS" "$CI_NEST_DB" >/dev/null 2>&1 || true
                docker network rm "$CI_NETWORK" >/dev/null 2>&1 || true
            '''
        }
        success {
            echo 'Relay CI passed: frontend, Go API gateway, Go Jobs API, Go Jobs Worker, Python AI service, NestJS API, and Express API.'
        }
        failure {
            echo 'Relay CI failed. Review the first failed stage and its test output.'
        }
    }
}
