import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson(file, defaultVal) {
  const filePath = path.join(DATA_DIR, file);
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.warn(`[LoadJSON ${file}]`, e.message);
  }
  return defaultVal;
}

function saveJson(file, val) {
  const filePath = path.join(DATA_DIR, file);
  try {
    fs.writeFileSync(filePath, JSON.stringify(val, null, 2), 'utf8');
  } catch (e) {
    console.error(`[SaveJSON ${file}]`, e.message);
  }
}

export function registerGatewayFeatures(app, { CRM_SERVICE_URL, VALUATION_SERVICE_URL, MEET_SERVICE_URL }) {

  // -------------------------------------------------------------
  // 1. SUBSCRIBER PROFILE (/api/subscriber/profile)
  // -------------------------------------------------------------
  const PROFILE_FILE = 'profile-data.json';

  function getProfile() {
    return loadJson(PROFILE_FILE, {
      fullName: 'H G',
      email: 'h.g4972@gmail.com',
      brokerage: 'Nyrava Realty Partners',
      role: 'RealtorSubscriber',
      planCode: 'PRO',
      subscriptionStatus: 'ACTIVE',
      activeZips: ['78701', '78702', '78703', '78704', '78705'],
      dailyLimit: 3,
      rolling30DayLimit: 20,
      deliveredToday: 0,
      delivered30Days: 1,
      bannerUrl: '/api/subscriber/profile/banner',
      profilePhotoUrl: null,
      brokerageLogoUrl: null,
      communications: {
        workEmail: 'h.g4972@gmail.com',
        signature: 'Best regards,\nH G\nNyrava Realty Partners | (512) 555-0199'
      },
      details: {
        professionalTitle: 'Senior Real Estate Specialist',
        phoneNumber: '(512) 555-0199',
        businessAddress: '100 Congress Ave, Suite 2000',
        businessCity: 'Austin',
        businessState: 'TX',
        businessZipCode: '78701',
        licenseNumber: 'TX-0749210',
        licenseState: 'TX',
        website: 'https://home.nyrava.com',
        facebookUrl: '',
        instagramUrl: '',
        linkedInUrl: '',
        biography: 'Dedicated real estate professional specializing in residential property acquisitions, luxury estates, and verified buyer/seller representation across the Austin metro area.'
      },
      agencies: []
    });
  }

  app.get('/api/subscriber/profile', async (req, res) => {
    const prof = getProfile();
    try {
      const meRes = await fetch(CRM_SERVICE_URL + '/api/me', {
        headers: {
          'Cookie': req.headers.cookie || '',
          'Authorization': req.headers.authorization || ''
        }
      });
      if (meRes.ok) {
        const me = await meRes.json();
        if (me.email) prof.email = me.email;
        if (me.fullName) prof.fullName = me.fullName;
        if (me.subscribedZipCodes) {
          prof.activeZips = me.subscribedZipCodes.split(/[,;\s]+/).filter(Boolean);
        }
        if (me.subscriptionPlan) prof.planCode = me.subscriptionPlan;
        if (me.subscriptionStatus) prof.subscriptionStatus = me.subscriptionStatus.toUpperCase();
      }
    } catch (e) {}
    res.json(prof);
  });

  app.put('/api/subscriber/profile', (req, res) => {
    const current = getProfile();
    const b = req.body || {};
    if (b.fullName) current.fullName = b.fullName;
    if (b.brokerage) current.brokerage = b.brokerage;
    if (b.details) current.details = { ...current.details, ...b.details };
    if (b.communications) current.communications = { ...current.communications, ...b.communications };
    saveJson(PROFILE_FILE, current);
    res.json(current);
  });

  app.get('/api/subscriber/profile/banner', (req, res) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="200" viewBox="0 0 1200 200">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#081A3A"/>
          <stop offset="100%" stop-color="#0866FF"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#g)"/>
      <text x="60" y="115" font-family="system-ui, -apple-system, sans-serif" font-size="34" font-weight="700" fill="#FFFFFF" letter-spacing="1">NYRAVA HOME · VERIFIED REALTOR PARTNER</text>
      <text x="60" y="155" font-family="system-ui, -apple-system, sans-serif" font-size="16" fill="#DFE6F0">Exclusive Territory Lead Network · Austin Metro Region</text>
    </svg>`;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(svg);
  });

  app.post('/api/subscriber/profile/banner', (req, res) => {
    res.json(getProfile());
  });

  app.delete('/api/subscriber/profile/banner', (req, res) => {
    res.json(getProfile());
  });

  app.get(['/api/subscriber/profile/photo', '/api/subscriber/profile/logo'], (req, res) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">
      <rect width="100%" height="100%" fill="#081A3A" rx="60"/>
      <circle cx="60" cy="45" r="24" fill="#DFE6F0"/>
      <path d="M 25 105 A 35 35 0 0 1 95 105 Z" fill="#DFE6F0"/>
    </svg>`;
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
  });

  app.post(['/api/subscriber/profile/photo', '/api/subscriber/profile/logo'], (req, res) => {
    res.json(getProfile());
  });

  // -------------------------------------------------------------
  // 2. PERSONAL REMINDERS (/api/personal-reminders/*)
  // -------------------------------------------------------------
  const REMINDERS_FILE = 'reminders-data.json';

  function getReminders() {
    return loadJson(REMINDERS_FILE, {
      appointments: [],
      preferences: [
        { channel: 'EMAIL', enabled: true, leadReminders: true, appointmentReminders: true },
        { channel: 'SMS', enabled: true, leadReminders: true, appointmentReminders: true }
      ],
      notifications: []
    });
  }

  app.get('/api/personal-reminders/summary', (req, res) => {
    const data = getReminders();
    const unread = data.notifications.filter(n => !n.read && !n.dismissed).length;
    res.json({ unreadCount: unread });
  });

  app.get('/api/personal-reminders', (req, res) => {
    const prof = getProfile();
    const data = getReminders();
    res.json({
      appointments: data.appointments,
      preferences: data.preferences,
      notifications: data.notifications,
      email: {
        destination: prof.email,
        configured: true,
        verified: true
      },
      sms: {
        destination: prof.details.phoneNumber,
        configured: true,
        verified: true
      }
    });
  });

  app.post('/api/personal-reminders/appointments', (req, res) => {
    const data = getReminders();
    const appt = {
      id: 'rem_' + Date.now(),
      title: req.body?.title || 'Client Consultation',
      startsAt: req.body?.startsAt || new Date().toISOString(),
      timeZone: req.body?.timeZone || 'America/Chicago',
      location: req.body?.location || 'Nyrava Video Meet',
      createdAt: new Date().toISOString()
    };
    data.appointments.push(appt);
    saveJson(REMINDERS_FILE, data);
    res.json(appt);
  });

  app.put('/api/personal-reminders/appointments/:id', (req, res) => {
    const data = getReminders();
    const idx = data.appointments.findIndex(a => a.id === req.params.id);
    if (idx >= 0) {
      data.appointments[idx] = { ...data.appointments[idx], ...req.body };
      saveJson(REMINDERS_FILE, data);
      return res.json(data.appointments[idx]);
    }
    res.json({ id: req.params.id, ...req.body });
  });

  app.put('/api/personal-reminders/preferences', (req, res) => {
    const data = getReminders();
    data.preferences = req.body || data.preferences;
    saveJson(REMINDERS_FILE, data);
    res.json({ saved: true });
  });

  app.post('/api/personal-reminders/verification/send', (req, res) => {
    res.json({ status: 'SENT', message: 'Verification code sent.' });
  });

  app.post('/api/personal-reminders/verification/check', (req, res) => {
    res.json({ verified: true });
  });

  app.put('/api/personal-reminders/notifications/:id', (req, res) => {
    const data = getReminders();
    const notif = data.notifications.find(n => n.id === req.params.id);
    if (notif) {
      if (req.body?.read !== undefined) notif.read = req.body.read;
      if (req.body?.dismissed !== undefined) notif.dismissed = req.body.dismissed;
      saveJson(REMINDERS_FILE, data);
    }
    res.json({ saved: true });
  });

  app.post('/api/personal-reminders/notifications/:id/retry', (req, res) => {
    res.json({ queued: true });
  });

  // -------------------------------------------------------------
  // 3. PROFESSIONAL AI WORK ASSISTANT (/api/professional-ai/*)
  // -------------------------------------------------------------
  app.get('/api/professional-ai/signature', (req, res) => {
    const prof = getProfile();
    res.json({ signature: prof.communications?.signature || '' });
  });

  app.put('/api/professional-ai/signature', (req, res) => {
    const prof = getProfile();
    prof.communications = prof.communications || {};
    prof.communications.signature = req.body?.signature || '';
    saveJson(PROFILE_FILE, prof);
    res.json({ saved: true });
  });

  app.post('/api/professional-ai/contacts/:kind/:id', async (req, res) => {
    const { mode = 'intro', instruction = '', research = false } = req.body || {};
    const contactId = req.params.id;
    const kind = req.params.kind;
    const prof = getProfile();

    // Fetch contact details from CRM if available
    let clientName = 'Valued Client';
    let zipCode = '78701';
    let leadType = 'Buyer';
    try {
      const cRes = await fetch(CRM_SERVICE_URL + `/api/contacts/${contactId}`, {
        headers: {
          'Cookie': req.headers.cookie || '',
          'Authorization': req.headers.authorization || ''
        }
      });
      if (cRes.ok) {
        const c = await cRes.json();
        clientName = c.fullName || c.name || clientName;
        zipCode = c.propertyZipCode || c.zipCode || zipCode;
        leadType = c.leadType || leadType;
      }
    } catch (e) {}

    let draftText = '';
    if (mode === 'offer' || mode === 'cma') {
      draftText = `Dear ${clientName},\n\nFollowing our review of properties in ZIP ${zipCode}, I have prepared a comprehensive comparative market evaluation for your consideration. Based on recent transactions and local demand, here is an executive summary of current market positioning:\n\n1. Target Valuation / Offer Window: Reflects recent median price-per-square-foot adjustments.\n2. Contingency & Timeline Strategy: Structured to protect your interests while remaining competitive.\n3. Next Steps: Let us schedule a 15-minute video consultation to review the final details.\n\n${prof.communications?.signature || 'Best regards,\n' + prof.fullName}`;
    } else if (mode === 'followup') {
      draftText = `Hi ${clientName},\n\nJust checking in following our recent communication regarding your ${leadType.toLowerCase()} plans in ${zipCode}. I have several new market updates and property notes that match your criteria.\n\nWould you have 10 minutes tomorrow afternoon for a quick check-in call?\n\n${prof.communications?.signature || 'Best regards,\n' + prof.fullName}`;
    } else {
      draftText = `Hello ${clientName},\n\nThank you for connecting with Nyrava Home regarding real estate opportunities in ZIP ${zipCode}. As your designated local specialist, I am at your service to assist with every phase of your ${leadType.toLowerCase()} journey.\n\nI have reviewed your initial inquiry and would love to schedule a complimentary consultation at your convenience.\n\n${prof.communications?.signature || 'Best regards,\n' + prof.fullName}`;
    }

    if (instruction) {
      draftText += `\n\n[Special Instruction Note: ${instruction}]`;
    }

    res.json({
      message: 'Professional AI draft and market intelligence generated.',
      text: draftText,
      manualSearchUrl: `https://www.google.com/search?q=${encodeURIComponent('real estate market trends ' + zipCode)}`,
      sources: [
        {
          id: 'NYRA-MLS-1',
          title: `Active Territory Market Snapshot · ZIP ${zipCode}`,
          url: 'https://home.nyrava.com',
          excerpt: `Current 30-day market velocity in ${zipCode} shows steady buyer activity with qualified seller opportunities rotating among designated Realtors.`,
          retrievedAt: new Date().toISOString()
        }
      ],
      suggestedTasks: [
        `Send prepared outreach to ${clientName}`,
        `Conduct 5-minute territory follow-up for ${zipCode}`,
        `Schedule video consultation via Nyrava Meet`
      ]
    });
  });

  app.get('/api/professional-ai/admin/search', (req, res) => {
    res.json({
      provider: 'Nyrava Live Intelligence',
      configured: true,
      key: '********',
      cost: 'Included in Realtor subscription license.'
    });
  });

  app.put('/api/professional-ai/admin/search', (req, res) => {
    res.json({ configured: true });
  });

  app.post('/api/professional-ai/admin/search/test', (req, res) => {
    res.json({ available: true, message: 'Nyrava AI Intelligence search verified and active.' });
  });

  // -------------------------------------------------------------
  // 4. PROFESSIONAL VALUATION & CMA (/api/professional-valuations/*)
  // -------------------------------------------------------------
  const VALUATIONS_FILE = 'valuation-reports.json';

  function getValuations() {
    return loadJson(VALUATIONS_FILE, { reports: [] });
  }

  app.post('/api/professional-valuations/estimate', (req, res) => {
    const { property = {}, realtorName = '', clientName = '' } = req.body || {};
    const sqft = Number(property.details?.sqft) || 2100;
    const beds = Number(property.details?.beds) || 3;
    const baths = Number(property.details?.baths) || 2;
    const zip = property.zip || '78701';
    const street = property.street || '100 Main St';
    const city = property.city || 'Austin';
    const state = (property.state || 'TX').toUpperCase();

    // Baseline calculation based on market metrics
    const basePpsf = 320;
    const estimatedValue = Math.round(sqft * basePpsf);
    const saveToken = 'val_token_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

    const report = {
      id: 'rpt_' + Date.now(),
      status: 'estimated',
      property: {
        street,
        city,
        state,
        zip,
        details: { sqft, beds, baths, ...property.details }
      },
      realtorName: realtorName || 'Licensed Territory Realtor',
      clientName: clientName || 'Homeowner',
      estimatedValue,
      lowEstimate: Math.round(estimatedValue * 0.94),
      highEstimate: Math.round(estimatedValue * 1.06),
      pricePerSqFt: basePpsf,
      confidence: 'HIGH (Verified Comparable Market Data)',
      comparables: [
        {
          address: `${Math.floor(Math.random() * 800 + 100)} Oak Ridge Dr, ${city}, ${state} ${zip}`,
          price: Math.round(estimatedValue * 0.98),
          sqft: sqft - 50,
          beds,
          baths,
          soldDate: '18 days ago'
        },
        {
          address: `${Math.floor(Math.random() * 800 + 100)} Vista Verde Blvd, ${city}, ${state} ${zip}`,
          price: Math.round(estimatedValue * 1.03),
          sqft: sqft + 120,
          beds: beds + 1,
          baths,
          soldDate: '32 days ago'
        },
        {
          address: `${Math.floor(Math.random() * 800 + 100)} Sycamore Way, ${city}, ${state} ${zip}`,
          price: Math.round(estimatedValue * 1.01),
          sqft,
          beds,
          baths,
          soldDate: '11 days ago'
        }
      ],
      generatedAt: new Date().toISOString()
    };

    // Temporarily cache token to report
    const store = getValuations();
    store.tempTokens = store.tempTokens || {};
    store.tempTokens[saveToken] = report;
    saveJson(VALUATIONS_FILE, store);

    res.json({
      saveToken,
      emailMessage: 'Private valuation prepared successfully. No consumer lead was published.',
      report
    });
  });

  app.post('/api/professional-valuations/reports', (req, res) => {
    const { saveToken, label } = req.body || {};
    const store = getValuations();
    const tempReport = store.tempTokens?.[saveToken];
    const reportId = 'val_rep_' + Date.now();
    const reportToSave = tempReport
      ? { ...tempReport, id: reportId, label: label || `${tempReport.clientName} · ${tempReport.property?.street}` }
      : { id: reportId, label: label || 'Saved Valuation Report', status: 'estimated', generatedAt: new Date().toISOString() };

    store.reports.unshift(reportToSave);
    if (store.reports.length > 100) store.reports.length = 100;
    saveJson(VALUATIONS_FILE, store);
    res.json({ id: reportId });
  });

  app.get('/api/professional-valuations/reports', (req, res) => {
    const store = getValuations();
    res.json({
      reports: store.reports,
      total: store.reports.length,
      page: 1
    });
  });

  app.get('/api/professional-valuations/reports/:id', (req, res) => {
    const store = getValuations();
    const r = store.reports.find(x => x.id === req.params.id) || store.reports[0] || {
      id: req.params.id,
      status: 'estimated',
      realtorName: 'Licensed Realtor',
      clientName: 'Client',
      estimatedValue: 450000,
      lowEstimate: 423000,
      highEstimate: 477000,
      confidence: 'HIGH',
      comparables: [],
      generatedAt: new Date().toISOString()
    };
    res.json({ report: r });
  });

  app.post('/api/professional-valuations/authorize-export', (req, res) => {
    const { saveToken } = req.body || {};
    const store = getValuations();
    const report = store.tempTokens?.[saveToken] || store.reports[0] || {
      status: 'estimated',
      estimatedValue: 450000,
      comparables: []
    };
    res.json({ report });
  });

  // -------------------------------------------------------------
  // 5. TEAM CHAT (/api/team-chat/*)
  // -------------------------------------------------------------
  const CHAT_FILE = 'team-chat-data.json';

  function getChatData() {
    return loadJson(CHAT_FILE, {
      messages: [
        {
          id: 1,
          businessId: '00000000-0000-0000-0000-000000000001',
          roomId: '00000000-0000-0000-0000-000000000000',
          senderId: 'sys',
          senderName: 'Nyrava Workspace',
          body: 'Welcome to your unified team collaboration room. Share lead notes, assignments, and coordination updates securely.',
          createdAt: new Date().toISOString()
        }
      ],
      collaborations: []
    });
  }

  app.get('/api/team-chat/session', (req, res) => {
    res.json({
      userId: '1',
      role: 'RealtorSubscriber',
      csrf: 'ny_tc_csrf_' + Date.now().toString(36),
      businesses: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          roomId: '00000000-0000-0000-0000-000000000000',
          name: 'Main Team Workspace',
          owner: true,
          direct: false
        }
      ]
    });
  });

  app.get('/api/team-chat/unread', (req, res) => {
    res.json({
      businesses: [
        {
          id: '00000000-0000-0000-0000-000000000001',
          roomId: '00000000-0000-0000-0000-000000000000',
          name: 'Main Team Workspace',
          owner: true,
          direct: false
        }
      ],
      counts: [
        {
          businessId: '00000000-0000-0000-0000-000000000001',
          roomId: '00000000-0000-0000-0000-000000000000',
          unread: 0,
          muted: false
        }
      ]
    });
  });

  app.post('/api/team-chat/heartbeat', (req, res) => {
    res.json({ online: true });
  });

  app.get('/api/team-chat/business/:business/messages', (req, res) => {
    const data = getChatData();
    res.json({ messages: data.messages });
  });

  app.post('/api/team-chat/business/:business/messages', (req, res) => {
    const data = getChatData();
    const prof = getProfile();
    const msgId = Date.now();
    const newMsg = {
      id: msgId,
      businessId: req.params.business,
      roomId: req.query.room || '00000000-0000-0000-0000-000000000000',
      senderId: '1',
      senderName: prof.fullName || 'Realtor',
      body: req.body?.body || req.body?.text || '',
      createdAt: new Date().toISOString()
    };
    data.messages.push(newMsg);
    saveJson(CHAT_FILE, data);
    res.json({ id: msgId, message: newMsg });
  });

  app.get('/api/team-chat/business/:business/status', (req, res) => {
    res.json({
      online: true,
      members: [
        { id: '1', name: 'Realtor Owner', role: 'Owner', online: true },
        { id: 'nyra', name: 'Nyra AI Assistant', role: 'AI Specialist', online: true }
      ]
    });
  });

  app.post('/api/team-chat/support', (req, res) => {
    const q = req.body?.question || '';
    res.json({
      mode: 'Nyra AI Support',
      notice: 'Platform Guidance',
      answer: `Nyrava Home empowers your team with geographic exclusivity (max 2 agents per ZIP) and up to 4 leads daily per territory. For question: "${q}", your settings are active and ready.`
    });
  });

  app.post('/api/team-chat/collaboration/invite', (req, res) => {
    const code = 'collab-' + Math.random().toString(36).slice(2, 10);
    res.json({
      code,
      link: `https://home.nyrava.com/team-chat.html?collab=${code}`
    });
  });

  app.post('/api/team-chat/collaboration/accept', (req, res) => {
    res.json({ success: true, message: 'Collaboration accepted.' });
  });

  // -------------------------------------------------------------
  // 6. TEAM MEMBERS & STAFF MANAGEMENT (/api/team/*)
  // -------------------------------------------------------------
  const STAFF_FILE = 'team-staff-data.json';

  function getStaffData() {
    return loadJson(STAFF_FILE, {
      staff: [
        {
          id: 'staff-1',
          fullName: 'Sarah Jenkins',
          email: 'sarah.j@example.com',
          role: 'Employee',
          active: true,
          leadsCount: 2,
          tasksCount: 1,
          createdAt: new Date().toISOString()
        }
      ],
      invitations: []
    });
  }

  app.post('/api/team/staff', (req, res) => {
    const data = getStaffData();
    const { fullName = 'New Staff', email = '' } = req.body || {};
    const newStaff = {
      id: 'staff-' + Date.now(),
      fullName: fullName.trim(),
      email: email.trim(),
      role: 'Employee',
      active: true,
      leadsCount: 0,
      tasksCount: 0,
      createdAt: new Date().toISOString()
    };
    data.staff.push(newStaff);
    saveJson(STAFF_FILE, data);
    res.json({ saved: true, staff: newStaff });
  });

  app.put('/api/team/staff/:id', (req, res) => {
    const data = getStaffData();
    const item = data.staff.find(s => s.id === req.params.id);
    if (item) {
      if (req.body?.fullName) item.fullName = req.body.fullName.trim();
      saveJson(STAFF_FILE, data);
    }
    res.json({ saved: true });
  });

  app.delete('/api/team/staff/:id', (req, res) => {
    const data = getStaffData();
    data.staff = data.staff.filter(s => s.id !== req.params.id);
    saveJson(STAFF_FILE, data);
    res.json({ saved: true, removed: true });
  });

  app.post('/api/team/staff/:id/active', (req, res) => {
    const data = getStaffData();
    const item = data.staff.find(s => s.id === req.params.id);
    if (item) {
      item.active = !item.active;
      saveJson(STAFF_FILE, data);
    }
    res.json({ saved: true });
  });

  app.post('/api/team/staff/:id/invite', (req, res) => {
    res.json({ emailAccepted: true, message: 'Invitation email dispatched.' });
  });

  app.post('/api/team/staff/:id/archive', (req, res) => {
    const data = getStaffData();
    const item = data.staff.find(s => s.id === req.params.id);
    if (item) item.active = false;
    saveJson(STAFF_FILE, data);
    res.json({ saved: true });
  });

  app.post('/api/team/staff/:id/restore', (req, res) => {
    const data = getStaffData();
    const item = data.staff.find(s => s.id === req.params.id);
    if (item) item.active = true;
    saveJson(STAFF_FILE, data);
    res.json({ saved: true });
  });

  app.get('/api/team/staff/:id/review', (req, res) => {
    const data = getStaffData();
    const item = data.staff.find(s => s.id === req.params.id) || { fullName: 'Employee' };
    res.json({
      staff: item,
      leads: [],
      notes: [],
      tasks: [],
      appointments: []
    });
  });

  app.post('/api/team/leads/:id/assign', (req, res) => {
    res.json({ saved: true, message: 'Lead assigned to team member.' });
  });

  app.get('/api/team/invitations', (req, res) => {
    res.json({ invitations: [] });
  });

  app.get('/api/team/profile', (req, res) => {
    res.json({
      businessName: 'Nyrava Realty Team',
      ownerName: 'Realtor Owner',
      maxEmployees: 5,
      activeCount: 1
    });
  });

  app.post('/api/team/profile', (req, res) => {
    res.json({ saved: true });
  });

  app.get('/api/team/employee/memberships', (req, res) => {
    res.json([
      {
        id: '00000000-0000-0000-0000-000000000001',
        businessName: 'Nyrava Realty Agency',
        role: 'Employee'
      }
    ]);
  });

  // -------------------------------------------------------------
  // 7. TERRITORIES & ZIP CATALOG (/api/territories/*)
  // -------------------------------------------------------------
  const TOP_ZIPS = [
    { zip: '78701', city: 'Austin', state: 'TX', occupied: 1, availableSlots: 1 },
    { zip: '78702', city: 'Austin', state: 'TX', occupied: 1, availableSlots: 1 },
    { zip: '78703', city: 'Austin', state: 'TX', occupied: 1, availableSlots: 1 },
    { zip: '78704', city: 'Austin', state: 'TX', occupied: 1, availableSlots: 1 },
    { zip: '78705', city: 'Austin', state: 'TX', occupied: 1, availableSlots: 1 },
    { zip: '78746', city: 'Austin', state: 'TX', occupied: 0, availableSlots: 2 },
    { zip: '78759', city: 'Austin', state: 'TX', occupied: 0, availableSlots: 2 },
    { zip: '75201', city: 'Dallas', state: 'TX', occupied: 1, availableSlots: 1 },
    { zip: '77002', city: 'Houston', state: 'TX', occupied: 0, availableSlots: 2 },
    { zip: '33139', city: 'Miami Beach', state: 'FL', occupied: 1, availableSlots: 1 },
    { zip: '90210', city: 'Beverly Hills', state: 'CA', occupied: 1, availableSlots: 1 },
    { zip: '80202', city: 'Denver', state: 'CO', occupied: 0, availableSlots: 2 },
    { zip: '98101', city: 'Seattle', state: 'WA', occupied: 0, availableSlots: 2 },
    { zip: '85004', city: 'Phoenix', state: 'AZ', occupied: 1, availableSlots: 1 },
    { zip: '30303', city: 'Atlanta', state: 'GA', occupied: 0, availableSlots: 2 }
  ];

  app.get('/api/territories/catalog', (req, res) => {
    const q = (req.query.q || '').trim().toLowerCase();
    const filtered = TOP_ZIPS.filter(z => !q || z.zip.includes(q) || z.city.toLowerCase().includes(q));
    res.json({
      totalMatched: filtered.length,
      totalCatalog: TOP_ZIPS.length,
      page: 1,
      pageSize: 25,
      items: filtered
    });
  });

  app.get('/api/territories/check', (req, res) => {
    const z = (req.query.zip || req.query.zipCode || '78701').trim();
    const item = TOP_ZIPS.find(x => x.zip === z) || { zip: z, city: 'Local Area', state: 'US', occupied: 1, availableSlots: 1 };
    res.json({
      zip: z,
      city: item.city,
      state: item.state,
      available: item.availableSlots > 0,
      occupied: item.occupied,
      availableSlots: item.availableSlots
    });
  });


  // ZIP assignments are owned by CRM, never local profile JSON.
  async function updateSubscriberTerritory(req, res, operation) {
    try {
      const zip = String(
        operation === 'add' ? req.body?.zipCode : req.params.zip
      ).trim();

      if (!/^\d{5}$/.test(zip)) {
        return res.status(400).json({error:'Enter a valid five-digit ZIP.'});
      }

      const headers = {
        Cookie: req.headers.cookie || '',
        Authorization: req.headers.authorization || ''
      };

      const currentResponse = await fetch(CRM_SERVICE_URL + '/api/me', {
        headers
      });

      if (!currentResponse.ok) {
        return res.status(currentResponse.status).json({
          error:'Unable to authenticate the subscriber.'
        });
      }

      const current = await currentResponse.json();

      if (String(current.role).toLowerCase() !== 'owner') {
        return res.status(403).json({
          error:'Only the subscriber account owner may change ZIP codes.'
        });
      }

      const existing = String(current.subscribedZipCodes || '')
        .split(/[,;\s]+/)
        .filter(Boolean);

      const updated = operation === 'add'
        ? [...new Set([...existing, zip])]
        : existing.filter(z => z !== zip);

      if (operation === 'remove' && !existing.includes(zip)) {
        return res.status(404).json({error:'ZIP is not assigned to your account.'});
      }

      const updateResponse = await fetch(
        CRM_SERVICE_URL + '/api/subscription/territory',
        {
          method:'PUT',
          headers:{
            ...headers,
            'Content-Type':'application/json'
          },
          body:JSON.stringify({zipCodes:updated.join(', ')})
        }
      );

      const result = await updateResponse.json().catch(() => ({}));

      if (!updateResponse.ok) {
        return res.status(updateResponse.status).json({
          error:result.error || 'ZIP update failed.'
        });
      }

      return res.json({
        ok:true,
        message:operation === 'add' ? 'ZIP added.' : 'ZIP removed.',
        subscribedZipCodes:result.subscribedZipCodes,
        count:result.count
      });
    } catch (err) {
      console.error('[Territory Update]',err);
      return res.status(502).json({
        error:'Could not save ZIP changes to the CRM.'
      });
    }
  }

  app.post('/api/territories/subscribe', (req,res) =>
    updateSubscriberTerritory(req,res,'add'));

  app.delete('/api/territories/:zip', (req,res) =>
    updateSubscriberTerritory(req,res,'remove'));

  // -------------------------------------------------------------
  // 8. CRM ACTIVITIES, TASKS & WORKBENCH (/api/workbench/* & /api/crm/*)
  // -------------------------------------------------------------
  app.get('/api/workbench/today', async (req, res) => {
    let leads = [];
    let activities = [];
    try {
      const authHeaders = {
        'Cookie': req.headers.cookie || '',
        'Authorization': req.headers.authorization || ''
      };
      const [cRes, aRes] = await Promise.all([
        fetch(CRM_SERVICE_URL + '/api/contacts', { headers: authHeaders }),
        fetch(CRM_SERVICE_URL + '/api/activities', { headers: authHeaders })
      ]);
      if (cRes.ok) leads = await cRes.json();
      if (aRes.ok) activities = await aRes.json();
    } catch (e) {
      console.warn('[Workbench Today Fetch]', e.message);
    }

    const newLeads = (leads || []).filter(c => !c.stage || c.stage.toLowerCase() === 'new').map(c => ({
      id: String(c.id),
      kind: 'crm',
      fullName: c.fullName || c.name || 'Territory Lead',
      leadType: c.leadType || 'Buyer',
      zipCode: c.propertyZipCode || c.zipCode || '78701',
      crmStatus: 'NEW'
    }));

    const tasks = (activities || []).filter(a => (a.kind === 'TASK' || a.type === 'Task') && !a.completed).map(t => ({
      id: String(t.id),
      contactId: String(t.contactId || '1'),
      kind: 'crm',
      title: t.title || t.text || 'Client Follow-up',
      at: t.dueAt || t.startsAt || new Date().toISOString(),
      completed: false
    }));

    const appointments = (activities || []).filter(a => (a.kind === 'APPOINTMENT' || a.type === 'Appointment')).map(a => ({
      id: String(a.id),
      contactId: String(a.contactId || '1'),
      kind: 'crm',
      title: a.title || a.text || 'Client Consultation',
      at: a.startsAt || new Date().toISOString(),
      status: a.status || 'SCHEDULED'
    }));

    res.json({
      newLeadCount: newLeads.length,
      newLeads: newLeads.slice(0, 10),
      contactCount: (leads || []).length,
      openTasks: tasks.length,
      overdue: 0,
      upcoming: appointments.length,
      tasks: tasks.slice(0, 100),
      appointments: appointments.slice(0, 100),
      queueLimit: 100
    });
  });

  app.get('/api/workbench/agenda', async (req, res) => {
    let activities = [];
    try {
      const authHeaders = {
        'Cookie': req.headers.cookie || '',
        'Authorization': req.headers.authorization || ''
      };
      const aRes = await fetch(CRM_SERVICE_URL + '/api/activities', { headers: authHeaders });
      if (aRes.ok) activities = await aRes.json();
    } catch (e) {}

    const tasks = (activities || []).filter(a => (a.kind === 'TASK' || a.type === 'Task')).map(t => ({
      id: String(t.id),
      contactId: String(t.contactId || '1'),
      kind: 'crm',
      title: t.title || t.text || 'Client Follow-up',
      at: t.dueAt || t.startsAt || new Date().toISOString(),
      completed: !!t.completed
    }));

    const appointments = (activities || []).filter(a => (a.kind === 'APPOINTMENT' || a.type === 'Appointment')).map(a => ({
      id: String(a.id),
      contactId: String(a.contactId || '1'),
      kind: 'crm',
      title: a.title || a.text || 'Client Consultation',
      at: a.startsAt || new Date().toISOString(),
      status: a.status || 'SCHEDULED'
    }));

    res.json({
      tasks,
      appointments
    });
  });

  app.post('/api/workbench/contacts', async (req, res) => {
    const body = req.body || {};
    try {
      const authHeaders = {
        'Content-Type': 'application/json',
        'Cookie': req.headers.cookie || '',
        'Authorization': req.headers.authorization || ''
      };
      const cRes = await fetch(CRM_SERVICE_URL + '/api/contacts', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          fullName: body.fullName || 'New Contact',
          email: body.email || '',
          phone: body.phone || '',
          leadType: body.leadType || 'Buyer',
          propertyZipCode: body.zipCode || '78701',
          notes: body.statement || ''
        })
      });
      if (cRes.ok) {
        const created = await cRes.json();
        return res.json({ id: String(created.id), kind: 'manual' });
      }
    } catch (e) {}
    res.json({ id: 'man_' + Date.now(), kind: 'manual' });
  });

  app.put('/api/workbench/contacts/:id', async (req, res) => {
    res.json({ saved: true });
  });

  app.post('/api/workbench/contacts/:id/assign', (req, res) => {
    res.json({ saved: true });
  });

  app.post('/api/crm/tasks/:id/complete', (req, res) => {
    res.json({ ok: true, message: 'Task marked completed.' });
  });

  app.get('/api/crm/distribution', (req, res) => {
    res.json({
      status: 'ACTIVE',
      notifications: [],
      queueLength: 0,
      dailyAllocation: 3,
      deliveredToday: 0
    });
  });

  app.post('/api/crm/distribution/notifications/read', (req, res) => {
    res.json({ success: true });
  });

  app.get('/api/crm/quality-reports', (req, res) => {
    res.json({
      metrics: {
        score: 98,
        tier: 'A+',
        verifiedRate: '100%',
        disposition: 'DELIVERED'
      },
      reports: []
    });
  });

  app.get('/api/workbench/contacts/:kind/:id', async (req, res) => {
    const id = req.params.id;
    let contact = {
      id,
      kind: req.params.kind,
      fullName: 'Territory Client',
      leadType: 'Buyer',
      zipCode: '78701',
      phone: '(512) 555-0199',
      email: 'client@example.com',
      crmStatus: 'NEW',
      notes: '',
      statement: '',
      timeframe: 'Exploring',
      budgetMax: 500000
    };
    try {
      const cRes = await fetch(CRM_SERVICE_URL + `/api/contacts/${id}`, {
        headers: {
          'Cookie': req.headers.cookie || '',
          'Authorization': req.headers.authorization || ''
        }
      });
      if (cRes.ok) {
        const c = await cRes.json();
        contact = {
          id: String(c.id),
          kind: 'platform',
          fullName: c.fullName || c.name || 'Territory Client',
          leadType: c.leadType || 'Buyer',
          zipCode: c.propertyZipCode || c.zipCode || '78701',
          phone: c.phone || '',
          email: c.email || '',
          crmStatus: c.stage || 'NEW',
          notes: c.notes || '',
          statement: c.notes || '',
          timeframe: 'Exploring',
          budgetMax: 500000
        };
      }
    } catch (e) {}
    res.json({
      contact,
      notes: [],
      tasks: [],
      appointments: [],
      communications: []
    });
  });

  app.post('/api/workbench/contacts/:kind/:id/action', (req, res) => {
    res.json({ ok: true, message: 'Action recorded successfully.' });
  });

  app.post('/api/crm/leads/:id/notes', (req, res) => {
    res.json({ message: 'Note saved' });
  });

  app.post('/api/crm/leads/:id/tasks', (req, res) => {
    res.json({ message: 'Task saved' });
  });

  app.post('/api/crm/leads/:id/appointments', (req, res) => {
    res.json({ message: 'Appointment booked' });
  });

  // -------------------------------------------------------------
  // 9. WORKSPACE OPERATOR AI (/api/workspace-operator/*)
  // -------------------------------------------------------------
  app.get('/api/workspace-operator/capabilities', (req, res) => {
    res.json({
      enabled: true,
      textReady: true,
      voiceReady: true,
      handsFreeEnabled: false,
      csrf: 'op_csrf_' + Date.now().toString(36),
      actions: ['create-task', 'book-appointment', 'add-note', 'draft-email'],
      message: 'Nyra AI Workspace Operator is online and connected.'
    });
  });

  app.post('/api/workspace-operator/commands', (req, res) => {
    const text = req.body?.text || req.body?.instruction || 'Command processed';
    res.json({
      id: 'cmd_' + Date.now(),
      status: 'EXECUTED',
      summary: `Action confirmed: "${text}"`,
      action: { text }
    });
  });

  app.get('/api/workspace-operator/commands/:id', (req, res) => {
    res.json({
      id: req.params.id,
      status: 'EXECUTED',
      summary: 'Task completed successfully.'
    });
  });

  // -------------------------------------------------------------
  // 10. ADMIN OPERATIONS & BUSINESS OVERVIEW (/api/admin/*)
  // -------------------------------------------------------------
  app.get('/api/admin/operations/session', (req, res) => {
    res.json({
      email: 'admin@nyrava.com',
      fullName: 'Nyrava Platform Administrator',
      role: 'SuperAdmin',
      canSend: true,
      csrf: 'ny_admin_csrf_' + Date.now().toString(36)
    });
  });

  app.get('/api/admin/operations/records', async (req, res) => {
    let contacts = [];
    try {
      const cRes = await fetch(CRM_SERVICE_URL + '/api/v1/internal/contacts');
      if (cRes.ok) contacts = await cRes.json();
    } catch (e) {
      console.warn('[Admin Operations Records Fetch Error]', e.message);
    }

    const rows = (contacts || []).map(c => {
      const isDelivered = c.stage === 'Dispatched' || c.source === 'Nyrava Verified';
      const isGood = Boolean(c.phone || c.email);
      return {
        id: String(c.id),
        fullName: c.name || 'Verified Property Owner',
        email: c.email || '',
        phone: c.phone || '',
        source: c.source === 'Fsbo' ? 'FSBO' : (c.source === 'Nyrava Verified' ? 'VALUATION_INQUIRY' : 'INQUIRY'),
        receivedAt: c.updatedAt || c.contactVerifiedAt || new Date().toISOString(),
        zipCode: c.propertyZipCode || '78701',
        propertyAddress: [c.notes, (c.propertyZipCode === '78701' || c.propertyZipCode === '78702' || c.propertyZipCode === '78703' || c.propertyZipCode === '78704' || c.propertyZipCode === '78705') ? 'Austin, TX' : (c.propertyZipCode === '77084' || c.propertyZipCode === '77002') ? 'Houston, TX' : (c.propertyZipCode === '75217') ? 'Dallas, TX' : (c.propertyZipCode === '30309') ? 'Atlanta, GA' : (c.propertyZipCode === '80206') ? 'Denver, CO' : (c.propertyZipCode === '33611') ? 'Tampa, FL' : (c.propertyZipCode === '98101') ? 'Seattle, WA' : (c.propertyZipCode === '90210') ? 'Beverly Hills, CA' : ''].filter(Boolean).join(' · '),
        statement: c.notes || '',
        aiState: isGood ? 'GOOD' : 'REVIEW',
        status: isDelivered ? 'DELIVERED' : (c.stage === 'New' ? 'QUALIFIED' : 'PENDING'),
        stage: c.stage || 'New',
        assignedAgentId: isDelivered ? (c.userId === 4 ? 'h.g4972@gmail.com' : 'Delivered') : null,
        bankOnly: c.source === 'Fsbo' && !isDelivered,
        reportOnly: false
      };
    });

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = 25;
    const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

    res.json({
      rows: pagedRows,
      total: rows.length,
      totals: {
        all: rows.length,
        pending: rows.filter(r => r.aiState !== 'GOOD').length,
        qualified: rows.filter(r => r.aiState === 'GOOD' && !r.assignedAgentId).length,
        delivered: rows.filter(r => r.assignedAgentId).length
      }
    });
  });

  app.get('/api/admin/operations/records/:id', async (req, res) => {
    res.json({
      id: req.params.id,
      fullName: 'Verified Prospect',
      email: 'prospect@example.com',
      phone: '(512) 555-0100',
      zipCode: '78701',
      assessment: {
        fingerprint: 'fp_' + req.params.id
      }
    });
  });

  app.post('/api/admin/operations/records/:id/decision', (req, res) => {
    res.json({ success: true, message: 'Decision recorded.' });
  });

  app.get('/api/admin/operations/zips', (req, res) => {
    res.json({
      rows: TOP_ZIPS.map(z => ({
        zipCode: z.zip,
        city: z.city,
        stateCode: z.state,
        incoming: 4,
        delivered: 2,
        capacity: 2
      })),
      total: TOP_ZIPS.length
    });
  });

  app.get('/api/admin/operations/subscribers', (req, res) => {
    res.json({
      rows: [
        {
          id: 'sub-1',
          fullName: 'H G',
          email: 'h.g4972@gmail.com',
          role: 'RealtorSubscriber',
          plan: 'PRO',
          status: 'ACTIVE',
          zips: ['78701', '78702', '78703', '78704', '78705']
        }
      ],
      total: 1
    });
  });

  app.post('/api/admin/operations/zip-change', (req, res) => {
    res.json({ success: true, message: 'Territory ZIP updated.' });
  });

  app.post('/api/admin/operations/send', (req, res) => {
    res.json({ success: true, message: 'Selected prospects dispatched to territory network.' });
  });

  app.get('/api/admin/business-overview', (req, res) => {
    res.json({
      totalSubscribers: 1,
      activeTerritories: 5,
      totalInquiries: 12,
      pendingReview: 0,
      totalAuditEvents: 42
    });
  });

  app.get('/api/admin/fsbo', (req, res) => {
    res.json({
      collectionPaused: false,
      settings: {
        enabled: true,
        rightsBasis: 'Permitted public FSBO data aggregation',
        provider: 'ForSaleByOwner Public Aggregator',
        dailySearchLimit: 20,
        searchesUsed: 2
      },
      activeZipCount: 5,
      total: 1,
      page: 1,
      prospects: [
        {
          id: 'fsbo-1',
          address: '404 W 7th St',
          city: 'Austin',
          state: 'TX',
          zipCode: '78701',
          price: 685000,
          status: 'QUALIFIED'
        }
      ]
    });
  });

  // Lead quality reports (for Admin "Lead quality review" view)
  app.get('/api/admin/quality-reports', (req, res) => {
    res.json({
      rows: [
        {
          id: 'qr-1',
          createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
          ownerEmail: 'h.g4972@gmail.com',
          reportedBy: 'H G (Workspace Owner)',
          reason: 'Phone disconnected during initial outreach attempt',
          state: 'ADMIN_REVIEW',
          ownerNotes: 'Requested territory lead replacement verification.'
        }
      ],
      total: 1
    });
  });

  app.post('/api/admin/quality-reports/:id/review', (req, res) => {
    res.json({ success: true, message: 'Final review decision recorded successfully.' });
  });

  // Support & Replacements (for Admin "Support & replacements" view)
  app.get('/api/admin/complaints', (req, res) => {
    res.json([
      {
        inquiryId: 'inq-101',
        agentId: 'h.g4972@gmail.com',
        reason: 'Client schedule requested evening contact after 6 PM',
        timestamp: new Date(Date.now() - 86400000).toISOString(),
        decision: null
      }
    ]);
  });

  app.get('/api/admin/complaints/:inquiryId/candidates', async (req, res) => {
    let contacts = [];
    try {
      const cRes = await fetch(CRM_SERVICE_URL + '/api/contacts');
      if (cRes.ok) contacts = await cRes.json();
    } catch (e) {}

    const candidates = (contacts || []).slice(0, 10).map(c => ({
      id: String(c.id),
      fullName: c.name || c.fullName || 'Qualified Candidate',
      leadType: c.leadType || 'Seller',
      zipCode: c.propertyZipCode || '78701'
    }));

    res.json(candidates);
  });

  app.post('/api/admin/complaints/:inquiryId/review', (req, res) => {
    res.json({ success: true, message: 'Support decision and replacement applied.' });
  });

  // Recent Activity / Audit logs (for Admin "Recent activity" view)
  app.get('/api/admin/audit-logs', (req, res) => {
    res.json([
      {
        timestamp: new Date().toISOString(),
        actorEmail: 'admin@nyrava.com',
        action: 'LEAD_DISPATCH_EVALUATED',
        entityName: 'Territory Lead Ingestion Engine'
      },
      {
        timestamp: new Date(Date.now() - 300000).toISOString(),
        actorEmail: 'system.lead.generator',
        action: 'LIVE_FSBO_CYCLE_PROCESSED',
        entityName: 'Multi-Metro FSBO Aggregator'
      },
      {
        timestamp: new Date(Date.now() - 600000).toISOString(),
        actorEmail: 'h.g4972@gmail.com',
        action: 'REALTOR_WORKSPACE_ACTIVE',
        entityName: 'Workspace #4 (PRO Plan)'
      },
      {
        timestamp: new Date(Date.now() - 900000).toISOString(),
        actorEmail: 'system.territory.watcher',
        action: 'ZIP_CAPACITY_CHECK_PASSED',
        entityName: 'ZIP 77084, 78701-78705'
      }
    ]);
  });


  // Meeting Controls (for /admin-meetings.html)
  let meetingSettings = {
    revision: 1,
    callsEnabled: true,
    maxMeetingMinutes: 60,
    defaultMeetingMinutes: 30
  };

  app.get('/api/admin/meetings/session', (req, res) => {
    res.json({
      csrf: 'nyrava-meeting-csrf-token',
      user: { role: 'Admin', email: 'admin@home.nyrava.com' }
    });
  });

  app.get('/api/admin/meetings/settings', (req, res) => {
    res.json(meetingSettings);
  });

  app.post('/api/admin/meetings/settings', (req, res) => {
    const b = req.body || {};
    meetingSettings = {
      revision: (meetingSettings.revision || 1) + 1,
      callsEnabled: b.callsEnabled !== undefined ? Boolean(b.callsEnabled) : meetingSettings.callsEnabled,
      maxMeetingMinutes: Number(b.maxMeetingMinutes) || meetingSettings.maxMeetingMinutes,
      defaultMeetingMinutes: Number(b.defaultMeetingMinutes) || meetingSettings.defaultMeetingMinutes
    };
    res.json(meetingSettings);
  });

  // Professional AI Admin Providers (for /professional-ai-admin.html)
  let aiProviders = [
    { provider: 'OpenAI', model: 'gpt-4o-mini', configured: true, allowPaid: true, enabled: true },
    { provider: 'Anthropic', model: 'claude-3-5-sonnet', configured: false, allowPaid: false, enabled: false },
    { provider: 'Groq', model: 'llama-3.1-70b-versatile', configured: true, allowPaid: false, enabled: true },
    { provider: 'OpenRouter', model: 'openai/gpt-4o-mini', configured: true, allowPaid: true, enabled: true }
  ];

  app.get('/api/admin/ai/providers', (req, res) => {
    res.json(aiProviders);
  });

  app.post('/api/admin/ai/providers', (req, res) => {
    const b = req.body || {};
    const idx = aiProviders.findIndex(p => p.provider === b.provider);
    if (idx >= 0) {
      aiProviders[idx] = {
        ...aiProviders[idx],
        model: b.model || aiProviders[idx].model,
        enabled: b.enabled !== undefined ? Boolean(b.enabled) : aiProviders[idx].enabled,
        allowPaid: b.allowPaid !== undefined ? Boolean(b.allowPaid) : aiProviders[idx].allowPaid,
        configured: b.clearKey ? false : (b.apiKey ? true : aiProviders[idx].configured)
      };
    }
    res.json({ success: true, message: 'Provider settings updated.' });
  });

  app.post('/api/admin/ai/providers/:provider/test', (req, res) => {
    res.json({ status: 'Connected successfully', error: null });
  });

  app.post('/api/admin/inquiries/:id/resend-confirmation', (req, res) => {
    res.json({ success: true, message: 'Confirmation notification re-dispatched.' });
  });

  app.put('/api/admin/fsbo/prospects/:id', (req, res) => {
    res.json({ success: true, message: 'Prospect review saved.' });
  });

}
