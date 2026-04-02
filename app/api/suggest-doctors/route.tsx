import { NextRequest, NextResponse } from "next/server";
import { openai } from "@/config/OpenAiModel";
import { AIDoctorAgents } from "@/shared/list";

export async function POST(req: NextRequest) {
  const { notes } = await req.json();

  try {
    const completion = await openai.chat.completions.create({
      model: "deepseek/deepseek-v3.2",
      messages: [
        { role: "system", content: JSON.stringify(AIDoctorAgents) },
        {
          role: "user",
          content:
            "User Notes/Symptoms: " +
            notes +
            ". Depending on user notes and symptoms, please suggest a list of doctors. Return a JSON array of matching doctors. You MUST include the 'id' field exactly as provided in the system prompt. No text outside JSON.",
        },
      ],
    });

    const rawContent = completion.choices[0].message?.content;

    if (!rawContent) {
      return NextResponse.json(
        { error: "No response from AI model" },
        { status: 500 }
      );
    }

    // Strip DeepSeek R1 <think>...</think> reasoning tags
    let cleaned = rawContent.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

    // Strip markdown code fences
    cleaned = cleaned
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim();

    // Extract JSON array robustly
    const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("Failed to extract JSON array from response:", cleaned);
      return NextResponse.json(
        { error: "Invalid response format from AI model" },
        { status: 500 }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // 🔧 Enrich missing fields using full list
    const enriched = parsed.map((partialDoctor: any) => {
      const full = AIDoctorAgents.find((doc) => doc.id === partialDoctor.id);
      return {
        ...full,
        ...partialDoctor, // allow overrides from LLM if any
      };
    });

    return NextResponse.json(enriched);
  } catch (e) {
    console.error("Doctor Suggestion API Error:", e);
    return NextResponse.json(
      { error: "Failed to suggest doctors" },
      { status: 500 }
    );
  }
}
