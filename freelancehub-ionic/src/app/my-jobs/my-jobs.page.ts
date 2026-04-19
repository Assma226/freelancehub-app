import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { ApplicationDto, ApplicationsListDto, MyProjectsDto, ProjectDocumentDto } from '../shared/api.dto';
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
  bids: JobRow[] = [];
  pending: JobRow[] = [];
  reviewed: JobRow[] = [];
  expandedProjectId = '';
  expandedHistoryId = '';
  applicationsByProject: Record<string, ApplicationDto[]> = {};
  applicationsLoading: Record<string, boolean> = {};

  constructor(private router: Router) {}

  async ngOnInit() {
    await this.reload();
  }

  async reload() {
    this.loading = true;
    this.bids = [];
    this.pending = [];
    this.reviewed = [];
    try {
      if (this.role === 'client') {
        await this.loadClientProjects();
      } else {
        await this.loadFreelancerApplications();
      }
    } finally {
      this.loading = false;
    }
  }

  get currentItems() {
    if (this.tab === 'bid') return this.bids;
    if (this.tab === 'pending') return this.pending;
    return this.reviewed;
  }

  get emptyStateTitle() {
    if (this.tab === 'bid') return 'Place A Bid For One Of Our Jobs';
    if (this.tab === 'pending') return 'Your Content Queue Is Empty';
    return 'There Is Nothing Rated Here';
  }

  get emptyStateCopy() {
    if (this.tab === 'bid') return 'Begin by submitting a bid for one of our jobs under the area titled all jobs.';
    if (this.tab === 'pending') return 'Begin by submitting a bid for one of our jobs under the area titled all jobs.';
    return 'The jobs that have been reviewed will be shown here.';
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
      };
      if (row.status === 'pending') this.bids.push(row);
      else if (row.status === 'accepted') this.pending.push(row);
      else this.reviewed.push(row);
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
    };
  }

  toggleHistory(projectId: string) {
    this.expandedHistoryId = this.expandedHistoryId === projectId ? '' : projectId;
  }

  statusLabel(status?: string) {
    if (status === 'in-progress') return 'In progress';
    if (status === 'completed') return 'Completed';
    if (status === 'cancelled') return 'Cancelled';
    if (status === 'accepted') return 'Accepted';
    if (status === 'rejected') return 'Rejected';
    return 'Open';
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

  goProject(id: string) {
    void this.router.navigate(['/project-detail', id]);
  }

  openContract(id: string) {
    void this.router.navigate(['/project-detail', id]);
  }

  openTracker() {
    void this.router.navigate(['/project-progress']);
  }
}
