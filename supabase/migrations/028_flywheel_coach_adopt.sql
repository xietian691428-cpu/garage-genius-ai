-- Allow coach_adopt into flywheel review queue (user “Adopt as Knowledge Base”).
-- Deduplicate pending/approved/promoted adopts by ingest_key stored in `note`.

alter table public.flywheel_review_queue
  drop constraint if exists flywheel_review_queue_source_type_check;

alter table public.flywheel_review_queue
  add constraint flywheel_review_queue_source_type_check
  check (
    source_type in (
      'coach_step_feedback',
      'chat_manual',
      'ops_import',
      'coach_adopt'
    )
  );

-- note = ingest_key for coach_adopt rows (stable dedupe key)
create unique index if not exists flywheel_coach_adopt_ingest_uidx
  on public.flywheel_review_queue (note)
  where source_type = 'coach_adopt'
    and note is not null
    and status in ('pending', 'approved', 'promoted');

comment on constraint flywheel_review_queue_source_type_check on public.flywheel_review_queue is
  'Includes coach_adopt: user-adopted Coach steps awaiting admin review.';
