export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { afterPhotoUrl, department, issueText } = req.body || {};
    if (!afterPhotoUrl) {
      return res.status(400).json({ error: "afterPhotoUrl is required" });
    }

    const apiKey =
      process.env.NVIDIA_API_KEY ||
      process.env.VITE_NVIDIA_API_KEY ||
      Buffer.from("bnZhcGktWndUeHdhRWZTTlJoR1hZVTRIZU9wak9BSWMtU3Nodi1la1pCY0pvNjhCby1GLU03SURHWnBib0V0d2RJaDFR", "base64").toString("utf-8");

    const promptText = `You are an AI civic infrastructure verification inspector for municipal complaints.
Department: ${department || "Municipal"}
Reported Defect: "${issueText || "Civic infrastructure issue"}"

Carefully inspect this AFTER RESOLUTION photo submitted by the field officer as proof of work:
1. Does this photo show genuine public municipal infrastructure work (e.g., asphalt pothole repair, road paving, water pipe fix, streetlight pole, drain clearance, garbage removal)?
2. Or does this photo show an UNRELATED scene such as an indoor room, classroom, office, chair, desk, furniture, person, selfie, television, or indoor object?
3. If it depicts an indoor room, classroom, furniture, person, selfie, or unrelated object, you MUST set work_completed=false and match_score between 0.05 and 0.20.
4. If it shows authentic completed field work resolving the complaint, set work_completed=true and match_score between 0.80 and 0.98.

Return ONLY raw JSON with this exact format:
{
  "work_completed": boolean,
  "match_score": number,
  "reason": "Detailed explanation of visual evidence",
  "tamper_suspected": boolean
}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const imageUrl = afterPhotoUrl.startsWith("http") || afterPhotoUrl.startsWith("data:")
      ? afterPhotoUrl
      : `data:image/jpeg;base64,${afterPhotoUrl}`;

    const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "meta/llama-3.2-11b-vision-instruct",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: promptText },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: 300,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      return res.status(500).json({ error: "AI gateway error", details: errText });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return res.json(parsed);
    }

    return res.status(500).json({ error: "Invalid AI response structure", raw: content });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Failed to process image" });
  }
}
