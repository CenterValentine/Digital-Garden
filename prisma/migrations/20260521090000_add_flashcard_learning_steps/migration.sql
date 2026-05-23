-- Migration A.1: Add learning_steps counter to Flashcard.
--
-- Follow-on to 20260520120000_flashcards_fsrs_expand. ts-fsrs's Card
-- carries a `learning_steps` counter that tracks position in the
-- learning-step ladder (resets when the card graduates to Review or
-- lapses to Relearning). Without persisting this counter across
-- reviews, the scheduler keeps the card stuck in the first learning
-- step indefinitely — discovered by scripts/fsrs-scheduler-smoke.ts.
--
-- Additive only; default 0 means existing rows behave as if they were
-- freshly created (which is the correct semantics — no review history
-- in the new column yet).

ALTER TABLE "Flashcard"
  ADD COLUMN "learningSteps" INTEGER NOT NULL DEFAULT 0;
