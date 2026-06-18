import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Qualify a lead using OpenAI GPT-4o.
 *
 * @param {string} leadMessage - The latest message from the lead
 * @param {Array<{role: string, content: string}>} conversationHistory - Last few messages
 * @param {string} qualifyingQuestion - The client's qualifying question
 * @param {string} businessName - The business name
 * @param {string} industry - The industry
 * @param {string} leadName - The lead's name
 * @returns {Promise<{tag: string, reply: string, reason: string}>}
 */
export async function qualifyLead(leadMessage, conversationHistory, qualifyingQuestion, businessName, industry, leadName) {
  try {
    const formattedHistory = (conversationHistory || [])
      .slice(-6)
      .map(m => `${m.role === 'assistant' ? 'Concierge' : (leadName || 'Lead')}: ${m.content}`)
      .join('\n');

    const systemPrompt = `You are a Senior Concierge for ${businessName}, a premium ${industry} firm in India. 
Your goal is to qualify leads with sophistication, warmth, and efficiency.

PERSONALITY:
- Professional, knowledgeable, and proactive.
- Use a "concierge" tone—helpful and elegant, never desperate or pushy.
- Adapt your language naturally to the lead (Hindi, English, or Hinglish).
- Use the lead's name (${leadName}) naturally to build rapport.

CATEGORIZATION RULES:
- HOT: Lead expresses clear intent to buy/book, asks for specific next steps (pricing, visit, meeting), or gives a positive answer to the qualifying question with urgency.
- WARM: Lead is interested and engaging but still has questions or is not ready to commit immediately. 
- COLD: Lead is clearly the wrong fit (wrong location, wrong service requested), expresses zero interest, or provides one-word dismissive answers.

CONSTRAINTS:
- Maximum 3-4 lines per response.
- Always end with a conversational question that gently nudges them towards the next step (e.g., booking a call or sharing more details).
- If the lead is HOT, acknowledge their interest warmly and prioritize moving them toward the ${businessName}'s primary goal (usually a booking).

OUTPUT FORMAT:
You must respond with a JSON object containing:
{
  "analysis": "1-2 sentences of internal reasoning about the lead's intent",
  "tag": "HOT|WARM|COLD",
  "reply": "Your concierge-style response",
  "reason": "Brief summary of why this tag was chosen"
}`;

    const userPrompt = `Business: ${businessName} (${industry})
Qualifying Question: ${qualifyingQuestion}
Lead Name: ${leadName}

Conversation History:
${formattedHistory}

Latest message from ${leadName}: "${leadMessage}"

Analyze the intent and provide the qualification JSON:`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5, // Slightly lower temperature for more consistent categorization
      max_tokens: 500,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    const parsed = JSON.parse(content);
    const validTags = ['HOT', 'WARM', 'COLD'];
    const tag = validTags.includes(parsed.tag) ? parsed.tag : 'WARM';

    return {
      tag,
      reply: parsed.reply || `Thanks for sharing that, ${leadName}. How can I best assist you further?`,
      reason: parsed.reason || parsed.analysis || 'Qualified based on intent',
    };
  } catch (error) {
    console.error('AI qualification error:', error.message);
    return {
      tag: 'WARM',
      reply: `I appreciate you sharing that, ${leadName}. To make sure we give you the best information, could you tell me a little more about what you're looking for?`,
      reason: `AI fallback: ${error.message}`,
    };
  }
}

/**
 * Generate an AI reply for a lead conversation.
 */
export async function generateReply(leadMessage, conversationHistory, businessName, industry, leadName) {
  try {
    const formattedHistory = (conversationHistory || [])
      .slice(-6)
      .map(m => `${m.role === 'assistant' ? 'Concierge' : (leadName || 'Lead')}: ${m.content}`)
      .join('\n');

    const systemPrompt = `You are a Senior Concierge for ${businessName}, a ${industry} business in India.
Maintain a warm, professional, and helpful tone. 
Reply in the lead's language (Hindi/English/Hinglish).
Keep it concise (max 3 lines) and always end with a helpful question.`;

    const userPrompt = `Lead Name: ${leadName}
Conversation History:
${formattedHistory}

Latest message from ${leadName}: "${leadMessage}"

Generate a concierge-style reply:`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 200,
    });

    return response.choices[0]?.message?.content || 
      `Thank you, ${leadName}. I'll look into that for you. Anything else I can help with?`;
  } catch (error) {
    console.error('AI reply generation error:', error.message);
    return `Got it, ${leadName}. One of our specialists will be with you shortly to assist further.`;
  }
}
