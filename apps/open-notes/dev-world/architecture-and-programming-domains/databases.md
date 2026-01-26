# Databases:

## ACID: Atomicity, Consistency, Isolation, Durability

Meaning A -> B must happen or nothing happens.

Atomicity: A transaction is treated as a single, indivisible unit that either completes entirely or fails completely, with no partial execution.
Consistency: Ensures the database moves from one valid state to another valid state, maintaining all defined rules, constraints, and integrity requirements.
Isolation: Concurrent transactions execute independently without interfering with each other, as if they were running sequentially.
Durability: Once a transaction is committed, its changes are permanently saved and will survive system failures, crashes, or power outages.

## BASE: Basically Available, Soft state, Eventual consistency

Prioritizes availability and Partition Tolerance over Consistency.

Basically Available: The system guarantees availability and will respond to requests even if some parts are failing, though the response may be a failure message or stale data.
Soft state: The state of the system may change over time without new input due to eventual consistency, meaning data doesn't have to be immediately consistent across all nodes.
Eventual consistency: The system will eventually become consistent across all nodes once all updates have propagated, though there may be temporary inconsistencies during that time.

## Database Comparison:

| PostgreSQL | SQL driven database                                                          | SQL gold standard for data integrity. | Integrity/Battle Tested |     |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------- | ----------------------- | --- |
| MongoDB    | document-oriented database (NoSQL) that stores data in JSON-like structures. | Large volumes of varied data.         | Scale/Speed             |     |
| Redis      | in-memory data key-value store.                                              | Caching for sub-millisecond speeds.   | Clarity - Opinionated   |     |
