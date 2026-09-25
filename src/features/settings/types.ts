import type { Dispatch, SetStateAction } from 'react';
import type { SettingsDraft } from '../../domain/settings';

export interface SettingsSectionProps {
  form: SettingsDraft;
  setForm: Dispatch<SetStateAction<SettingsDraft>>;
  handleSaveGeneral: () => Promise<void>;
  primaryColor: string;
}
