import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth';
import { Suspense } from 'react';
import LoginForm from './LoginForm';
export const dynamic = 'force-dynamic';
export default async function Login() { if (await getUser()) redirect('/'); return <Suspense><LoginForm /></Suspense>; }
