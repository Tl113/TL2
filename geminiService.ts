
import { GoogleGenAI, Type } from "@google/genai";
import { NoteData } from "../types";
import { NOTE_FREQUENCIES } from "../constants";

export const generateSilhouetteImage = async (prompt: string): Promise<string | null> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: `A brilliant, high-saturation ethereal silhouette of ${prompt} made of flowing translucent silk fabric. The texture MUST feature a vivid prismatic gradient of electric cyan, neon violet, glowing magenta, and soft peach. The silhouette is set against a perfectly flat, pure BLACK background (#000000). High-end digital art style, bioluminescent ethereal glow, intricate fabric folds, 4k resolution.` }]
      },
      config: {
        imageConfig: {
          aspectRatio: "1:1"
        }
      }
    });

    const candidate = response.candidates?.[0];
    if (candidate && candidate.content && candidate.content.parts) {
      for (const part of candidate.content.parts) {
        if (part.inlineData) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    return null;
  } catch (error) {
    console.error("Error generating image:", error);
    return null;
  }
};

export const generateRandomMelody = async (prompt: string): Promise<NoteData[]> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Generate a rhythmically interesting 16-note melody inspired by "${prompt}" using scale degrees 1-7 (1=Do, 7=Ti). Return as JSON.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            notes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  value: { type: Type.STRING },
                  duration: { type: Type.NUMBER }
                },
                required: ["value", "duration"]
              }
            }
          },
          required: ["notes"]
        }
      }
    });

    const json = JSON.parse(response.text.trim());
    return json.notes.map((n: any) => ({
      value: n.value,
      frequency: NOTE_FREQUENCIES[n.value] || 261.63,
      duration: n.duration || 0.4
    }));
  } catch (error) {
    console.error("Error generating melody:", error);
    return Array.from({ length: 8 }, (_, i) => ({
      value: String((i % 7) + 1),
      frequency: NOTE_FREQUENCIES[String((i % 7) + 1)],
      duration: 0.5
    }));
  }
};
