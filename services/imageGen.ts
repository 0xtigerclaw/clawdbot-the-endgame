import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenAI } from '@google/genai';

// Image generation using Nano Banana (Gemini 2.5 Flash)
export async function generateImage(
    prompt: string,
    agentName: string = "Ive"
): Promise<{ url: string; localPath: string } | null> {
    console.log(`[NANOBANANA] ${agentName} generating visual via Nano Banana (v2.5): "${prompt.substring(0, 50)}..."...`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("[NANOBANANA] No GEMINI_API_KEY found");
        return null;
    }

    try {
        const ai = new GoogleGenAI({ apiKey });

        // Use Gemini 2.5 Flash Image model (Nano Banana)
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash-image",
            contents: [{
                role: "user",
                parts: [{ text: `Generate a professional image: ${prompt}` }]
            }],
            config: {
                responseModalities: ["image", "text"],
            }
        });

        console.log(`[NANOBANANA] Response received`);

        // Check for inline image data in the response
        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
            if (part.inlineData?.data) {
                const localPath = await saveBase64Image(part.inlineData.data, agentName);
                console.log(`[NANOBANANA] Generated successfully: ${localPath}`);
                return { url: `${localPath}?t=${Date.now()}`, localPath };
            }
        }

        console.log("[NANOBANANA] No image data in response");
        return null;

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[IMAGE] Gemini image generation failed:", message);

        // Try alternative approach with direct REST API
        return await tryDirectGeminiAPI(prompt, agentName, apiKey);
    }
}

// Try direct REST API for image generation
async function tryDirectGeminiAPI(prompt: string, agentName: string, apiKey: string): Promise<{ url: string; localPath: string } | null> {
    try {
        console.log("[IMAGE] Trying direct Gemini REST API...");

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    contents: [{
                        parts: [{
                            text: `Create a visual image: ${prompt}`
                        }]
                    }],
                    generationConfig: {
                        responseModalities: ["IMAGE", "TEXT"],
                    }
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[IMAGE] Gemini REST API error: ${response.status} - ${errorText.substring(0, 200)}`);
            return null;
        }

        const data = await response.json();
        console.log(`[IMAGE] Gemini REST API response received`);

        // Check for inline image data
        const parts = data.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
            if (part.inlineData?.data) {
                const localPath = await saveBase64Image(part.inlineData.data, agentName);
                console.log(`[IMAGE] Generated via REST API: ${localPath}`);
                return { url: localPath, localPath };
            }
        }

        console.log("[IMAGE] No image data in REST API response");
        return null;

    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[IMAGE] REST API fallback failed:", message);
        return null;
    }
}

// Save base64 image to file
async function saveBase64Image(base64Data: string, agentName: string): Promise<string> {
    const timestamp = Date.now();
    const filename = `${agentName.toLowerCase()}_design_${timestamp}.png`;
    const outputDir = path.join(process.cwd(), 'public', 'generated');

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, filename);

    try {
        const buffer = Buffer.from(base64Data, 'base64');
        fs.writeFileSync(outputPath, buffer);
        console.log(`[IMAGE] Saved to: ${outputPath}`);
        return `/generated/${filename}`;  // Return public URL path
    } catch (error) {
        console.error("[IMAGE] Failed to save image:", error);
        return "";
    }
}

// Generate design prompt from task
export function createDesignPrompt(task: string): string {
    return `Create a professional digital mockup design for: "${task}". 
Style: Clean, modern, minimal, premium aesthetic. 
Format: Marketing visual or social media graphic.
Colors: Sophisticated color palette with gradients, not too busy.
Elements: Include relevant icons, typography, and visual hierarchy.
Quality: High-end, polished, ready for publication.
Do not include any text overlays other than essential branding.`;
}
