import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, IonSpinner } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { bag, camera, cash, checkmark, codeSlash, colorPalette, megaphone, musicalNotes, personCircle, refresh, time } from 'ionicons/icons';
import { apiAuthHeaders, apiUrl, getSessionUser } from '../shared/api-url';
import {
  CategoriesListDto,
  ProjectsListDto,
  ProjectDocumentDto,
  CategoryDto,
  NotificationsListDto,
  ConversationsListDto,
  ApplicationsListDto,
  MyProjectsDto,
} from '../shared/api.dto';
import { AccountMenuComponent } from '../shared/account-menu.component';
import { categorySymbol, resolveProjectCategorySlug } from '../shared/service-ui';
import { UserBottomNavComponent } from '../shared/user-bottom-nav.component';

interface DashboardMetric {
  label: string;
  value: string;
  tone: 'primary' | 'success' | 'neutral';
  icon?: string;
  badge?: string;
}

interface FocusCard {
  eyebrow: string;
  title: string;
  copy: string;
  action: string;
  icon?: string;
  tone?: 'execution' | 'credibility' | 'finance';
}

interface RevenueBar {
  day: string;
  value: number;
  amount: number;
}

interface WalletTransaction {
  status?: string;
  type?: string;
  freelancer_receives?: number;
  freelancer_commission?: number;
  released_at?: string;
  created_at?: string;
}

interface ServiceCard {
  name: string;
  slug: string;
  icon: string;
  opportunities: number;
  badge?: string;
}

addIcons({ bag, camera, cash, checkmark, codeSlash, colorPalette, megaphone, musicalNotes, personCircle, refresh, time });

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, IonContent, IonButton, IonIcon, IonSpinner, UserBottomNavComponent, AccountMenuComponent],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage implements OnInit {
  loading = true;
  user = getSessionUser();
  categories: CategoryDto[] = [];
  projects: ProjectDocumentDto[] = [];
  unreadNotifications = 0;
  unreadMessages = 0;
  dashboardMetrics: DashboardMetric[] = [];
  focusCards: FocusCard[] = [];
  spotlightProjects: ProjectDocumentDto[] = [];
  dashboardHeadline = '';
  dashboardCopy = '';
  revenueTotal = 0;
  revenueCommission = 0;
  revenueBars: RevenueBar[] = [
    { day: 'J-6', value: 0, amount: 0 },
    { day: 'J-5', value: 0, amount: 0 },
    { day: 'J-4', value: 0, amount: 0 },
    { day: 'J-3', value: 0, amount: 0 },
    { day: 'J-2', value: 0, amount: 0 },
    { day: 'Hier', value: 0, amount: 0 },
    { day: 'Auj', value: 0, amount: 0 },
  ];
  serviceCards: ServiceCard[] = [];

  constructor(private router: Router) {}

  get isClient() {
    return this.user?.role === 'client';
  }

  async ngOnInit() {
    if (this.user?.role === 'admin') {
      void this.router.navigate(['/admin']);
      return;
    }
    try {
      const [categoriesRes, projectsRes] = await Promise.all([
        fetch(apiUrl('/api/categories?counts=true')),
        fetch(apiUrl('/api/projects?status=open&page_size=8')),
      ]);
      if (categoriesRes.ok) {
        const data = await categoriesRes.json() as CategoriesListDto;
        this.categories = data.categories || [];
        this.buildServiceCards();
      }
      if (projectsRes.ok) {
        const data = await projectsRes.json() as ProjectsListDto;
        this.projects = data.projects || [];
        this.spotlightProjects = this.projects.slice(0, 4);
      }
      if (this.user) {
        await Promise.all([
          this.loadNotificationsCount(),
          this.loadUnreadMessagesCount(),
          this.loadDashboardInsights(),
        ]);
      }
      this.buildStaticHeroCopy();
    } finally {
      this.loading = false;
    }
  }

  async loadNotificationsCount() {
    const res = await fetch(apiUrl('/api/notifications?page_size=1'), { headers: apiAuthHeaders(false) });
    if (!res.ok) return;
    const data = await res.json() as NotificationsListDto;
    this.unreadNotifications = data.unread_count || 0;
  }

  async loadUnreadMessagesCount() {
    const res = await fetch(apiUrl('/api/messages'), { headers: apiAuthHeaders(false) });
    if (!res.ok) return;
    const data = await res.json() as ConversationsListDto;
    this.unreadMessages = (data.conversations || []).reduce((total, conv) => {
      return total + (conv.unread_count || 0);
    }, 0);
  }

  async loadDashboardInsights() {
    if (this.isClient) {
      await this.loadClientInsights();
      return;
    }
    await this.loadFreelancerInsights();
  }

  async loadClientInsights() {
    const res = await fetch(apiUrl('/api/projects/my'), { headers: apiAuthHeaders(false) });
    if (!res.ok) {
      this.buildStaticHeroCopy();
      return;
    }

    const data = await res.json() as MyProjectsDto;
    const projects = data.projects || [];
    const openProjects = projects.filter(project => (project.status || 'open') === 'open');
    const activeProjects = projects.filter(project => (project.status || '') === 'in-progress');
    const completedProjects = projects.filter(project => (project.status || '') === 'completed');
    const totalApplicants = projects.reduce((sum, project) => {
      return sum + Number(project.applicants ?? project.applicants_count ?? 0);
    }, 0);

    this.dashboardHeadline = activeProjects.length
      ? `${activeProjects.length} mission${activeProjects.length > 1 ? 's' : ''} avance${activeProjects.length > 1 ? 'nt' : ''} en ce moment`
      : 'Votre pipeline client est pret';
    this.dashboardCopy = openProjects.length
      ? `Vous avez ${openProjects.length} projet${openProjects.length > 1 ? 's' : ''} ouvert${openProjects.length > 1 ? 's' : ''} et ${totalApplicants} candidature${totalApplicants > 1 ? 's' : ''} a suivre.`
      : 'Publiez une nouvelle demande pour attirer rapidement des profils qualifies.';

    this.dashboardMetrics = [
      { label: 'Projets publies', value: `${projects.length}`, tone: 'primary' },
      { label: 'En cours', value: `${activeProjects.length}`, tone: 'success' },
      { label: 'Termines', value: `${completedProjects.length}`, tone: 'neutral' },
      { label: 'Candidatures', value: `${totalApplicants}`, tone: 'primary' },
    ];

    this.focusCards = [
      {
        eyebrow: 'Pilotage',
        title: 'Suivre vos candidats sans friction',
        copy: 'Passez des projets ouverts aux profils en quelques gestes depuis votre dashboard.',
        action: 'Voir les candidatures',
      },
      {
        eyebrow: 'Acceleration',
        title: 'Lancer une nouvelle demande claire',
        copy: 'Publiez un besoin structure pour recevoir de meilleures propositions.',
        action: 'Creer un projet',
      },
    ];
  }

  async loadFreelancerInsights() {
    const [applicationsRes, completedRes, walletRes] = await Promise.all([
      fetch(apiUrl('/api/users/applications'), { headers: apiAuthHeaders(false) }),
      fetch(apiUrl('/api/projects/freelancer?status=completed'), { headers: apiAuthHeaders(false) }),
      fetch(apiUrl('/api/payments/wallet'), { headers: apiAuthHeaders(false) }),
    ]);

    const applications = applicationsRes.ok
      ? ((await applicationsRes.json() as ApplicationsListDto).applications || [])
      : [];
    const completedProjects = completedRes.ok
      ? ((await completedRes.json() as ProjectsListDto).projects || [])
      : [];
    const wallet = walletRes.ok
      ? (await walletRes.json() as { balance?: Record<string, number>; transactions?: WalletTransaction[] })
      : { balance: {}, transactions: [] };

    const activeApplications = applications.filter(app => ['accepted', 'in-progress'].includes(app.status || ''));
    const pendingApplications = applications.filter(app => (app.status || 'pending') === 'pending');
    const reviewedApplications = applications.filter(app => ['accepted', 'rejected'].includes(app.status || ''));
    const totalProjectedNet = activeApplications.reduce((sum, app) => {
      return sum + Number(app.net_amount ?? app.bid_amount ?? 0);
    }, 0);
    const fallbackProjectedNet = applications.reduce((sum, app) => {
      return sum + Number(app.net_amount ?? app.bid_amount ?? 0);
    }, 0);

    const walletEarned = Number(wallet.balance?.['earned_total'] || 0);
    this.revenueTotal = Math.round(walletEarned || totalProjectedNet || fallbackProjectedNet);
    this.revenueCommission = Math.round(Number(wallet.balance?.['fees_paid'] || 0));
    this.revenueBars = this.buildRevenueSeries(wallet.transactions || []);

    this.dashboardHeadline = activeApplications.length
      ? `${activeApplications.length} projet${activeApplications.length > 1 ? 's' : ''} actif${activeApplications.length > 1 ? 's' : ''} a livrer`
      : 'Votre vitrine freelance est prete';
    this.dashboardCopy = completedProjects.length
      ? `Vous avez deja finalise ${completedProjects.length} mission${completedProjects.length > 1 ? 's' : ''} et vos resultats meritent d etre visibles.`
      : 'Activez vos propositions, structurez vos suivis et montrez une image plus professionnelle des votre arrivee.';

    this.dashboardMetrics = [
      { label: 'Projets en cours', value: `${activeApplications.length}`, tone: 'success', icon: 'bag', badge: `${activeApplications.length}` },
      { label: 'Missions finalisees', value: `${completedProjects.length}`, tone: 'primary', icon: 'checkmark', badge: `${completedProjects.length}` },
      { label: 'Propositions', value: `${pendingApplications.length}`, tone: 'neutral', icon: 'time', badge: 'En attente' },
      { label: 'Revenus projetes', value: `$${this.revenueTotal}`, tone: 'primary', icon: 'cash', badge: `$${this.revenueTotal}` },
    ];

    this.focusCards = [
      {
        eyebrow: 'Execution',
        title: 'Retrouver vos projets en un regard',
        copy: 'Vos missions acceptees et votre production recente remontent directement dans le dashboard.',
        action: 'Voir mes projets',
        icon: 'refresh',
        tone: 'execution',
      },
      {
        eyebrow: 'Credibilite',
        title: 'Mettre en avant vos resultats',
        copy: `${reviewedApplications.length} candidature${reviewedApplications.length > 1 ? 's' : ''} deja traitee${reviewedApplications.length > 1 ? 's' : ''}, ${completedProjects.length} mission${completedProjects.length > 1 ? 's' : ''} terminee${completedProjects.length > 1 ? 's' : ''}.`,
        action: 'Ouvrir le suivi',
        icon: 'person-circle',
        tone: 'credibility',
      },
      {
        eyebrow: 'Finance',
        title: 'Encaissez avant la fin du mois',
        copy: '1 paiement en attente de validation client.',
        action: 'Voir paiements',
        icon: 'cash',
        tone: 'finance',
      },
    ];

    this.buildServiceCards();
  }

  buildStaticHeroCopy() {
    if (this.dashboardHeadline && this.dashboardCopy) return;
    this.dashboardHeadline = this.isClient
      ? 'Gardez le controle sur vos recrutements'
      : 'Visualisez vos missions et votre progression';
    this.dashboardCopy = this.isClient
      ? 'Un tableau de bord plus clair pour publier, comparer et lancer vos projets.'
      : 'Un espace plus fort visuellement pour voir vos projets, votre avancement et vos resultats.';
  }

  get revenuePolylinePoints() {
    const width = 300;
    const height = 86;
    const max = Math.max(...this.revenueBars.map(bar => bar.amount), 1);
    return this.revenueBars.map((bar, index) => {
      const x = this.revenueBars.length === 1 ? width / 2 : (index / (this.revenueBars.length - 1)) * width;
      const y = height - (bar.amount / max) * 68 - 9;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  get revenueAreaPoints() {
    return `0,86 ${this.revenuePolylinePoints} 300,86`;
  }

  openProject(id: string) {
    void this.router.navigate(['/project-detail', id]);
  }

  openClientHub() {
    void this.router.navigate(['/client-request']);
  }

  openService(slug?: string) {
    void this.router.navigate(['/service-market', slug || 'all']);
  }

  openMyJobs() {
    void this.router.navigate(['/my-jobs']);
  }

  async goMessages() {
    await fetch(apiUrl('/api/users/me'), { headers: apiAuthHeaders(false) });
    void this.router.navigate(['/messages']);
  }

  openNotifications() {
    void this.router.navigate(['/notifications']);
  }

  openFavorites() {
    void this.router.navigate(['/favorites']);
  }

  openProgressTracker() {
    void this.router.navigate(['/project-progress']);
  }

  categorySymbol(category: CategoryDto) {
    return categorySymbol(category);
  }

  serviceIcon(category: CategoryDto) {
    const slug = (category.slug || category.name || '').toLowerCase();
    if (slug.includes('market')) return 'megaphone';
    if (slug.includes('design') || slug.includes('graphic')) return 'color-palette';
    if (slug.includes('program') || slug.includes('tech') || slug.includes('dev')) return 'code-slash';
    if (slug.includes('music') || slug.includes('audio')) return 'musical-notes';
    if (slug.includes('photo')) return 'camera';
    return 'bag';
  }

  serviceBadge(card: ServiceCard) {
    if (card.opportunities >= 4) return 'Top';
    if (card.opportunities > 0) return 'Actif';
    return '';
  }

  projectCategorySlug(project: ProjectDocumentDto): string | null {
    return resolveProjectCategorySlug(project, this.categories);
  }

  openPrimaryFocusCard(index: number) {
    if (this.isClient) {
      if (index === 0) {
        void this.router.navigate(['/my-jobs']);
        return;
      }
      this.openClientHub();
      return;
    }

    if (index === 0) {
      this.openMyJobs();
      return;
    }
    this.openProgressTracker();
  }

  private buildServiceCards() {
    const preferred = [
      'ai-services',
      'digital-marketing',
      'graphic-design',
      'program-tech',
      'music-audio',
      'photography',
    ];
    const bySlug = new Map(this.categories.map(category => [category.slug, category]));
    const selected = preferred
      .map(slug => bySlug.get(slug))
      .filter((category): category is CategoryDto => Boolean(category));
    const fallback = this.categories.filter(category => !selected.includes(category)).slice(0, Math.max(0, 6 - selected.length));

    this.serviceCards = [...selected, ...fallback].slice(0, 6).map(category => {
      const opportunities = Number(category.projects_count || 0);
      const card: ServiceCard = {
        name: category.name,
        slug: category.slug,
        icon: this.serviceIcon(category),
        opportunities,
      };
      card.badge = this.serviceBadge(card);
      return card;
    });
  }

  private buildRevenueSeries(transactions: WalletTransaction[]): RevenueBar[] {
    const now = new Date();
    const buckets = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setHours(0, 0, 0, 0);
      date.setDate(now.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);
      const label = index === 5 ? 'Hier' : index === 6 ? 'Auj' : date.toLocaleDateString('fr-FR', { weekday: 'short' });
      return { key, day: label.replace('.', ''), amount: 0 };
    });
    const byKey = new Map(buckets.map(bucket => [bucket.key, bucket]));

    for (const tx of transactions) {
      if (tx.type !== 'project_payment' || tx.status !== 'completed') continue;
      const rawDate = tx.released_at || tx.created_at;
      if (!rawDate) continue;
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) continue;
      const key = date.toISOString().slice(0, 10);
      const bucket = byKey.get(key);
      if (bucket) {
        bucket.amount += Number(tx.freelancer_receives || 0);
      }
    }

    const max = Math.max(...buckets.map(bucket => bucket.amount), 1);
    return buckets.map(bucket => ({
      day: bucket.day,
      amount: Math.round(bucket.amount),
      value: Math.round((bucket.amount / max) * 100),
    }));
  }
}
