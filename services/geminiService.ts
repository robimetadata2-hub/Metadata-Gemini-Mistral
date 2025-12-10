
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { Tab, ControlSettings } from '../types';

const geminiSchemaMetadata = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
        category: { type: Type.STRING }
    },
    required: ["title", "description", "keywords", "category"]
};

const geminiSchemaPrompt = {
    type: Type.OBJECT,
    properties: {
        description: { type: Type.STRING }
    },
    required: ["description"]
};

export const createPrompt = (settings: ControlSettings, mode: Tab): string => {
    const { 
        customPromptSelect, customPromptEntry,
        promptSwitches, customPromptEntryPrompt,
        descWords
    } = settings;

    // Handle custom prompts first
    if (mode === 'prompt' && promptSwitches.customPrompt && customPromptEntryPrompt.trim()) {
        return `Analyze this image based on the following instructions:\n${customPromptEntryPrompt.trim()}\n\nProvide JSON object with only 'description'.`;
    }
    if (mode === 'metadata' && customPromptSelect === 'set_custom' && customPromptEntry.trim()) {
        return `Analyze this image based on the following instructions:\n${customPromptEntry.trim()}\n\nProvide JSON object with 'title', 'description', 'keywords', and a relevant 'category'.`;
    }

    if (mode === 'prompt') {
        let prompt = `Act as an expert metadata generator specializing in stock media requirements.\nAnalyze this image.\nIMPORTANT: If the subject is isolated, assume it's on a white or transparent background. Do NOT mention "black background", "dark background", or similar phrases.\n`;
        prompt += `Generate only a compelling description.\nTarget Description Length: MUST BE EXACTLY ${descWords} words. Provide the exact word count requested.\n`;
        if (promptSwitches.silhouette) prompt += "Style: Silhouette. Emphasize this.\n";
        if (promptSwitches.whiteBg) prompt += "Background: Plain white. Mention 'white background', 'isolated'.\n";
        if (promptSwitches.transparentBg) prompt += "Background: Transparent. Mention 'transparent background', 'isolated'.\n";
        prompt += "Focus on facts and concepts, avoiding subjective words (e.g., beautiful, amazing).\n\nProvide JSON object with only 'description'.";
        return prompt;
    } else { // metadata mode
        // Updated prompt based on user request (70-100 chars title, specific formatting)
        return `I will give you images. You have to:
1. Write title for each images as per instructions and guide(Instructions and Guide will given below)
2. Write detailed description for each images.
3. Write keywords for each images as per instructions and guide(Instructions and Guide will given below)
4. Select a relevant Category.

Instructions: Analyze this image and generate content based on the following exact and strict requirements. Please give keywords separated by comma also give single word keyword and prefer singular keyword. please give single word keyword and give at maximum 30 keywords also give a title and title character will be around 70 -100 character, also give title in sentence case means only first letter will be in capital.

Provide JSON object with 'title', 'description', 'keywords', and 'category'.`;
    }
};

// Helper for Grok API (OpenAI Compatible)
const callGrokApi = async (apiKey: string, modelName: string, prompt: string, apiData: { base64Data: string; mimeType: string }) => {
    const messages = [
        {
            role: "system",
            content: "You are a helpful AI assistant that generates metadata for images in JSON format."
        },
        {
            role: "user",
            content: [
                { type: "text", text: prompt },
                {
                    type: "image_url",
                    image_url: {
                        url: `data:${apiData.mimeType};base64,${apiData.base64Data}`,
                        detail: "high"
                    },
                },
            ],
        },
    ];

    const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            messages: messages,
            model: modelName,
            stream: false,
            temperature: 0, 
        }),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Grok API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
};

// Helper for Mistral API (OpenAI Compatible)
const callMistralApi = async (apiKey: string, modelName: string, prompt: string, apiData: { base64Data: string; mimeType: string }) => {
    // Mistral's non-vision models (Large, Medium, Small) CANNOT see images.
    // To fix "Metadata giving nothing" or 400 errors, we MUST use Pixtral for images.
    const effectiveModel = "pixtral-12b-2409"; 

    // Structure messages: System prompt for instructions, User prompt for Image
    const messages = [
        {
            role: "system", 
            content: prompt // Using the detailed instructions as system prompt
        },
        {
            role: "user",
            content: [
                { type: "text", text: "Analyze this image and provide the requested metadata in JSON format." },
                {
                    type: "image_url",
                    image_url: {
                        url: `data:${apiData.mimeType};base64,${apiData.base64Data}`
                    }
                },
            ],
        },
    ];

    const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: effectiveModel,
            messages: messages,
            temperature: 0.7, 
            max_tokens: 2048,
            top_p: 1,
            stream: false,
        }),
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const errorMessage = errData.message || errData.error?.message || `Mistral API Error: ${response.status} ${response.statusText}`;
        console.error("Mistral API Failure:", errorMessage, errData);
        throw new Error(errorMessage);
    }

    const data = await response.json();
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error("Invalid response structure from Mistral API");
    }
    return data.choices[0].message.content;
};


export const callApiWithBackoff = async (
    provider: 'gemini' | 'grok' | 'mistral',
    apiKey: string,
    modelName: string,
    prompt: string,
    apiData: { base64Data: string; mimeType: string } | null,
    settings: ControlSettings,
    mode: Tab,
    onRetry: (delay: number) => void
): Promise<any> => {
    if (!apiData) throw new Error("API data is missing.");
    
    // For Gemini schema, we define it. Grok/Mistral uses prompt-based JSON.
    const schema = (mode === 'prompt') ? geminiSchemaPrompt : geminiSchemaMetadata;
    let delay = 1000;
    const maxDelay = 30000; // 30-second maximum delay

    while (true) {
        try {
            let resultText: string | undefined;

            if (provider === 'gemini') {
                const ai = new GoogleGenAI({ apiKey });
                const response: GenerateContentResponse = await ai.models.generateContent({
                    model: modelName,
                    contents: {
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType: apiData.mimeType, data: apiData.base64Data } }
                        ]
                    },
                    config: {
                        responseMimeType: "application/json",
                        responseSchema: schema
                    }
                });
                resultText = response.text;
                 if (!resultText) {
                    const safetyReason = response.candidates?.[0]?.finishReason;
                    if (safetyReason === 'SAFETY') {
                       throw new Error("Blocked by safety settings.");
                    }
                    throw new Error("Invalid Gemini API response structure.");
               }
            } else if (provider === 'grok') {
                resultText = await callGrokApi(apiKey, modelName, prompt, apiData);
            } else { // mistral
                resultText = await callMistralApi(apiKey, modelName, prompt, apiData);
            }
            
            if (!resultText) throw new Error("Empty response from API");
            
            // Clean up Markdown code blocks if present (common in chat models)
            let cleanJson = resultText!;
            const jsonMatch = resultText!.match(/```json\n([\s\S]*?)\n```/) || resultText!.match(/```\n([\s\S]*?)\n```/);
            
            if (jsonMatch) {
                cleanJson = jsonMatch[1];
            } else {
                 // Fallback: Try to extract JSON between first { and last }
                 const firstBrace = resultText!.indexOf('{');
                 const lastBrace = resultText!.lastIndexOf('}');
                 if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                     cleanJson = resultText!.substring(firstBrace, lastBrace + 1);
                 }
            }
            
            let metadata;
            try {
                metadata = JSON.parse(cleanJson);
            } catch (e) {
                 console.error("JSON Parse Error:", e, "Cleaned Text:", cleanJson, "Original Text:", resultText);
                 throw new Error("Failed to parse AI response as JSON. The model might have returned unstructured text.");
            }
            
            if (mode === 'metadata') {
                 const { advanceTitle, keywordsCount } = settings;
                 let baseTitle = metadata.title ? metadata.title.charAt(0).toUpperCase() + metadata.title.slice(1).toLowerCase() : "";
                 
                 const opts = [];
                 if (advanceTitle.transparentBg) opts.push("isolated on transparent background");
                 if (advanceTitle.whiteBg) opts.push("isolated on white background");
                 if (advanceTitle.vector) opts.push("Vector");
                 if (advanceTitle.illustration) opts.push("illustration");
                 const toggleText = opts.length > 0 ? " " + opts.join(', ') : "";

                 metadata.title = baseTitle + toggleText;

                 let combinedKeywords = (metadata.keywords || []).map((kw: string) => kw.trim().toLowerCase()).filter(Boolean);
                 const toggleKeywordsLower = opts.map(kw => kw.toLowerCase());
                 toggleKeywordsLower.forEach((tk) => {
                     if (!combinedKeywords.includes(tk)) combinedKeywords.push(tk);
                 });
                 
                 metadata.keywords = [...new Set(combinedKeywords)].slice(0, keywordsCount);
            }

            return metadata;

        } catch (error: any) {
            // Don't retry on client errors (4xx) usually, but we backoff anyway for simplicity unless specific checks added
            console.warn(`API call failed. Retrying in ${delay / 1000}s...`, error.message);
            
            // If it's a 400 error from Mistral (e.g. text model with image), do NOT retry loop forever
            if (error.message.includes('400') || error.message.includes('invalid') || error.message.includes('not support')) {
                 throw error; // Fail immediately for configuration errors
            }

            onRetry(delay);
            await new Promise(res => setTimeout(res, delay));
            delay = Math.min(delay * 2, maxDelay); // Exponential backoff with a cap
        }
    }
};
