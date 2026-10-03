import BackupManager from '../components/BackupManager';
import Layout from '../components/layout/Layout';
import AppearanceSettingsSection from '../features/settings/AppearanceSettingsSection';
import BillingSettingsSection from '../features/settings/BillingSettingsSection';
import CloudSettingsSection from '../features/settings/CloudSettingsSection';
import DataMaintenanceSection from '../features/settings/DataMaintenanceSection';
import GeneralSettingsSection from '../features/settings/GeneralSettingsSection';
import NotificationSettingsSection from '../features/settings/NotificationSettingsSection';
import PasswordSettingsSection from '../features/settings/PasswordSettingsSection';
import SubjectsSettingsSection from '../features/settings/SubjectsSettingsSection';
import { useSettingsDraft } from '../features/settings/useSettingsDraft';

export default function SettingsPage() {
  const editor = useSettingsDraft();
  return (
    <Layout title="الإعدادات">
      <div className="max-w-3xl mx-auto space-y-6">
        <GeneralSettingsSection {...editor} />
        <SubjectsSettingsSection primaryColor={editor.primaryColor} />
        <BillingSettingsSection {...editor} />
        <AppearanceSettingsSection {...editor} />
        <NotificationSettingsSection {...editor} />
        <CloudSettingsSection primaryColor={editor.primaryColor} />
        <PasswordSettingsSection primaryColor={editor.primaryColor} />
        <DataMaintenanceSection primaryColor={editor.primaryColor} />
        <BackupManager />
      </div>
    </Layout>
  );
}
