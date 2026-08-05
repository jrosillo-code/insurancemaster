import { redirect } from 'next/navigation';
import { getSession } from '../lib/session';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  redirect((await getSession()) ? '/chat' : '/login');
}
