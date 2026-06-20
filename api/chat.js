// api/chat.js
// Serverless Function Vercel — menghubungi Groq API dari SISI SERVER.
// API key TIDAK PERNAH dikirim ke browser pengguna. Aman.
//
// WAJIB: Atur Environment Variable di dashboard Vercel Anda:
//   Nama   : GROQ_API_KEY
//   Isi    : (API key Groq milik Anda, didapat dari https://console.groq.com)
//
// Cara: Project di Vercel > Settings > Environment Variables > tambahkan GROQ_API_KEY

export default async function handler(req, res) {
  // Hanya izinkan metode POST
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);
    return res.status(405).json({ error: "Metode tidak diizinkan. Gunakan POST." });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "GROQ_API_KEY belum diatur di Environment Variables Vercel."
    });
  }

  try {
    const { messages } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Riwayat pesan (messages) tidak valid." });
    }

    // System prompt: identitas ZN.AI + instruksi format jawaban (bold/italic/code/bash)
    const systemPrompt = {
      role: "system",
      content:
        "Kamu adalah ZN.AI, sebuah asisten AI yang futuristik, cerdas, ramah, dan elegan. " +
        "Jawablah dalam Bahasa Indonesia yang baik kecuali pengguna memakai bahasa lain. " +
        "Kamu memiliki context window penuh atas seluruh riwayat percakapan ini, jadi selalu " +
        "perhatikan konteks dari pesan-pesan sebelumnya saat menjawab. " +
        "Gunakan format markdown sederhana berikut bila relevan: **teks** untuk tebal (bold), " +
        "_teks_ untuk miring (italic), dan blok kode dengan tiga backtick (```bahasa ... ```) " +
        "untuk kode pemrograman. Jika kamu menunjukkan perintah terminal/command line, gunakan " +
        "blok kode dengan label bahasa 'bash'. Jawablah dengan jelas, terstruktur, dan tidak " +
        "bertele-tele kecuali diminta detail."
    };

    const pesanUntukGroq = [systemPrompt, ...messages];

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey
      },
      body: JSON.stringify({
        // Model Groq yang cepat & mendukung konteks panjang.
        // Bisa diganti sesuai model yang tersedia di akun Groq Anda.
        model: "llama-3.3-70b-versatile",
        messages: pesanUntukGroq,
        temperature: 0.7,
        // "Tak terbatas" untuk versi Beta: diset ke batas maksimal yang diizinkan model.
        max_tokens: 8000
      })
    });

    if (!groqResponse.ok) {
      const teksError = await groqResponse.text();
      console.error("Groq API error:", groqResponse.status, teksError);
      return res.status(502).json({
        error: "Gagal mendapat balasan dari Groq API.",
        detail: teksError
      });
    }

    const data = await groqResponse.json();
    const reply =
      data &&
      data.choices &&
      data.choices[0] &&
      data.choices[0].message &&
      data.choices[0].message.content
        ? data.choices[0].message.content
        : "Maaf, tidak ada balasan yang dihasilkan.";

    return res.status(200).json({ reply });

  } catch (err) {
    console.error("Kesalahan server:", err);
    return res.status(500).json({ error: "Kesalahan internal server.", detail: String(err.message || err) });
  }
      }
