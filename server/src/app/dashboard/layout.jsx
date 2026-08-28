import { redirect } from 'next/navigation';

export default function RetiredDashboardLayout() {
  redirect(`${String(process.env.BMOS_URL || 'https://brand-macros-os.vercel.app').replace(/\/$/, '')}/dashboard`);
}
