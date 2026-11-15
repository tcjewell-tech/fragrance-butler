import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { BackupDevice } from './backupApi';

/** The real device I/O: a cache file, the share sheet and the document picker. Not unit-tested; keep it thin. */
export const expoBackupDevice: BackupDevice = {
  async writeFile(name, text) {
    const file = new File(Paths.cache, name);
    file.create({ overwrite: true });
    await file.write(text);
    return file.uri;
  },

  // shortcut: shareAsync cannot tell a dismissed sheet from a saved file, so opening it counts as shared.
  async share(uri) {
    if (!(await Sharing.isAvailableAsync())) return false;
    await Sharing.shareAsync(uri, { mimeType: 'application/json', UTI: 'public.json' });
    return true;
  },

  async pickFile() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (result.canceled) return null;
    return new File(result.assets[0].uri).text();
  },
};
