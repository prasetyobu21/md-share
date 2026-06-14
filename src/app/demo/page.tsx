import DemoDashboard from './DemoDashboard';
import { Metadata } from 'next';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Demo Dashboard - MD Share Sandbox',
  description: 'Upload and preview your markdown files passwordless with up to 10 files limit.',
};

export default function DemoPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <DemoDashboard />
    </div>
  );
}
