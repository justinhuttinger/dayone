# System Flow Diagram

## Complete Process Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          TRAINER ACTION                              │
│                                                                       │
│  Trainer fills out "Generate PT Program" form in GoHighLevel         │
│  - Selects client contact                                            │
│  - Chooses program parameters (goal, duration, days, etc.)           │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             │ Form Submitted
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       GHL WORKFLOW                                   │
│                                                                       │
│  Automation triggered → Sends webhook to Render                      │
│  POST /webhook/generate-program                                      │
│  {contactId, locationId, formData}                                   │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             │ HTTP POST
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    NODE.JS SERVICE (Render)                          │
│                                                                       │
│  1. Receives webhook → Returns 200 OK immediately                    │
│                                                                       │
│  2. Fetches full contact data from GHL API                           │
│     GET /contacts/{contactId}                                        │
│     → Gets name, email, custom fields, tags                          │
│                                                                       │
│  3. Builds AI prompt with:                                           │
│     - Client information                                             │
│     - Program parameters                                             │
│     - Training requirements                                          │
│                                                                       │
│  4. Calls Anthropic API (Claude)                                     │
│     POST /v1/messages                                                │
│     → Returns structured JSON program                                │
│                                                                       │
│  5. Merges AI output into HTML template                              │
│     - Replaces {{clientName}}, {{currentDate}}                       │
│     - Formats workout tables                                         │
│                                                                       │
│  6. Generates PDF with Puppeteer                                     │
│     - Renders HTML with CSS styling                                  │
│     - Creates professional A4 PDF                                    │
│                                                                       │
│  7. Sends email via SendGrid                                         │
│     - To: client email                                               │
│     - Attachment: PDF program                                        │
│                                                                       │
│  8. (Optional) Uploads PDF to GHL contact record                     │
│                                                                       │
└────────────────────────────┬─────────────────────────────────────────┘
                             │
                             │ Email Sent
                             ▼
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT RECEIVES                             │
│                                                                       │
│  Email arrives with PDF attachment:                                  │
│  "Your Personalized Training Program - [Name]"                       │
│                                                                       │
│  PDF Contents:                                                       │
│  - WCS branded header                                                │
│  - Client name and date                                              │
│  - Program overview                                                  │
│  - Week-by-week breakdown                                            │
│  - Exercise tables (sets, reps, rest, notes)                         │
│  - Progression notes                                                 │
│  - General instructions                                              │
└─────────────────────────────────────────────────────────────────────┘
```

## Error Handling Flow

```
┌──────────────────┐
│  Error Occurs    │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────┐
│  Logged to Render Console         │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│  Email sent to Admin              │
│  (justin@westcoaststrength.com)   │
│  with error details               │
└──────────────────────────────────┘
```

## Data Flow

```
GHL Form Data:
  - Program Goal: "muscle building"
  - Duration: "8 weeks"
  - Days/Week: "4"
  - Experience: "intermediate"
  - Equipment: "full gym"
            ↓
GHL API Response:
  - Name: "Sarah Johnson"
  - Email: "sarah@example.com"
  - Custom fields: age, weight, etc.
  - Tags: ["Active Member", "Lancaster"]
            ↓
Claude AI Input:
  "Generate 8-week muscle building program
   for intermediate lifter with full gym access..."
            ↓
Claude AI Output (JSON):
  {
    "programOverview": "...",
    "weeks": [
      {
        "weekNumber": 1,
        "workouts": [...]
      }
    ]
  }
            ↓
HTML Template Merge:
  Client name → Sarah Johnson
  Program data → Formatted tables
            ↓
PDF Generation:
  Professional branded PDF document
            ↓
Email Delivery:
  SendGrid → sarah@example.com
```

## Technology Stack

```
Frontend:
  └─ GoHighLevel Forms & Workflows

Backend:
  ├─ Node.js + Express (Web Server)
  ├─ Anthropic SDK (Claude AI)
  ├─ Puppeteer (PDF Generation)
  ├─ Axios (API Calls)
  └─ SendGrid (Email Delivery)

Hosting:
  └─ Render (Auto-deploy from GitHub)

Integration:
  └─ GoHighLevel API (Contact Data)
```

## Typical Response Times

```
Form Submission → Webhook Response: < 1 second
Complete Process → Email Delivery: 10-30 seconds

Breakdown:
  - GHL API fetch: 1-2 seconds
  - Claude AI generation: 5-15 seconds
  - PDF creation: 2-5 seconds
  - Email sending: 1-3 seconds
```
