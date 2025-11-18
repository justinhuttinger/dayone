# Quick Deployment Checklist

## Pre-Deployment

- [ ] Get Anthropic API key from https://console.anthropic.com/
- [ ] Get GHL API key from GHL Settings → Integrations
- [ ] Ensure SendGrid account is setup with verified sender
- [ ] Test locally with `npm run test`
- [ ] Review generated PDF in test-output/

## GitHub Setup

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

## Render Setup

1. **Create Web Service:**
   - New + → Web Service
   - Connect GitHub repo
   - Name: `pt-program-generator`
   - Environment: Node
   - Build: `npm install`
   - Start: `npm start`

2. **Environment Variables (copy from .env):**
   ```
   ANTHROPIC_API_KEY
   GHL_API_KEY
   SENDGRID_API_KEY
   FROM_EMAIL
   ADMIN_EMAIL
   ```

3. **Note your URL:**
   - Example: `https://pt-program-generator.onrender.com`

## GHL Form Setup

**Form Fields:**
- Contact (hidden or selector)
- Program Goal (dropdown): Muscle Building, Fat Loss, Strength, General Fitness
- Duration (dropdown): 4, 8, 12 weeks
- Days Per Week (dropdown): 3, 4, 5, 6
- Experience Level (dropdown): Beginner, Intermediate, Advanced
- Equipment (dropdown): Full Gym, Home Gym, Minimal Equipment

## GHL Workflow Setup

**Trigger:** Form Submitted
**Action:** Custom Webhook
**URL:** `https://YOUR-RENDER-URL.onrender.com/webhook/generate-program`
**Method:** POST
**Body:**
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

## Testing

1. Submit form in GHL
2. Check Render logs: Dashboard → Logs
3. Verify email received
4. Review PDF quality

## If Something Breaks

**Check Render Logs:**
```
Dashboard → Your Service → Logs tab
```

**Common Issues:**
- API key missing/incorrect → Add in Environment tab
- Webhook not triggering → Verify URL in GHL workflow
- Email not sending → Check SendGrid API key and sender verification
- PDF generation fails → Check Puppeteer logs (might need larger instance)

## Monitoring

- Render dashboard shows requests and errors
- SendGrid dashboard shows email delivery
- Set up error notifications to your email (already configured)

## Next Steps After Deployment

1. Test with real data
2. Get trainer feedback on programs
3. Refine AI prompts based on output quality
4. Customize PDF styling/branding
5. Add more form fields as needed
