-- Enable real-time updates for all tables
ALTER TABLE public.file_uploads REPLICA IDENTITY FULL;
ALTER TABLE public.transactions REPLICA IDENTITY FULL;
ALTER TABLE public.locations REPLICA IDENTITY FULL;
ALTER TABLE public.location_agent_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.agents REPLICA IDENTITY FULL;
ALTER TABLE public.pl_data REPLICA IDENTITY FULL;

-- Add tables to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.file_uploads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.locations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.location_agent_assignments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.agents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pl_data;