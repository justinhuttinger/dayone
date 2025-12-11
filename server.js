const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs').promises;
const path = require('path');
const sgMail = require('@sendgrid/mail');
const FormData = require('form-data');
require('dotenv').config();

const app = express();
app.use(express.json());

// Temporary storage for PDF URLs (in production, use Redis or similar)
const pdfUrlCache = new Map();

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

// Success redirect page - looks up the PDF URL for the contact
app.get('/program-success/:contactId', (req, res) => {
  const contactId = req.params.contactId;
  const pdfUrl = pdfUrlCache.get(contactId);
  
  if (!pdfUrl) {
    return res.send(`
      <html>
        <head><title>Program Generated</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>✅ Program Generated!</h1>
          <p>Your personalized training program has been emailed to the client.</p>
          <p style="color: #666; font-size: 14px; margin-top: 30px;">The direct link has expired. Please check the client's email or contact files in GHL.</p>
        </body>
      </html>
    `);
  }
  
  res.send(`
    <html>
      <head>
        <title>Program Generated</title>
        <meta http-equiv="refresh" content="1;url=${pdfUrl}">
      </head>
      <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
        <h1>✅ Your Program is Ready!</h1>
        <p>Opening your personalized training program...</p>
        <p style="color: #666; font-size: 14px;">If it doesn't open automatically, <a href="${pdfUrl}" style="color: #E31E24; font-weight: bold;">click here</a></p>
        <script>
          setTimeout(() => {
            window.location.href = "${pdfUrl}";
          }, 500);
        </script>
      </body>
    </html>
  `);
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
    
    // Map GHL field names to our format - capture ALL PT Intake fields
    const formData = {
      // Trainer & Program Design
      trainerName: req.body['Service Employee'] || '',
      programGoal: req.body['Program Goal'] || 'general fitness',
      duration: String(req.body['Duration (Weeks)'] || req.body['Duration'] || 8).replace(' weeks', ''),
      daysPerWeek: String(req.body['Days Per Week'] || req.body['Days per Week'] || 4).replace(' days a week', '').replace(' day a week', ''),
      experienceLevel: (req.body['Experience Level'] || 'intermediate').toLowerCase(),
      equipment: req.body['Equipment'] || 'full gym',
      
      // InBody Metrics
      weight: req.body['Weight (Lbs)'] || req.body['Weight'] || '',
      height: req.body['Height'] || '',
      bodyFat: String(req.body['Body Fat (%)'] || req.body['Body Fat'] || '').replace('%', ''),
      bmr: req.body['BMR'] || '',
      
      // Movement Limitations
      neckLimitation: req.body['Neck Limitation'] === 'Yes' || (Array.isArray(req.body['Neck Limitation']) && req.body['Neck Limitation'].includes('Yes')),
      shoulderLimitation: req.body['Shoulder Limitation'] === 'Yes' || (Array.isArray(req.body['Shoulder Limitation']) && req.body['Shoulder Limitation'].includes('Yes')),
      elbowWristLimitation: req.body['Elbow Wrist Limitation'] === 'Yes' || (Array.isArray(req.body['Elbow Wrist Limitation']) && req.body['Elbow Wrist Limitation'].includes('Yes')),
      lowerBackLimitation: req.body['Lower Back Limitation'] === 'Yes' || (Array.isArray(req.body['Lower Back Limitation']) && req.body['Lower Back Limitation'].includes('Yes')),
      hipLimitation: req.body['Hip Limitation'] === 'Yes' || (Array.isArray(req.body['Hip Limitation']) && req.body['Hip Limitation'].includes('Yes')),
      kneeLimitation: req.body['Knee Limitation'] === 'Yes' || (Array.isArray(req.body['Knee Limitation']) && req.body['Knee Limitation'].includes('Yes')),
      ankleLimitation: req.body['Ankle Limitation'] === 'Yes' || (Array.isArray(req.body['Ankle Limitation']) && req.body['Ankle Limitation'].includes('Yes')),
      otherLimitations: req.body['Other Limitations'] || '',
      
      // Client Goals & Interests
      interestedIn: req.body['What are you interested in?'] || '',
      interestedInPT: req.body['Are you interested in Personal Training?'] || '',
      preferredCoach: req.body['Do you have a Preferred Coach?'] || '',
      fitnessGoals: req.body['What are your Fitness Goals?'] || '',
      
      // Medical Screening Questions
      heartCondition: req.body['Has a Doctor Ever Said You Have a Heart Condition & Recommended Only Medically Supervised Activity?'] || '',
      chestPain: req.body['Do You Experience Chest Pain During Physical Activity?'] || '',
      boneJointProblem: req.body['Do You Have a Bone or Joint Problem that Physical Activity Could Aggravate?'] || '',
      bloodPressureMedication: req.body['Has Your Doctor Recommended Medication for your Blood Pressure?'] || '',
      medicalSupervisionNeeded: req.body['Are you Aware of Any Reason you Should Not Exercise Without Medical Supervision'] || '',
      
      // Current Fitness & Nutrition
      currentWorkoutRoutine: req.body['What is Your Current Workout Routine?'] || '',
      followsDietPlan: req.body['Do You Follow a Diet / Meal Plan?'] || '',
      biggestObstacles: req.body['What are your Biggest Obstacles?'] || '',
      wouldHelpMost: req.body['What Would Help You the Most?'] || '',
      
      // Additional Client Info
      gender: req.body['Gender'] || req.body['contact.gender'] || '',
      trainerNotes: req.body['contact.pt_notes'] || req.body['PT Notes'] || '',
      
      // Day Focus (optional - only filled if specified)
      day1Focus: req.body['Day 1 Focus'] || '',
      day2Focus: req.body['Day Two Focus'] || '',
      day3Focus: req.body['Day Three Focus'] || '',
      day4Focus: req.body['Day Four Focus'] || '',
      day5Focus: req.body['Day Five Focus'] || '',
      day6Focus: req.body['Day Six Focus'] || '',
      day7Focus: req.body['Day Seven Focus'] || ''
    };
    
    console.log('📝 Parsed formData:', JSON.stringify(formData, null, 2));
    
    // Process SYNCHRONOUSLY and wait for PDF URL
    const pdfUrl = await generateAndSendProgram(contactId, club, formData);
    
    // Store PDF URL in cache with contactId (expires after 5 minutes)
    pdfUrlCache.set(contactId, pdfUrl);
    setTimeout(() => pdfUrlCache.delete(contactId), 5 * 60 * 1000);
    
    // Build redirect URL that trainer can use
    const baseUrl = process.env.BASE_URL || 'https://dayone-xe91.onrender.com';
    const redirectUrl = `${baseUrl}/program-success/${contactId}`;
    
    // Return PDF URL in response
    res.status(200).json({ 
      message: 'Program generated successfully',
      club: club.clubName,
      contactId: contactId,
      pdfUrl: pdfUrl,
      redirectUrl: redirectUrl,
      success: true
    });
    
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
    
    // Step 4: Add medical screening to program content (for PDF display - always include for legal purposes)
    programContent.medicalScreening = {
      heartCondition: formData.heartCondition || 'No',
      chestPain: formData.chestPain || 'No',
      boneJointProblem: formData.boneJointProblem || 'No',
      bloodPressureMedication: formData.bloodPressureMedication || 'No',
      medicalSupervisionNeeded: formData.medicalSupervisionNeeded || 'No'
    };
    
    // Step 5: Create PDF from template
    const pdfBuffer = await generatePDF(contactData, programContent);
    console.log('📄 PDF created');
    
    // Step 6: Upload PDF to GHL and get shareable URL
    const pdfUrl = await uploadPDFtoGHL(contactId, club, pdfBuffer, contactData);
    console.log(`📤 PDF uploaded to GHL: ${pdfUrl}`);
    
    // Step 7: Email PDF to client
    await sendProgramEmail(contactData, club, pdfBuffer);
    console.log(`✅ Program sent to: ${contactData.email}`);
    
    // Return the PDF URL
    return pdfUrl;
    
  } catch (error) {
    console.error('❌ Program generation error:', error);
    // Send error notification
    await sendErrorNotification(error, contactId, club);
    throw error; // Re-throw so webhook can return error
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
    otherLimitations,
    interestedIn,
    interestedInPT,
    preferredCoach,
    fitnessGoals,
    heartCondition,
    chestPain,
    boneJointProblem,
    bloodPressureMedication,
    medicalSupervisionNeeded,
    currentWorkoutRoutine,
    followsDietPlan,
    biggestObstacles,
    wouldHelpMost,
    gender,
    trainerNotes,
    day1Focus,
    day2Focus,
    day3Focus,
    day4Focus,
    day5Focus,
    day6Focus,
    day7Focus
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
  
  // Build medical screening section
  const medicalScreening = [];
  if (heartCondition && heartCondition !== 'No') medicalScreening.push(`Heart condition requiring medical supervision: ${heartCondition}`);
  if (chestPain && chestPain !== 'No') medicalScreening.push(`Chest pain during activity: ${chestPain}`);
  if (boneJointProblem && boneJointProblem !== 'No') medicalScreening.push(`Bone/joint concerns: ${boneJointProblem}`);
  if (bloodPressureMedication && bloodPressureMedication !== 'No') medicalScreening.push(`Blood pressure medication: ${bloodPressureMedication}`);
  if (medicalSupervisionNeeded && medicalSupervisionNeeded !== 'No') medicalScreening.push(`Other medical supervision needed: ${medicalSupervisionNeeded}`);
  
  const medicalText = medicalScreening.length > 0
    ? `\nMEDICAL SCREENING ALERTS:\n- ${medicalScreening.join('\n- ')}\n⚠️ IMPORTANT: Design a conservative program that accounts for these medical considerations.`
    : '';
  
  // Build client context section
  const clientContext = [];
  if (fitnessGoals) clientContext.push(`Fitness Goals: ${fitnessGoals}`);
  if (currentWorkoutRoutine) clientContext.push(`Current Routine: ${currentWorkoutRoutine}`);
  if (followsDietPlan) clientContext.push(`Diet/Meal Plan: ${followsDietPlan}`);
  if (biggestObstacles) clientContext.push(`Biggest Obstacles: ${biggestObstacles}`);
  if (wouldHelpMost) clientContext.push(`What Would Help Most: ${wouldHelpMost}`);
  if (interestedIn) clientContext.push(`Interests: ${interestedIn}`);
  
  const clientContextText = clientContext.length > 0
    ? `\nCLIENT BACKGROUND:\n${clientContext.join('\n')}`
    : '';
  
  // Build trainer notes section
  const trainerNotesText = trainerNotes
    ? `\n⭐ TRAINER NOTES (IMPORTANT - USE THESE TO CUSTOMIZE THE PROGRAM):\n${trainerNotes}\nYou MUST incorporate these notes into the program design. If the client loves certain exercises, include them. If they hate certain exercises, avoid them or use alternatives.`
    : '';
  
  // Build day focus section (only include days that have a focus specified)
  const dayFocuses = [];
  if (day1Focus) dayFocuses.push(`Day 1: ${day1Focus}`);
  if (day2Focus) dayFocuses.push(`Day 2: ${day2Focus}`);
  if (day3Focus) dayFocuses.push(`Day 3: ${day3Focus}`);
  if (day4Focus) dayFocuses.push(`Day 4: ${day4Focus}`);
  if (day5Focus) dayFocuses.push(`Day 5: ${day5Focus}`);
  if (day6Focus) dayFocuses.push(`Day 6: ${day6Focus}`);
  if (day7Focus) dayFocuses.push(`Day 7: ${day7Focus}`);
  
  const dayFocusText = dayFocuses.length > 0
    ? `\n🎯 DAILY FOCUS (CRITICAL - EACH WORKOUT MUST FOLLOW THIS FOCUS):\n${dayFocuses.join('\n')}\nYou MUST design each workout day to align with the specified focus. The workout title and exercises should directly reflect this focus.`
    : '';
  
  return `You are an expert personal trainer creating a ${duration}-week training program for ${contactData.firstName}.

CLIENT INFO:
- Name: ${contactData.firstName} ${contactData.lastName}
${gender ? `- Gender: ${gender}` : ''}
- Experience Level: ${experienceLevel}
- Available Equipment: ${equipment}
- Training Days Per Week: ${daysPerWeek}
- Primary Goal: ${programGoal}
${inbodyText}
${clientContextText}
${trainerNotesText}
${dayFocusText}

${limitationsText}
${medicalText}

IMPORTANT: If there are movement limitations, you MUST intelligently modify exercises. For example:
- Shoulder limitations → Use landmine presses instead of overhead presses, focus on neutral grip movements
- Knee limitations → Use leg press variations, step-ups, or belt squats instead of back squats
- Lower back limitations → Use hex bar deadlifts, hip thrusts, or leg curls instead of conventional deadlifts

${medicalScreening.length > 0 ? 'MEDICAL CONSIDERATIONS: This client has medical screening alerts. Keep intensity moderate, avoid high-impact movements, emphasize proper breathing and form, and include longer rest periods.\n' : ''}

Create a comprehensive training program with:
1. A detailed program overview with separate sections for explanation, progression, terminology, principles, and notes
2. ${daysPerWeek} distinct workouts per week (e.g., Upper/Lower split, Push/Pull/Legs, etc.)
3. Each workout should have 5-8 exercises with specific sets, reps, and exercise variations
4. Include form cues and technique notes for each exercise
5. Provide 1-2 alternative exercise variations for each exercise
${currentWorkoutRoutine ? `6. Consider their current routine (${currentWorkoutRoutine}) when designing progression` : ''}

Return your response as a JSON object with this EXACT structure:

{
  "basicExplanation": "2-3 sentences explaining what this program is, the training split used, and how it will help them reach their goal",
  "progressionNotes": "How to progress week to week - when to increase weight, add reps, etc. Be specific about progression protocol",
  "terminology": "Define ONLY terms that are actually used in this program's exercises and notes. Every term defined here MUST appear somewhere in the workout exercises or notes. Do not define terms that aren't used.",
  "principles": "The core training principles this program is built on (e.g., progressive overload, compound movements first, etc.)",
  "importantNotes": "Safety reminders, warm-up guidance, rest day recommendations, and any other critical information",
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
            "notes": "Form cues, modifications for limitations if applicable",
            "variations": "1-2 alternative exercises that target the same muscles (e.g., 'DB Press, Machine Press')"
          }
        ]
      }
    ]
  }
}

CRITICAL INSTRUCTIONS:
1. Create ${daysPerWeek} distinct workouts that form a complete training split
2. MODIFY exercises based on limitations - use safer alternatives, reduced ROM, or easier progressions
3. ${medicalScreening.length > 0 ? 'Use CONSERVATIVE programming due to medical screening alerts - moderate intensity, avoid high-impact' : 'Include specific form cues and technique notes for each exercise'}
4. ${biggestObstacles ? `Address their biggest obstacle: ${biggestObstacles}` : 'Focus on sustainable, progressive programming'}
5. ALWAYS include 1-2 exercise variations for each exercise in the "variations" field
6. NEVER mention or recommend consulting a physical therapist, doctor, physician, medical professional, or healthcare provider. Simply provide exercise modifications and alternatives instead.
7. EXERCISE ORDER IS CRITICAL - Follow this structure for each workout:
   - Start with the most demanding compound lifts that use large muscle groups (squats, deadlifts, bench press, rows, overhead press)
   - Then move to secondary compound movements
   - Finish with isolation/accessory exercises for smaller muscles
   - NEVER jump between muscle groups - complete ALL exercises for a muscle group before moving to the next
   - Example: Do ALL back exercises first, THEN all bicep exercises. Never go back→bicep→back
   - Example: Do ALL chest exercises first, THEN all tricep exercises. Never go chest→tricep→chest
8. TERMINOLOGY MUST MATCH PROGRAM - Only define terms in the terminology section that are actually used in the exercises or notes. If you use "superset" in the program, define it. If you don't use "AMRAP", don't define it.
9. Return ONLY valid JSON. No markdown code blocks. No text before or after the JSON.`;
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
  
  // Helper function to bold terminology words (format: "Term: definition" or "Term - definition")
  function formatTerminology(text) {
    if (!text) return '';
    // Bold words before colons or dashes that start definitions
    return text
      .replace(/([A-Za-z\s]+):/g, '<strong>$1</strong>:')
      .replace(/([A-Za-z]+)\s*-\s+/g, '<strong>$1</strong> - ');
  }
  
  let html = '';
  
  // Page 1: Program Overview
  html += `
    <div class="page">
      <img src="data:image/png;base64,{{logoBase64}}" class="logo-image" alt="WCS Logo">
      
      <div class="page-header" style="margin-bottom: 10px;">
        <div class="header-left">
          <h1>WEST COAST STRENGTH</h1>
          <h2>PROGRAM OVERVIEW</h2>
        </div>
        <div class="header-right">
          <p>TRAINER: ${programContent.trainerName || ''}</p>
          <p>CLIENT: ${contactData.firstName} ${contactData.lastName}</p>
        </div>
      </div>
      
      <div class="core-concepts" style="margin-top: 5px;">
        <h3 style="margin-bottom: 3px;">BASIC EXPLANATION:</h3>
        <div class="core-concepts-content" style="margin-bottom: 10px;">
          <p style="margin: 0;">${programContent.basicExplanation || programContent.programOverview || ''}</p>
        </div>
        
        <h3 style="margin-bottom: 3px;">PROGRESSION:</h3>
        <div class="core-concepts-content" style="margin-bottom: 10px;">
          <p style="margin: 0;">${programContent.progressionNotes || ''}</p>
        </div>
        
        <h3 style="margin-bottom: 3px;">TERMINOLOGY:</h3>
        <div class="core-concepts-content" style="margin-bottom: 10px;">
          <p style="margin: 0;">${formatTerminology(programContent.terminology) || ''}</p>
        </div>
        
        <h3 style="margin-bottom: 3px;">PRINCIPLES:</h3>
        <div class="core-concepts-content" style="margin-bottom: 10px;">
          <p style="margin: 0;">${programContent.principles || ''}</p>
        </div>
        
        <h3 style="margin-bottom: 3px;">IMPORTANT NOTES:</h3>
        <div class="core-concepts-content" style="margin-bottom: 10px;">
          <p style="margin: 0;">${programContent.importantNotes || programContent.generalNotes || ''}</p>
        </div>
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
        
        <table style="width: 100%; border-collapse: collapse; border: 1px solid #000;">
          <thead>
            <tr>
              <th style="text-align: left; padding: 8px; border: 1px solid #000;">EXERCISE</th>
              <th style="text-align: center; padding: 8px; border: 1px solid #000; width: 100px;"></th>
              <th style="text-align: left; padding: 8px; border: 1px solid #000; width: 180px;">VARIATIONS</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    // Add exercises as table rows
    workout.exercises.forEach(exercise => {
      const setsReps = `${exercise.sets} x ${exercise.reps}`;
      const notes = exercise.notes || '';
      const variations = exercise.variations || exercise.variation || '';
      const videoUrl = exercise.videoUrl || '';
      
      // Generate QR code if video URL exists
      let qrCodeHTML = '';
      if (videoUrl) {
        qrCodeHTML = `<br><img src="https://api.qrserver.com/v1/create-qr-code/?size=60x60&data=${encodeURIComponent(videoUrl)}" alt="Video QR" style="margin-top: 5px;">`;
      }
      
      html += `
        <tr>
          <td style="padding: 8px; border: 1px solid #000;">
            <strong>${exercise.name}</strong>
            ${notes ? `<br><span style="font-size: 11px; color: #666;">${notes}</span>` : ''}
            ${qrCodeHTML}
          </td>
          <td style="text-align: center; padding: 8px; border: 1px solid #000; width: 100px;">${setsReps}</td>
          <td style="padding: 8px; border: 1px solid #000; width: 180px; font-size: 11px;">${variations}</td>
        </tr>
      `;
    });
    
    html += `
          </tbody>
        </table>
      </div>
    `;
  });
  
  return html;
}

// Upload PDF to GHL contact files and return shareable URL
async function uploadPDFtoGHL(contactId, club, pdfBuffer, contactData) {
  try {
    const form = new FormData();
    
    const filename = `Training_Program_${contactData.firstName}_${contactData.lastName}.pdf`;
    
    // Add the PDF file to form data
    form.append('file', pdfBuffer, {
      filename: filename,
      contentType: 'application/pdf'
    });
    
    // Upload to GHL files endpoint
    const response = await axios.post(
      `https://services.leadconnectorhq.com/files/`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'Authorization': `Bearer ${club.ghlApiKey}`,
          'Version': '2021-07-28'
        },
        params: {
          contactId: contactId,
          locationId: club.ghlLocationId
        }
      }
    );
    
    console.log('GHL Upload Response:', response.data);
    
    // Return the file URL from response
    if (response.data && response.data.fileUrl) {
      return response.data.fileUrl;
    } else if (response.data && response.data.url) {
      return response.data.url;
    } else if (response.data && response.data.id) {
      // If only ID is returned, construct the URL
      return `https://services.leadconnectorhq.com/files/${response.data.id}`;
    } else {
      console.error('Unexpected GHL upload response:', response.data);
      throw new Error('Could not get file URL from GHL upload response');
    }
    
  } catch (error) {
    console.error('Error uploading to GHL:', error.response?.data || error.message);
    throw error;
  }
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
