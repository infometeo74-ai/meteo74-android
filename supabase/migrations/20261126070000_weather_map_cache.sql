create table public.meteo74_map_cache (
    name text primary key check (name in ('model', 'stations')),
    cycle bigint not null default -1,
    payload jsonb,
    lease_cycle bigint,
    lease_until timestamptz
);
alter table public.meteo74_map_cache enable row level security;
revoke all on table public.meteo74_map_cache from public, anon, authenticated;
grant select, insert, update on table public.meteo74_map_cache to service_role;

create function public.meteo74_claim_map_cache(p_name text, p_cycle bigint)
returns boolean language sql set search_path = '' as $$
    with claimed as (
        insert into public.meteo74_map_cache as cache (name, lease_cycle, lease_until)
        values (p_name, p_cycle, clock_timestamp() + interval '70 seconds')
        on conflict (name) do update
        set lease_cycle = excluded.lease_cycle, lease_until = excluded.lease_until
        where cache.cycle < p_cycle
          and (cache.lease_until is null or cache.lease_until < clock_timestamp())
        returning 1
    )
    select exists (select 1 from claimed);
$$;
revoke all on function public.meteo74_claim_map_cache(text, bigint) from public, anon, authenticated;
grant execute on function public.meteo74_claim_map_cache(text, bigint) to service_role;
