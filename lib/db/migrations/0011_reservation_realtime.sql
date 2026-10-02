-- A bare ping, never data: a public Realtime channel can be listened to by anyone, so the
-- payload has the bike and the days and nothing personal (no label). Clients refetch.
-- Sent from the database, not from the app, so ANY write notifies: an action, a payment,
-- the worker, a manual fix.
CREATE OR REPLACE FUNCTION public.notify_reservation_change() RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object(
      'op', TG_OP,
      'bike_unit_id', NEW.bike_unit_id,
      'previous_bike_unit_id', CASE WHEN TG_OP = 'UPDATE' THEN OLD.bike_unit_id ELSE NULL END,
      'starts_on', NEW.starts_on,
      'ends_on', NEW.ends_on
    ),
    'changed',
    'reservations',
    false
  );
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- A trigger function is not meant to be called through /rest/v1/rpc: nobody gets EXECUTE.
REVOKE ALL ON FUNCTION public.notify_reservation_change() FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
CREATE TRIGGER bike_reservations_notify
AFTER INSERT OR UPDATE ON public.bike_reservations
FOR EACH ROW EXECUTE FUNCTION public.notify_reservation_change();
