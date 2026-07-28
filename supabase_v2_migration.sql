-- Migration SQL for HarNug Studio V2.0 Upgrade
-- Run this script in your Supabase SQL Editor (https://supabase.com/dashboard/project/_/sql)

-- 1. Ensure 'status' column exists in 'topik' and 'naskah' tables
ALTER TABLE IF EXISTS public.topik 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

ALTER TABLE IF EXISTS public.naskah 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft';

-- 2. Add Fact Check & Translation columns to 'naskah'
ALTER TABLE IF EXISTS public.naskah 
ADD COLUMN IF NOT EXISTS fact_check_result JSONB DEFAULT NULL,
ADD COLUMN IF NOT EXISTS english_script TEXT DEFAULT NULL;

-- 3. Create 'channel_analysis' table (Replacing old reference profiles)
CREATE TABLE IF NOT EXISTS public.channel_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_name TEXT NOT NULL,
    channel_link TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Drop niche columns if they were previously added
ALTER TABLE IF EXISTS public.channel_analysis
DROP COLUMN IF EXISTS niche_kategori,
DROP COLUMN IF EXISTS niche_durasi,
DROP COLUMN IF EXISTS niche_topik_disukai,
DROP COLUMN IF EXISTS niche_topik_ditolak,
DROP COLUMN IF EXISTS niche_tone,
DROP COLUMN IF EXISTS niche_jumlah_kandidat;

-- Enable RLS for channel_analysis
ALTER TABLE public.channel_analysis ENABLE ROW LEVEL SECURITY;

-- Drop policy if it already exists (safe for re-run)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own channel analysis profiles' AND tablename = 'channel_analysis') THEN
    DROP POLICY "Users can manage their own channel analysis profiles" ON public.channel_analysis;
  END IF;
END $$;

CREATE POLICY "Users can manage their own channel analysis profiles"
ON public.channel_analysis
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. Create 'channel_analysis_entries' table (5-10 entries per channel profile)
CREATE TABLE IF NOT EXISTS public.channel_analysis_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_analysis_id UUID NOT NULL REFERENCES public.channel_analysis(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    video_link TEXT,
    title TEXT NOT NULL,
    full_script TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS for channel_analysis_entries
ALTER TABLE public.channel_analysis_entries ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage their own channel analysis entries' AND tablename = 'channel_analysis_entries') THEN
    DROP POLICY "Users can manage their own channel analysis entries" ON public.channel_analysis_entries;
  END IF;
END $$;

CREATE POLICY "Users can manage their own channel analysis entries"
ON public.channel_analysis_entries
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
