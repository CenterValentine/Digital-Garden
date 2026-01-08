# Big Data and Data Science:

Solves the volume & complexity problem of data. Used for Terabytes or Petabytes.

| Program name  | Application                                                                                     | Constraint          | Tradeoffs |
| ------------- | ----------------------------------------------------------------------------------------------- | ------------------- | --------- |
| Apache Spark  | in-memory processing to run data analysis 100x faster than traditional methods like Hadoop.     | Processing Speed    |           |
| Apache Hadoop | Grandfather of big data. Slow (disk storage), but incredibly reliable for massive "batch" jobs. | Longevity           |           |
| BigQuery      | Fully managed serverless warehouse based in SQL (opinionation).                                 | Clarity/Opinionated |           |

## Serverless:

Cloud Functions eliminate server setup, OS updates and listening loops.

## Tradeoffs:

- Serverless cannot tune the underlying OS.
- Limited by timeouts of < a few minutes.
- If provider goes down, you are broken.
