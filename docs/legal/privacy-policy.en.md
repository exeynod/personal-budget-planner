# Privacy Policy

> **Draft v0.1 — pending legal review.** This document was prepared
> before professional legal review. Real launch requires finalisation
> per `docs/legal/LEGAL-REVIEW-TODO.md`.

**Version:** v0.1 (2026-05-11)
**Applicable law:** Russian Federation Federal Law No. 152-FZ
"On Personal Data" of 27.07.2006.

## 1. Data Operator

The operator is a private individual — the owner of the TG Budget Planner service.
Contact: **exeynod@gmail.com**.

## 2. Purposes of Personal Data (PII) Processing

PII is processed exclusively for:

1. User authentication via Telegram Mini App (Telegram initData).
2. Storage of user budget data (categories, transactions, plans,
   subscriptions) for display in the application and bot.
3. Sending push notifications via Telegram bot (only to subscribed users).
4. Analytics of the AI assistant operation (token spend, ai_usage_log)
   for cost control.
5. Audit journal of operations on PII (consent / export / deletion) for
   compliance with §10.1 of 152-FZ.

PII is **not used** for marketing, profiling by third parties, or sharing
with advertisers.

## 3. Categories of PII Processed

| Category | Source | Purpose |
|----------|--------|---------|
| Telegram user ID (tg_user_id) | Telegram initData | Identification |
| Telegram chat ID (tg_chat_id) | /start command | Push notifications |
| Telegram name/username (optional) | Telegram initData | UI display |
| Budget data (categories, transactions, plans, savings, goals) | User | Application functionality |
| Text of AI chat messages | User | Processing via OpenAI |
| IP address (hashed) | HTTP request | Audit log (sha256) |

## 4. Legal Basis for Processing

The legal basis is the **consent of the data subject** (Art. 6, Para 1, P. 1
of 152-FZ), explicitly obtained via an onboarding checkbox "I consent to
processing of personal data" after prior review of this Policy. Consent
may be revoked at any time via `DELETE /api/v1/me/consent` or account
deletion.

## 5. Retention Periods

- Active user: PII is stored throughout the period of service use.
- After account deletion request: data is marked soft-deleted
  (`app_user.deleted_at`) and finally removed after **30 days** (cooling
  period to allow cancellation of accidental deletion).
- After final deletion: audit records (with hashed user_id) are retained
  for an additional **1 year** for compliance with regulatory requests,
  then archived.

## 6. Methods of Processing

Processing is carried out by automated means using computer equipment.
No manual processing of PII by the operator is provided.

## 7. Storage

PII is stored on servers in the Russian Federation (operator's VPS).
Backups are periodically taken via `pg_dump` and stored in encrypted form.

## 8. Sharing PII with Third Parties (Sub-processors)

| Sub-processor | Purpose | Data | Server location |
|---------------|---------|------|------------------|
| **OpenAI** | AI chat / categorization | Text of user AI chat messages; category names | EU (api.openai.com EU residency) |
| **Telegram** | Message delivery / Mini App | tg_user_id, text of bot messages | Depends on Telegram infrastructure |

PII is not shared with any other third parties.

## 9. Rights of the Data Subject

In accordance with Art. 14-15 of 152-FZ, the data subject has the right to:

1. **Access PII** — via `GET /api/v1/me/export` (JSON dump of all user data).
2. **Correct inaccurate PII** — via UI of the application (all fields editable).
3. **Delete PII** ("right to be forgotten") — via `DELETE /api/v1/me/account`
   (soft-delete + automatic hard-delete in 30 days).
4. **Revoke consent** — via `DELETE /api/v1/me/consent` (after revocation
   the application blocks all primary operations until consent is re-granted).
5. **Appeal operator actions** — contact the operator at
   **exeynod@gmail.com** or file with Roskomnadzor.

## 10. PII Protection

1. All API requests pass through HTTPS (TLS via Let's Encrypt).
2. PostgreSQL Row-Level Security (RLS) ensures isolation of user data:
   every request is executed under a non-superuser role with forced
   filtering by the `app.current_user_id` GUC.
3. Telegram initData is validated via HMAC-SHA256 on every request.
4. The audit journal stores only hashed (sha256) user_id and IP —
   identification is impossible after account deletion.

## 11. Cookies

The application uses only **technically required** cookies for Mini App
functionality (Telegram session). Analytical / marketing cookies are not
used.

## 12. Operator Contacts

**Operator:** private individual.
**Email (DPO contact):** exeynod@gmail.com
**Channel for data subject requests:** the same email or a direct message
in the Telegram bot.

## 13. Policy Changes

The operator is entitled to make changes to this Policy. The current
version is always available at `/legal/privacy?lang=en`. Material changes
are accompanied by a re-request of consent in the onboarding flow.

---

*This document is registered with Roskomnadzor: see `docs/COMPLIANCE.md`
(reg-number is filled after submission via pd.rkn.gov.ru).*
