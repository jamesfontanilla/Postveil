-- Keep the trigram extension outside public while preserving the existing
-- sender-search index. Supabase includes extensions in the default search path.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
