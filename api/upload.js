import { createClient } from '@supabase/supabase-js';
import cookie from 'cookie';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cookies = cookie.parse(req.headers.cookie || '');
  const token = cookies.sb_access_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid session' });

  const { filename } = req.body || {};
  const filePath = `${user.id}/${Date.now()}_${filename}`;

  const { data, error } = await supabase.storage
    .from('uploads')
    .createSignedUploadUrl(filePath);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({
    upload: {
      bucket: 'uploads',
      path: filePath,
      token: data.token
    }
  });
}
