const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();

const app = express();
app.use(express.json());

// Initialize SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Initialize Anthropic (Claude)
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Load clubs configuration
let clubsConfig = { clubs: [] };
async function loadClubsConfig() {
  try {
    const configPath = path.join(__dirname, 'clubs-config.json');
    const configData = await fs.readFile(configPath, 'utf8');
    clubsConfig = JSON.parse(configData);
    console.log(`✅ Loaded configuration for ${clubsConfig.clubs.length} clubs`);
    console.log(`✅ Enabled clubs: ${clubsConfig.clubs.filter(c => c.enabled).length}`);
  } catch (error) {
    console.error('❌ Error loading clubs-config.json:', error.message);
    console.log('⚠️  Will use environment variables as fallback');
  }
}

// Helper function to get club config by GHL location ID
function getClubByLocationId(locationId) {
  const club = clubsConfig.clubs.find(c => c.ghlLocationId === locationId && c.enabled);
  if (!club) {
    console.warn(`⚠️  No enabled club found for location ${locationId}, using default config`);
    return {
      clubName: 'West Coast Strength',
      ghlLocationId: locationId,
      ghlApiKey: process.env.GHL_API_KEY,
      fromEmail: process.env.FROM_EMAIL || 'programs@westcoaststrength.com',
      fromName: 'West Coast Strength',
      isDefault: true
    };
  }
  
  return {
    ...club,
    fromEmail: process.env.FROM_EMAIL || 'programs@westcoaststrength.com',
    fromName: club.clubName.includes('West Coast Strength') 
      ? club.clubName 
      : `West Coast Strength - ${club.clubName}`,
    isDefault: false
  };
}

// Health check endpoint
app.get('/health', (req, res) => {
  const enabledClubs = clubsConfig.clubs.filter(c => c.enabled);
  res.json({ 
    status: 'healthy', 
    service: 'PT Program Generator',
    enabledClubs: enabledClubs.length,
    clubs: enabledClubs.map(c => ({ 
      name: c.clubName, 
      clubNumber: c.clubNumber,
      locationId: c.ghlLocationId 
    }))
  });
});

// Main webhook endpoint from GHL
app.post('/webhook/generate-program', async (req, res) => {
  try {
    console.log('📥 Received webhook:', JSON.stringify(req.body, null, 2));
    
    // Parse GHL webhook format
    const contactId = req.body.contact_id;
    const locationId = req.body.location?.id;
    
    if (!contactId) {
      return res.status(400).json({ error: 'Missing contact_id' });
    }
    
    if (!locationId) {
      return res.status(400).json({ error: 'Missing location.id' });
    }
    
    // Get club config
    const club = getClubByLocationId(locationId);
    console.log(`📍 Processing for: ${club.clubName} (${club.clubNumber || 'default'})`);
    
    // Map GHL field names to our format
    const formData = {
      trainerName: req.body['Service Employee'] || '',
      programGoal: req.body['Program Goal'] || 'general fitness',
      duration: String(req.body['Duration (Weeks)'] || req.body['Duration'] || 8).replace(' weeks', ''),
      daysPerWeek: String(req.body['Days Per Week'] || req.body['Days per Week'] || 4).replace(' days a week', '').replace(' day a week', ''),
      experienceLevel: (req.body['Experience Level'] || 'intermediate').toLowerCase(),
      equipment: req.body['Equipment'] || 'full gym',
      weight: req.body['Weight (Lbs)'] || req.body['Weight'] || '',
      height: req.body['Height'] || '',
      bodyFat: String(req.body['Body Fat (%)'] || req.body['Body Fat'] || '').replace('%', ''),
      bmr: req.body['BMR'] || '',
      neckLimitation: req.body['Neck Limitation'] === 'Yes' || (Array.isArray(req.body['Neck Limitation']) && req.body['Neck Limitation'].includes('Yes')),
      shoulderLimitation: req.body['Shoulder Limitation'] === 'Yes' || (Array.isArray(req.body['Shoulder Limitation']) && req.body['Shoulder Limitation'].includes('Yes')),
      elbowWristLimitation: req.body['Elbow Wrist Limitation'] === 'Yes' || (Array.isArray(req.body['Elbow Wrist Limitation']) && req.body['Elbow Wrist Limitation'].includes('Yes')),
      lowerBackLimitation: req.body['Lower Back Limitation'] === 'Yes' || (Array.isArray(req.body['Lower Back Limitation']) && req.body['Lower Back Limitation'].includes('Yes')),
      hipLimitation: req.body['Hip Limitation'] === 'Yes' || (Array.isArray(req.body['Hip Limitation']) && req.body['Hip Limitation'].includes('Yes')),
      kneeLimitation: req.body['Knee Limitation'] === 'Yes' || (Array.isArray(req.body['Knee Limitation']) && req.body['Knee Limitation'].includes('Yes')),
      ankleLimitation: req.body['Ankle Limitation'] === 'Yes' || (Array.isArray(req.body['Ankle Limitation']) && req.body['Ankle Limitation'].includes('Yes')),
      otherLimitations: req.body['Other Limitations'] || ''
    };
    
    console.log('📝 Parsed formData:', JSON.stringify(formData, null, 2));
    
    // Quick response to GHL
    res.status(200).json({ 
      message: 'Program generation started',
      club: club.clubName,
      contactId: contactId
    });
    
    // Process asynchronously
    generateAndSendProgram(contactId, club, formData);
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Main program generation function
async function generateAndSendProgram(contactId, club, formData) {
  try {
    console.log(`🚀 Starting program generation for contact: ${contactId} at ${club.clubName}`);
    
    // Step 1: Fetch contact data from GHL
    const contactData = await fetchGHLContact(contactId, club);
    console.log(`👤 Fetched contact: ${contactData.name} (${contactData.email})`);
    
    // Step 2: Generate program with Claude AI
    const programContent = await generateProgramWithAI(contactData, formData);
    console.log('🤖 Program generated by AI');
    
    // Step 3: Add trainer name to program content
    programContent.trainerName = formData.trainerName || '';
    
    // Step 4: Create PDF from template
    const pdfBuffer = await generatePDF(contactData, programContent);
    console.log('📄 PDF created');
    
    // Step 5: Email PDF to client
    await sendProgramEmail(contactData, club, pdfBuffer);
    console.log(`✅ Program sent to: ${contactData.email}`);
    
    // Step 6: Upload PDF to GHL contact record (optional)
    // await uploadToGHL(contactId, club, pdfBuffer);
    
  } catch (error) {
    console.error('❌ Program generation error:', error);
    // Send error notification
    await sendErrorNotification(error, contactId, club);
  }
}

// Fetch contact data from GHL
async function fetchGHLContact(contactId, club) {
  console.log(`🔍 Fetching contact from: ${club.clubName} (Location: ${club.ghlLocationId})`);
  
  const response = await axios.get(
    `https://services.leadconnectorhq.com/contacts/${contactId}`,
    {
      headers: {
        'Authorization': `Bearer ${club.ghlApiKey}`,
        'Version': '2021-07-28'
      }
    }
  );
  
  const contact = response.data.contact;
  
  return {
    id: contact.id,
    name: contact.name || 'Client',
    firstName: contact.firstName || '',
    lastName: contact.lastName || '',
    email: contact.email,
    phone: contact.phone,
    customFields: contact.customField || {},
    tags: contact.tags || [],
    locationId: club.ghlLocationId,
    locationName: club.clubName,
    clubNumber: club.clubNumber
  };
}

// Generate program using Claude AI
async function generateProgramWithAI(contactData, formData) {
  const prompt = buildPrompt(contactData, formData);
  
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });
  
  const responseText = message.content[0].text;
  
  // Parse the structured response
  try {
    // Remove markdown code blocks if present
    let cleanedResponse = responseText.trim();
    
    // Check for markdown JSON code blocks and extract
    const jsonMatch = cleanedResponse.match(/```json\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      cleanedResponse = jsonMatch[1];
      console.log('Extracted from markdown json block');
    } else {
      // Try to find just ``` code blocks
      const codeMatch = cleanedResponse.match(/```\s*\n?([\s\S]*?)\n?```/);
      if (codeMatch) {
        cleanedResponse = codeMatch[1];
        console.log('Extracted from markdown code block');
      }
    }
    
    // Try to parse
    const parsed = JSON.parse(cleanedResponse.trim());
    
    // Log what we got
    console.log('✅ Successfully parsed program JSON');
    console.log('Has weekTemplate?', !!parsed.weekTemplate);
    console.log('Has weeks?', !!parsed.weeks);
    console.log('Has mealPlan?', !!parsed.mealPlan);
    if (parsed.weekTemplate) {
      console.log('Number of workouts:', parsed.weekTemplate.workouts?.length || 0);
    }
    
    return parsed;
  } catch (e) {
    console.error('Failed to parse AI response as JSON:', e.message);
    console.log('Raw response:', responseText.substring(0, 500));
    
    // Return fallback structure
    return {
      programOverview: 'Error generating structured program. Please try again.',
      programText: responseText,
      weekTemplate: null
    };
  }
}

// Build prompt for AI
function buildPrompt(contactData, formData) {
  const {
    trainerName,
    programGoal,
    duration,
    daysPerWeek,
    experienceLevel,
    equipment,
    weight,
    height,
    bodyFat,
    bmr,
    neckLimitation,
    shoulderLimitation,
    elbowWristLimitation,
    lowerBackLimitation,
    hipLimitation,
    kneeLimitation,
    ankleLimitation,
    otherLimitations
  } = formData;
  
  // Build limitations array
  const limitations = [];
  if (neckLimitation) limitations.push('Neck');
  if (shoulderLimitation) limitations.push('Shoulder');
  if (elbowWristLimitation) limitations.push('Elbow/Wrist');
  if (lowerBackLimitation) limitations.push('Lower Back');
  if (hipLimitation) limitations.push('Hip');
  if (kneeLimitation) limitations.push('Knee');
  if (ankleLimitation) limitations.push('Ankle');
  if (otherLimitations) limitations.push(`Other: ${otherLimitations}`);
  
  const limitationsText = limitations.length > 0 
    ? `MOVEMENT LIMITATIONS: ${limitations.join(', ')}. YOU MUST modify exercises to work around these limitations.`
    : 'No movement limitations reported.';
  
  // Build InBody stats
  const inbodyText = (weight || height || bodyFat || bmr) 
    ? `INBODY METRICS: Weight: ${weight} lbs, Height: ${height} inches, Body Fat: ${bodyFat}%, BMR: ${bmr} calories/day`
    : '';
  
  return `You are an expert personal trainer creating a ${duration}-week training program for ${contactData.firstName}.

CLIENT INFO:
- Name: ${contactData.firstName} ${contactData.lastName}
- Experience Level: ${experienceLevel}
- Available Equipment: ${equipment}
- Training Days Per Week: ${daysPerWeek}
- Primary Goal: ${programGoal}
${inbodyText}

${limitationsText}

IMPORTANT: If there are movement limitations, you MUST intelligently modify exercises. For example:
- Shoulder limitations → Use landmine presses instead of overhead presses, focus on neutral grip movements
- Knee limitations → Use leg press variations, step-ups, or belt squats instead of back squats
- Lower back limitations → Use hex bar deadlifts, hip thrusts, or leg curls instead of conventional deadlifts

Create a comprehensive training program with:
1. A program overview explaining the training approach and how it addresses their goal
2. ${daysPerWeek} distinct workouts per week (e.g., Upper/Lower split, Push/Pull/Legs, etc.)
3. Each workout should have 5-8 exercises with specific sets, reps, and rest periods
4. Include form cues and technique notes for each exercise
5. Progression guidelines for advancing week to week

Return your response as a JSON object with this EXACT structure:

{
  "programOverview": "Brief explanation of the training approach and split (2-3 sentences)",
  ${inbodyText ? '"inbodyStats": { "weight": "' + weight + '", "height": "' + height + '", "bodyFat": "' + bodyFat + '", "bmr": "' + bmr + '" },' : ''}
  "weekTemplate": {
    "workouts": [
      {
        "day": 1,
        "title": "Workout name (e.g., Upper Body, Push Day, etc.)",
        "focus": "Primary muscle groups/movement patterns",
        "exercises": [
          {
            "name": "Exercise name (modified for any limitations)",
            "sets": "3",
            "reps": "8-10",
            "rest": "90 seconds",
            "notes": "Form cues, modifications for limitations if applicable",
            "videoUrl": "Optional: URL to instructional video (leave empty if not available)"
          }
        ]
      }
    ]
  },
  "progressionNotes": "How to progress week to week (increase weight, reps, etc.)",
  "generalNotes": "Important reminders, warm-up guidance, cool-down"
}

CRITICAL INSTRUCTIONS:
1. Create ${daysPerWeek} distinct workouts that form a complete training split
2. MODIFY exercises based on limitations - use safer alternatives, reduced ROM, or easier progressions
3. Include specific form cues and technique notes for each exercise
4. Return ONLY valid JSON. No markdown code blocks. No text before or after the JSON.`;
}

// Generate PDF from HTML template
async function generatePDF(contactData, programContent) {
  // Load HTML template
  const templatePath = path.join(__dirname, 'templates', 'program-template.html');
  let htmlTemplate = await fs.readFile(templatePath, 'utf8');
  
  // Load and encode logo as base64
  const logoPath = path.join(__dirname, 'templates', 'logo.png');
  const logoBuffer = await fs.readFile(logoPath);
  const logoBase64 = logoBuffer.toString('base64');
  
  // Generate the program content HTML first
  let programHTML = formatProgramHTML(contactData, programContent);
  
  // THEN replace the logo placeholder in the program content
  programHTML = programHTML.replace(/{{logoBase64}}/g, logoBase64);
  
  // Replace placeholders in template
  htmlTemplate = htmlTemplate
    .replace(/{{programContent}}/g, programHTML);
  
  console.log('Generated HTML length:', htmlTemplate.length);
  
  // Generate PDF using PDFShift API with margins
  const response = await axios.post(
    'https://api.pdfshift.io/v3/convert/pdf',
    {
      source: htmlTemplate,
      landscape: false,
      use_print: true,
      margin: {
        top: '0.5in',
        bottom: '0.5in',
        left: '0.5in',
        right: '0.5in'
      }
    },
    {
      auth: {
        username: 'api',
        password: process.env.PDFSHIFT_API_KEY
      },
      responseType: 'arraybuffer'
    }
  );
  
  return Buffer.from(response.data);
}

// Format program content as HTML matching WCS Day 1 Program style
function formatProgramHTML(contactData, programContent) {
  if (!programContent.weekTemplate && !programContent.weeks) {
    return `<div class="program-text">${programContent.programText || 'Program content'}</div>`;
  }
  
  let html = '';
  
  // Page 1: Overview/Core Concepts with InBody Stats
  html += `
    <div class="page">
      <img src="data:image/png;base64,{{logoBase64}}" class="logo-image" alt="WCS Logo">
      
      <div class="page-header">
        <div class="header-left">
          <h1>WEST COAST STRENGTH</h1>
          <h2>TRAINING PROGRAM</h2>
        </div>
        <div class="header-right">
          <p>TRAINER: ${programContent.trainerName || ''}</p>
          <p>CLIENT: ${contactData.firstName} ${contactData.lastName}</p>
        </div>
      </div>
      
      <div class="core-concepts">
        <h3>CORE CONCEPTS:</h3>
        <div class="core-concepts-content">
          ${programContent.programOverview ? `<p>${programContent.programOverview}</p>` : ''}
          ${programContent.progressionNotes ? `<p><strong>Progression:</strong> ${programContent.progressionNotes}</p>` : ''}
          ${programContent.generalNotes ? `<p><strong>Important Notes:</strong> ${programContent.generalNotes}</p>` : ''}
        </div>
        
        ${programContent.inbodyStats ? `
          <h3 style="margin-top: 40px;">INBODY METRICS:</h3>
          <div class="core-concepts-content">
            <p><strong>Weight:</strong> ${programContent.inbodyStats.weight} lbs | <strong>Height:</strong> ${programContent.inbodyStats.height} inches</p>
            <p><strong>Body Fat:</strong> ${programContent.inbodyStats.bodyFat}% | <strong>Basal Metabolic Rate:</strong> ${programContent.inbodyStats.bmr} calories/day</p>
          </div>
        ` : ''}
      </div>
    </div>
  `;
  
  // Get the workout template
  const workouts = programContent.weekTemplate?.workouts || programContent.weeks?.[0]?.workouts || [];
  
  // Generate workout pages - one page per workout
  workouts.forEach(workout => {
    html += `
      <div class="page">
        <img src="data:image/png;base64,{{logoBase64}}" class="logo-image" alt="WCS Logo">
        
        <div class="page-header">
          <div class="header-left">
            <h1>WEST COAST STRENGTH</h1>
            <h2>DAY ${workout.day} - ${workout.title.toUpperCase()}</h2>
          </div>
          <div class="header-right">
            <p>TRAINER: ${programContent.trainerName || ''}</p>
            <p>CLIENT: ${contactData.firstName} ${contactData.lastName}</p>
          </div>
        </div>
        
        <table class="workout-table">
    `;
    
    // Add exercises as table rows
    workout.exercises.forEach(exercise => {
      const setsReps = `${exercise.sets} x ${exercise.reps}`;
      const notes = exercise.notes || '';
      const videoUrl = exercise.videoUrl || '';
      
      // Generate QR code if video URL exists
      let qrCodeHTML = '';
      if (videoUrl) {
        // QR code API - generates QR code image from URL
        qrCodeHTML = `<br><img src="https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${encodeURIComponent(videoUrl)}" alt="Video QR" style="margin-top: 5px;">`;
      }
      
      html += `
        <tr>
          <td>
            <strong>${exercise.name}</strong>
            ${notes ? `<br><span style="font-size: 11px; color: #666;">${notes}</span>` : ''}
            ${qrCodeHTML}
          </td>
          <td>${setsReps}</td>
        </tr>
      `;
    });
    
    html += `
        </table>
      </div>
    `;
  });
  
  return html;
}

// Send program via email
async function sendProgramEmail(contactData, club, pdfBuffer) {
  const msg = {
    to: contactData.email,
    from: {
      email: club.fromEmail,
      name: club.fromName
    },
    subject: `Your Personalized Training Program - ${contactData.firstName}`,
    text: `Hi ${contactData.firstName},\n\nYour customized training program from ${club.fromName} is attached. Please review it carefully and reach out if you have any questions.\n\nLet's crush these goals!\n\n${club.fromName}`,
    html: `
      <p>Hi ${contactData.firstName},</p>
      <p>Your customized training program from <strong>${club.fromName}</strong> is attached. Please review it carefully and reach out if you have any questions.</p>
      <p><strong>Let's crush these goals!</strong></p>
      <p>${club.fromName}</p>
    `,
    attachments: [
      {
        content: pdfBuffer.toString('base64'),
        filename: `Training_Program_${contactData.firstName}_${contactData.lastName}.pdf`,
        type: 'application/pdf',
        disposition: 'attachment'
      }
    ]
  };
  
  await sgMail.send(msg);
}

// Send error notification
async function sendErrorNotification(error, contactId, club) {
  const msg = {
    to: process.env.ADMIN_EMAIL || 'justin@westcoaststrength.com',
    from: process.env.FROM_EMAIL || 'programs@westcoaststrength.com',
    subject: `PT Program Generator Error - ${club.clubName}`,
    text: `Error generating program for contact ${contactId} at ${club.clubName} (${club.clubNumber}):\n\n${error.message}\n\n${error.stack}`
  };
  
  try {
    await sgMail.send(msg);
  } catch (e) {
    console.error('Failed to send error notification:', e);
  }
}

// Start server
const PORT = process.env.PORT || 3000;

// Load config and start server
loadClubsConfig().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 PT Program Generator running on port ${PORT}`);
    console.log(`📍 Managing ${clubsConfig.clubs.filter(c => c.enabled).length} enabled locations`);
  });
}).catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
