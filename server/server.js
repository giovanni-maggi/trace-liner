import express from 'express';
import createTables from './tables.js';
import {join, dirname} from 'path';
import {fileURLToPath} from 'url';
import jwt from 'jsonwebtoken';
// import bcrypt from 'bcrypt';
import helmet from 'helmet';
import db from './db.js';
import 'dotenv/config';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(express.json());

(async () => {
  console.log('Creating tables if they do not exist...')
  await createTables();
})();

const authenticateToken = (req, res, next) => {
  const token = req.headers['authorization'] && req.headers['authorization'].split(' ')[1];
  if (!token) return res.status(403).json({ error: 'Access denied' });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};
app.post('/api/editable/:table', authenticateToken, async (req, res) => {
  try {
    const table = req.params.table
    const id = await db.addRecord(req.body, table)
    const result = {
      table: table,
      id: id
    }
    res.status(201).json(result)
  } catch (e) {
    console.error('Exception inserting non editable record:', e)
    res.status(500).json({error: e})
  }
})
app.post('/api/ua/users_auth', authenticateToken, async (req, res) => {
  try {
    const id = await db.addUsersAuth(req.body, process.env.TOKEN_ENCRYPTION_KEY)
    const result = {
      id: id
    }
    res.status(201).json(result)
  } catch (e) {
    console.error('Exception inserting non editable record:', e)
    res.status(500).json({error: e})
  }
})
app.patch('/api/editable/:table/:recordId', authenticateToken, async (req, res) => {
  try {
    const table = req.params.table
    // console.log('modifying record:', table)
    const recordId = req.params.recordId
    const updatedUserId = await db.modifyRecord(req.body, table, recordId)
    const result = {
      table: table,
      id: updatedUserId
    }
    res.status(201).json(result)
  } catch (e) {
    console.error('Exception modifying record:', e)
    res.status(500).json({error: e})
  }
})
app.post('/api/noneditable/:table', authenticateToken, async (req, res) => {
  try {
    const table = req.params.table
    const id = await db.addRecord(req.body, table)
    const result = {
      table: table,
      id: id
    }
    res.status(201).json(result)
  } catch (e) {
    console.error('Exception inserting non editable record:', e)
    res.status(500).json({error: e})
  }
})
app.patch('/api/noneditable/:table/:recordId', authenticateToken, async (req, res) => {
  try {
    const table = req.params.table
    const recordId = req.params.recordId
    const updatedUserId = await db.modifyRecord(req.body, table, recordId)
    const result = {
      table: table,
      id: updatedUserId
    }
    res.status(201).json(result)
  } catch (e) {
    console.error('Exception updating non editable record:', e)
    res.status(500).json({error: e})
  }
})
app.post('/api/query', authenticateToken, async (req, res) => {
  try {
    let result
    const query = req.body.query
    if(query) {
      result = await db.getQueryResult(query)
    }
    if(result && result.command === 'SELECT' && result.rows) {
      res.status(201).json({number: result.rows && result.rows.length ? result.rows.length : 0,records: result.rows})
    } else if(result && result.command) {
      res.status(200).json({message: result.command + ' executed successfully'})
    }
  } catch (e) {
    console.error('Exception querying:', e.message)
    res.status(400).json({error: e.message})
  }
})
app.get('/api/strava-webhooks', async (req, res) => {
  try {
    console.log('Received Strava webhook verification request', req.query);
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];
    if(token === process.env.REACT_APP_WEBHOOK_TOKEN && mode === 'subscribe') {
      console.log('Access succeeded for Strava webhook verification');
      res.status(200).json({ 'hub-challenge': challenge });
    } else {
      console.log('Access denied for Strava webhook verification');
      res.status(403).json({ error: 'Access denied' });
    }
  } catch (e) {
    console.error('Exception querying:', e)
    res.status(500).json({error: e})
  }
})
app.post('/api/strava-webhooks', async (req, res) => {
  const event = req.body;
  console.log('Received Strava webhook event:', event);
  res.sendStatus(200);

  // Defensive checks
  if (event.object_type !== 'activity') return;
  if (!['create', 'update', 'delete'].includes(event.aspect_type)) return;

  /*
    event structure:
    {
      aspect_type,
      event_time,
      object_id,     // activity_id
      object_type,
      owner_id,      // athlete_id
      subscription_id
    }
  */

  // 1. Persist raw event (optional but useful)
  // 2. Look up athlete access token via owner_id
  // 3. Fetch full activity if create/update
  // 4. Store activity idempotently
});
// app.post('/api/register', async (req, res) => {
//   const { username, password } = req.body;

//   try {
//     const saltRounds = 10;
//     const hashedPassword = await bcrypt.hash(password, saltRounds);
//     let data = {
//       username: username,
//       password_hash: hashedPassword,
//       active: true,
//       created_at: db.getTimestampGMT()
//     }
//     await db.register(data, 'traceliner_users');

//     res.status(201).json({message: 'user created'});
//   } catch (e) {
//     console.error('Exception querying:', e)
//     res.status(500).json({error: e})
//   }
// })
app.get('/api/:table', authenticateToken, async (req, res) => {
  try {
    const table = req.params.table
    const fields = req?.body?.fields
    const whereClause = req?.body?.whereClause
    let records
    if(fields && Array.isArray(fields) && fields.length) {
      records = await db.getRecordsFields(table,fields,whereClause)
    } else {
      records = await db.getRecords(table,whereClause)
    }
    const result = {
      table: table,
      recordsNumber: records.length ? records.length : 0,
      records: records
    }
    res.status(201).json(result)
  } catch (e) {
    console.error('Exception querying:', e)
    res.status(500).json({error: e})
  }
})
app.get('/api/:table/:field/:value', authenticateToken, async (req, res) => {
  try {
    const table = req.params.table
    const fields = req?.body?.fields
    const field = req.params.field
    const value = req.params.value
    let record
    if(fields && Array.isArray(fields) && fields.length) {
      record = await db.getRecordFields(table,fields,field,value)
    } else {
      record = await db.getRecord(table,field,value)
    }
    const result = {
      table: table,
      recordsNumber: record ? 1 : 0,
      record: record
    }
    res.status(201).json(result)
  } catch (e) {
    console.error('Exception querying:', e)
    res.status(500).json({error: e})
  }
})

app.post('/api/salesforce-login-and-upsert', authenticateToken, async (req, res) => {
  const { username, password, securityToken, clientId, clientSecret, externalId, object, field, body } = req.body;

  // Step 1: Get the access token by logging in to Salesforce
  const loginUrl = `https://login.salesforce.com/services/oauth2/token?grant_type=password&client_id=${clientId}&client_secret=${clientSecret}&username=${username}&password=${password}${securityToken}`;

  try {
    // Perform the login request to Salesforce
    const loginResponse = await fetch(loginUrl, { method: 'POST' });
    const loginData = await loginResponse.json();

    if (!loginResponse.ok) {
      throw new Error(`Salesforce login failed: ${loginData.error_description}`);
    }

    const accessToken = loginData.access_token;
    const instanceUrlFromLogin = loginData.instance_url;
    
    // Step 2: Perform the upsert using the access token obtained
    const upsertUrl = `${instanceUrlFromLogin}/services/data/v50.0/sobjects/${object}/${field}/${externalId}`;

    // console.log('upsertUrl', upsertUrl)
    // console.log('body', body)

    const upsertResponse = await fetch(upsertUrl, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: body,
    });

    const upsertData = await upsertResponse.json();
    // console.log('upsertData:', upsertData)
    if (!upsertResponse.ok) {
      throw new Error(`Salesforce upsert failed: ${upsertData.message}`);
    }

    //console.log('Upsert Response:', upsertData);

    // Send the upsert response back to the client
    res.json(upsertData);

  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: 'Error in Salesforce login and upsert process', details: error.message });
  }
});

// Use Helmet to set various security headers
app.use(helmet());

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        connectSrc: ["'self'", "https://www.strava.com","https://login.salesforce.com"],
        imgSrc: ["'self'","*","data:"],
      }
    }
  })
);

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', "web-share=*");
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

// Serve static files from the React app
app.use(express.static(join(__dirname, '../dist')));

app.get('/visitId-:id', (req, res) => {
  res.sendFile(join(__dirname, '../dist', 'index.html'));
});
app.get('/statistics', (req, res) => {
  res.sendFile(join(__dirname, '../dist', 'index.html'));
});
app.get('/pro', (req, res) => {
  res.sendFile(join(__dirname, '../dist', 'index.html'));
});
// app.get('/signup', (req, res) => {
//   res.sendFile(join(__dirname, '../dist', 'index.html'));
// });

app.use((req, res) => {
  res.status(404).sendFile(join(__dirname, '../dist', '404.html'));
});

const PORT = process.env.PORT || 5173;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});