# PT Program Generator

AI-powered personal training program generator for West Coast Strength. Generates customized training programs using Claude AI and delivers them as professional PDF documents.

## Features

- 🤖 **AI-Powered**: Uses Claude Sonnet 4.5 to generate personalized training programs
- 📄 **Professional PDFs**: Clean, branded PDF output with WCS styling
- 📧 **Automatic Delivery**: Sends programs via email using SendGrid
- 🔗 **GHL Integration**: Connects with GoHighLevel for contact data and workflows
- ⚡ **Async Processing**: Fast webhook response with background processing
- 🎯 **Customizable**: Easy to modify prompts, templates, and program structure

## Architecture

```
GHL Form Submission 
    ↓
Webhook to Render
    ↓
Fetch Contact Data from GHL API
    ↓
Generate Program with Claude AI
    ↓
Create PDF from HTML Template
    ↓
Email PDF via SendGrid
    ↓
(Optional) Upload to GHL Contact Record
```

## Prerequisites

- Node.js 18+
- Anthropic API key (for Claude)
- GoHighLevel API key
- SendGrid API key
- Render account (for hosting)
- GitHub account (for deployment)

## Setup Instructions

### 1. Local Development Setup

```bash
# Clone/download the repository
cd pt-program-generator

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your actual API keys
nano .env
```

### 2. Environment Variables

Edit `.env` with your actual credentials:

```env
PORT=3000
ANTHROPIC_API_KEY=sk-ant-xxx...
GHL_API_KEY=your_ghl_api_key
SENDGRID_API_KEY=SG.xxx...
FROM_EMAIL=programs@westcoaststrength.com
ADMIN_EMAIL=justin@westcoaststrength.com
```

**Where to get API keys:**

- **Anthropic API**: https://console.anthropic.com/
- **GoHighLevel API**: Settings → Integrations → API Keys
- **SendGrid API**: https://app.sendgrid.com/settings/api_keys

### 3. Test Locally

Before deploying, test the generation:

```bash
npm run test
```

This will:
- Generate a test program for "John Smith"
- Create a PDF in the `test-output/` directory
- Show you the program structure and PDF size

Check the generated PDF to ensure it looks good!

### 4. Deploy to Render

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit - PT Program Generator"
   git remote add origin your-github-repo-url
   git push -u origin main
   ```

2. **Create Render Web Service:**
   - Go to https://render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name**: `pt-program-generator`
     - **Environment**: `Node`
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Instance Type**: Free (to start, upgrade later if needed)

3. **Add Environment Variables in Render:**
   - Go to Environment tab
   - Add all variables from your `.env` file
   - Save changes

4. **Deploy!**
   - Render will automatically build and deploy
   - Note your service URL: `https://pt-program-generator.onrender.com`

### 5. Setup GHL Webhook

1. **Create Form in GHL:**
   - Go to Sites → Forms
   - Create new form: "Generate PT Program"
   - Add fields:
     - Contact selector or hidden contact ID field
     - Program Goal (dropdown): Muscle Building, Fat Loss, Strength, General Fitness
     - Duration (dropdown): 4, 8, 12 weeks
     - Days Per Week (dropdown): 3, 4, 5, 6
     - Experience Level (dropdown): Beginner, Intermediate, Advanced
     - Equipment (dropdown): Full Gym, Home Gym, Minimal Equipment

2. **Create Workflow:**
   - Go to Automations → Workflows
   - Create new workflow
   - **Trigger**: Form Submitted (select your form)
   - **Action**: Custom Webhook
   - **Webhook URL**: `https://your-render-url.onrender.com/webhook/generate-program`
   - **Method**: POST
   - **Body**: 
     ```json
     {
       "contactId": "{{contact.id}}",
       "locationId": "{{contact.location_id}}",
       "formData": {
         "programGoal": "{{form.program_goal}}",
         "duration": "{{form.duration}}",
         "daysPerWeek": "{{form.days_per_week}}",
         "experienceLevel": "{{form.experience_level}}",
         "equipment": "{{form.equipment}}"
       }
     }
     ```
   - Save workflow

### 6. Test the Integration

1. Submit the form in GHL as a test
2. Check Render logs for processing
3. Verify email delivery
4. Review the generated PDF

## API Endpoints

### Health Check
```
GET /health
```
Returns service status.

### Generate Program (Webhook)
```
POST /webhook/generate-program
```
Accepts GHL webhook with contact and form data.

## Project Structure

```
pt-program-generator/
├── server.js                 # Main application
├── test-generation.js        # Test script
├── templates/
│   └── program-template.html # PDF template
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

## Customization

### Modify the AI Prompt

Edit the `buildPrompt()` function in `server.js` to change how programs are generated.

### Customize PDF Design

Edit `templates/program-template.html` to change styling, layout, branding.

### Add More Form Fields

1. Add fields to GHL form
2. Include in webhook payload
3. Update `buildPrompt()` to use new fields

### Multi-Location Support

Add location-specific configuration (similar to your ABC sync):

```javascript
// config/locations.json
{
  "loc_123": {
    "name": "Salem",
    "trainerEmail": "salem@wcs.com"
  }
}
```

## Costs

**Estimated costs per program:**
- Anthropic API: $0.01 - $0.05 per program
- SendGrid: Free tier covers 100 emails/day
- Render: Free tier for testing, $7/month for production

**Monthly estimate for 100 programs:**
- AI: ~$3
- Email: Free
- Hosting: $7
- **Total: ~$10/month**

## Troubleshooting

### Programs not generating
- Check Render logs for errors
- Verify API keys in environment variables
- Test webhook URL with Postman

### PDF looks wrong
- Run `npm run test` locally to debug
- Check HTML template syntax
- Verify Puppeteer launched correctly

### Emails not sending
- Verify SendGrid API key
- Check sender email is verified in SendGrid
- Review SendGrid activity logs

## Future Enhancements

Phase 2 ideas:
- [ ] Pull more GHL contact data (tags, custom fields, notes)
- [ ] Multiple program templates (bodybuilding, powerlifting, crossfit)
- [ ] Video exercise links in PDF
- [ ] Progress tracking integration
- [ ] Upload PDF back to GHL contact files
- [ ] Nutrition guidance section
- [ ] Recovery protocols

## Support

Questions? Issues? Contact Justin at West Coast Strength.

## License

Proprietary - West Coast Strength © 2024
