-- ==========================================
-- Supabase Database & Storage Setup for MD Share App
-- Run this in your Supabase SQL Editor.
-- ==========================================

-- 1. Create the files table
CREATE TABLE IF NOT EXISTS public.files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    short_id TEXT NOT NULL UNIQUE,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_accessible BOOLEAN DEFAULT false,
    expires_at TIMESTAMP WITH TIME ZONE NULL,
    timezone TEXT DEFAULT 'GMT+7'
);

-- 2. Add an index on short_id for hyper-fast readers route queries
CREATE INDEX IF NOT EXISTS idx_files_short_id ON public.files(short_id);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies
-- For simplicity, since the admin actions are performed server-side with the Service Role Client, 
-- we only need to specify RLS policies for read operations by public users if needed.
-- However, since the server reads from the database directly, we can define a policy that allows 
-- public users to view rows, or let the server bypass RLS using the service role client.
-- Let's define a policy that allows anyone to view the file metadata.
CREATE POLICY "Allow public read access to files table" 
ON public.files 
FOR SELECT 
USING (true);

-- 5. Create storage bucket for markdown files (md-files)
-- Inserts a record into storage.buckets to create a private bucket named 'md-files' if it does not exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('md-files', 'md-files', false)
ON CONFLICT (id) DO NOTHING;

-- ==========================================
-- MIGRATION FOR EXISTING DB INSTALLATIONS
-- Run these statements if you already have the files table created:
-- ==========================================
-- ALTER TABLE public.files ADD COLUMN IF NOT EXISTS is_accessible BOOLEAN DEFAULT false;
-- ALTER TABLE public.files ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE NULL;
-- ALTER TABLE public.files ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'GMT+7';

