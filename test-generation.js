const Anthropic = require('@anthropic-ai/sdk');
const puppeteer = require('puppeteer');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Initialize Anthropic
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Test data
const testContactData = {
  id: 'test123',
  name: 'John Smith',
  firstName: 'John',
  lastName: 'Smith',
  email: 'john.smith@example.com',
  phone: '555-0123'
};

const testFormData = {
  programGoal: 'muscle building',
  duration: '8',
  daysPerWeek: '4',
  experienceLevel: 'intermediate',
  equipment: 'full gym'
};

async function testGeneration() {
  console.log('🚀 Starting test program generation...\n');
  
  try {
    // Step 1: Generate with AI
    console.log('📝 Generating program with Claude AI...');
    const programContent = await generateProgramWithAI(testContactData, testFormData);
    console.log('✅ Program generated!\n');
    console.log('Program structure:', JSON.stringify(programContent, null, 2).substring(0, 500) + '...\n');
    
    // Step 2: Create PDF
    console.log('📄 Creating PDF...');
    const pdfBuffer = await generatePDF(testContactData, programContent);
    console.log('✅ PDF created!\n');
    
    // Step 3: Save to file
    const outputPath = path.join(__dirname, 'test-output');
    await fs.mkdir(outputPath, { recursive: true });
    const filename = `test-program-${Date.now()}.pdf`;
    const filepath = path.join(outputPath, filename);
    await fs.writeFile(filepath, pdfBuffer);
    
    console.log(`✅ Test complete! PDF saved to: ${filepath}`);
    console.log('\n📊 Summary:');
    console.log(`   - Client: ${testContactData.firstName} ${testContactData.lastName}`);
    console.log(`   - Goal: ${testFormData.programGoal}`);
    console.log(`   - Duration: ${testFormData.duration} weeks`);
    console.log(`   - Days/week: ${testFormData.daysPerWeek}`);
    console.log(`   - PDF size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

// Copy functions from server.js
async function generateProgramWithAI(contactData, formData) {
  const prompt = buildPrompt(contactData, formData);
  
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });
  
  const responseText = message.content[0].text;
  
  try {
    // Try to extract JSON if it's wrapped in markdown code blocks
    const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }
    return JSON.parse(responseText);
  } catch (e) {
    console.warn('Could not parse as JSON, using text format');
    return { programText: responseText };
  }
}

function buildPrompt(contactData, formData) {
  const {
    programGoal = 'general fitness',
    duration = '8',
    daysPerWeek = '4',
    experienceLevel = 'intermediate',
    equipment = 'full gym'
  } = formData || {};
  
  return `You are an expert personal trainer creating a customized training program.

CLIENT INFORMATION:
- Name: ${contactData.firstName} ${contactData.lastName}
- Experience Level: ${experienceLevel}
- Available Equipment: ${equipment}

PROGRAM REQUIREMENTS:
- Goal: ${programGoal}
- Duration: ${duration} weeks
- Training Days per Week: ${daysPerWeek}

Please generate a comprehensive training program in JSON format with the following structure:

{
  "programOverview": "Brief 2-3 sentence overview of the program approach",
  "weeks": [
    {
      "weekNumber": 1,
      "focus": "What this week emphasizes",
      "workouts": [
        {
          "day": 1,
          "title": "Workout name (e.g., Upper Body Strength)",
          "exercises": [
            {
              "name": "Exercise name",
              "sets": "3",
              "reps": "8-10",
              "rest": "90 seconds",
              "notes": "Form cues or modifications"
            }
          ]
        }
      ]
    }
  ],
  "progressionNotes": "How to progress week to week",
  "generalNotes": "Important reminders, warm-up guidance, cool-down"
}

Create a progressive, evidence-based program appropriate for their experience level. Include proper warm-up exercises and ensure balanced programming.

IMPORTANT: Return ONLY the JSON object, with no additional text or markdown formatting.`;
}

async function generatePDF(contactData, programContent) {
  const templatePath = path.join(__dirname, 'templates', 'program-template.html');
  let htmlTemplate = await fs.readFile(templatePath, 'utf8');
  
  htmlTemplate = htmlTemplate
    .replace(/{{clientName}}/g, `${contactData.firstName} ${contactData.lastName}`)
    .replace(/{{currentDate}}/g, new Date().toLocaleDateString())
    .replace(/{{programContent}}/g, formatProgramHTML(programContent));
  
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    headless: 'new'
  });
  
  const page = await browser.newPage();
  await page.setContent(htmlTemplate, { waitUntil: 'networkidle0' });
  
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '20px',
      right: '20px',
      bottom: '20px',
      left: '20px'
    }
  });
  
  await browser.close();
  
  return pdfBuffer;
}

function formatProgramHTML(programContent) {
  if (!programContent.weeks) {
    return `<div class="program-text">${programContent.programText || 'Program content'}</div>`;
  }
  
  let html = `<div class="program-overview">${programContent.programOverview}</div>`;
  
  programContent.weeks.forEach(week => {
    html += `
      <div class="week-section">
        <h2>Week ${week.weekNumber}</h2>
        <p class="week-focus"><strong>Focus:</strong> ${week.focus}</p>
    `;
    
    week.workouts.forEach(workout => {
      html += `
        <div class="workout">
          <h3>Day ${workout.day}: ${workout.title}</h3>
          <table class="exercise-table">
            <thead>
              <tr>
                <th>Exercise</th>
                <th>Sets</th>
                <th>Reps</th>
                <th>Rest</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
      `;
      
      workout.exercises.forEach(exercise => {
        html += `
          <tr>
            <td>${exercise.name}</td>
            <td>${exercise.sets}</td>
            <td>${exercise.reps}</td>
            <td>${exercise.rest}</td>
            <td>${exercise.notes}</td>
          </tr>
        `;
      });
      
      html += `
            </tbody>
          </table>
        </div>
      `;
    });
    
    html += `</div>`;
  });
  
  if (programContent.progressionNotes) {
    html += `
      <div class="notes-section">
        <h3>Progression Notes</h3>
        <p>${programContent.progressionNotes}</p>
      </div>
    `;
  }
  
  if (programContent.generalNotes) {
    html += `
      <div class="notes-section">
        <h3>Important Notes</h3>
        <p>${programContent.generalNotes}</p>
      </div>
    `;
  }
  
  return html;
}

// Run test
testGeneration();
