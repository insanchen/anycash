import { DashboardShell } from '@/components/layouts/DashboardShell';
import TransactionsClient from '../transactions/TransactionsClient';

export default function TransactionsPage() {
  return (
    <DashboardShell>
      <TransactionsClient />
    </DashboardShell>
  );
}
