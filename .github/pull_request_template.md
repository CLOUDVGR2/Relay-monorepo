## Engineering change

**Purpose**
<!-- State the user, operator, or platform outcome. -->

**Owning components**
<!-- Identify source directories and runtime services. -->

## Contract and data impact

- [ ] HTTP / GraphQL / Socket.IO / AMQP contracts reviewed
- [ ] Database schema, indexes, and migration compatibility reviewed
- [ ] Environment variables and deployment configuration reviewed
- [ ] Downstream consumers and version compatibility reviewed

## Security and reliability

- [ ] Authentication and resource authorization reviewed
- [ ] Tenant and ownership boundaries tested
- [ ] Input bounds, timeouts, retries, and idempotency reviewed
- [ ] Secrets and sensitive telemetry handling reviewed
- [ ] Failure, recovery, and shutdown behavior considered

## Verification evidence

| Check | Command / environment | Result |
|---|---|---|
| Focused tests | | |
| Integration / E2E tests | | |
| Build / typecheck / lint | | |
| Container / Kustomize / Terraform validation | | |
| Security / dependency scanning | | |

## Release and documentation

- [ ] Migration and rollout sequence documented
- [ ] Rollback compatibility assessed
- [ ] Architecture/API/operations docs updated
- [ ] Validation reflects the exact commit under review
