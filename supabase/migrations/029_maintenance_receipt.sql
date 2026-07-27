-- Receipt / invoice OCR fields for maintenance_records.

alter table public.maintenance_records
  add column if not exists shop_name text;

-- Expand source to include receipt scans (keep legacy values).
alter table public.maintenance_records
  drop constraint if exists maintenance_records_source_check;

alter table public.maintenance_records
  add constraint maintenance_records_source_check
  check (source in ('manual', 'chat', 'parts', 'receipt'));

comment on column public.maintenance_records.shop_name is
  'Shop / dealer name extracted from a receipt or entered manually.';
