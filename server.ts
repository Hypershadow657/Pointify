import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'database.json');

// --- Simple Shared Types ---
interface Db {
  families: any[];
  users: any[];
  chores: any[];
  completions: any[];
  rewards: any[];
  redemptions: any[];
  sharedGoals: any[];
  notifications: any[];
}

// --- DB Seeding/Loading ---
function loadDb(): Db {
  if (!fs.existsSync(DB_PATH)) {
    const initial: Db = {
      families: [],
      users: [],
      chores: [],
      completions: [],
      rewards: [],
      redemptions: [],
      sharedGoals: [],
      notifications: []
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  if (!db.sharedGoals) db.sharedGoals = [];
  return db;
}

function saveDb(data: Db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// --- Server Setup ---
async function startServer() {
  const app = express();
  app.use(express.json());

  // --- API Routes ---

  // Health check
  app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

  // Auth / Registration
  app.post('/api/auth/register', (req, res) => {
    const { name, role, familyId, avatarUrl } = req.body;
    const db = loadDb();
    
    // Check if user already exists (simplified to just creating a new one with a distinct ID)
    const newUser = {
      uid: Math.random().toString(36).substring(2, 11),
      name,
      role,
      familyId,
      avatarUrl,
      points: 0
    };
    
    db.users.push(newUser);
    saveDb(db);
    res.json(newUser);
  });

  // Families
  app.post('/api/families', (req, res) => {
    const { name, createdBy } = req.body;
    const db = loadDb();
    const family = {
      id: Math.random().toString(36).substring(2, 11),
      name,
      createdBy,
      createdAt: new Date().toISOString()
    };
    db.families.push(family);
    saveDb(db);
    res.json(family);
  });

  app.get('/api/families/:id', (req, res) => {
    const db = loadDb();
    const family = db.families.find(f => f.id === req.params.id);
    if (!family) return res.status(404).json({ error: 'Not found' });
    res.json(family);
  });

  // Users
  app.get('/api/users/:uid', (req, res) => {
    const db = loadDb();
    const user = db.users.find(u => u.uid === req.params.uid);
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  });

  app.patch('/api/users/:uid/points', (req, res) => {
    const { points } = req.body;
    const db = loadDb();
    const user = db.users.find(u => u.uid === req.params.uid);
    if (!user) return res.status(404).json({ error: 'Not found' });
    user.points = points;
    saveDb(db);
    res.json(user);
  });

  app.patch('/api/users/:uid/avatar', (req, res) => {
    const { avatarUrl } = req.body;
    const db = loadDb();
    const user = db.users.find(u => u.uid === req.params.uid);
    if (!user) return res.status(404).json({ error: 'Not found' });
    user.avatarUrl = avatarUrl;
    saveDb(db);
    res.json(user);
  });

  app.get('/api/users/:uid/activity', (req, res) => {
    const db = loadDb();
    const comps = db.completions.filter(c => c.kidId === req.params.uid && c.status === 'approved');
    const reds = db.redemptions.filter(r => r.kidId === req.params.uid && r.status === 'approved');
    
    const activity = [
      ...comps.map(c => ({ ...c, type: 'chore' })),
      ...reds.map(r => ({ ...r, type: 'reward' }))
    ].sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    res.json(activity);
  });

  app.get('/api/families/:id/members', (req, res) => {
    const db = loadDb();
    const members = db.users.filter(u => u.familyId === req.params.id);
    res.json(members);
  });

  // Chores
  app.get('/api/families/:familyId/chores', (req, res) => {
    const db = loadDb();
    const now = new Date().toISOString();
    res.json(db.chores.filter(c => 
      c.familyId === req.params.familyId && 
      (!c.expiresAt || c.expiresAt > now)
    ));
  });

  app.post('/api/chores', (req, res) => {
    const db = loadDb();
    const chore = {
      id: Math.random().toString(36).substring(2, 11),
      ...req.body,
      createdAt: new Date().toISOString()
    };
    db.chores.push(chore);
    saveDb(db);
    res.json(chore);
  });

  app.delete('/api/chores/:id', (req, res) => {
    const db = loadDb();
    db.chores = db.chores.filter(c => c.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  });

  // Completions
  app.get('/api/families/:familyId/completions', (req, res) => {
    const db = loadDb();
    res.json(db.completions.filter(c => c.familyId === req.params.familyId));
  });

  app.post('/api/completions', (req, res) => {
    const db = loadDb();
    const completion = {
      id: Math.random().toString(36).substring(2, 11),
      ...req.body,
      timestamp: new Date().toISOString()
    };
    db.completions.push(completion);
    saveDb(db);
    res.json(completion);
  });

  app.patch('/api/completions/:id', (req, res) => {
    const { status } = req.body;
    const db = loadDb();
    const idx = db.completions.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    
    const comp = db.completions[idx];
    comp.status = status;

    if (status === 'approved') {
      const user = db.users.find(u => u.uid === comp.kidId);
      if (user) user.points += comp.pointsAwarded;

      // Handle one-time chores
      const choreIdx = db.chores.findIndex(c => c.id === comp.choreId);
      if (choreIdx !== -1) {
        const chore = db.chores[choreIdx];
        if (!chore.isRecurring) {
          db.chores.splice(choreIdx, 1);
        }
      }
    }

    saveDb(db);
    res.json(comp);
  });

  // Rewards
  app.get('/api/families/:familyId/rewards', (req, res) => {
    const db = loadDb();
    const now = new Date().toISOString();
    res.json(db.rewards.filter(r => 
      r.familyId === req.params.familyId && 
      (!r.expiresAt || r.expiresAt > now)
    ));
  });

  app.post('/api/rewards', (req, res) => {
    const db = loadDb();
    const reward = {
      id: Math.random().toString(36).substring(2, 11),
      ...req.body,
      createdAt: new Date().toISOString()
    };
    db.rewards.push(reward);
    saveDb(db);
    res.json(reward);
  });

  app.delete('/api/rewards/:id', (req, res) => {
    const db = loadDb();
    db.rewards = db.rewards.filter(r => r.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  });

  // Redemptions
  app.get('/api/families/:familyId/redemptions', (req, res) => {
    const db = loadDb();
    res.json(db.redemptions.filter(r => r.familyId === req.params.familyId));
  });

  app.post('/api/redemptions', (req, res) => {
    const db = loadDb();
    const redemption = {
      id: Math.random().toString(36).substring(2, 11),
      ...req.body,
      timestamp: new Date().toISOString()
    };
    db.redemptions.push(redemption);
    saveDb(db);
    res.json(redemption);
  });

  app.patch('/api/redemptions/:id', (req, res) => {
    const { status } = req.body;
    const db = loadDb();
    const idx = db.redemptions.findIndex(r => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Not found' });
    
    const red = db.redemptions[idx];
    red.status = status;

    if (status === 'approved') {
      const user = db.users.find(u => u.uid === red.kidId);
      if (user) user.points -= red.cost;

      // Handle one-time rewards
      const rewardIdx = db.rewards.findIndex(r => r.id === red.rewardId);
      if (rewardIdx !== -1) {
        const reward = db.rewards[rewardIdx];
        if (!reward.isRecurring) {
          db.rewards.splice(rewardIdx, 1);
        }
      }
    }

    saveDb(db);
    res.json(red);
  });

  // Shared Goals
  app.get('/api/families/:familyId/shared-goals', (req, res) => {
    const db = loadDb();
    res.json(db.sharedGoals.filter(g => g.familyId === req.params.familyId));
  });

  app.post('/api/shared-goals', (req, res) => {
    const db = loadDb();
    const goal = {
      id: Math.random().toString(36).substring(2, 11),
      ...req.body,
      currentPoints: 0,
      contributors: {},
      status: 'active',
      createdAt: new Date().toISOString()
    };
    db.sharedGoals.push(goal);
    saveDb(db);
    res.json(goal);
  });

  app.post('/api/shared-goals/:id/contribute', (req, res) => {
    const { kidId, amount } = req.body;
    const db = loadDb();
    const gIdx = db.sharedGoals.findIndex(g => g.id === req.params.id);
    const uIdx = db.users.findIndex(u => u.uid === kidId);

    if (gIdx === -1 || uIdx === -1) return res.status(404).json({ error: 'Not found' });
    
    const goal = db.sharedGoals[gIdx];
    const user = db.users[uIdx];

    if (user.points < amount) return res.status(400).json({ error: 'Insufficient points' });

    user.points -= amount;
    goal.currentPoints += amount;
    goal.contributors[kidId] = (goal.contributors[kidId] || 0) + amount;

    if (goal.currentPoints >= goal.cost) {
      goal.status = 'completed';
    }

    saveDb(db);
    res.json({ goal, user });
  });

  app.delete('/api/shared-goals/:id', (req, res) => {
    const db = loadDb();
    db.sharedGoals = db.sharedGoals.filter(g => g.id !== req.params.id);
    saveDb(db);
    res.json({ success: true });
  });

  // Notifications
  app.get('/api/families/:familyId/notifications', (req, res) => {
    const db = loadDb();
    res.json(db.notifications.filter(n => n.familyId === req.params.familyId).sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()));
  });

  app.post('/api/notifications', (req, res) => {
    const db = loadDb();
    const notification = {
      id: Math.random().toString(36).substring(2, 11),
      ...req.body,
      read: false,
      timestamp: new Date().toISOString()
    };
    db.notifications.push(notification);
    saveDb(db);
    res.json(notification);
  });

  // --- Vite Integration ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
