import { getSupabaseAdminClient, getSupabaseAuthClient } from '../config/supabase.js';

export type SupabaseAuthResult = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: {
    id: string;
    name: string;
    email: string;
    role: 'ADMIN' | 'MENTOR' | 'MENTEE';
    menteeId?: string;
  };
};

export async function signInWithSupabase(email: string, password: string): Promise<SupabaseAuthResult> {
  const { data, error } = await getSupabaseAuthClient().auth.signInWithPassword({ email, password });
  if (error || !data.session || !data.user) throw new Error('Invalid email or password.');

  const { data: profile, error: profileError } = await getSupabaseAdminClient()
    .from('profiles')
    .select('display_name, role, status, mentee_id')
    .eq('id', data.user.id)
    .single();

  if (profileError || !profile || profile.status !== 'active') {
    await getSupabaseAuthClient().auth.signOut();
    throw new Error('This account is not active.');
  }

  if (!['ADMIN', 'MENTOR', 'MENTEE'].includes(profile.role)) {
    await getSupabaseAuthClient().auth.signOut();
    throw new Error('This account has no valid role.');
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresIn: data.session.expires_in ?? 3600,
    user: {
      id: data.user.id,
      name: profile.display_name,
      email: data.user.email ?? email,
      role: profile.role,
      menteeId: profile.mentee_id ?? undefined,
    },
  };
}

export async function getSupabaseUserFromAccessToken(token: string) {
  const { data, error } = await getSupabaseAuthClient().auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function getSupabaseUserContext(token: string) {
  const user = await getSupabaseUserFromAccessToken(token);
  if (!user) return null;

  const { data: profile, error } = await getSupabaseAdminClient()
    .from('profiles')
    .select('display_name, role, status, mentee_id')
    .eq('id', user.id)
    .single();

  if (error || !profile) return null;
  return {
    id: user.id,
    email: user.email ?? '',
    name: profile.display_name,
    role: profile.role as 'ADMIN' | 'MENTOR' | 'MENTEE',
    status: profile.status as string,
    menteeId: profile.mentee_id ?? undefined,
  };
}
