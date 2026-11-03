import { DashboardShell } from '@/components/layouts/DashboardShell';
import SettingsClient from '../settings/SettingsClient';

export default function SettingsPage() {
  return (
    <DashboardShell>
      <SettingsClient />
    </DashboardShell>
  );
}
