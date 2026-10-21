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
        CI_JOBS_API_IMAGE = 'relay-ci-jobs-api:local'
        CI_JOBS_WORKER_IMAGE = 'relay-ci-jobs-worker:local'
        CI_NEST_API_IMAGE = 'relay-ci-nest-api:local'
        CI_AI_SERVICE_IMAGE = 'relay-ci-ai-service:local'
        CI_NEST_DB = "relay-ci-postgres-${BUILD_NUMBER}"
        CI_NEST_DB_HOST = "relay-ci-postgres-${BUILD_NUMBER}"
        CI_NEST_DATABASE_URL = "postgresql://relay_ci:relay_ci_test_only@relay-ci-postgres-${BUILD_NUMBER}:5432/relay_nest_test"
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
                      -t "$CI_WEB_IMAGE" ./apps/web
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
                      -t "$CI_NEST_API_IMAGE" ./services/nest-api
                '''
            }
        }

        stage('Test NestJS API with isolated PostgreSQL') {
            steps {
                sh '''
                    set -eu

                    docker network inspect relay-ci-network >/dev/null 2>&1 || \
                      docker network create relay-ci-network

                    docker run -d --rm \
                      --name "$CI_NEST_DB" \
                      --network relay-ci-network \
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
                      --network relay-ci-network \
                      -e DATABASE_URL="$CI_NEST_DATABASE_URL" \
                      "$CI_NEST_API_IMAGE" npx prisma migrate deploy

                    docker run --rm \
                      --network relay-ci-network \
                      -e DATABASE_URL="$CI_NEST_DATABASE_URL" \
                      "$CI_NEST_API_IMAGE" npm test
                '''
            }
        }

        stage('Build Express API') {
            steps {
                sh '''
                    set -eu
                    docker build --pull=false \
                      -f infrastructure/devops/jenkins/ci/express-api.Dockerfile \
                      -t "$CI_EXPRESS_API_IMAGE" ./services/express-api
                '''
            }
        }

        stage('Express API integration tests') {
            steps {
                sh '''
                    set -eu
                    docker network inspect relay_default >/dev/null
                    docker run --rm \
                      --network relay_default \
                      -e EXPRESS_TEST_BASE_URL=http://relay-express-api-1:5001 \
                      "$CI_EXPRESS_API_IMAGE"
                '''
            }
        }
    }

    post {
        always {
            sh '''
                docker rm -f "$CI_NEST_DB" >/dev/null 2>&1 || true
            '''
        }
        success {
            echo 'Relay CI passed: frontend, Go API, Go worker, Python AI, NestJS API, and Express API.'
        }
        failure {
            echo 'Relay CI failed. Review the first failed stage and its test output.'
        }
    }
}
