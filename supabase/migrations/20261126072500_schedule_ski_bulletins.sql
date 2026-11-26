-- Refresh the shared resort bulletins once per hour, independently of map visits.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
select cron.schedule('meteo74_refresh_ski_bulletins', '7 * * * *', $job$
    select net.http_get(
        url := 'https://bepcgggpdtxwaifiyrah.supabase.co/functions/v1/meteo74-neige?sync=1',
        headers := jsonb_build_object('Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlcGNnZ2dwZHR4d2FpZml5cmFoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU1OTg5NTksImV4cCI6MjExMTE3NDk1OX0.qRCXb7lLdpZT6seIgmQ7jTRCgaPirbHSorYvrxnebwk'),
        timeout_milliseconds := 55000
    );
$job$);
