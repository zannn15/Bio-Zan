// api/chat.js
// Serverless Function (Vercel) — proxy aman ke Groq API.
// API key Groq disimpan di Environment Variable Vercel (GROQ_API_KEY),
// TIDAK PERNAH dikirim ke browser pengguna.
//
// Batasan: 1500 token (estimasi) per percakapan, per hari, per pengguna.
// Karena Vercel Serverless tidak punya database bawaan, batas harian
// dilacak secara in-memory per instance sebagai lapisan tambahan,
// namun sumber kebenaran utama adalah penghitungan token yang dikirim
// balik ke klien (lihat AI.html) yang menyimpan pemakaian di localStorage
// pengguna per-hari. Ini cukup untuk proyek personal/skala kecil.

const DAILY_TOKEN_LIMIT = 1500;
const MODEL = "llama-3.3-70b-versatile";

// Cache sederhana in-memory (reset saat cold start — lapisan tambahan saja)
const usageMap = new Map();

function getTodayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function getClientId(req) {
  const fwd = req.headers["x-forwarded-for"];
  const ip = Array.isArray(fwd) ? fwd[0] : (fwd ? fwd.split(",")[0].trim() : "unknown");
  return ip;
}

module.exports = async function handler(req, res) {
  // CORS dasar (boleh dipersempit ke domain Vercel kamu sendiri)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Metode tidak diizinkan. Gunakan POST." });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error: "Server belum dikonfigurasi. GROQ_API_KEY belum diatur di Environment Variables Vercel.",
    });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      res.status(400).json({ error: "Body permintaan tidak valid (bukan JSON)." });
      return;
    }
  }

  const { messages, usedTokensToday } = body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "Field 'messages' wajib diisi dan berupa array." });
    return;
  }

  // --- Lapisan batas harian tambahan (in-memory, best-effort) ---
  const clientId = getClientId(req);
  const todayKey = getTodayKey();
  const mapKey = `${clientId}:${todayKey}`;
  const serverSeen = usageMap.get(mapKey) || 0;

  // Gunakan angka pemakaian yang lebih besar antara catatan klien & server
  const effectiveUsed = Math.max(serverSeen, Number(usedTokensToday) || 0);

  if (effectiveUsed >= DAILY_TOKEN_LIMIT) {
    res.status(429).json({
      error: "Batas token harian (1500 token) sudah tercapai. Silakan coba lagi besok.",
      limitReached: true,
      usedTokensToday: effectiveUsed,
      dailyLimit: DAILY_TOKEN_LIMIT,
    });
    return;
  }

  const remainingBudget = DAILY_TOKEN_LIMIT - effectiveUsed;
  // Jangan biarkan satu balasan menghabiskan jauh lebih dari sisa kuota
  const maxTokensForThisCall = Math.max(64, Math.min(700, remainingBudget));

  try {
    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.7,
        max_tokens: maxTokensForThisCall,
      }),
    });

    const data = await groqRes.json();

    if (!groqRes.ok) {
      res.status(groqRes.status).json({
        error: data?.error?.message || "Terjadi kesalahan saat menghubungi Groq API.",
      });
      return;
    }

    const totalTokensUsed =
      data?.usage?.total_tokens ??
      (data?.usage?.prompt_tokens || 0) + (data?.usage?.completion_tokens || 0);

    usageMap.set(mapKey, effectiveUsed + totalTokensUsed);

    res.status(200).json({
      reply: data?.choices?.[0]?.message?.content || "",
      usage: {
        promptTokens: data?.usage?.prompt_tokens || 0,
        completionTokens: data?.usage?.completion_tokens || 0,
        totalTokens: totalTokensUsed,
      },
      usedTokensToday: effectiveUsed + totalTokensUsed,
      dailyLimit: DAILY_TOKEN_LIMIT,
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal menghubungi server Groq. Coba lagi sebentar." });
  }
};
