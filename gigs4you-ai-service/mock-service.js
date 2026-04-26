const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 8001;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Get agent status
app.get('/agents/status', (req, res) => {
  res.json({
    agents: ['task_matching', 'chat', 'recommendation'],
    total_agents: 3,
    timestamp: new Date().toISOString()
  });
});

// Execute agent
app.post('/agents/execute', (req, res) => {
  const { agent_type, task, context } = req.body;

  let result = {};
  switch (agent_type) {
    case 'task_matching':
      result = { message: 'Task matching completed', task };
      break;
    case 'chat':
      result = { response: 'Chat assistance provided', task };
      break;
    case 'recommendation':
      result = { recommendations: [], task };
      break;
    default:
      result = { message: 'Unknown agent type', task };
  }

  res.json({
    agent_id: `${agent_type}_${Date.now()}`,
    status: 'completed',
    result,
    execution_time: Math.random() * 2,
    timestamp: new Date().toISOString()
  });
});

// Job-worker matching
app.post('/matching/job-worker', (req, res) => {
  const { job_id, worker_pool, constraints } = req.body;

  // Mock matching results
  const matches = worker_pool.slice(0, 5).map((worker, index) => ({
    worker_id: worker.id,
    score: Math.floor(70 + Math.random() * 30), // 70-100 score
    reasoning: `Skill match: ${Math.floor(60 + Math.random() * 40)}%`
  }));

  res.json({
    job_id,
    matches,
    total_candidates: worker_pool.length
  });
});

// Chat assistance
app.post('/chat/assist', (req, res) => {
  const { conversation_id, message, user_context, platform } = req.body;
  const { role, user_id } = user_context || {};
  const msg = message.toLowerCase().trim();

  let response = '';

  // Context-aware responses based on role and platform
  if (role === 'admin' || role === 'super_admin') {
    if (msg.includes('report') || msg.includes('analytics')) {
      response = "📊 I can help you analyze reports! Try: 'Show me today's task completion rates' or 'Generate a performance summary for this week'. You can also access detailed reports in the Reports section.";
    } else if (msg.includes('agent') || msg.includes('worker')) {
      response = "👥 For agent management: 'Show me checked-in agents' or 'Find agents near [location]'. Use the Agents page to assign tasks, track locations, and manage your team.";
    } else if (msg.includes('task') || msg.includes('job')) {
      response = "✅ Task management: 'Create a new task' or 'Show overdue tasks'. The Tasks page lets you assign work, track progress, and manage deadlines.";
    } else if (msg.includes('payment') || msg.includes('billing')) {
      response = "💰 Payment insights: 'Show payment trends' or 'Check pending payouts'. Visit Payments to process transactions and view financial reports.";
    } else if (msg.includes('dashboard') || msg.includes('overview')) {
      response = "📈 Your dashboard shows key metrics. Quick actions: refresh data, view urgent tasks, or check agent status. What specific data are you looking for?";
    } else {
      response = "🏢 As an admin, I can help with: reports & analytics, agent management, task coordination, payment processing, and system monitoring. What would you like to know?";
    }
  } else if (role === 'manager' || role === 'supervisor') {
    if (msg.includes('schedule') || msg.includes('calendar') || msg.includes('reminder')) {
      response = "🗓️ Task scheduler: 'Schedule task for tomorrow 9am', 'Remind me to check pending approvals at 4pm'. I can create, reschedule, and list upcoming tasks for your team.";
    } else if (msg.includes('task') || msg.includes('assign')) {
      response = "📋 Task assignment: 'Assign task to [agent name]' or 'Create urgent task'. Use the Tasks page to distribute work and track completion.";
    } else if (msg.includes('agent') || msg.includes('team')) {
      response = "👥 Team management: 'Show my team's performance' or 'Check agent locations'. The Agents page helps you monitor your workforce.";
    } else if (msg.includes('report') || msg.includes('progress')) {
      response = "📊 Progress tracking: 'Show team completion rates' or 'Generate productivity report'. Check Reports for detailed analytics.";
    } else if (msg.includes('job') || msg.includes('work')) {
      response = "💼 Job management: 'Create new job posting' or 'Review job applications'. The Jobs page handles all work opportunities.";
    } else {
      response = "🎯 As a manager, I can assist with: task assignment, team monitoring, progress reports, job management, and performance tracking. How can I help?";
    }
  } else if (role === 'employer') {
    if (msg.includes('job') || msg.includes('post')) {
      response = "📝 Job posting: 'Create a new job' or 'Edit existing job'. Use the Jobs page to post opportunities and manage applications.";
    } else if (msg.includes('worker') || msg.includes('candidate')) {
      response = "👷 Worker selection: 'Find skilled workers' or 'Review applications'. The Workers page shows available talent and their ratings.";
    } else if (msg.includes('payment') || msg.includes('budget')) {
      response = "💵 Budget management: 'Set job budget' or 'Check payment status'. Payments page tracks all transactions and payouts.";
    } else if (msg.includes('progress') || msg.includes('status')) {
      response = "📊 Project tracking: 'Check job progress' or 'View worker performance'. Use Tasks to monitor ongoing work.";
    } else {
      response = "🏭 As an employer, I can help with: job posting, worker hiring, budget management, project tracking, and payment processing. What do you need?";
    }
  } else if (role === 'agent' || platform === 'mobile') {
    if (msg.includes('task') || msg.includes('job')) {
      response = "📱 Task management: 'Show my tasks' or 'Mark task complete'. Check your dashboard for today's assignments and use the app to update status.";
    } else if (msg.includes('location') || msg.includes('check')) {
      response = "📍 Check-in: 'Check in at location' or 'Update my location'. Use the check-in button on your dashboard to mark your presence.";
    } else if (msg.includes('payment') || msg.includes('money')) {
      response = "💰 Earnings: 'Check my balance' or 'View payment history'. Your wallet shows available funds and recent transactions.";
    } else if (msg.includes('help') || msg.includes('support')) {
      response = "🆘 Support: Contact your supervisor through the Messages section, or check the Tasks page for detailed instructions.";
    } else {
      response = "🚀 As a field agent, I can help with: task management, location check-ins, payment tracking, and getting support. What do you need assistance with?";
    }
  } else {
    // Generic fallback
    if (msg.includes('job')) {
      response = "💼 Looking for work? Check the Jobs section for available opportunities, or visit Workers if you're an employer seeking talent.";
    } else if (msg.includes('task')) {
      response = "✅ Task management: Use the Tasks page to view assignments, update progress, and track completion.";
    } else if (msg.includes('payment')) {
      response = "💳 Payment questions: Visit the Payments page to check balances, process transactions, or view payment history.";
    } else if (msg.includes('help')) {
      response = "🤖 I'm your Gigs4You AI assistant! I can help with jobs, tasks, payments, and general platform questions. What would you like to know?";
    } else {
      response = "👋 Hi! I'm here to help with Gigs4You. Try asking about: jobs, tasks, payments, reports, or general platform features. How can I assist you?";
    }
  }

  res.json({
    conversation_id,
    response,
    platform: platform || 'unknown',
    timestamp: new Date().toISOString()
  });
});

// Personalized recommendations
app.post('/recommendations/personalize', (req, res) => {
  const { user_id, user_type, context } = req.body;

  let recommendations = [];

  if (user_type === 'worker') {
    recommendations = [
      {
        type: 'job',
        title: 'Recommended Job Opportunity',
        description: 'Based on your skills and location preferences',
        confidence: 0.85
      },
      {
        type: 'skill',
        title: 'Skill Development Suggestion',
        description: 'Consider learning this skill to increase your opportunities',
        confidence: 0.72
      }
    ];
  } else if (user_type === 'employer') {
    recommendations = [
      {
        type: 'worker',
        title: 'Top Rated Worker Match',
        description: 'Highly rated worker with relevant experience',
        confidence: 0.91
      },
      {
        type: 'pricing',
        title: 'Optimal Pricing Strategy',
        description: 'Based on market rates and competition',
        confidence: 0.78
      }
    ];
  }

  res.json({
    user_id,
    user_type,
    recommendations,
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, () => {
  console.log(`AI Service running on port ${PORT}`);
});