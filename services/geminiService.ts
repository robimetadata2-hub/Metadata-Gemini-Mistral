
import { GoogleGenAI, Type } from "@google/genai";
import { Tab, ControlSettings } from '../types';

export class ApiKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiKeyError';
  }
}

export const createPrompt = (settings: ControlSettings, mode: Tab): string => {
    const { 
        customPromptSelect, customPromptEntry,
        promptSwitches, customPromptEntryPrompt,
        descWords
    } = settings;

    if (mode === 'prompt' && promptSwitches.customPrompt && customPromptEntryPrompt.trim()) {
        return `Analyze this image based on the following instructions:\n${customPromptEntryPrompt.trim()}`;
    }
    if (mode === 'metadata' && customPromptSelect === 'set_custom' && customPromptEntry.trim()) {
        return `Analyze this image based on the following instructions:\n${customPromptEntry.trim()}`;
    }

    if (mode === 'prompt') {
        let prompt = `Act as an expert metadata generator specializing in stock media requirements.\nAnalyze this image.\nIMPORTANT: If the subject is isolated, assume it's on a white or transparent background. Do NOT mention "black background", "dark background", or similar phrases.\n`;
        prompt += `Generate only a compelling description.\nTarget Description Length: MUST BE EXACTLY ${descWords} words. Provide the exact word count requested.\n`;
        if (promptSwitches.silhouette) prompt += "Style: Silhouette. Emphasize this.\n";
        if (promptSwitches.whiteBg) prompt += "Background: Plain white. Mention 'white background', 'isolated'.\n";
        if (promptSwitches.transparentBg) prompt += "Background: Transparent. Mention 'transparent background', 'isolated'.\n";
        prompt += "Focus on facts and concepts, avoiding subjective words (e.g., beautiful, amazing). Output the result as a simple string or JSON with a 'description' key. Do not use nested objects.";
        return prompt;
    } else { // metadata mode
        return `I will give you an image. You must generate a JSON object with the following flat structure (no nested objects):
1. "title": Write a title for the image. The title should be in sentence case (only the first letter capitalized) and be between 70-100 characters. It must be a single string.
2. "description": Write a detailed description for the image. It must be a single string, not an object.
3. "keywords": Provide a list of relevant keywords. Keywords should be single words where possible, lowercase, and singular. Provide a maximum of 30 keywords.
4. "category": Select a single, relevant Category string.`;
    }
};

const fetchWithTimeout = async (resource: string, options: RequestInit = {}, timeout = 60000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(resource, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error: any) {
        clearTimeout(id);
        if (error.name === 'AbortError') {
            throw new Error('Request timed out.');
        }
        throw error;
    }
};

const parseAndFormatResponse = (resultText: string, mode: Tab, settings: ControlSettings) => {
    let cleanJson = resultText.trim();
    
    const jsonMatch = cleanJson.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
        cleanJson = jsonMatch[1];
    }

    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
    }
    
    let rawMetadata: any;
    try {
        rawMetadata = JSON.parse(cleanJson);
    } catch (e) {
         console.error("JSON Parse Error:", e, "Cleaned Text:", cleanJson, "Original Text:", resultText);
         throw new Error("Failed to parse AI response as JSON.");
    }

    // Key Normalization: Lowercase all keys to handle 'Title' vs 'title'
    const metadata: any = {};
    if (rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
        Object.keys(rawMetadata).forEach(key => {
            metadata[key.toLowerCase()] = rawMetadata[key];
        });
    } else {
        throw new Error("Invalid response format: Expected a JSON object.");
    }

    // Helper to flatten nested objects or parse JSON strings recursively
    const forceString = (val: any): string => {
        if (val === null || val === undefined) return '';
        
        if (typeof val === 'string') {
            // Check if string is actually a JSON object representation
            const trimmed = val.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try {
                    const parsed = JSON.parse(trimmed);
                    return forceString(parsed);
                } catch {
                    return val;
                }
            }
            return val;
        }
        
        if (typeof val === 'number') return String(val);
        
        if (Array.isArray(val)) {
            return val.map(v => forceString(v)).join('. ');
        }
        
        if (typeof val === 'object') {
            // Intelligent flattening: prioritize common keys, otherwise join all string values
            const parts = [];
            if (val.main) parts.push(forceString(val.main));
            if (val.summary) parts.push(forceString(val.summary));
            if (val.details) parts.push(forceString(val.details));
            if (val.text) parts.push(forceString(val.text));
            
            if (parts.length > 0) return parts.join(' ');
            
            // Fallback: join all values that resolve to simple strings
            return Object.values(val)
                .map(v => forceString(v))
                .filter(s => s.length > 0)
                .join('. ');
        }
        
        return String(val);
    };

    if (mode === 'prompt') {
        const desc = metadata.description || metadata.prompt || metadata.text || '';
        return { description: forceString(desc) };
    }
    
    metadata.title = forceString(metadata.title || metadata.headline || '');
    metadata.description = forceString(metadata.description || metadata.caption || metadata.summary || '');

    if (typeof metadata.category !== 'string') {
        metadata.category = String(metadata.category || 'N/A');
    }
    
    const { advanceTitle, keywordsCount } = settings;
    let baseTitle = "";
    if (typeof metadata.title === 'string' && metadata.title.length > 0) {
        baseTitle = metadata.title.charAt(0).toUpperCase() + metadata.title.slice(1).toLowerCase();
    }
    
    const opts = [];
    if (advanceTitle.transparentBg) opts.push("isolated on transparent background");
    if (advanceTitle.whiteBg) opts.push("isolated on white background");
    if (advanceTitle.vector) opts.push("Vector");
    if (advanceTitle.illustration) opts.push("illustration");
    const toggleText = opts.length > 0 ? " " + opts.join(', ') : "";

    metadata.title = baseTitle + toggleText;

    let rawKeywords = metadata.keywords || metadata.tags || [];
    if (typeof rawKeywords === 'string') {
       rawKeywords = rawKeywords.split(/,+/);
    } else if (!Array.isArray(rawKeywords)) {
       rawKeywords = [];
    }

    let combinedKeywords = rawKeywords.map((kw: any) => String(kw).trim().toLowerCase()).filter(Boolean);
    
    const toggleKeywordsLower = opts.map(kw => kw.toLowerCase());
    toggleKeywordsLower.forEach((tk) => {
        if (!combinedKeywords.includes(tk)) combinedKeywords.push(tk);
    });
    
    metadata.keywords = [...new Set(combinedKeywords)].slice(0, keywordsCount);

    return metadata;
};

export const callApiWithBackoff = async (
    provider: 'mistral' | 'groq' | 'gemini',
    apiKey: string,
    modelName: string,
    prompt: string,
    apiData: { base64Data: string; mimeType: string } | null,
    settings: ControlSettings,
    mode: Tab
): Promise<any> => {
    if (!apiData) throw new Error("API data is missing.");
    const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);

    let retries = 0;
    const maxRetries = 3;

    while (retries <= maxRetries) {
        try {
            let resultText = '';

            if (provider === 'gemini') {
                try {
                    const ai = new GoogleGenAI({ apiKey: apiKey });
                    const responseSchema = mode === 'metadata' ? {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING }, description: { type: Type.STRING },
                            keywords: { type: Type.ARRAY, items: { type: Type.STRING } }, category: { type: Type.STRING }
                        },
                        required: ["title", "description", "keywords", "category"]
                    } : {
                        type: Type.OBJECT, properties: { description: { type: Type.STRING } }, required: ["description"]
                    };

                    const response = await ai.models.generateContent({
                        model: modelName,
                        contents: { parts: [ { text: prompt }, { inlineData: { mimeType: apiData.mimeType, data: apiData.base64Data } } ] },
                        config: { temperature: 0.7, maxOutputTokens: 2048, responseMimeType: "application/json", responseSchema: responseSchema }
                    });

                    resultText = response.text || '';
                    if (!resultText) throw new Error("Empty response from Gemini");

                } catch (error: any) {
                     const errorMessage = error.message || "Unknown Gemini API error";
                     if (errorMessage.includes('403') || errorMessage.includes('401') || errorMessage.includes('API key not valid')) {
                         throw new ApiKeyError("Invalid API Key or unauthorized access.");
                     }
                     if (errorMessage.includes('429')) {
                         throw new ApiKeyError("Rate limit exceeded.");
                     }
                     throw error; // Rethrow other errors to be caught by outer loop
                }
            } else { 
                let endpoint = provider === 'mistral' ? "https://api.mistral.ai/v1/chat/completions" : "https://api.groq.com/openai/v1/chat/completions";
                
                const body: any = { 
                    model: modelName, 
                    messages: [
                        { role: "system", content: "Your response must be ONLY the JSON object, without any markdown." },
                        { role: "user", content: [ { type: "text", text: prompt }, { type: "image_url", image_url: { url: `data:${apiData.mimeType};base64,${apiData.base64Data}` } } ] }
                    ], 
                    temperature: 0.7, max_tokens: 2048,
                    response_format: { type: "json_object" }
                };

                const headers = new Headers({ "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` });
                const response = await fetchWithTimeout(endpoint, { method: "POST", headers, body: JSON.stringify(body) });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    const errorMessage = errData.error?.message || `${providerName} API Error: ${response.status} ${response.statusText}`;
                    if (response.status === 429 || response.status === 401 || response.status === 403) {
                        throw new ApiKeyError(errorMessage);
                    }
                    throw new Error(errorMessage);
                }

                const data = await response.json();
                resultText = data.choices?.[0]?.message?.content;
                if (!resultText) throw new Error(`Invalid response structure from ${providerName}.`);
            }

            return parseAndFormatResponse(resultText, mode, settings);

        } catch (error: any) {
            const isRateLimit = error instanceof ApiKeyError && (error.message.includes('429') || error.message.toLowerCase().includes('rate limit') || error.message.toLowerCase().includes('quota'));
            
            // If it's a rate limit or auth error, don't retry locally - throw so App can switch keys
            if (isRateLimit || error instanceof ApiKeyError) {
                throw error;
            }

            // Retry on network errors or 5xx server errors
            const isRetryable = error.message.includes('500') || error.message.includes('503') || error.message.includes('timed out') || error.message.includes('fetch failed');
            
            if (isRetryable && retries < maxRetries) {
                retries++;
                const delay = 2000 * Math.pow(2, retries - 1); // Exponential backoff
                console.warn(`Attempt ${retries} failed. Retrying in ${delay}ms...`, error.message);
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            
            throw error;
        }
    }
};

export const testApiKey = async (
    provider: 'mistral' | 'groq' | 'gemini',
    apiKey: string,
    modelName: string
): Promise<{ success: boolean; message: string }> => {
    try {
        if (provider === 'gemini') {
            const ai = new GoogleGenAI({ apiKey: apiKey });
            // Simple generation to test key
            await ai.models.generateContent({
                model: modelName,
                contents: { parts: [{ text: "Test" }] },
                config: { maxOutputTokens: 1 }
            });
            return { success: true, message: "Gemini API key is valid!" };
        } 
        
        let endpoint = '';
        let body: any = {};
        
        if (provider === 'mistral') {
            endpoint = "https://api.mistral.ai/v1/chat/completions";
            body = { model: 'open-mistral-nemo', messages: [{ role: "user", content: "Test" }], max_tokens: 1 };
        } else { // groq
            endpoint = "https://api.groq.com/openai/v1/chat/completions";
            body = { model: 'llama3-8b-8192', messages: [{ role: "user", content: "Test" }], max_tokens: 1 };
        }

        const headers = new Headers({ "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` });
        const response = await fetchWithTimeout(endpoint, { method: "POST", headers, body: JSON.stringify(body) }, 15000);

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `API Error: ${response.status}`);
        }
        
        return { success: true, message: "API Key is valid and working!" };
    } catch (error: any) {
        let friendlyMessage = error.message.toLowerCase().includes('key') ? "Invalid API Key." : error.message;
        console.error("API Key Test Failed:", error);
        return { success: false, message: `Test failed: ${friendlyMessage}` };
    }
};
