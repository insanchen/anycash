import { DashboardShell } from '@/components/layouts/DashboardShell';
import AccountsClient from '../accounts/AccountsClient';

export default function AccountsPage() {
  return (
    <DashboardShell>
      <AccountsClient />
    </DashboardShell>
  );
}
