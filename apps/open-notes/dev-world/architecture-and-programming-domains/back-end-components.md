# Back-end Components / Messaging:

Solves the decoupling problem. Messaging layers buffer failure between services.

how services talk to each other through Messaging (like RabbitMQ or Kafka) or handle Caching at scale.

| Program name          | Application                                                                        | Constraint            | Tradeoffs |
| --------------------- | ---------------------------------------------------------------------------------- | --------------------- | --------- |
| RabbitMQ              | Smart broker that ensrues messages get to the right place.                         | Simplicity            |           |
| Apache Kafka          | Can handle trillions of events (built by linkedin). It permanantly store messages. | Scale (battle tested) |           |
| dbt (Data BUild Tool) | Transformation part of data pipelines. Forces you to write modular/testable SQL.   | Clarity opinionation. |           |

## Assumptions:

Assumes a Microservices or Event-Driven architecture.

## Tradeoffs: System Simplicity for Resilience (esp Kafka).

## Teams:

- High-growth startups use RabbitMQ to handle background tasks (like sending emails). Enterprise giants use Kafka to sync data across hundresds of global services.
