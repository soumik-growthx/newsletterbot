import { NextResponse } from "next/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import axios from "axios";
import { remark } from "remark";
import html from "remark-html";

class NewsletterResearchBot {
  private story_template: {
    headline: string | null;
    context: {
      market_size: string | null;
      key_players: string[];
      recent_developments: string[];
    };
    metrics: {
      revenue: number | null;
      funding: number | null;
      market_share: number | null;
      growth_rate: number | null;
    };
    business_model: {
      core_offering: string | null;
      unit_economics: string | null;
      channels: string[];
      partnerships: string[];
    };
    analysis_points: string[];
  };

  constructor() {
    this.story_template = {
      headline: null,
      context: {
        market_size: null,
        key_players: [],
        recent_developments: [],
      },
      metrics: {
        revenue: null,
        funding: null,
        market_share: null,
        growth_rate: null,
      },
      business_model: {
        core_offering: null,
        unit_economics: null,
        channels: [],
        partnerships: [],
      },
      analysis_points: [],
    };
  }

  async research_company(
    company_name: string,
    company_data: {
      metrics: {
        revenue: number | null;
        funding: number | null;
        market_share: number | null;
        growth_rate: number | null;
      };
      business_model: {
        core_offering: string | null;
        unit_economics: string | null;
        channels: string[];
        partnerships: string[];
      };
      context: {
        market_size: string | null;
        key_players: string[];
        recent_developments: string[];
      };
      analysis_points?: string[];
    }
  ) {
    const story = { ...this.story_template };
    story.headline = await this.generate_hook(company_name);
    story.metrics = { ...story.metrics, ...company_data.metrics };
    story.business_model = {
      ...story.business_model,
      ...company_data.business_model,
    };
    story.context = { ...story.context, ...company_data.context };
    story.analysis_points = company_data.analysis_points || [];
    return story;
  }

  async generate_hook(company_name: string) {
    const prompt = `Create an engaging headline for a newsletter about ${company_name}, highlighting its innovative business model and recent growth. Include a sense of excitement.`;
    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages: [{ role: "user", content: prompt }],
      maxTokens: 20,
      temperature: 0.8,
    });
    return text.trim();
  }

  async format_story(story_data: {
    headline: string;
    context: {
      market_size: string | null;
      key_players: string[];
      recent_developments: string[];
    };
    metrics: {
      revenue: number | null;
      funding: number | null;
      market_share: number | null;
      growth_rate: number | null;
    };
    business_model: {
      core_offering: string | null;
      unit_economics: string | null;
      channels: string[];
      partnerships: string[];
    };
    analysis_points: string[];
  }) {
    const prompt = `Write a compelling newsletter research document about the company based on the following details:

Headline: ${story_data.headline}
Context: ${JSON.stringify(story_data.context)}
Metrics: ${JSON.stringify(story_data.metrics)}
Business Model: ${JSON.stringify(story_data.business_model)}
Analysis Points: ${JSON.stringify(story_data.analysis_points)}

Structure the story into sections like Context, Business Model, Metrics, and Insights.`;

    const { text } = await generateText({
      model: openai("gpt-4o-mini"),
      messages: [{ role: "user", content: prompt }],
      maxTokens: 10000,
      temperature: 0.7,
    });
    console.log("OpenAI Formatted Story:", text);
    return text.trim();
  }

  format_metrics(value: number, metric_type: string) {
    if (metric_type === "inr") {
      if (value >= 10000000) {
        return `₹${(value / 10000000).toFixed(0)} crores`;
      }
      return `₹${value.toLocaleString("en-IN")}`;
    } else if (metric_type === "usd") {
      if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(0)}M`;
      }
      return `$${value.toLocaleString("en-US")}`;
    }
    return value.toString();
  }
}

async function researchCompanyWithPerplexity(company_name: string) {
  const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;
  if (!PERPLEXITY_API_KEY) {
    throw new Error("Perplexity API key is not set");
  }

  const response = await axios.post(
    "https://api.perplexity.ai/chat/completions",
    {
      model: "llama-3.1-sonar-small-128k-online",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that provides accurate information about companies.",
        },
        {
          role: "user",
          content: `Research the company ${company_name} and provide information about its business model, metrics (if available), market context, and key analysis points. Format the response strictly as a JSON object with keys: business_model, metrics, context, and analysis_points. Do not include any explanations, code fences, or additional formatting. Provide only the JSON object.`,
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${PERPLEXITY_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );

  let assistantMessage = response.data.choices[0].message.content;

  assistantMessage = assistantMessage
    .replace(/(^```(?:json)?\s*|```$)/g, "")
    .trim();

  let researchData = null;
  try {
    researchData = JSON.parse(assistantMessage);
  } catch (error) {
    console.error("Error parsing JSON response from Perplexity:", error);
    throw new Error("Failed to parse JSON response from Perplexity");
  }
  return researchData;
}

async function markdownToHtml(markdown: string) {
  const result = await remark().use(html).process(markdown);
  return result.toString();
}

export async function POST(req: Request) {
  try {
    const { company_name, company_data } = await req.json();
    const bot = new NewsletterResearchBot();

    let research_data = company_data;
    let rawApiResponse = null;
    if (!company_data) {
      try {
        research_data = await researchCompanyWithPerplexity(company_name);
      } catch (error) {
        console.error("Error fetching data from Perplexity:", error);
        if (error instanceof Error) {
          rawApiResponse = error.message;
        } else {
          rawApiResponse = "An unknown error occurred";
        }
      }
    }

    if (!research_data && !rawApiResponse) {
      throw new Error("Failed to fetch company data");
    }

    let formatted_story = "";
    if (research_data) {
      const story = await bot.research_company(company_name, research_data);
      if (!story.headline) {
        throw new Error("Generated headline is null");
      }
      if (!story.headline) {
        throw new Error("Generated headline is null");
      }
      formatted_story = await bot.format_story(
        story as {
          headline: string;
          context: {
            market_size: string | null;
            key_players: string[];
            recent_developments: string[];
          };
          metrics: {
            revenue: number | null;
            funding: number | null;
            market_share: number | null;
            growth_rate: number | null;
          };
          business_model: {
            core_offering: string | null;
            unit_economics: string | null;
            channels: string[];
            partnerships: string[];
          };
          analysis_points: string[];
        }
      );
    }

    // Check if the formatted_story is in markdown format
    const isMarkdown =
      formatted_story.includes("##") || formatted_story.includes("*");

    let htmlContent = "";
    if (isMarkdown) {
      htmlContent = await markdownToHtml(formatted_story);
    }

    return NextResponse.json({
      story: formatted_story,
      htmlContent,
      isMarkdown,
      rawApiResponse,
    });
  } catch (error) {
    console.error("Error generating newsletter:", error);
    return NextResponse.json(
      { error: "Failed to generate newsletter" },
      { status: 500 }
    );
  }
}
