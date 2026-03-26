import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

// Initialize the Gemini API client
// Note: The API key is injected by the environment
export const getGeminiClient = () => {
  // Prefer process.env.API_KEY (injected by the key selection dialog)
  // Fallback to process.env.GEMINI_API_KEY (default environment key)
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    throw new Error("API Key not found. Please select an API key using the 'Select API Key' button.");
  }
  return new GoogleGenAI({ apiKey });
};

export const enhancePrompt = async (prompt: string) => {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `Expand this simple image generation prompt into a highly detailed, professional, and evocative prompt for an AI image generator. Keep it concise but descriptive. Prompt: ${prompt}`,
    config: {
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    }
  });
  return response.text || prompt;
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
  const ai = getGeminiClient();
  
  // Apply style modifiers to the prompt
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

  // Build the content parts
  const parts: any[] = [];
  
  // Add reference images (Visual LoRAs)
  for (const img of referenceImages) {
    parts.push({
      inlineData: {
        data: img.data,
        mimeType: img.mimeType
      }
    });
  }

  // Add the text prompt
  parts.push({
    text: referenceImages.length > 0 
      ? `Generate a new image that follows the character, style, and composition of the provided reference images. This is an image-to-image (img2img) task. Preserve the key elements of the reference while applying the following new prompt: ${finalPrompt}`
      : finalPrompt
  });

  // We use the 'gemini-3.1-flash-image-preview' model (Nano Banana 2)
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: {
      parts: parts,
    },
    config: {
      seed: seed,
      imageConfig: {
        aspectRatio: aspectRatio as any,
        imageSize: size,
      },
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    },
  });

  // Extract the image from the response parts
  const candidate = response.candidates?.[0];
  let textExplanation = "";

  for (const part of candidate?.content?.parts || []) {
    if (part.inlineData) {
      const base64Data = part.inlineData.data;
      return `data:image/png;base64,${base64Data}`;
    }
    if (part.text) {
      textExplanation += part.text + " ";
    }
  }

  // If we reach here, no image was found
  if (candidate?.finishReason === "SAFETY") {
    const safetyRatings = candidate.safetyRatings || [];
    const blockedCategories = safetyRatings
      .filter(r => r.probability !== "NEGLIGIBLE" && r.probability !== "LOW")
      .map(r => r.category.replace("HARM_CATEGORY_", "").toLowerCase().replace(/_/g, " "))
      .join(", ");
    
    const baseMsg = "The prompt was blocked by the model's safety filters.";
    const detailMsg = blockedCategories 
      ? ` Potential issues detected: ${blockedCategories}.` 
      : " This usually happens with prompts involving real people, sensitive topics, or restricted content.";
    
    throw new Error(`${baseMsg}${detailMsg} Please try a different prompt.`);
  }

  if (textExplanation.trim()) {
    throw new Error(`No image was generated. The model responded: "${textExplanation.trim()}"`);
  }

  throw new Error("No image was generated. The prompt might have hit the model's built-in safety filters or the request was blocked by the system.");
};

export const suggestRefinedPrompt = async (originalPrompt: string) => {
  const ai = getGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: `The following image generation prompt was blocked by safety filters. Please rewrite it to be safe and compliant with AI safety guidelines while preserving the core artistic intent, character design, and style as much as possible. Remove explicit anatomical descriptions or NSFW terms and replace them with artistic, evocative, or suggestive language that is safe for a general audience. 
    
    Original Blocked Prompt: ${originalPrompt}
    
    Return ONLY the refined prompt text.`,
    config: {
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    }
  });
  return response.text?.trim() || null;
};

export const startChat = () => {
  const ai = getGeminiClient();
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: `You are a world-class AI Prompt Engineering Specialist for an image generation app called "NB2 Pro". 
      Your goal is to help users create high-quality, detailed, and effective prompts for the Nano Banana 2 (Gemini 3.1 Flash Image) model.
      
      Key Responsibilities:
      1. Help users refine their ideas into descriptive, artistic prompts.
      2. If a user's prompt is likely to be blocked by safety filters (e.g., NSFW, explicit content), suggest creative, safe, and artistic alternatives that preserve the core aesthetic and character design without violating safety guidelines.
      3. Explain why certain terms might be problematic and offer better alternatives (e.g., "Instead of 'explicit', try 'cinematic lighting' or 'elegant composition'").
      4. Suggest styles, lighting, and technical details (e.g., "ray tracing", "8k resolution", "bokeh effect") to improve image quality.
      
      Keep your tone professional, helpful, and creative. When you provide a final prompt, wrap it in [PROMPT]...[/PROMPT] tags so the app can easily identify it.`,
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
    }
  });
};
