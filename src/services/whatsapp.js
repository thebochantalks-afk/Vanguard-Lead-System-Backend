import { sendMessage as interaktSend } from './interakt.js';

/**
 * Send a WhatsApp message.
 * Uses Interakt (Indian WhatsApp BSP) — each client uses their own registered number.
 * The phone is cleaned automatically — no "whatsapp:" prefix needed.
 * 
 * @param {string} to - Recipient phone number (with or without country code)
 * @param {string} body - Message content
 * @returns {Promise<object>}
 */
export async function sendMessage(to, body) {
  try {
    const result = await interaktSend(to, body);
    return result;
  } catch (error) {
    console.error('WhatsApp send error:', error.message);
    throw error;
  }
}

// ============================================================================
// Message Templates
// ============================================================================

/**
 * Welcome message sent when a new lead comes in.
 */
export function welcomeMessage(leadName, clientName, qualifyingQuestion) {
  return `Hi ${leadName}, thank you for reaching out to ${clientName}. We're glad to assist you.

To help us provide the best information, could you please tell us: ${qualifyingQuestion}

Looking forward to your reply.`;
}

/**
 * Follow-up 1 - Sent 24 hours after lead comes in (no reply).
 */
export function followUp1(leadName) {
  return `Hi ${leadName}, just following up on our previous message. We'd love to help you with your inquiry.

Do you have any specific questions we can answer for you?`;
}

/**
 * Follow-up 2 - Sent 72 hours after lead comes in (no reply).
 */
export function followUp2(leadName) {
  return `Hi ${leadName}, we haven't heard back yet, but we're still here to help.

Just a reminder that our availability can fill up quickly. If you're still interested, we'd love to have a brief chat.`;
}

/**
 * Follow-up 3 - Final follow-up with Calendly link, sent 7 days after.
 */
export function followUp3(leadName, calendlyLink) {
  const link = calendlyLink || 'https://calendly.com/your-link';
  return `Hi ${leadName}, this is our final follow-up for now.

If you'd like to discuss this further at your convenience, you can book a time that works for you here:
📅 ${link}

Best regards.`;
}

/**
 * Alert sent to the client when a lead is tagged HOT.
 */
export function hotLeadAlert(leadName, leadPhone, lastMessage, aiReason) {
  return `🔥 HOT LEAD ALERT 🔥

Lead: ${leadName}
Phone: ${leadPhone}
Last message: "${lastMessage}"

AI Reason: ${aiReason || 'Identified as high intent.'}

Recommendation: Reach out within 5-10 minutes for maximum conversion! 🚀`;
}

/**
 * Appointment confirmation message.
 */
export function appointmentConfirmation(date, time) {
  return `✅ Your appointment is confirmed!

📅 Date: ${date}
⏰ Time: ${time}

We'll send you a reminder before the call. See you soon! 🎉`;
}

/**
 * 24-hour appointment reminder.
 */
export function appointmentReminder24h(time) {
  return `⏰ Friendly Reminder! 

Your appointment is tomorrow at ${time}. 

Please be ready a few minutes early. Can't wait to connect with you! 😊`;
}

/**
 * 1-hour appointment reminder.
 */
export function appointmentReminder1h() {
  return `🔔 Your appointment starts in 1 hour!

We're looking forward to speaking with you. Just a heads up — please be in a quiet place with good internet if possible.

See you soon! 🎉`;
}

/**
 * Fallback message when AI is unavailable.
 */
export function fallbackMessage(leadName) {
  return `Hey ${leadName}! 👋

Thanks for your message! One of our team members will get back to you shortly.

In the meantime, feel free to share any questions you have! 😊`;
}