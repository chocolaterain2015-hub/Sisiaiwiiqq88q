import OpenAI from 'openai';

export const getGeminiClient = () => {
  const apiKey = import.meta.env.VITE_XAI_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_XAI_API_KEY not found. Please set it in Vercel environment variables.");
  }
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.x.ai/v1',
    dangerouslyAllowBrowser: true,
  });
};

// Fast / Normal / Multi-agent toggle
const getChatModel = (mode: 'fast' | 'normal' | 'multi-agent' = 'normal') => {
  if (mode === 'fast') return 'grok-4-1-fast';
  if (mode === 'multi-agent') return 'grok-4.20-multi-agent-0309';
  return 'grok-4.20-0309-reasoning';
};

export const enhancePrompt = async (prompt: string) => {
  const client = getGeminiClient();
  const response = await client.chat.completions.create({
    model: getChatModel('normal'),
    messages: [
      { role: "system", content: "You are a helpful image prompt enhancer. Expand the user prompt into a highly detailed, artistic description." },
      { role: "user", content: `Expand this prompt: ${prompt}` }
    ],
    max_tokens: 300,
  });
  return response.choices[0]?.message?.content?.trim() || prompt;
};

export const suggestRefinedPrompt = async (originalPrompt: string) => {
  const client = getGeminiClient();
  const response = await client.chat.completions.create({
    model: getChatModel('normal'),
    messages: [
      { role: "system", content: "Rewrite the prompt to be safe and artistic while keeping the core idea." },
      { role: "user", content: originalPrompt }
    ],
    max_tokens: 250,
  });
  return response.choices[0]?.message?.content?.trim() || null;
};

export const startChat = async (message: string, mode: 'fast' | 'normal' | 'multi-agent' = 'normal') => {
  const client = getGeminiClient();
  const response = await client.chat.completions.create({
    model: getChatModel(mode),
    messages: [{ role: "user", content: message }],
    max_tokens: 500,
  });
  return response.choices[0]?.message?.content?.trim() || "Sorry, I couldn't generate a response.";
};

export const generateImage = async (prompt: string, matureMode = false, aspectRatio = "1:1") => {
  const client = getGeminiClient();
  const fullPrompt = matureMode ? `NSFW, ${prompt}` : prompt;

  const response = await client.images.generate({
    model: "grok-imagine-image",
    prompt: fullPrompt,
    aspect_ratio: aspectRatio as any,
    response_format: "b64_json",
  });

  const imageData = response.data[0].b64_json;
  return `data:image/png;base64,${imageData}`;
};
