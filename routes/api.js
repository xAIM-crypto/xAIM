process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();
const crypto = require('crypto');

// Import and initialize the OpenAI client.
const OpenAI = require('openai').default;
const openai = new OpenAI({
  apiKey: process.env.OPEN_AI_API_KEY,
});

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL environment variable not set");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false  // SSL disabled
});

// Helper function to generate random attribute points for a robot.
// Target total is 300; each attribute between 40 and 80.
function generateRobotAttributes(target = 300) {
  const count = 5;
  const min = 40;
  const max = 80;
  let vals;
  while (true) {
    vals = [];
    for (let i = 0; i < count - 1; i++) {
      const randVal = Math.floor(Math.random() * (max - min + 1)) + min;
      vals.push(randVal);
    }
    const last = target - vals.reduce((sum, val) => sum + val, 0);
    if (last >= min && last <= max) {
      vals.push(last);
      break;
    }
  }
  // Shuffle the numbers so the adjusted value isn't always in a fixed position.
  for (let i = vals.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [vals[i], vals[j]] = [vals[j], vals[i]];
  }
  return {
    attack_power: vals[0],
    defense: vals[1],
    speed_agility: vals[2],
    strategy: vals[3],
    endurance: vals[4]
  };
}

// Example API endpoint: GET /api/data
router.get('/data', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM mytable');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

/**
 * Helper function to poll a Meshy task until it finishes.
 * @param {string} taskId - Meshy task ID.
 * @param {object} headers - API headers.
 * @param {number} timeout - Maximum waiting time (ms).
 * @param {number} interval - Polling interval (ms).
 */
async function pollTask(taskId, headers, timeout, interval) {
  const startTime = Date.now();
  let taskData;
  while (Date.now() - startTime < timeout) {
    try {
      const response = await axios.get(`https://api.meshy.ai/openapi/v2/text-to-3d/${taskId}`, { headers });
      taskData = response.data;
      if (taskData.status === 'SUCCEEDED') {
        return taskData;
      } else if (taskData.status === 'FAILED') {
        throw new Error(taskData.task_error.message || 'Task failed');
      }
    } catch (error) {
      console.error(`Polling error for task ${taskId}:`, error.message);
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error('Task timed out');
}

// POST /api/generate: Start the 3D generation process.
router.post('/generate', async (req, res) => {
  try {
    // 1. Determine user IP
    const ipAddress = 
      req.headers['x-forwarded-for'] ||
      req.headers['x-real-ip'] ||
      req.socket.remoteAddress;

    // 2. Log the incoming request for debug
    console.log('[generate route] Received request from IP:', ipAddress);
    console.log('[generate route] Request body is:', req.body);

    // 3. Check how many models are saved for this IP
    const checkResult = await pool.query(
      'SELECT COUNT(*) FROM saved_models WHERE ip_address = $1',
      [ipAddress]
    );
    const modelsCount = parseInt(checkResult.rows[0].count, 10);

    // 4. Log the count
    console.log(`[generate route] Count for IP ${ipAddress}: ${modelsCount}`);

    // 5. If limit is 1, disallow further generation if they have at least 1
    if (modelsCount >= 1) {
      console.log('[generate route] IP has reached limit. Blocking generation.');
      return res.status(403).json({ error: 'You have already generated your model.' });
    }

    // Disable default timeout for long polling.
    req.setTimeout(0);
    const prompt = req.body.prompt;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Get Meshy API key from environment variables.
    const meshyAPIKey = process.env.MESHY_API_KEY;
    if (!meshyAPIKey) {
      throw new Error('Missing Meshy API Key');
    }

    const meshHeaders = {
      'Authorization': `Bearer ${meshyAPIKey}`,
      'Content-Type': 'application/json'
    };

    // STEP 1: Create Preview Task.
    const previewPayload = {
      mode: 'preview',
      prompt: prompt,
      art_style: 'realistic',
      should_remesh: true,
      ai_model: 'meshy-4',
      topology: 'triangle',
      target_polycount: 100000
    };

    const previewResponse = await axios.post('https://api.meshy.ai/openapi/v2/text-to-3d', previewPayload, { headers: meshHeaders });
    const previewTaskId = previewResponse.data.result;
    console.log('Preview Task ID:', previewTaskId);

    // Poll until preview task completes.
    const previewTaskData = await pollTask(previewTaskId, meshHeaders, 600000, 5000);
    console.log('Preview Task Completed:', previewTaskData);

    // STEP 2: Create Refine Task.
    const refinePayload = {
      mode: 'refine',
      preview_task_id: previewTaskId,
      enable_pbr: true,
      texture_prompt: prompt
    };

    const refineResponse = await axios.post('https://api.meshy.ai/openapi/v2/text-to-3d', refinePayload, { headers: meshHeaders });
    const refineTaskId = refineResponse.data.result;
    console.log('Refine Task ID:', refineTaskId);

    // Poll until refine task completes.
    const refineTaskData = await pollTask(refineTaskId, meshHeaders, 600000, 5000);
    console.log('Refine Task Completed:', refineTaskData);

    // Extract the 3D model URL (GLB format).
    const glbUrl = refineTaskData.model_urls && refineTaskData.model_urls.glb;
    res.json({
      thumbnail_url: refineTaskData.thumbnail_url,
      model_urls: refineTaskData.model_urls,
      video_url: refineTaskData.video_url,
      texture_urls: refineTaskData.texture_urls,
      model_3d_url: glbUrl
    });
  } catch (err) {
    console.error('Error in /generate route:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/proxy: A proxy endpoint for asset requests.
router.get('/proxy', async (req, res) => {
  const url = req.query.url;
  try {
    const response = await axios.get(url, { responseType: 'stream' });
    res.set('Access-Control-Allow-Origin', '*');
    response.data.pipe(res);
  } catch (error) {
    res.status(500).send('Error fetching remote asset');
  }
});

// --- NEW ENDPOINTS FOR HANDLING MODELS ---

// POST /api/models: Save a newly generated model to the database.
router.post('/models', async (req, res) => {
  const { 
    name, 
    prompt, 
    thumbnail_url, 
    model_3d_url, 
    video_url, 
    texture_urls, 
    ip_address 
  } = req.body;

  // Validate fields
  if (!prompt || !model_3d_url || !name) {
    return res.status(400).json({
      error: 'Required fields missing: prompt, model_3d_url, and name are required'
    });
  }
  if (!ip_address) {
    return res.status(400).json({
      error: 'No IP address provided.' 
    });
  }

  // Enforce your IP-based limit if needed
  // e.g. only 1 or 3 or however many models per IP

  // Generate random robot attributes
  const attributes = generateRobotAttributes();

  // Generate a private secret key (16 random bytes => hex string)
  const secretKey = crypto.randomBytes(16).toString('hex');

  try {
    const result = await pool.query(`
      INSERT INTO saved_models 
        (name, prompt, thumbnail_url, model_3d_url, video_url, texture_urls,
         attack_power, defense, speed_agility, strategy, endurance, ip_address, secret_key)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      name,
      prompt,
      thumbnail_url,
      model_3d_url,
      video_url,
      texture_urls,
      attributes.attack_power,
      attributes.defense,
      attributes.speed_agility,
      attributes.strategy,
      attributes.endurance,
      ip_address,   // from the request body
      secretKey     // new secret key
    ]);

    // Return the newly inserted row plus the secret key
    // Optionally, you can store on the row, but only return it once here
    res.json({
      model: result.rows[0],
      secret_key: secretKey
    });
  } catch (err) {
    console.error('Error saving model:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/models: Retrieve all saved models.
router.get('/models', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM saved_models ORDER BY created_at DESC');
    res.json({ models: result.rows });
  } catch (err) {
    console.error('Error retrieving models:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// GET /api/modelsTournament: Retrieve all saved models for the tournament.
router.get('/modelsTournament', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM saved_models ORDER BY created_at ASC');
    res.json({ models: result.rows });
  } catch (err) {
    console.error('Error retrieving models:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/enhance', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    // Build the conversation messages.
    const messages = [
      {
        role: "user",
        content:
          `You are a creative assistant that enhances prompts for 3D robot model generation. 
          Your task is to take an input prompt and rewrite it for improved clarity, creativity, and detail. 
          The prompt should be optimized for Meshy.ai such that the generated 3D model from it is of high quality and detail. YOU ARE SUPPOSED TO RESPOND ME BACK ONLY WITH THE PROMPT.
          DO NOT MENTION MESHY.AI ANYWHERE IN THE PROMPT AND THE PROMPT SHOULD HAVE A MAXIMUM OF 60 WORDS. THE PROMPT SHOULD MAKE SURE THAT THE ROBOT CONTAINS DIFFERENT VIBRANT COLORS. THE PROMPT SHOULD BE ABOUT GENERATING A 3D ROBOT NOT ANYTHING ELSE.
          Please enhance the following prompt for a 3D design: "${prompt}."`
      },
    ];

    // Create a chat completion using the OpenAI library.
    const completion = await openai.chat.completions.create({
      messages: messages,
      model: "o1-mini",
      temperature: 1,
    });

    // Extract the enhanced prompt from the completion.
    const enhancedPrompt = completion.choices[0].message.content.trim();
    res.json({ enhanced_prompt: enhancedPrompt });
  } catch (error) {
    console.error("Error enhancing prompt:", error);
    res.status(500).json({ error: "Error enhancing prompt: " + error.message });
  }
});

// Tournament-specific endpoints

// GET /api/tournament/models: Get all models for the tournament
router.get('/tournament/models', async (req, res) => {
  try {
    console.log('Fetching tournament models from database...');
    const result = await pool.query(`
      SELECT 
        id,
        name,
        thumbnail_url as mascot,
        attack_power,
        defense,
        speed_agility,
        strategy,
        endurance
      FROM saved_models 
      ORDER BY RANDOM()
      LIMIT 1024
    `);
    
    console.log(`Found ${result.rows.length} models in database`);
    
    // If we don't have enough models, pad with default ones
    const models = result.rows;
    if (models.length < 1024) {
      console.log(`Padding with ${1024 - models.length} default models`);
      const defaultModel = {
        id: null,
        name: 'TBD',
        mascot: '/images/default-mascot.svg',
        attack_power: 60,
        defense: 60,
        speed_agility: 60,
        strategy: 60,
        endurance: 60
      };
      
      while (models.length < 1024) {
        models.push({...defaultModel, id: `default-${models.length}`});
      }
    }
    
    // Send the models array directly
    res.json(models);
  } catch (err) {
    console.error('Error retrieving tournament models:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/tournament/match: Determine the winner of a match
router.post('/tournament/match', async (req, res) => {
  try {
    const { model1, model2 } = req.body;
    
    if (!model1 || !model2) {
      return res.status(400).json({ error: 'Both models are required' });
    }
    
    // Calculate total stats for each model
    const calculateScore = (model) => {
      return model.attack_power + 
             model.defense + 
             model.speed_agility + 
             model.strategy + 
             model.endurance;
    };
    
    const score1 = calculateScore(model1);
    const score2 = calculateScore(model2);
    
    // Add some randomness to make it interesting
    const random1 = Math.random() * 50;
    const random2 = Math.random() * 50;
    
    const finalScore1 = score1 + random1;
    const finalScore2 = score2 + random2;
    
    const winner = finalScore1 > finalScore2 ? model1 : model2;
    
    res.json({
      winner,
      scores: {
        [model1.id]: finalScore1,
        [model2.id]: finalScore2
      }
    });
  } catch (err) {
    console.error('Error determining match winner:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/saveModel', async (req, res) => {
  try {
    // 1. Extract IP from request body
    const { ip_address, name, prompt, model_3d_url } = req.body;
    
    // Log for debugging
    console.log('[saveModel route] ip_address from body:', ip_address);
    console.log('[saveModel route] Request body is:', req.body);

    // 2. If IP isn't provided or is invalid, you can either block or set a fallback:
    if (!ip_address) {
      return res.status(400).json({ error: 'No IP address provided.' });
    }

    // 3. Check the DB count for that IP
    const checkResult = await pool.query(
      `SELECT COUNT(*) FROM saved_models WHERE ip_address = $1`,
      [ip_address]
    );
    const modelsCount = parseInt(checkResult.rows[0].count, 10);
    console.log(`[saveModel route] Count for IP ${ip_address}: ${modelsCount}`);

    if (modelsCount >= 1) {
      console.log('[saveModel route] IP has reached limit. Blocking save.');
      return res.status(403).json({ error: 'You already saved your model.' });
    }

    // 4. Insert record
    const attributes = generateRobotAttributes();
    const saveResult = await pool.query(
      `INSERT INTO saved_models 
       (name, prompt, thumbnail_url, model_3d_url, video_url, texture_urls,
        attack_power, defense, speed_agility, strategy, endurance, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        name,
        prompt,
        'some thumbnail',
        model_3d_url,
        null,
        null,
        attributes.attack_power,
        attributes.defense,
        attributes.speed_agility,
        attributes.strategy,
        attributes.endurance,
        ip_address  // Instead of reading from req.socket
      ]
    );

    const newModel = saveResult.rows[0];
    console.log('[saveModel route] Model saved successfully:', newModel);

    return res.status(201).json({ model: newModel });
  } catch (err) {
    console.error('Error in /saveModel route:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/can-generate', async (req, res) => {
  try {
    const ipAddress = 
      req.headers['x-forwarded-for'] ||
      req.headers['x-real-ip'] ||
      req.socket.remoteAddress;
    const checkResult = await pool.query(
      'SELECT COUNT(*) FROM saved_models WHERE ip_address = $1',
      [ipAddress]
    );
    const modelsCount = parseInt(checkResult.rows[0].count, 10);

    const canGenerate = (modelsCount < 1); // Only <1 means none saved yet
    console.log('[can-generate route]', { ipAddress, modelsCount, canGenerate });
    res.json({ canGenerate });
  } catch (err) {
    console.error('Error in can-generate route:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Example: GET /api/log-ip
router.get('/log-ip', (req, res) => {
  // Attempt to retrieve the real IP if behind a reverse proxy/load balancer
  const ipAddress = 
      req.headers['x-forwarded-for'] || 
      req.headers['x-real-ip'] || 
      req.socket.remoteAddress;

  // Print it in your server console
  console.log(`User IP (from /api/log-ip):`, ipAddress);

  // Respond with a JSON object (or whatever else you need)
  return res.json({ message: 'IP logged to console', ip: ipAddress });
});

module.exports = router;
