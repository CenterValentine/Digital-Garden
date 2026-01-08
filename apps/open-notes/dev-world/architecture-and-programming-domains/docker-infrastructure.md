# Docker Infrastructure: Enviornment consistency across development, testing, and production.

Docker packages appliction eith its entire world of libraries, OS, and settings so applications run identically everywhere.

| Framework       | Description                                                   | Constraint                                                                                                                                                                                                        | Application                                                                                                                                                 |
| --------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker Compose  | Single host                                                   | Simple                                                                                                                                                                                                            | Lets you define a multi-container app (like a web app + a database) in one simple file.                                                                     |
| Kubernetes (K8) | Cluster orchestrator **"Self-Healing"** and **"Rescheduling** | For scaling (battle tested), Small change" involves a massive machinery of checks. You must define Resource Requests and Limits (CPU/RAM) and Health Checks (Liveness/Readiness probes) for every single service. | Manages thousands of containers (server nodes) and treats them as one giant pool of resources. Replaces broken containers and scales them based on traffic. |
| Nomad           |                                                               | Opinionated (Speed)                                                                                                                                                                                               | Opinionated laternative to kubernetes that focuses on "scheduling" tasks without the as much complexity of K8.                                              |

### Assumptions:

- The application is stateless.
- You are moving toward a microservices model.

### Tradeoffs:

- Infrastructure simplicity vs portability.
- Docker/K8s allows you to move your application from AWS to Google Cloud in 1 day.

### Teams:

- Platform engineering teams live inside Kubernetes to ensure 99.99% uptime.
