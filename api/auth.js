import { createClient } from '@supabase/supabase-js';
import cookie from 'cookie';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const cookies = cookie.parse(req.headers.cookie || '');
    const token = cookies.sb_access_token;

    if (!token) {
      return res.status(401).json({ authenticated: false, error: 'No active session' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ authenticated: false, error: 'Invalid or expired session' });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('username, plan_type')
      .eq('id', user.id)
      .single();

    return res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        email: user.email,
        username: profile?.username || user.email.split('@')[0],
        planType: profile?.plan_type || 'free'
      }
    });
  }

  if (req.method === 'POST') {
    const { action } = req.body || {};
    if (action === 'logout') {
      res.setHeader('Set-Cookie', [
        cookie.serialize('sb_access_token', '', { maxAge: -1, path: '/' }),
        cookie.serialize('sb_refresh_token', '', { maxAge: -1, path: '/' })
      ]);
      return res.status(200).json({ success: true });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
