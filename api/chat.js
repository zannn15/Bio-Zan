export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).end();
    
    const { messages, model } = req.body;
    const GROQ_API_KEY = process.env.GROQ_API_KEY; // set di Vercel dashboard
    
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model || 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Kamu adalah ZN.AI, asisten AI futuristik yang cerdas, membantu, dan ramah. Jawab dalam bahasa yang sama dengan pengguna.' },
          ...messages
        ],
        max_tokens: 4096,
        temperature: 0.7,
      }),
    });
    
    const data = await response.json();
    res.json({ content: data.choices?.[0]?.message?.content || 'Tidak ada respons.' });
}
