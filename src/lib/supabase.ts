import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || supabaseUrl === 'https://your-project-id.supabase.co') {
  console.warn('Warning: NEXT_PUBLIC_SUPABASE_URL is not configured properly.');
}

if (!supabaseServiceKey || supabaseServiceKey === 'your_supabase_service_role_key') {
  console.warn('Warning: SUPABASE_SERVICE_ROLE_KEY is not configured properly.');
}

// Service Role client bypasses RLS and handles all administrative commands.
// NEVER expose this client to the browser/client-side code!
export const supabaseServer = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceKey || 'placeholder-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);
