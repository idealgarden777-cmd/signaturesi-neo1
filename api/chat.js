import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import cookie from 'cookie';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cookies = cookie.parse(req.headers.cookie || '');
    const token = cookies.sb_access_token;

    if (!token) {
      return res.status(401).json({ error: 'Unauthorized access' });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const { messages, conversationId, title, model } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    let activeConversationId = conversationId;
    if (!activeConversationId) {
      const { data: newConv, error: convError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          title: title || 'New conversation',
          model: model || 'l1.0'
        })
        .select()
        .single();

      if (convError) throw convError;
      activeConversationId = newConv.id;
    }

    const lastUserMsg = messages[messages.length - 1];

    await supabase.from('messages').insert({
      conversation_id: activeConversationId,
      user_id: user.id,
      role: 'user',
      content: lastUserMsg.content,
      attachments: lastUserMsg.attachments || []
    });

    const aiModel = genAI.getGenerativeModel({
      model: model === 'l1.2' ? 'gemini-1.5-pro' : 'gemini-1.5-flash'
    });

    const promptHistory = messages.map(m => `${m.role === 'user' ? 'User' : 'Model'}: ${m.content}`).join('\n');
    const result = await aiModel.generateContent(promptHistory);
    const reply = result.response.text();

    await supabase.from('messages').insert({
      conversation_id: activeConversationId,
      user_id: user.id,
      role: 'assistant',
      content: reply
    });

    return res.status(200).json({
      reply,
      conversationId: activeConversationId
    });

  } catch (err) {
    console.error('Chat handler error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
}
