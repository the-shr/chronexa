import { redirect } from 'next/navigation';

export default function RetiredLoginLayout() {
  redirect(`${String(process.env.BMOS_URL || 'https://brand-macros-os.vercel.app').replace(/\/$/, '')}/login`);
}
