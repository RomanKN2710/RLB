import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import LoginForm from './LoginForm';
export const dynamic = 'force-dynamic';
export default async function Login() { if (await getUser()) redirect('/'); return <LoginForm />; }
