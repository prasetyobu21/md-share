import { isAuthenticated } from './actions';
import AuthWall from './components/AuthWall';
import Dashboard from './components/Dashboard';
import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const authenticated = await isAuthenticated();

  if (!authenticated) {
    return <AuthWall />;
  }

  // Fetch file metadata from Supabase, filtering out demo files
  const { data: files } = await supabaseServer
    .from('files')
    .select('*')
    .or('is_demo.is.null,is_demo.eq.false')
    .order('created_at', { ascending: false });

  return (
    <div className="flex flex-col min-h-screen">
      <Dashboard files={files || []} />
    </div>
  );
}

