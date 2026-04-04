// ============================================================
// seed_v2.js — Base de données complète avec :
//   ✅ Essai gratuit (1er projet)
//   ✅ Commission 5% client + 5% freelancer
//   ✅ Plans d'abonnement (Basic $19/mois)
//   ✅ Transactions & paiements
//   ✅ Messages & conversations
// ============================================================

const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');

const MONGO_URI = 'mongodb+srv://Asma:asma2003@cluster0.6o1doob.mongodb.net/?appName=Cluster0';
const DB_NAME   = 'talent_db';

async function seed() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    console.log('✅ Connecté à MongoDB');
    const db = client.db(DB_NAME);

    // Nettoyer
    const cols = ['users','freelancers','projects','reviews','applications',
                  'categories','conversations','messages','transactions',
                  'subscriptions','plans','commissions'];
    for (const c of cols) await db.collection(c).deleteMany({});
    console.log('🗑️  Anciennes données supprimées');

    // ═══════════════════════════════════════════════════════
    // 1. PLANS D'ABONNEMENT
    // ═══════════════════════════════════════════════════════
    const plans = [
      {
        _id:          new ObjectId(),
        name:         'Free Trial',
        slug:         'free-trial',
        price:        0,
        currency:     'USD',
        period:       null,
        description:  'Essai gratuit pour le 1er projet',
        features: [
          '1 projet gratuit (client ou freelancer)',
          'Commission 0% sur le 1er projet',
          'Accès à tous les freelancers',
          'Messagerie incluse',
          'Support standard',
        ],
        limits: {
          max_projects:      1,
          max_bids:          3,
          commission_client: 0,      // 0% sur le 1er projet
          commission_freelancer: 0,
        },
        is_active: true,
        created_at: new Date(),
      },
      {
        _id:          new ObjectId(),
        name:         'Basic',
        slug:         'basic',
        price:        19,
        currency:     'USD',
        period:       'month',
        description:  'Pour les indépendants et starters',
        features: [
          'Accès à toutes les fonctionnalités',
          '14 lookups par mois',
          'No API Credits',
          '10 Monitoring Quota',
          '60 minutes Monitoring Interval',
          '20% discount on backorders',
          'Domain Name Appraiser',
          '10 Monitoring',
          'Backline Monitoring',
        ],
        limits: {
          max_projects:         -1,   // illimité
          max_bids:             -1,
          commission_client:     5,   // 5% prélevé au client
          commission_freelancer: 5,   // 5% prélevé au freelancer
        },
        trial_days: 14,
        is_active:  true,
        created_at: new Date(),
      },
      {
        _id:          new ObjectId(),
        name:         'Pro',
        slug:         'pro',
        price:        49,
        currency:     'USD',
        period:       'month',
        description:  'Pour les freelancers professionnels',
        features: [
          'Tout ce qui est dans Basic',
          'Commission réduite 3% client + 3% freelancer',
          'Profil mis en avant (Top Rated badge)',
          'Analytics avancés',
          'Support prioritaire',
          'Appels vidéo intégrés',
        ],
        limits: {
          max_projects:         -1,
          max_bids:             -1,
          commission_client:     3,
          commission_freelancer: 3,
        },
        trial_days: 14,
        is_active:  true,
        created_at: new Date(),
      },
    ];

    await db.collection('plans').insertMany(plans);
    console.log(`✅ ${plans.length} plans insérés`);

    // ═══════════════════════════════════════════════════════
    // 2. CATEGORIES
    // ═══════════════════════════════════════════════════════
    const categories = [
      { slug: 'graphic-design',    label: 'Graphic Design',    icon: 'color-palette-outline', bg: 'linear-gradient(135deg,#FF6B6B,#ee0979)',  freelancer_count: 520, project_count: 48 },
      { slug: 'digital-marketing', label: 'Digital Marketing', icon: 'megaphone-outline',     bg: 'linear-gradient(135deg,#f7971e,#ffd200)',  freelancer_count: 310, project_count: 32 },
      { slug: 'video-animation',   label: 'Video & Animation', icon: 'videocam-outline',      bg: 'linear-gradient(135deg,#396afc,#2948ff)',  freelancer_count: 280, project_count: 27 },
      { slug: 'program-tech',      label: 'Program & Tech',    icon: 'code-slash-outline',    bg: 'linear-gradient(135deg,#11998e,#38ef7d)',  freelancer_count: 890, project_count: 95 },
      { slug: 'music-audio',       label: 'Music & Audio',     icon: 'musical-notes-outline', bg: 'linear-gradient(135deg,#834d9b,#d04ed6)',  freelancer_count: 190, project_count: 18 },
      { slug: 'photography',       label: 'Photography',       icon: 'camera-outline',        bg: 'linear-gradient(135deg,#f953c6,#b91d73)',  freelancer_count: 240, project_count: 22 },
      { slug: 'uiux-design',       label: 'UI/UX Design',      icon: 'phone-portrait-outline',bg: 'linear-gradient(135deg,#8B1A3A,#C0395A)',  freelancer_count: 430, project_count: 41 },
      { slug: 'ai-services',       label: 'Build AI Services', icon: 'hardware-chip-outline', bg: 'linear-gradient(135deg,#0f2027,#203a43)',  freelancer_count: 160, project_count: 15 },
    ];
    await db.collection('categories').insertMany(categories);
    console.log(`✅ ${categories.length} catégories insérées`);

    // ═══════════════════════════════════════════════════════
    // 3. USERS
    // ═══════════════════════════════════════════════════════
    const password = await bcrypt.hash('password123', 10);

    const users = [
      // Clients
      { _id: new ObjectId(), name: 'TechFlow Inc.',      email: 'contact@techflow.com',    password, role: 'client',     avatar: 'https://i.pravatar.cc/80?img=20', company: 'TechFlow Inc.',    is_verified: true,  trial_used: false, projects_count: 0, created_at: new Date('2023-01-15') },
      { _id: new ObjectId(), name: 'Startup Vision',     email: 'hr@startupvision.io',     password, role: 'client',     avatar: 'https://i.pravatar.cc/80?img=21', company: 'Startup Vision',   is_verified: true,  trial_used: true,  projects_count: 2, created_at: new Date('2023-03-10') },
      { _id: new ObjectId(), name: 'DigitalCraft',       email: 'jobs@digitalcraft.tn',    password, role: 'client',     avatar: 'https://i.pravatar.cc/80?img=22', company: 'DigitalCraft',     is_verified: false, trial_used: true,  projects_count: 1, created_at: new Date('2023-05-20') },
      { _id: new ObjectId(), name: 'E-Commerce Hub',     email: 'team@ecommercehub.com',   password, role: 'client',     avatar: 'https://i.pravatar.cc/80?img=23', company: 'E-Commerce Hub',   is_verified: true,  trial_used: true,  projects_count: 3, created_at: new Date('2023-06-01') },
      { _id: new ObjectId(), name: 'DevNation',          email: 'contact@devnation.dev',   password, role: 'client',     avatar: 'https://i.pravatar.cc/80?img=24', company: 'DevNation',        is_verified: true,  trial_used: true,  projects_count: 4, created_at: new Date('2023-07-15') },
      { _id: new ObjectId(), name: 'AIForge',            email: 'talent@aiforge.ai',       password, role: 'client',     avatar: 'https://i.pravatar.cc/80?img=27', company: 'AIForge',          is_verified: true,  trial_used: true,  projects_count: 2, created_at: new Date('2023-09-01') },
      // Freelancers
      { _id: new ObjectId(), name: 'Sarah El Mansouri',  email: 'sarah@gmail.com',         password, role: 'freelancer', avatar: 'https://i.pravatar.cc/80?img=5',  trial_used: true,  bids_count: 15, earnings_total: 8450, created_at: new Date('2021-01-10') },
      { _id: new ObjectId(), name: 'Alex Dupont',        email: 'alex@gmail.com',          password, role: 'freelancer', avatar: 'https://i.pravatar.cc/80?img=11', trial_used: true,  bids_count: 9,  earnings_total: 5200, created_at: new Date('2021-03-22') },
      { _id: new ObjectId(), name: 'Lina Bouzid',        email: 'lina@gmail.com',          password, role: 'freelancer', avatar: 'https://i.pravatar.cc/80?img=16', trial_used: true,  bids_count: 7,  earnings_total: 3100, created_at: new Date('2022-02-14') },
      { _id: new ObjectId(), name: 'Omar Chelly',        email: 'omar@gmail.com',          password, role: 'freelancer', avatar: 'https://i.pravatar.cc/80?img=33', trial_used: true,  bids_count: 21, earnings_total: 12800,created_at: new Date('2020-11-05') },
      { _id: new ObjectId(), name: 'Mehdi Trabelsi',     email: 'mehdi@gmail.com',         password, role: 'freelancer', avatar: 'https://i.pravatar.cc/80?img=7',  trial_used: true,  bids_count: 18, earnings_total: 9600, created_at: new Date('2021-06-18') },
      { _id: new ObjectId(), name: 'Amina Khelil',       email: 'amina@gmail.com',         password, role: 'freelancer', avatar: 'https://i.pravatar.cc/80?img=47', trial_used: false, bids_count: 3,  earnings_total: 1200, created_at: new Date('2022-04-30') },
      { _id: new ObjectId(), name: 'Karim Nasri',        email: 'karim@gmail.com',         password, role: 'freelancer', avatar: 'https://i.pravatar.cc/80?img=52', trial_used: true,  bids_count: 8,  earnings_total: 7300, created_at: new Date('2022-09-12') },
      { _id: new ObjectId(), name: 'Yasmine Hamdani',    email: 'yasmine@gmail.com',       password, role: 'freelancer', avatar: 'https://i.pravatar.cc/80?img=9',  trial_used: true,  bids_count: 12, earnings_total: 4100, created_at: new Date('2021-12-01') },
    ];
    await db.collection('users').insertMany(users);
    console.log(`✅ ${users.length} utilisateurs insérés`);

    const clients     = users.filter(u => u.role === 'client');
    const freelancers = users.filter(u => u.role === 'freelancer');

    // ═══════════════════════════════════════════════════════
    // 4. SUBSCRIPTIONS (abonnements actifs)
    // ═══════════════════════════════════════════════════════
    const basicPlan = plans.find(p => p.slug === 'basic');
    const freePlan  = plans.find(p => p.slug === 'free-trial');

    const subscriptions = [
      // Clients avec Basic
      { _id: new ObjectId(), user_id: clients[1]._id, plan_id: basicPlan._id, plan_slug: 'basic', status: 'active', started_at: new Date('2023-04-01'), expires_at: new Date('2026-04-01'), auto_renew: true,  payment_method: 'card', created_at: new Date('2023-04-01') },
      { _id: new ObjectId(), user_id: clients[2]._id, plan_id: basicPlan._id, plan_slug: 'basic', status: 'active', started_at: new Date('2023-06-01'), expires_at: new Date('2026-06-01'), auto_renew: true,  payment_method: 'card', created_at: new Date('2023-06-01') },
      { _id: new ObjectId(), user_id: clients[3]._id, plan_id: basicPlan._id, plan_slug: 'basic', status: 'active', started_at: new Date('2023-07-01'), expires_at: new Date('2026-07-01'), auto_renew: false, payment_method: 'paypal', created_at: new Date('2023-07-01') },
      { _id: new ObjectId(), user_id: clients[4]._id, plan_id: basicPlan._id, plan_slug: 'basic', status: 'active', started_at: new Date('2023-08-01'), expires_at: new Date('2026-08-01'), auto_renew: true,  payment_method: 'card', created_at: new Date('2023-08-01') },
      { _id: new ObjectId(), user_id: clients[5]._id, plan_id: basicPlan._id, plan_slug: 'basic', status: 'active', started_at: new Date('2023-10-01'), expires_at: new Date('2026-10-01'), auto_renew: true,  payment_method: 'card', created_at: new Date('2023-10-01') },
      // Client avec Free Trial
      { _id: new ObjectId(), user_id: clients[0]._id, plan_id: freePlan._id,  plan_slug: 'free-trial', status: 'active', started_at: new Date('2025-01-01'), expires_at: null, auto_renew: false, payment_method: null, created_at: new Date('2025-01-01') },
      // Freelancers avec Basic
      { _id: new ObjectId(), user_id: freelancers[0]._id, plan_id: basicPlan._id, plan_slug: 'basic', status: 'active', started_at: new Date('2021-02-01'), expires_at: new Date('2026-02-01'), auto_renew: true, payment_method: 'card', created_at: new Date('2021-02-01') },
      { _id: new ObjectId(), user_id: freelancers[3]._id, plan_id: basicPlan._id, plan_slug: 'basic', status: 'active', started_at: new Date('2021-01-01'), expires_at: new Date('2026-01-01'), auto_renew: true, payment_method: 'card', created_at: new Date('2021-01-01') },
      { _id: new ObjectId(), user_id: freelancers[4]._id, plan_id: basicPlan._id, plan_slug: 'basic', status: 'active', started_at: new Date('2021-07-01'), expires_at: new Date('2026-07-01'), auto_renew: true, payment_method: 'paypal', created_at: new Date('2021-07-01') },
      { _id: new ObjectId(), user_id: freelancers[6]._id, plan_id: basicPlan._id, plan_slug: 'basic', status: 'active', started_at: new Date('2022-10-01'), expires_at: new Date('2026-10-01'), auto_renew: true, payment_method: 'card', created_at: new Date('2022-10-01') },
      // Freelancers Free Trial
      { _id: new ObjectId(), user_id: freelancers[5]._id, plan_id: freePlan._id, plan_slug: 'free-trial', status: 'active', started_at: new Date('2022-05-01'), expires_at: null, auto_renew: false, payment_method: null, created_at: new Date('2022-05-01') },
    ];
    await db.collection('subscriptions').insertMany(subscriptions);
    console.log(`✅ ${subscriptions.length} abonnements insérés`);

    // ═══════════════════════════════════════════════════════
    // 5. FREELANCER PROFILES
    // ═══════════════════════════════════════════════════════
    const freelancerProfiles = [
      {
        user_id: freelancers[0]._id, name: 'Sarah El Mansouri', avatar: 'https://i.pravatar.cc/80?img=5',
        title: 'Senior UI/UX Designer', bio: 'Passionate UI/UX designer with 6+ years crafting delightful digital experiences. I specialize in SaaS and mobile apps.',
        category: 'uiux-design', skills: ['Figma', 'Prototyping', 'Design System', 'User Research', 'Adobe XD'],
        hourly_rate: 45, location: 'Tunis, TN', languages: ['French', 'Arabic', 'English'],
        is_available: true, is_top_rated: true, rating: 4.9, review_count: 127, completed_jobs: 89, response_time: '< 1h',
        education: [{ degree: 'Master Design', school: 'Université de Tunis', year: 2018, department: 'Design' }],
        experience: [{ title: 'Lead Designer', company: 'Tech Studio', from: '2019', to: '2023', description: 'Led UI/UX team' }],
        portfolio: [
          { title: 'SaaS Dashboard Redesign', bg: 'linear-gradient(135deg,#1a1a2e,#0f3460)' },
          { title: 'Fintech Mobile App',      bg: 'linear-gradient(135deg,#4a0072,#7b1fa2)' },
          { title: 'E-Commerce UX',           bg: 'linear-gradient(135deg,#004d40,#00897b)' },
          { title: 'Brand Identity',          bg: 'linear-gradient(135deg,#b71c1c,#e53935)' },
        ],
        // Stats financières
        earnings_total:      8450,
        earnings_after_fees: 8027.5,  // 8450 * 0.95
        platform_fees_paid:  422.5,
        created_at: new Date('2021-01-10')
      },
      {
        user_id: freelancers[1]._id, name: 'Alex Dupont', avatar: 'https://i.pravatar.cc/80?img=11',
        title: 'Product Designer & UX Researcher', bio: 'I help startups validate and ship products faster. 5+ years in product design.',
        category: 'uiux-design', skills: ['User Research', 'Wireframing', 'Adobe XD', 'Figma', 'Usability Testing'],
        hourly_rate: 60, location: 'Paris, FR', languages: ['French', 'English'],
        is_available: true, is_top_rated: true, rating: 4.8, review_count: 94, completed_jobs: 62, response_time: '< 2h',
        education: [], experience: [],
        portfolio: [
          { title: 'B2B SaaS Platform', bg: 'linear-gradient(135deg,#1a1a2e,#16213e)' },
          { title: 'Healthcare App',    bg: 'linear-gradient(135deg,#0f9b8e,#000000)' },
          { title: 'Travel App UX',     bg: 'linear-gradient(135deg,#396afc,#2948ff)' },
        ],
        earnings_total: 5200, earnings_after_fees: 4940, platform_fees_paid: 260, created_at: new Date('2021-03-22')
      },
      {
        user_id: freelancers[2]._id, name: 'Lina Bouzid', avatar: 'https://i.pravatar.cc/80?img=16',
        title: 'Mobile App UI Designer', bio: 'Specialized in mobile-first UI design. Available for iOS and Android projects.',
        category: 'uiux-design', skills: ['Mobile UI', 'Figma', 'Illustration', 'Prototyping'],
        hourly_rate: 30, location: 'Sfax, TN', languages: ['Arabic', 'French'],
        is_available: false, is_top_rated: false, rating: 4.7, review_count: 58, completed_jobs: 41, response_time: '< 4h',
        education: [], experience: [],
        portfolio: [
          { title: 'Food Delivery App', bg: 'linear-gradient(135deg,#f7971e,#ffd200)' },
          { title: 'Fitness App',       bg: 'linear-gradient(135deg,#11998e,#38ef7d)' },
        ],
        earnings_total: 3100, earnings_after_fees: 2945, platform_fees_paid: 155, created_at: new Date('2022-02-14')
      },
      {
        user_id: freelancers[3]._id, name: 'Omar Chelly', avatar: 'https://i.pravatar.cc/80?img=33',
        title: 'UX/UI & Front-End Designer', bio: 'Full-stack designer who also codes. Expert in React and Figma.',
        category: 'uiux-design', skills: ['Figma', 'HTML/CSS', 'React', 'Design System', 'Tailwind'],
        hourly_rate: 50, location: 'Remote', languages: ['Arabic', 'French', 'English'],
        is_available: true, is_top_rated: true, rating: 4.9, review_count: 201, completed_jobs: 134, response_time: '< 1h',
        education: [], experience: [],
        portfolio: [
          { title: 'Startup Landing Page', bg: 'linear-gradient(135deg,#8B1A3A,#C0395A)' },
          { title: 'Admin Dashboard',      bg: 'linear-gradient(135deg,#0f2027,#203a43)' },
          { title: 'Portfolio Website',    bg: 'linear-gradient(135deg,#834d9b,#d04ed6)' },
        ],
        earnings_total: 12800, earnings_after_fees: 12160, platform_fees_paid: 640, created_at: new Date('2020-11-05')
      },
      {
        user_id: freelancers[4]._id, name: 'Mehdi Trabelsi', avatar: 'https://i.pravatar.cc/80?img=7',
        title: 'Full Stack React Developer', bio: 'Passionate full-stack developer with expertise in React ecosystem.',
        category: 'program-tech', skills: ['React', 'Node.js', 'PostgreSQL', 'TypeScript', 'AWS'],
        hourly_rate: 55, location: 'Tunis, TN', languages: ['Arabic', 'French', 'English'],
        is_available: true, is_top_rated: true, rating: 4.8, review_count: 183, completed_jobs: 112, response_time: '< 1h',
        education: [], experience: [],
        portfolio: [
          { title: 'SaaS Platform',      bg: 'linear-gradient(135deg,#11998e,#38ef7d)' },
          { title: 'Real-time Chat App', bg: 'linear-gradient(135deg,#396afc,#2948ff)' },
        ],
        earnings_total: 9600, earnings_after_fees: 9120, platform_fees_paid: 480, created_at: new Date('2021-06-18')
      },
      {
        user_id: freelancers[5]._id, name: 'Amina Khelil', avatar: 'https://i.pravatar.cc/80?img=47',
        title: 'Digital Marketing Specialist', bio: 'Growth-focused digital marketer. Managed $500K+ in ad spend.',
        category: 'digital-marketing', skills: ['SEO', 'Google Ads', 'Social Media', 'Content Strategy', 'Meta Ads'],
        hourly_rate: 35, location: 'Tunis, TN', languages: ['Arabic', 'French', 'English'],
        is_available: true, is_top_rated: false, rating: 4.7, review_count: 76, completed_jobs: 54, response_time: '< 3h',
        education: [], experience: [],
        portfolio: [
          { title: 'SEO Campaign',        bg: 'linear-gradient(135deg,#f7971e,#ffd200)' },
          { title: 'Google Ads Strategy', bg: 'linear-gradient(135deg,#FF6B6B,#ee0979)' },
        ],
        earnings_total: 1200, earnings_after_fees: 1200, platform_fees_paid: 0, // free trial → 0 commission
        created_at: new Date('2022-04-30')
      },
      {
        user_id: freelancers[6]._id, name: 'Karim Nasri', avatar: 'https://i.pravatar.cc/80?img=52',
        title: 'AI/ML Engineer', bio: 'AI engineer specializing in NLP and LLM applications.',
        category: 'ai-services', skills: ['Python', 'TensorFlow', 'LangChain', 'OpenAI API', 'RAG', 'FastAPI'],
        hourly_rate: 80, location: 'Remote', languages: ['Arabic', 'English'],
        is_available: true, is_top_rated: true, rating: 4.9, review_count: 44, completed_jobs: 28, response_time: '< 2h',
        education: [], experience: [],
        portfolio: [
          { title: 'NLP Chatbot',            bg: 'linear-gradient(135deg,#0f2027,#203a43)' },
          { title: 'Document AI System',     bg: 'linear-gradient(135deg,#834d9b,#d04ed6)' },
          { title: 'Recommendation Engine', bg: 'linear-gradient(135deg,#11998e,#38ef7d)' },
        ],
        earnings_total: 7300, earnings_after_fees: 6935, platform_fees_paid: 365, created_at: new Date('2022-09-12')
      },
      {
        user_id: freelancers[7]._id, name: 'Yasmine Hamdani', avatar: 'https://i.pravatar.cc/80?img=9',
        title: 'Brand & Graphic Designer', bio: 'Creative graphic designer with a keen eye for branding.',
        category: 'graphic-design', skills: ['Illustrator', 'Branding', 'Print', 'Photoshop', 'Logo Design'],
        hourly_rate: 25, location: 'Bizerte, TN', languages: ['Arabic', 'French'],
        is_available: false, is_top_rated: false, rating: 4.6, review_count: 89, completed_jobs: 67, response_time: '< 6h',
        education: [], experience: [],
        portfolio: [
          { title: 'Brand Identity Kit', bg: 'linear-gradient(135deg,#FF6B6B,#ee0979)' },
          { title: 'Product Packaging',  bg: 'linear-gradient(135deg,#f7971e,#ffd200)' },
        ],
        earnings_total: 4100, earnings_after_fees: 3895, platform_fees_paid: 205, created_at: new Date('2021-12-01')
      },
    ];

    const flResult = await db.collection('freelancers').insertMany(freelancerProfiles);
    const flIds    = Object.values(flResult.insertedIds);
    console.log(`✅ ${freelancerProfiles.length} profils freelancers insérés`);

    // ═══════════════════════════════════════════════════════
    // 6. PROJECTS
    // ═══════════════════════════════════════════════════════
    const projects = [
      {
        client_id: clients[0]._id, company: 'TechFlow Inc.', company_logo: 'https://i.pravatar.cc/40?img=20',
        title: 'Senior UI/UX Designer for SaaS Dashboard', description: 'We need an experienced UI/UX designer to redesign our analytics dashboard.',
        category: 'uiux-design', tags: ['Figma', 'Design System', 'SaaS'],
        budget_min: 2000, budget_max: 4000, duration: '3 months', location: 'Remote',
        is_remote: true, is_verified: true, applicants: 18, status: 'open',
        // Facturation
        is_trial_project: true,                 // 1er projet → essai gratuit
        commission_rate_client: 0,              // 0% car trial
        commission_rate_freelancer: 0,
        requirements: ['3+ years UI/UX', 'Portfolio SaaS', 'Figma expert'],
        responsibilities: ['Redesign dashboard', 'Design system', 'User research'],
        created_at: new Date('2025-01-28')
      },
      {
        client_id: clients[1]._id, company: 'Startup Vision', company_logo: 'https://i.pravatar.cc/40?img=21',
        title: 'Mobile App Designer – Fintech App', description: 'Looking for a creative designer for our fintech app.',
        category: 'uiux-design', tags: ['Mobile', 'Fintech', 'Prototype'],
        budget_min: 800, budget_max: 1500, duration: '6 weeks', location: 'Remote',
        is_remote: true, is_verified: true, applicants: 32, status: 'open',
        is_trial_project: false,
        commission_rate_client: 5,              // 5% → commission standard
        commission_rate_freelancer: 5,
        requirements: ['2+ ans mobile UX', 'Portfolio fintech'],
        responsibilities: ['Design all screens', 'Figma prototype', 'Component library'],
        created_at: new Date('2025-01-25')
      },
      {
        client_id: clients[2]._id, company: 'DigitalCraft', company_logo: 'https://i.pravatar.cc/40?img=22',
        title: 'Brand Identity & Landing Page Designer', description: 'Nous avons besoin d\'un kit de marque complet.',
        category: 'graphic-design', tags: ['Branding', 'Landing Page', 'Figma'],
        budget_min: 300, budget_max: 700, duration: '2 weeks', location: 'Remote / Tunis',
        is_remote: false, is_verified: false, applicants: 9, status: 'open',
        is_trial_project: false, commission_rate_client: 5, commission_rate_freelancer: 5,
        requirements: ['Portfolio branding', 'Landing page experience'],
        responsibilities: ['Logo + brand identity', 'Brand guidelines', 'Landing page mockup'],
        created_at: new Date('2025-01-24')
      },
      {
        client_id: clients[3]._id, company: 'E-Commerce Hub', company_logo: 'https://i.pravatar.cc/40?img=23',
        title: 'E-Commerce UX Audit & Redesign', description: 'Our conversion rate is low. Need a senior UX specialist.',
        category: 'uiux-design', tags: ['E-Commerce', 'UX Audit', 'Shopify'],
        budget_min: 1200, budget_max: 2500, duration: '2 months', location: 'Remote',
        is_remote: true, is_verified: true, applicants: 14, status: 'open',
        is_trial_project: false, commission_rate_client: 5, commission_rate_freelancer: 5,
        requirements: ['4+ ans UX', 'E-commerce portfolio', 'Shopify'],
        responsibilities: ['UX audit', 'Redesign checkout', 'Livraison Figma'],
        created_at: new Date('2025-01-22')
      },
      {
        client_id: clients[4]._id, company: 'DevNation', company_logo: 'https://i.pravatar.cc/40?img=24',
        title: 'React Native Developer – Social App', description: 'Build a social media app from scratch.',
        category: 'program-tech', tags: ['React Native', 'Firebase', 'Social'],
        budget_min: 3000, budget_max: 6000, duration: '4 months', location: 'Remote',
        is_remote: true, is_verified: true, applicants: 41, status: 'in-progress',
        is_trial_project: false, commission_rate_client: 5, commission_rate_freelancer: 5,
        assigned_freelancer_id: flIds[4],
        requirements: ['3+ ans React Native', 'Firebase', 'Apps publiées'],
        responsibilities: ['Build full app', 'Real-time chat', 'CI/CD'],
        created_at: new Date('2025-01-20')
      },
      {
        client_id: clients[5]._id, company: 'AIForge', company_logo: 'https://i.pravatar.cc/40?img=27',
        title: 'AI/ML Engineer – NLP Customer Support Bot', description: 'Build a customer support chatbot using LLMs.',
        category: 'ai-services', tags: ['Python', 'NLP', 'LangChain', 'RAG'],
        budget_min: 5000, budget_max: 9000, duration: '5 months', location: 'Remote',
        is_remote: true, is_verified: true, applicants: 22, status: 'open',
        is_trial_project: false, commission_rate_client: 5, commission_rate_freelancer: 5,
        requirements: ['3+ ans Python ML', 'LangChain', 'RAG architecture'],
        responsibilities: ['RAG pipeline', 'Knowledge base integration', 'Production deployment'],
        created_at: new Date('2025-01-18')
      },
    ];

    const projResult = await db.collection('projects').insertMany(projects);
    const projIds    = Object.values(projResult.insertedIds);
    console.log(`✅ ${projects.length} projets insérés`);

    // ═══════════════════════════════════════════════════════
    // 7. APPLICATIONS (candidatures / bids)
    // ═══════════════════════════════════════════════════════
    const applications = [
      { _id: new ObjectId(), project_id: projIds[0], freelancer_id: flIds[0], bid_amount: 2500, cover_letter: 'I have 6 years of experience designing SaaS dashboards.', status: 'pending',  created_at: new Date('2025-01-29') },
      { _id: new ObjectId(), project_id: projIds[0], freelancer_id: flIds[1], bid_amount: 3200, cover_letter: 'As a product designer with deep UX research background.',  status: 'pending',  created_at: new Date('2025-01-29') },
      { _id: new ObjectId(), project_id: projIds[1], freelancer_id: flIds[2], bid_amount: 1100, cover_letter: 'Mobile-first designer specialized in fintech apps.',          status: 'pending',  created_at: new Date('2025-01-26') },
      { _id: new ObjectId(), project_id: projIds[4], freelancer_id: flIds[4], bid_amount: 4500, cover_letter: 'I have built 3 social apps with React Native and Firebase.',  status: 'accepted', created_at: new Date('2025-01-21') },
      { _id: new ObjectId(), project_id: projIds[5], freelancer_id: flIds[6], bid_amount: 7500, cover_letter: 'Built production RAG systems for Fortune 500 clients.',        status: 'pending',  created_at: new Date('2025-01-19') },
    ];
    await db.collection('applications').insertMany(applications);
    console.log(`✅ ${applications.length} candidatures insérées`);

    // ═══════════════════════════════════════════════════════
    // 8. TRANSACTIONS & COMMISSIONS
    // ═══════════════════════════════════════════════════════
    const transactions = [
      {
        _id:              new ObjectId(),
        type:             'project_payment',
        project_id:       projIds[4],
        client_id:        clients[4]._id,
        freelancer_id:    flIds[4],
        gross_amount:     4500,        // Montant du bid
        // Côté client : paie 5% de commission
        client_pays:      4725,        // 4500 * 1.05
        client_commission: 225,        // 5% de 4500
        // Côté freelancer : reçoit moins 5%
        freelancer_receives: 4275,     // 4500 * 0.95
        freelancer_commission: 225,    // 5% de 4500
        // Plateforme gagne
        platform_revenue: 450,         // 225 (client) + 225 (freelancer)
        currency:         'USD',
        status:           'completed',
        is_trial:         false,
        created_at:       new Date('2025-01-22')
      },
      {
        _id:              new ObjectId(),
        type:             'project_payment',
        project_id:       projIds[0],
        client_id:        clients[0]._id,
        freelancer_id:    flIds[0],
        gross_amount:     2500,
        // Essai gratuit → 0% commission
        client_pays:      2500,
        client_commission: 0,
        freelancer_receives: 2500,
        freelancer_commission: 0,
        platform_revenue: 0,
        currency:         'USD',
        status:           'completed',
        is_trial:         true,        // ✅ Essai gratuit
        created_at:       new Date('2025-01-30')
      },
      {
        _id:              new ObjectId(),
        type:             'subscription',
        user_id:          clients[1]._id,
        plan_slug:        'basic',
        amount:           19,
        currency:         'USD',
        status:           'completed',
        billing_period:   'month',
        created_at:       new Date('2025-01-01')
      },
    ];
    await db.collection('transactions').insertMany(transactions);
    console.log(`✅ ${transactions.length} transactions insérées`);

    // ═══════════════════════════════════════════════════════
    // 9. CONVERSATIONS & MESSAGES
    // ═══════════════════════════════════════════════════════
    const conversations = [
      {
        _id:          new ObjectId(),
        participants: [clients[0]._id, freelancers[0]._id],
        project_id:   projIds[0],
        job_id:       'JD-1298',
        company:      'TechFlow Inc.',
        last_message: 'Looking forward to working with you!',
        last_at:      new Date('2025-01-30T10:00:00Z'),
        unread_count: { [clients[0]._id]: 0, [freelancers[0]._id]: 1 },
        created_at:   new Date('2025-01-28')
      },
      {
        _id:          new ObjectId(),
        participants: [clients[1]._id, freelancers[2]._id],
        project_id:   projIds[1],
        job_id:       'JD-3259',
        company:      'Startup Vision',
        last_message: 'Can you share your portfolio?',
        last_at:      new Date('2025-01-29T15:30:00Z'),
        unread_count: { [clients[1]._id]: 2, [freelancers[2]._id]: 0 },
        created_at:   new Date('2025-01-25')
      },
      {
        _id:          new ObjectId(),
        participants: [clients[2]._id, freelancers[7]._id],
        project_id:   projIds[2],
        job_id:       'JD-8722',
        company:      'Exola Movers',
        last_message: 'I can start on Monday.',
        last_at:      new Date('2025-01-28T09:00:00Z'),
        unread_count: { [clients[2]._id]: 0, [freelancers[7]._id]: 0 },
        created_at:   new Date('2025-01-24')
      },
      {
        _id:          new ObjectId(),
        participants: [clients[3]._id, freelancers[3]._id],
        project_id:   projIds[3],
        job_id:       'JD-4550',
        company:      'Aceabie Inc.',
        last_message: 'Please review the revised proposal.',
        last_at:      new Date('2025-01-27T11:00:00Z'),
        unread_count: { [clients[3]._id]: 1, [freelancers[3]._id]: 0 },
        created_at:   new Date('2025-01-22')
      },
      {
        _id:          new ObjectId(),
        participants: [clients[4]._id, freelancers[4]._id],
        project_id:   projIds[4],
        job_id:       'JD-455',
        company:      'Percepta PVT Limited',
        last_message: 'Milestone 1 completed!',
        last_at:      new Date('2025-01-26T16:00:00Z'),
        unread_count: { [clients[4]._id]: 0, [freelancers[4]._id]: 0 },
        created_at:   new Date('2025-01-20')
      },
    ];
    const convResult = await db.collection('conversations').insertMany(conversations);
    const convIds    = Object.values(convResult.insertedIds);
    console.log(`✅ ${conversations.length} conversations insérées`);

    const messages = [
      // Conversation 1
      { conversation_id: convIds[0], sender_id: clients[0]._id,     content: 'Hi Sarah! I saw your portfolio and I am really impressed.', type: 'text', read: true,  created_at: new Date('2025-01-28T09:00:00Z') },
      { conversation_id: convIds[0], sender_id: freelancers[0]._id, content: 'Thank you! I would love to hear more about the project.',      type: 'text', read: true,  created_at: new Date('2025-01-28T09:15:00Z') },
      { conversation_id: convIds[0], sender_id: clients[0]._id,     content: 'We need a complete redesign of our SaaS dashboard.',          type: 'text', read: true,  created_at: new Date('2025-01-28T09:20:00Z') },
      { conversation_id: convIds[0], sender_id: freelancers[0]._id, content: 'I have done similar projects. Can we schedule a call?',        type: 'text', read: true,  created_at: new Date('2025-01-28T09:30:00Z') },
      { conversation_id: convIds[0], sender_id: clients[0]._id,     content: 'Sure! Tomorrow at 10am?',                                     type: 'text', read: true,  created_at: new Date('2025-01-29T10:00:00Z') },
      { conversation_id: convIds[0], sender_id: freelancers[0]._id, content: 'Looking forward to working with you!',                         type: 'text', read: false, created_at: new Date('2025-01-30T10:00:00Z') },
      // Conversation 2
      { conversation_id: convIds[1], sender_id: clients[1]._id,     content: 'Hello Lina! We are looking for a mobile designer for a fintech app.', type: 'text', read: true,  created_at: new Date('2025-01-25T10:00:00Z') },
      { conversation_id: convIds[1], sender_id: freelancers[2]._id, content: 'Great! I specialize in mobile UI design.',                             type: 'text', read: true,  created_at: new Date('2025-01-25T10:30:00Z') },
      { conversation_id: convIds[1], sender_id: clients[1]._id,     content: 'Can you share your portfolio?',                                        type: 'text', read: false, created_at: new Date('2025-01-29T15:30:00Z') },
    ];
    await db.collection('messages').insertMany(messages);
    console.log(`✅ ${messages.length} messages insérés`);

    // ═══════════════════════════════════════════════════════
    // 10. REVIEWS
    // ═══════════════════════════════════════════════════════
    const reviews = [
      { freelancer_id: flIds[0], client_id: clients[0]._id, project_id: projIds[0], project_title: 'SaaS Dashboard Redesign', rating: 5, comment: 'Exceptional work! Increased user retention by 40%.', author_name: 'TechFlow CEO', author_avatar: 'https://i.pravatar.cc/40?img=60', created_at: new Date('2025-01-30') },
      { freelancer_id: flIds[0], client_id: clients[1]._id, project_id: projIds[1], project_title: 'Fintech App Design',      rating: 5, comment: 'Very professional. Delivered on time.',             author_name: 'Startup Vision', author_avatar: 'https://i.pravatar.cc/40?img=61', created_at: new Date('2024-12-20') },
      { freelancer_id: flIds[0], client_id: clients[2]._id, project_id: projIds[2], project_title: 'Brand Identity',          rating: 4, comment: 'Great attention to detail. Would hire again.',      author_name: 'DigitalCraft',   author_avatar: 'https://i.pravatar.cc/40?img=62', created_at: new Date('2024-11-15') },
      { freelancer_id: flIds[4], client_id: clients[4]._id, project_id: projIds[4], project_title: 'React Native Social App', rating: 5, comment: 'Delivered 1 week ahead of schedule. Excellent code quality.', author_name: 'DevNation', author_avatar: 'https://i.pravatar.cc/40?img=64', created_at: new Date('2024-09-30') },
      { freelancer_id: flIds[6], client_id: clients[5]._id, project_id: projIds[5], project_title: 'NLP Chatbot',             rating: 5, comment: 'The chatbot handles 95% of support queries automatically.', author_name: 'AIForge', author_avatar: 'https://i.pravatar.cc/40?img=65', created_at: new Date('2024-09-01') },
    ];
    await db.collection('reviews').insertMany(reviews);
    console.log(`✅ ${reviews.length} avis insérés`);

    // ═══════════════════════════════════════════════════════
    // 11. INDEX
    // ═══════════════════════════════════════════════════════
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('freelancers').createIndex({ category: 1 });
    await db.collection('freelancers').createIndex({ rating: -1 });
    await db.collection('freelancers').createIndex({ is_available: 1 });
    await db.collection('projects').createIndex({ category: 1 });
    await db.collection('projects').createIndex({ status: 1 });
    await db.collection('projects').createIndex({ created_at: -1 });
    await db.collection('reviews').createIndex({ freelancer_id: 1 });
    await db.collection('categories').createIndex({ slug: 1 }, { unique: true });
    await db.collection('conversations').createIndex({ participants: 1 });
    await db.collection('messages').createIndex({ conversation_id: 1, created_at: 1 });
    await db.collection('transactions').createIndex({ client_id: 1 });
    await db.collection('transactions').createIndex({ freelancer_id: 1 });
    await db.collection('subscriptions').createIndex({ user_id: 1 });
    await db.collection('plans').createIndex({ slug: 1 }, { unique: true });
    console.log('✅ Index créés');

    // ═══════════════════════════════════════════════════════
    // RÉSUMÉ
    // ═══════════════════════════════════════════════════════
    console.log('\n🎉 Base de données v2 initialisée avec succès !');
    console.log('══════════════════════════════════════════════');
    console.log(`📁 Base         : ${DB_NAME}`);
    console.log(`📂 Collections  :`);
    console.log(`   • plans          : ${plans.length} (Free Trial, Basic $19, Pro $49)`);
    console.log(`   • categories     : ${categories.length}`);
    console.log(`   • users          : ${users.length} (6 clients + 8 freelancers)`);
    console.log(`   • subscriptions  : ${subscriptions.length}`);
    console.log(`   • freelancers    : ${freelancerProfiles.length}`);
    console.log(`   • projects       : ${projects.length}`);
    console.log(`   • applications   : ${applications.length}`);
    console.log(`   • transactions   : ${transactions.length}`);
    console.log(`   • conversations  : ${conversations.length}`);
    console.log(`   • messages       : ${messages.length}`);
    console.log(`   • reviews        : ${reviews.length}`);
    console.log('══════════════════════════════════════════════');
    console.log('💰 Modèle de commission :');
    console.log('   • 1er projet      → GRATUIT (0% commission)');
    console.log('   • Projets suivants→ 5% client + 5% freelancer');
    console.log('   • Abonnement Basic → $19/mois (essai 14j)');
    console.log('══════════════════════════════════════════════');
    console.log('🔑 Comptes de test (mdp: password123)');
    console.log('   Client     : contact@techflow.com (Free Trial)');
    console.log('   Client     : hr@startupvision.io  (Basic)');
    console.log('   Freelancer : sarah@gmail.com       (Basic)');
    console.log('   Freelancer : amina@gmail.com       (Free Trial)');
    console.log('══════════════════════════════════════════════');

  } catch (err) {
    console.error('❌ Erreur:', err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

seed();