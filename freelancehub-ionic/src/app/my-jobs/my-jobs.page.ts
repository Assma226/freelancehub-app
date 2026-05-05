import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { ApplicationDto, ApplicationsListDto, MyProjectsDto, ProjectDocumentDto, ProjectsListDto } from '../shared/api.dto';
import { apiAuthHeaders, apiUrl, getSessionUser } from '../shared/api-url';
import { AccountMenuComponent } from '../shared/account-menu.component';
import { UserBottomNavComponent } from '../shared/user-bottom-nav.component';

const RATE = 0.05;

interface JobRow {
  id: string;
  title: string;
  company: string;
  category: string;
  bid: number;
  applicants: number;
  status: string;
  free: boolean;
  receives: number;
  fee: number;
  statusHistory: Array<{
    status?: string;
    note?: string;
    actor_id?: string;
    created_at?: string;
  }>;
  createdAt?: string;
  contractStatus?: string;
  escrowStatus?: string;
  paymentLabel?: string;
  alert?: string;
  canAddProgress?: boolean;
}

interface DashboardSummaryCard {
  label: string;
  value: string;
  helper: string;
}

interface DashboardActionItem {
  eyebrow: string;
  title: string;
  copy: string;
  action: string;
  target: 'jobs' | 'market' | 'messages' | 'profile' | 'tracker';
}

@Component({
  selector: 'app-my-jobs',
  standalone: true,
  imports: [CommonModule, IonContent, IonSpinner, UserBottomNavComponent, AccountMenuComponent],
  templateUrl: './my-jobs.page.html',
  styleUrl: './my-jobs.page.scss',
})
export class MyJobsPage implements OnInit {
  user = getSessionUser();
  role = this.user?.role || null;
  loading = true;
  actionLoading = false;
  tab: 'bid' | 'pending' | 'reviewed' = 'bid';
  missionFilter: 'signature' | 'payment' | 'active' | 'completed' | 'refunded' = 'signature';
  bids: JobRow[] = [];
  pending: JobRow[] = [];
  reviewed: JobRow[] = [];
  freelancerMissions: JobRow[] = [];
  expandedProjectId = '';
  expandedHistoryId = '';
  applicationsByProject: Record<string, ApplicationDto[]> = {};
  applicationsLoading: Record<string, boolean> = {};
  completedProjects: ProjectDocumentDto[] = [];

  constructor(private router: Router) {}

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    this.loading = true;
    this.bids = [];
    this.pending = [];
    this.reviewed = [];
    this.completedProjects = [];
    try {
      if (this.role === 'client') {
        await this.loadClientProjects();
      } else {
        await Promise.all([this.loadFreelancerApplications(), this.loadFreelancerProjects()]);
      }
    } finally {
      this.loading = false;
    }
  }

  get currentItems() {
    if (this.isFreelancer) return this.currentMissionItems;
    if (this.tab === 'bid') return this.bids;
    if (this.tab === 'pending') return this.pending;
    return this.reviewed;
  }

  get currentMissionItems() {
    return this.freelancerMissions.filter(item => this.missionBucket(item) === this.missionFilter);
  }

  get missionFilters() {
    return [
      { key: 'signature' as const, label: 'Signature', count: this.missionCount('signature') },
      { key: 'payment' as const, label: 'Paiement', count: this.missionCount('payment') },
      { key: 'active' as const, label: 'En cours', count: this.missionCount('active') },
      { key: 'completed' as const, label: 'Terminees', count: this.missionCount('completed') },
      { key: 'refunded' as const, label: 'Remboursees', count: this.missionCount('refunded') },
    ];
  }

  get summaryCards(): DashboardSummaryCard[] {
    if (this.role === 'client') {
      const items = [...this.bids, ...this.pending, ...this.reviewed];
      const totalApplicants = items.reduce((sum, item) => sum + item.applicants, 0);
      const completedCount = items.filter(item => item.status === 'completed').length;
      return [
        { label: 'Projets publies', value: `${items.length}`, helper: 'Vue globale de vos demandes' },
        { label: 'En cours', value: `${this.pending.length}`, helper: 'Missions actuellement lancees' },
        { label: 'Finalises', value: `${completedCount}`, helper: 'Livraisons deja bouclees' },
        { label: 'Candidatures', value: `${totalApplicants}`, helper: 'Profils recus sur tous vos projets' },
      ];
    }

    const activeNet = this.freelancerMissions
      .filter(item => item.escrowStatus === 'funded')
      .reduce((sum, item) => sum + item.receives, 0);
    return [
      { label: 'Propositions', value: `${this.bids.length}`, helper: 'En attente de reponse client' },
      { label: 'Missions', value: `${this.freelancerMissions.length}`, helper: 'Accords, paiements et livraisons' },
      { label: 'A signer', value: `${this.missionCount('signature')}`, helper: 'Accords qui attendent votre action' },
      { label: 'En escrow', value: `$${activeNet}`, helper: 'Net bloque avant liberation' },
    ];
  }

  get heroTitle() {
    return this.role === 'client' ? 'Dashboard client' : 'Dashboard freelancer';
  }

  get isFreelancer() {
    return this.role === 'freelancer';
  }

  get heroCopy() {
    if (this.role === 'client') {
      return 'Suivez vos projets, vos candidats et vos validations depuis une vue plus claire et plus convaincante.';
    }
    return 'Retrouvez vos missions, signatures, paiements escrow et livraisons dans un espace plus clair.';
  }

  get actionItems(): DashboardActionItem[] {
    if (!this.isFreelancer) return [];

    const items: DashboardActionItem[] = [];

    const signCount = this.missionCount('signature');
    if (signCount) {
      items.push({
        eyebrow: 'Accord',
        title: `${signCount} accord${signCount > 1 ? 's' : ''} a signer`,
        copy: 'Votre candidature est acceptee. Signez l accord pour continuer.',
        action: 'Signer',
        target: 'tracker',
      });
    }

    const activeCount = this.missionCount('active');
    if (activeCount) {
      items.push({
        eyebrow: 'Livraison',
        title: `${activeCount} mission${activeCount > 1 ? 's' : ''} a piloter`,
        copy: 'Ajoutez l avancement quand le paiement est bien bloque en escrow.',
        action: 'Ouvrir le suivi',
        target: 'tracker',
      });
    }

    if (this.bids.length) {
      items.push({
        eyebrow: 'Pipeline',
        title: `${this.bids.length} proposition${this.bids.length > 1 ? 's' : ''} en attente`,
        copy: 'Gardez vos candidatures visibles et continuez a postuler sur les offres pertinentes.',
        action: 'Voir les propositions',
        target: 'jobs',
      });
    }

    items.push({
      eyebrow: 'Opportunites',
      title: 'Trouver une nouvelle mission',
      copy: 'Explorez le marche et ciblez les projets proches de vos competences.',
      action: 'Explorer les projets',
      target: 'market',
    });

    items.push({
      eyebrow: 'Profil',
      title: 'Renforcer votre vitrine',
      copy: 'Un profil complet aide les clients a comprendre votre valeur plus vite.',
      action: 'Ameliorer le profil',
      target: 'profile',
    });

    return items.slice(0, 3);
  }

  get spotlightItems() {
    if (this.role === 'client') {
      return this.pending.length ? this.pending.slice(0, 2) : this.bids.slice(0, 2);
    }
    return this.freelancerMissions.length ? this.freelancerMissions.slice(0, 2) : this.reviewed.slice(0, 2);
  }

  get emptyStateTitle() {
    if (this.role === 'client') {
      if (this.tab === 'bid') return 'Aucun projet ouvert pour le moment';
      if (this.tab === 'pending') return 'Aucune mission en cours';
      return 'Aucun historique a afficher';
    }
    if (this.missionFilter === 'signature') return 'Aucun accord en attente';
    if (this.missionFilter === 'payment') return 'Aucun paiement en attente';
    if (this.missionFilter === 'active') return 'Aucune mission en cours';
    if (this.missionFilter === 'completed') return 'Aucune mission terminee';
    return 'Aucune mission remboursee';
  }

  get emptyStateCopy() {
    if (this.role === 'client') {
      if (this.tab === 'bid') return 'Publiez une demande pour lancer de nouvelles candidatures directement depuis votre espace client.';
      if (this.tab === 'pending') return 'Les projets acceptes et actuellement en execution apparaitront ici.';
      return 'Les projets finalises, refuses ou annules seront regroupes dans cet historique.';
    }
    if (this.missionFilter === 'signature') return 'Les candidatures acceptees avec accord a signer apparaitront ici.';
    if (this.missionFilter === 'payment') return 'Les missions signeees qui attendent le paiement client apparaitront ici.';
    if (this.missionFilter === 'active') return 'Les missions financees en escrow apparaitront ici avec le suivi disponible.';
    if (this.missionFilter === 'completed') return 'Les missions terminees et liberees seront regroupees ici.';
    return 'Les missions remboursees par l admin seront visibles ici.';
  }

  async loadFreelancerApplications() {
    const res = await fetch(apiUrl('/api/users/applications'), { headers: apiAuthHeaders(false) });
    if (!res.ok) return;
    const data = await res.json() as ApplicationsListDto;
    for (const app of data.applications || []) {
      const bid = Number(app.bid_amount || 0);
      const net = Number(app.net_amount ?? bid * (1 - RATE));
      const fee = Math.round(bid * Number(app.commission_rate ?? RATE));
      const row: JobRow = {
        id: app.project_id,
        title: app.project_title || 'Projet',
        company: app.freelancer_name || 'Client',
        category: '',
        bid,
        applicants: 0,
        status: app.status || 'pending',
        free: Boolean(app.is_trial),
        receives: Math.round(net),
        fee,
        statusHistory: [],
        createdAt: undefined,
      };
      if (row.status === 'pending') this.bids.push(row);
      else if (row.status === 'accepted') this.pending.push(row);
      else this.reviewed.push(row);
    }
  }

  async loadFreelancerCompletedProjects() {
    const res = await fetch(apiUrl('/api/projects/freelancer?status=completed'), { headers: apiAuthHeaders(false) });
    if (!res.ok) return;
    const data = await res.json() as ProjectsListDto;
    this.completedProjects = data.projects || [];
  }

  async loadFreelancerProjects() {
    const res = await fetch(apiUrl('/api/projects/freelancer'), { headers: apiAuthHeaders(false) });
    if (!res.ok) return;
    const data = await res.json() as ProjectsListDto;
    this.freelancerMissions = (data.projects || []).map(project => this.mapFreelancerProject(project));
    this.pending = this.freelancerMissions.filter(item => ['accepted', 'in-progress'].includes(item.status));
    this.reviewed = [
      ...this.reviewed,
      ...this.freelancerMissions.filter(item => ['completed', 'refunded', 'cancelled'].includes(item.status)),
    ];
    this.completedProjects = (data.projects || []).filter(project => project.status === 'completed');
    if (!this.currentMissionItems.length) {
      const firstAvailable = this.missionFilters.find(filter => filter.count > 0);
      if (firstAvailable) this.missionFilter = firstAvailable.key;
    }
  }

  async loadClientProjects() {
    const res = await fetch(apiUrl('/api/projects/my'), { headers: apiAuthHeaders(false) });
    if (!res.ok) return;
    const data = await res.json() as MyProjectsDto;
    for (const project of data.projects || []) {
      const row = this.mapProject(project);
      if (row.status === 'open') this.bids.push(row);
      else if (row.status === 'in-progress') this.pending.push(row);
      else this.reviewed.push(row);
    }
  }

  mapProject(project: ProjectDocumentDto): JobRow {
    return {
      id: project.id,
      title: project.title || 'Projet',
      company: project.company || project.client_name || 'Client',
      category: project.category || project.category_name || '',
      bid: Number(project.budgetMax ?? project.budget_max ?? 0),
      applicants: Number(project.applicants ?? project.applicants_count ?? 0),
      status: project.status || 'open',
      free: Boolean(project.is_trial || project.is_trial_project),
      receives: 0,
      fee: Math.round(Number(project.agreed_amount || 0) * RATE),
      statusHistory: project.status_history || [],
      createdAt: project.created_at || project.postedAt,
    };
  }

  mapFreelancerProject(project: ProjectDocumentDto): JobRow {
    const amount = Number(project.agreed_amount || project.contract?.amount || project.budgetMax || project.budget_max || 0);
    const escrowStatus = String(project.escrow_status || 'not_funded');
    const contractStatus = String(project.contract?.status || 'draft');
    const canAddProgress = project.status === 'in-progress' && escrowStatus === 'funded';
    return {
      id: project.id,
      title: project.title || 'Mission',
      company: project.company || project.client_name || 'Client',
      category: project.category || project.category_name || '',
      bid: Math.round(amount),
      applicants: Number(project.applicants ?? project.applicants_count ?? 0),
      status: project.status || 'in-progress',
      free: Boolean(project.is_trial || project.is_trial_project),
      receives: Math.round(amount * (1 - RATE)),
      fee: Math.round(amount * RATE),
      statusHistory: project.status_history || [],
      createdAt: project.created_at || project.postedAt,
      contractStatus,
      escrowStatus,
      paymentLabel: this.paymentStatusLabel(escrowStatus),
      alert: this.freelancerMissionAlert(contractStatus, escrowStatus, project.status),
      canAddProgress,
    };
  }

  missionBucket(item: JobRow): 'signature' | 'payment' | 'active' | 'completed' | 'refunded' {
    if (item.status === 'refunded' || item.escrowStatus === 'refunded') return 'refunded';
    if (item.status === 'completed' || item.escrowStatus === 'released') return 'completed';
    if (item.escrowStatus === 'funded') return 'active';
    if (item.contractStatus === 'signed' || item.escrowStatus === 'awaiting_payment') return 'payment';
    return 'signature';
  }

  missionCount(filter: 'signature' | 'payment' | 'active' | 'completed' | 'refunded') {
    return this.freelancerMissions.filter(item => this.missionBucket(item) === filter).length;
  }

  paymentStatusLabel(status?: string) {
    if (status === 'funded') return 'Argent bloque';
    if (status === 'released') return 'Libere';
    if (status === 'refunded') return 'Rembourse';
    if (status === 'disputed') return 'Litige';
    return 'Paiement non encore effectue';
  }

  freelancerMissionAlert(contractStatus?: string, escrowStatus?: string, status?: string) {
    if (status === 'refunded' || escrowStatus === 'refunded') return 'Cette mission a ete remboursee par l admin.';
    if (contractStatus !== 'signed') return 'Votre candidature est acceptee. Signez l accord pour continuer.';
    if (escrowStatus !== 'funded' && escrowStatus !== 'released') return 'Accord signe. En attente du paiement client en escrow.';
    if (escrowStatus === 'funded') return 'Argent bloque en escrow. Vous pouvez ajouter votre avancement.';
    return 'Mission terminee. Consultez votre portefeuille pour le paiement.';
  }

  toggleHistory(projectId: string) {
    this.expandedHistoryId = this.expandedHistoryId === projectId ? '' : projectId;
  }

  statusLabel(status?: string) {
    if (status === 'pending') return 'En attente';
    if (status === 'in-progress') return 'En cours';
    if (status === 'completed') return 'Termine';
    if (status === 'cancelled') return 'Annule';
    if (status === 'accepted') return 'Accepte';
    if (status === 'rejected') return 'Refuse';
    if (status === 'refunded') return 'Rembourse';
    return 'Ouvert';
  }

  async toggleCandidates(projectId: string) {
    if (this.expandedProjectId === projectId) {
      this.expandedProjectId = '';
      return;
    }
    this.expandedProjectId = projectId;
    if (this.applicationsByProject[projectId]) return;
    this.applicationsLoading[projectId] = true;
    try {
      const res = await fetch(apiUrl(`/api/projects/${projectId}/apply`), { headers: apiAuthHeaders(false) });
      if (!res.ok) return;
      const data = await res.json() as ApplicationsListDto;
      this.applicationsByProject[projectId] = data.applications || [];
    } finally {
      this.applicationsLoading[projectId] = false;
    }
  }

  async reviewCandidate(projectId: string, applicationId: string, action: 'accept' | 'reject') {
    this.actionLoading = true;
    try {
      const res = await fetch(apiUrl(`/api/projects/${projectId}/apply/${applicationId}`), {
        method: 'PUT',
        headers: apiAuthHeaders(),
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await this.reload();
        if (action === 'accept') {
          void this.router.navigate(['/project-detail', projectId]);
        }
      }
    } finally {
      this.actionLoading = false;
    }
  }

  candidateNet(app: ApplicationDto) {
    return Math.round(Number(app.net_amount ?? app.bid_amount ?? 0));
  }

  startHere() {
    if (this.role === 'client') {
      void this.router.navigate(['/client-request']);
      return;
    }
    void this.router.navigate(['/service-market', 'all']);
  }

  openAction(item: DashboardActionItem) {
    if (item.target === 'jobs') {
      this.tab = 'bid';
      return;
    }
    if (item.target === 'tracker') {
      const nextMission = this.currentMissionItems[0] || this.freelancerMissions[0];
      if (!nextMission) return;
      if (nextMission?.canAddProgress) this.openTracker(nextMission.id);
      else this.goProject(nextMission?.id || '');
      return;
    }
    if (item.target === 'messages') {
      void this.router.navigate(['/messages']);
      return;
    }
    if (item.target === 'profile') {
      void this.router.navigate(['/edit-profile']);
      return;
    }
    void this.router.navigate(['/service-market', 'all']);
  }

  primaryJobActionLabel(item: JobRow) {
    if (this.role === 'client') return 'Ouvrir';
    if (item.contractStatus && item.contractStatus !== 'signed') return 'Signer accord';
    if (item.canAddProgress) return 'Ajouter avancement';
    if (item.status === 'accepted' || item.status === 'in-progress') return 'Voir mission';
    if (item.status === 'pending') return 'Voir details';
    return 'Consulter';
  }

  openPrimaryJobAction(item: JobRow) {
    if (this.isFreelancer && item.canAddProgress) {
      this.openTracker(item.id);
      return;
    }
    this.goProject(item.id);
  }

  goProject(id: string) {
    void this.router.navigate(['/project-detail', id]);
  }

  openContract(id: string) {
    void this.router.navigate(['/project-detail', id]);
  }

  openTracker(projectId?: string) {
    if (!projectId) {
      void this.router.navigate(['/project-progress']);
      return;
    }
    void this.router.navigate(['/project-progress'], { queryParams: { project: projectId } });
  }

  goBack() {
    void this.router.navigate(['/home']);
  }
}
