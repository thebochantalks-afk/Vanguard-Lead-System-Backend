import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Qualify a lead using OpenAI GPT-4o.
 *
 * @param {string} leadMessage - The latest message from the lead
 * @param {Array<{role: string, content: string}>} conversationHistory - Last 5 messages from conversation
 * @param {string} qualifyingQuestion - The client's qualifying question
 * @param {string} businessName - The business name
 * @param {string} industry - The industry (e.g. 'real estate', 'education')
 * @returns {Promise<{tag: string, reply: string, reason: string}>}
 */
export async function qualifyLead(leadMessage, conversationHistory, qualifyingQuestion, businessName, industry) {
  try {
    const formattedHistory = (conversationHistory || [])
      .slice(-5)
      .map(m => `${m.role === 'assistant' ? 'AI' : 'Lead'}: ${m.content}`)
      .join('\n');

    const systemPrompt = `You are a lead qualification assistant for ${businessName}, a ${industry} business in India. 
Qualify leads and reply in the same language they write in (Hindi, English, or Hinglish). 
Always sound warm and human. Never robotic. Maximum 4 lines per reply.

Rules:
- HOT = strong intent, specific need, ready soon (e.g. asking for pricing, wanting to buy, specific timeline)
- WARM = interested but vague, needs nurturing (e.g. just browsing, asking general questions, not sure yet)
- COLD = wrong fit, no budget, just browsing (e.g. not interested, wrong location, no budget)

Keep replies friendly, professional, and conversational. End with a question to keep the conversation flowing.`;

    const userPrompt = `Lead's qualifying question: ${qualifyingQuestion}

Conversation so far:
${formattedHistory}

Latest lead message: "${leadMessage}"

Respond with a JSON object:
{
  "tag": "HOT|WARM|COLD",
  "reply": "your friendly reply here (max 4 lines)",
  "reason": "brief reason for the tag"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 300,
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
      reply: parsed.reply || 'Thank you for your interest! How can I help you today?',
      reason: parsed.reason || 'Qualified based on conversation',
    };
  } catch (error) {
    console.error('AI qualification error:', error.message);
    // Fallback: return COLD with a friendly generic reply
    return {
      tag: 'COLD',
      reply: `Thanks for reaching out! 😊 We'd love to learn more about what you're looking for. Could you tell us a bit more about your needs?`,
      reason: `AI service unavailable: ${error.message}`,
    };
  }
}

/**
 * Generate an AI reply for a lead conversation.
 * Simpler version used after initial qualification.
 *
 * @param {string} leadMessage
 * @param {Array} conversationHistory
 * @param {string} businessName
 * @param {string} industry
 * @returns {Promise<string>}
 */
export async function generateReply(leadMessage, conversationHistory, businessName, industry) {
  try {
    const formattedHistory = (conversationHistory || [])
      .slice(-6)
      .map(m => `${m.role === 'assistant' ? 'AI' : 'Lead'}: ${m.content}`)
      .join('\n');

    const systemPrompt = `You are a friendly sales assistant for ${businessName}, a ${industry} business in India.
Reply in the same language the lead writes in (Hindi, English, or Hinglish).
Keep it warm, human, and conversational. Maximum 3 lines.
End with a gentle question to keep them engaged. Never be pushy or robotic.`;

    const userPrompt = `Conversation so far:
${formattedHistory}

Latest message from lead: "${leadMessage}"

Generate a natural, friendly reply:`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 200,
    });

    return response.choices[0]?.message?.content || 
      'That sounds great! Let me check and get back to you. 😊';
  } catch (error) {
    console.error('AI reply generation error:', error.message);
    return 'Thanks for sharing! Let me look into this for you. 😊';
  }
}