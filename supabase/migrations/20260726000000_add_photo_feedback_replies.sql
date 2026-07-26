alter table if exists public.photo_feedbacks
  add column if not exists parent_id bigint references public.photo_feedbacks(id) on delete cascade;

create index if not exists photo_feedbacks_parent_id_idx
  on public.photo_feedbacks(parent_id);
