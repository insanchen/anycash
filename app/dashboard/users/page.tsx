import { DashboardShell } from '@/components/layouts/DashboardShell';
import UsersClient from '../users/UsersClient';

export default function UsersPage() {
  return (
    <DashboardShell>
      <UsersClient />
    </DashboardShell>
  );
}
