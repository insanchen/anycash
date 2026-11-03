import { DashboardShell } from '@/components/layouts/DashboardShell';
import ReportsClient from '../reports/ReportsClient';

export default function ReportsPage() {
  return (
    <DashboardShell>
      <ReportsClient />
    </DashboardShell>
  );
}
