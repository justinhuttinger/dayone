# Quick Start Guide

## Get Running in 15 Minutes

### Step 1: Extract and Setup (2 min)

```bash
# Extract the project
tar -xzf pt-program-generator.tar.gz
cd pt-program-generator

# Install dependencies
npm install
```

### Step 2: Get API Keys (5 min)

1. **Anthropic (Claude AI)**
   - Go to: https://console.anthropic.com/
   - Sign up/login
   - Create API key
   - Copy the key (starts with `sk-ant-`)

2. **GoHighLevel**
   - Login to GHL
   - Settings → Integrations → API
   - Create or copy existing API key

3. **SendGrid**
   - Go to: https://app.sendgrid.com/
   - Sign up/login (free tier is fine)
   - Settings → API Keys → Create API Key
   - Copy key (starts with `SG.`)
   - **Important**: Verify your sender email in SendGrid!

### Step 3: Configure (2 min)

```bash
# Copy example environment file
cp .env.example .env

# Edit with your actual keys
nano .env
```

Paste your keys:
```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
GHL_API_KEY=your-ghl-key
SENDGRID_API_KEY=SG.your-key-here
FROM_EMAIL=programs@westcoaststrength.com
ADMIN_EMAIL=justin@westcoaststrength.com
```

### Step 4: Test Locally (3 min)

```bash
npm run test
```

You should see:
- ✅ Program generated
- ✅ PDF created
- PDF saved to `test-output/` folder

**Open the PDF** and verify it looks good!

### Step 5: Deploy to Render (3 min)

```bash
# Push to GitHub
git init
git add .
git commit -m "PT Program Generator"
git remote add origin YOUR-GITHUB-URL
git push -u origin main
```

Then in Render:
1. New Web Service
2. Connect GitHub repo
3. Build: `npm install`
4. Start: `npm start`
5. Add environment variables
6. Deploy!

### Step 6: Setup GHL Form & Webhook (Optional - do later)

See DEPLOYMENT.md for detailed GHL setup instructions.

## That's It! 🎉

You now have:
- ✅ Working AI program generator
- ✅ Professional PDF output
- ✅ Email delivery system
- ✅ Ready to deploy

## What to Do Next

1. **Test the PDF output** - Make sure it looks how you want
2. **Customize the HTML template** - Add your logo, change colors
3. **Refine the AI prompt** - Adjust how programs are generated
4. **Setup GHL integration** - Connect to your live system
5. **Get feedback** - Have trainers test it

## Need Help?

- Check README.md for full documentation
- Review DEPLOYMENT.md for detailed setup
- Look at SYSTEM-FLOW.md to understand how it works

## Pro Tips

- Start with the test script (`npm run test`) to iterate on prompts/design
- Keep your `.env` file secure - never commit it to GitHub
- Monitor Render logs when you first deploy
- Test email delivery with your own email first
- Have trainers review sample PDFs before rolling out

## Costs

Expected monthly costs for 100 programs:
- Anthropic API: ~$3
- SendGrid: Free (up to 100/day)
- Render: $7/month
- **Total: ~$10/month**

Start on free tiers, upgrade as needed!
