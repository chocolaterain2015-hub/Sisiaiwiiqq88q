import OpenAI from 'openai';

// Initialize Grok / xAI client
export const getGeminiClient = () => {   // kept the same name so UI doesn't break
  const apiKey = import.meta.env.VITE_XAI_API_KEY || process.env.VITE_XAI_API_KEY || process.env.API_KEY;
  if (!apiKey) {
    throw new Error("XAI_API_KEY not found. Please add VITE_XAI_API_KEY to your environment variables.");
  }
  return new OpenAI({
    apiKey,
    baseURL: 'https://api.x.ai/v1',
    dangerouslyAllowBrowser: true
  });
};

const getChatModel = (mode: 'fast' | 'normal' | 'multi-agent' = 'normal') => {
  if (mode === 'fast') return 'grok-4-1-fast-reasoning';
  if (mode === 'multi-agent') return 'grok-4.20-multi-agent-0309';
  return 'grok-4.20-0309-reasoning';
};

export const enhancePrompt = async (prompt: string) => {
  const client = getGeminiClient();
  const response = await client.chat.completions.create({
    model: getChatModel('normal'),
    messages: [
      { role: 'system', content: 'You are an expert prompt engineer. Expand the user prompt into a highly detailed, professional, and evocative prompt for an AI image generator. Keep it concise but descriptive.' },
      { role: 'user', content: `Prompt: ${prompt}` }
    ],
    max_tokens: 300,
    temperature: 0.8,
  });
  return response.choices[0]?.message?.content?.trim() || prompt;
};

export const generateImage = async (
  prompt: string, 
  matureMode: boolean = false,
  aspectRatio: string = "1:1",
  style: string = "none",
  negativePrompt: string = "",
  referenceImages: { data: string, mimeType: string }[] = [],
  seed: number | undefined = undefined,
  size: "1K" | "2K" | "4K" = "1K"
) => {
  const client = getGeminiClient();

  let finalPrompt = prompt;

  const styleModifiers: Record<string, string> = {
    anime: "in high-quality stylized anime art style, vibrant colors, detailed line art",
    realistic: "photorealistic, 8k resolution, highly detailed, cinematic lighting, professional photography",
    cartoon: "3D animated movie style, Pixar/Dreamworks aesthetic, expressive characters, soft lighting",
    cyberpunk: "cyberpunk aesthetic, neon lights, futuristic city, high tech low life, synthwave colors",
    digital_art: "detailed digital painting, concept art, smooth gradients, artistic composition",
    sketch: "hand-drawn pencil sketch, charcoal textures, artistic shading, paper texture",
    oil_painting: "classical oil painting, visible brushstrokes, rich textures, museum quality",
  };

  if (style !== "none" && styleModifiers[style]) {
    finalPrompt = `${prompt}, ${styleModifiers[style]}`;
  }
  if (negativePrompt.trim()) {
    finalPrompt = `${finalPrompt}. Avoid: ${negativePrompt}`;
  }

  const response = await client.images.generate({
    model: 'grok-imagine-image',
    prompt: finalPrompt,
    n: 1,
    response_format: 'b64_json',
    aspect_ratio: aspectRatio,
    seed: seed,
  });

  const base64Data = response.data[0].b64_json;
  return `data:image/png;base64,${base64Data}`;
};

export const suggestRefinedPrompt = async (originalPrompt: string) => {
  const client = getGeminiClient();
  const response = await client.chat.completions.create({
    model: getChatModel('normal'),
    messages: [
      { role: 'system', content: 'Rewrite the blocked prompt to be safe while preserving artistic intent. Return ONLY the refined prompt.' },
      { role: 'user', content: originalPrompt }
    ],
    max_tokens: 250,
  });
  return response.choices[0]?.message?.content?.trim() || null;
};

export const startChat = () => {
  const client = getGeminiClient();

  return {
    sendMessage: async (userMessage: string) => {
      const response = await client.chat.completions.create({
        model: getChatModel('normal'),
        messages: [
          {
            role: 'system',
            content: `You are a world-class AI Prompt Engineering Specialist for "NB2 Pro". 
Your goal is to help users create high-quality prompts for Grok Imagine.
If a prompt looks NSFW/explicit, suggest safe artistic alternatives that keep the vibe.
Keep tone professional and creative.`
          },
          { role: 'user', content: userMessage }
        ],
        temperature: 0.85,
      });
      return {
        text: () => response.choices[0]?.message?.content || ''
      };
    }
  };
};
