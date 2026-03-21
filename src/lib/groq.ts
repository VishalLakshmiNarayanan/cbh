import Groq from "groq-sdk";

const apiKey = import.meta.env.VITE_GROQ_API_KEY;
const groq = apiKey ? new Groq({ apiKey, dangerouslyAllowBrowser: true }) : null;

export const chatWithAssistant = async (messages: {role: 'user' | 'assistant' | 'system', content: string}[]) => {
  if (!groq) {
    return "API Key not configured. Please add VITE_GROQ_API_KEY to your .env file.";
  }

  try {
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `You are a specialized 3D Facial Diagnostic Assistant AI.
You receive input when a user clicks on specific facial zones along with any symptomatic text they provide.
Interpret the 3D coordinates and landmarks.
If a marker is placed on the 'Forehead', you could ask: 'Is this skin-related, or are you experiencing a tension headache?'
If on 'Mandible', trigger a dental-specific or jaw-related AI triage.
If on 'Periorbital', ask about sleep, allergies, or eye strain.
If on 'T-Zone', ask about oiliness, breakouts, or sinuses.
Keep responses extremely concise, empathetic, and clinical.
CRITICAL: Respond in plain text ONLY. Do NOT use markdown formatting, asterisks, bold text, or lists. Just simple paragraphs.`
        },
        ...messages
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
      max_tokens: 150,
      top_p: 1,
      stream: false,
      stop: null
    });
    return response.choices[0]?.message?.content || "I couldn't generate a response.";
  } catch (error) {
    console.error("Groq API error:", error);
    return "Error communicating with the diagnostic engine.";
  }
};
