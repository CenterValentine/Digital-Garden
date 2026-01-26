# API Design:

data contract management.

| Framework | Description                                                             | Application                                | Constraint               | Tradeoff |
| --------- | ----------------------------------------------------------------------- | ------------------------------------------ | ------------------------ | -------- |
| REST      | HTTP methods of GET, POST, PUT, DELETE.                                 | Highly cachaeble                           | Predictable/Battletested |          |
| GraphQL   | Allows client to ask for the exact data it needs, nothing more or less. | No over fetching.                          | Client-Driven/Scale      |          |
| gRPC      | Uses protocol buffers instead of JSON.                                  | Internal service-to-service communication. | Speed/Performance        |          |
