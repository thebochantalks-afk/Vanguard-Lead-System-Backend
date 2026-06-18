# Webhook Setup Guide

To secure your webhooks, follow these steps to configure the environment variables in your deployment (Railway/Vercel).

## 1. Meta Ads (Lead Ingestion)
Endpoint: `https://your-backend-url.com/webhook/lead`

- **Verify Token**: Set `META_VERIFY_TOKEN` in your `.env`. Use the same value in Meta Ads Manager.
- **App Secret**: Set `META_APP_SECRET` (from Meta App Settings) to enable signature verification.
- **Manual Ingestion**: If sending leads via API, use `X-Webhook-Token` header matching `WEBHOOK_LEAD_TOKEN`.

## 2. Interakt (WhatsApp Messages)
Endpoint: `https://your-backend-url.com/webhook/whatsapp`

- **Verify Token**: Set `INTERAKT_VERIFY_TOKEN`. In Interakt dashboard, ensure this token is sent either as a query param `?token=...` or a header `X-Webhook-Token`.

## Environment Variables Summary
```
META_VERIFY_TOKEN=your_choice
META_APP_SECRET=from_meta
INTERAKT_VERIFY_TOKEN=your_choice
WEBHOOK_LEAD_TOKEN=your_choice
```
