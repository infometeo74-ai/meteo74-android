-- The ski cards and the weather map share this cache. The map reads stored rows only.
create table public.meteo74_ski_bulletins (
    station_id text primary key,
    checked_at timestamptz not null,
    bulletin jsonb not null
);
create table public.meteo74_ski_depths (
    day date not null,
    station_id text not null,
    snow jsonb not null,
    primary key (day, station_id)
);
alter table public.meteo74_ski_bulletins enable row level security;
alter table public.meteo74_ski_depths enable row level security;
revoke all on table public.meteo74_ski_bulletins, public.meteo74_ski_depths from public, anon, authenticated;
grant select, insert, update on table public.meteo74_ski_bulletins, public.meteo74_ski_depths to service_role;

create function public.meteo74_archive_ski_depths() returns trigger
language plpgsql set search_path = '' as $$
begin
    if new.bulletin->>'date' ~ '^\d{4}-\d{2}-\d{2}$' and jsonb_array_length(coalesce(new.bulletin->'snow','[]'::jsonb)) > 0 then
        insert into public.meteo74_ski_depths (day, station_id, snow)
        values ((new.bulletin->>'date')::date, new.station_id, new.bulletin->'snow')
        on conflict (day, station_id) do update set snow = excluded.snow;
    end if;
    return new;
end;
$$;
revoke all on function public.meteo74_archive_ski_depths() from public, anon, authenticated;
create trigger archive_ski_snow after insert or update on public.meteo74_ski_bulletins
for each row execute function public.meteo74_archive_ski_depths();

alter table public.meteo74_map_cache drop constraint meteo74_map_cache_name_check;
alter table public.meteo74_map_cache add check (name in ('model','stations','ski-sync'));
