
const DEFAULT_REPLICA_ID = "rfe12d8b9597"; // Stock replica

export async function createTavusConversation() {
  const TAVUS_API_KEY = import.meta.env.VITE_TAVUS_API_KEY;

  console.log("Creating Tavus Conversation. Key detected:", !!TAVUS_API_KEY);
  
  if (!TAVUS_API_KEY) {
    console.error("Tavus API key missing in environment");
    return null;
  }

  try {
    const response = await fetch("https://api.tavus.io/v2/conversations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": TAVUS_API_KEY,
      },
      body: JSON.stringify({
        replica_id: DEFAULT_REPLICA_ID,
        name: "Agnos AI Session",
        conversational_config: {
          system_prompt: "You are Agnos AI, a professional medical diagnosis system. Be helpful, clinical, and precise. You are interacting with a user who is using a 3D anatomical model.",
        },
        properties: {
            max_duration: 600,
            enable_recording: false
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Tavus API Error Status:", response.status, "Message:", errorText);
      return null;
    }

    const data = await response.json();
    console.log("Tavus Conversation Created Successfully:", data.conversation_id);
    return data;
  } catch (err) {
    console.error("Failed to create Tavus conversation:", err);
    return null;
  }
}

