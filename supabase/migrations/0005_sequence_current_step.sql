-- Sequencing walking-skeleton, step 2 (#8): track which hardcoded step an
-- enrollment is on. Step *content* still lives in code (src/sequenceSteps.ts)
-- — a real sequences/sequence_steps table lands in #9.

alter table public.sequence_enrollments add column if not exists current_step smallint not null default 0;
