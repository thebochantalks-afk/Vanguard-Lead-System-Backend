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
  return `Hey ${leadName}! 👋

Welcome to ${clientName}! We're super excited to have you here.

Quick question: ${qualifyingQuestion}

Let us know, and we'll get right back to you! 🚀`;
}

/**
 * Follow-up 1 - Sent 24 hours after lead comes in (no reply).
 */
export function followUp1(leadName) {
  return `Hey ${leadName}! 👋

Just checking in — did you get a chance to see our earlier message? We'd love to help you out.

Got any questions? Feel free to ask! 😊`;
}

/**
 * Follow-up 2 - Sent 72 hours after lead comes in (no reply).
 */
export function followUp2(leadName) {
  return `Hi ${leadName}! 😊

We haven't heard from you yet, but we're still here whenever you're ready.

Quick heads up — our offers and availability change frequently, so it's best to lock in a quick chat while we have slots open!

Reply anytime. No pressure! 👍`;
}

/**
 * Follow-up 3 - Final follow-up with Calendly link, sent 7 days after.
 */
export function followUp3(leadName, calendlyLink) {
  const link = calendlyLink || 'https://calendly.com/your-link';
  return `Hey ${leadName}! 🙌

This will be our last check-in for now. If you're still interested, here's a link to book a quick call with us:

📅 ${link}

If not, no worries at all — you can always reach out when the time is right.

Wishing you all the best! 🎉`;
}

/**
 * Alert sent to the client when a lead is tagged HOT.
 */
export function hotLeadAlert(leadName, leadPhone, lastMessage) {
  return `🔥 HOT LEAD ALERT 🔥

Name: ${leadName}
Phone: ${leadPhone}
Last message: "${lastMessage}"

Reach out ASAP! This lead is ready to convert! 💪`;
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