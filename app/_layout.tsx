import { features } from '@/config/features';
import { LocalRoot } from '@/shell/LocalRoot';
import { SupabaseRoot } from '@/shell/SupabaseRoot';

export default function RootLayout() {
  return features.localMode ? <LocalRoot /> : <SupabaseRoot />;
}
