import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent, IonSpinner } from '@ionic/angular/standalone';
import { apiAuthHeaders, apiUrl, getSessionUser } from '../shared/api-url';
import { ProjectDocumentDto } from '../shared/api.dto';
import { AccountMenuComponent } from '../shared/account-menu.component';
import { UserBottomNavComponent } from '../shared/user-bottom-nav.component';

@Component({
  selector: 'app-project-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton, IonSpinner, AccountMenuComponent, UserBottomNavComponent],
  templateUrl: './project-detail.page.html',
  styleUrl: './project-detail.page.scss',
})
export class ProjectDetailPage implements OnInit {
  loading = true;
  userRole = getSessionUser()?.role || null;
  project: ProjectDocumentDto | null = null;
  bidAmount = 0;
  coverLetter = '';
  statusNote = '';
  error = '';
  isFavorite = false;
  progressError = '';
  progressSaving = false;
  contractError = '';
  contractSaving = false;
  progressForm = {
    title: '',
    summary: '',
    achievementsText: '',
    hours_spent: 0,
    completion_percent: 0,
    next_step: '',
    blockers: '',
    health: 'on-track',
  };
  contractForm = {
    start_date: '',
    due_date: '',
    amount: 0,
    terms: '',
    deliverablesText: '',
  };

  constructor(private route: ActivatedRoute, private router: Router) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    await this.loadProject(id);
  }

  async loadProject(id: string) {
    try {
      const res = await fetch(apiUrl(`/api/projects/${id}`));
      if (!res.ok) return;
      this.project = await res.json() as ProjectDocumentDto;
      this.bidAmount = Math.round((Number(this.project.budgetMin ?? this.project.budget_min ?? 0) + Number(this.project.budgetMax ?? this.project.budget_max ?? 0)) / 2);
      this.progressForm.completion_percent = Number(this.project.progress_percent || 0);
      this.progressForm.health = String(this.project.progress_health || 'on-track');
      this.syncContractForm();
      if (getSessionUser()) {
        await this.loadFavoriteState();
      }
    } finally {
      this.loading = false;
    }
  }

  async submitBid() {
    if (!this.project?.id) return;
    const res = await fetch(apiUrl(`/api/projects/${this.project.id}/apply`), {
      method: 'POST',
      headers: apiAuthHeaders(),
      body: JSON.stringify({
        bid_amount: this.bidAmount,
        cover_letter: this.coverLetter,
      }),
    });
    if (!res.ok) {
      this.error = 'Impossible d envoyer la proposition.';
      return;
    }
    await this.router.navigate(['/my-jobs']);
  }

  contactClient() {
    void this.router.navigate(['/messages']);
  }

  get statusHistory() {
    return this.project?.status_history || [];
  }

  get progressEntries() {
    return this.project?.progress_entries || [];
  }

  get isInProgress() {
    return this.project?.status === 'in-progress';
  }

  get contract() {
    return this.project?.contract || null;
  }

  get canManageContract() {
    return this.userRole === 'client' && this.isInProgress;
  }

  get canSignContract() {
    return this.userRole === 'freelancer' && this.isInProgress && this.contract?.status === 'pending-signature' && !this.contract?.freelancer_signed_at;
  }

  get canCancel() {
    return this.userRole === 'client' && ['open', 'in-progress'].includes(this.project?.status || '');
  }

  get canComplete() {
    return this.userRole === 'client' && this.project?.status === 'in-progress';
  }

  get canReopen() {
    return this.userRole === 'client' && this.project?.status === 'cancelled';
  }

  async updateStatus(nextStatus: 'open' | 'completed' | 'cancelled') {
    if (!this.project?.id) return;
    const res = await fetch(apiUrl(`/api/projects/${this.project.id}/status`), {
      method: 'PUT',
      headers: apiAuthHeaders(),
      body: JSON.stringify({
        status: nextStatus,
        note: this.statusNote,
      }),
    });
    if (!res.ok) {
      this.error = 'Impossible de mettre a jour le statut du projet.';
      return;
    }
    this.project = await res.json() as ProjectDocumentDto;
    this.statusNote = '';
    this.error = '';
  }

  statusLabel(status?: string) {
    if (status === 'in-progress') return 'In progress';
    if (status === 'completed') return 'Completed';
    if (status === 'cancelled') return 'Cancelled';
    return 'Open';
  }

  async loadFavoriteState() {
    if (!this.project?.id) return;
    const res = await fetch(
      apiUrl(`/api/users/favorites/check?entity_type=project&entity_id=${this.project.id}`),
      { headers: apiAuthHeaders(false) },
    );
    if (!res.ok) return;
    const data = await res.json() as { favorited?: boolean };
    this.isFavorite = Boolean(data.favorited);
  }

  async toggleFavorite() {
    if (!this.project?.id) return;
    const res = await fetch(apiUrl('/api/users/favorites/toggle'), {
      method: 'POST',
      headers: apiAuthHeaders(),
      body: JSON.stringify({
        entity_type: 'project',
        entity_id: this.project.id,
      }),
    });
    if (!res.ok) return;
    const data = await res.json() as { favorited?: boolean };
    this.isFavorite = Boolean(data.favorited);
  }

  openTracker() {
    void this.router.navigate(['/project-progress']);
  }

  healthLabel(value?: string) {
    if (value === 'blocked') return 'Blocked';
    if (value === 'at-risk') return 'At risk';
    return 'On track';
  }

  contractStatusLabel(value?: string) {
    if (value === 'signed') return 'Signed';
    if (value === 'pending-signature') return 'Pending signature';
    return 'Draft';
  }

  syncContractForm() {
    const contract = this.project?.contract;
    this.contractForm.start_date = String(contract?.start_date || '');
    this.contractForm.due_date = String(contract?.due_date || '');
    this.contractForm.amount = Number(contract?.amount ?? this.project?.agreed_amount ?? 0);
    this.contractForm.terms = String(contract?.terms || '');
    this.contractForm.deliverablesText = (contract?.deliverables || []).join('\n');
  }

  async saveContract() {
    if (!this.project?.id) return;
    this.contractSaving = true;
    this.contractError = '';
    try {
      const deliverables = this.contractForm.deliverablesText
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean);

      const res = await fetch(apiUrl(`/api/projects/${this.project.id}/contract`), {
        method: 'PUT',
        headers: apiAuthHeaders(),
        body: JSON.stringify({
          start_date: this.contractForm.start_date,
          due_date: this.contractForm.due_date,
          amount: this.contractForm.amount,
          terms: this.contractForm.terms,
          deliverables,
        }),
      });
      if (!res.ok) {
        this.contractError = 'Impossible d enregistrer l accord de mission.';
        return;
      }
      this.project = await res.json() as ProjectDocumentDto;
      this.syncContractForm();
    } finally {
      this.contractSaving = false;
    }
  }

  async signContract() {
    if (!this.project?.id) return;
    this.contractSaving = true;
    this.contractError = '';
    try {
      const res = await fetch(apiUrl(`/api/projects/${this.project.id}/contract/sign`), {
        method: 'PUT',
        headers: apiAuthHeaders(),
      });
      if (!res.ok) {
        this.contractError = 'Impossible de signer l accord de mission.';
        return;
      }
      this.project = await res.json() as ProjectDocumentDto;
      this.syncContractForm();
    } finally {
      this.contractSaving = false;
    }
  }

  async submitProgress() {
    if (!this.project?.id) return;
    this.progressSaving = true;
    this.progressError = '';
    try {
      const achievements = this.progressForm.achievementsText
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean);

      const res = await fetch(apiUrl(`/api/projects/${this.project.id}/progress`), {
        method: 'POST',
        headers: apiAuthHeaders(),
        body: JSON.stringify({
          title: this.progressForm.title,
          summary: this.progressForm.summary,
          achievements,
          hours_spent: this.progressForm.hours_spent,
          completion_percent: this.progressForm.completion_percent,
          next_step: this.progressForm.next_step,
          blockers: this.progressForm.blockers,
          health: this.progressForm.health,
        }),
      });
      if (!res.ok) {
        this.progressError = 'Impossible d enregistrer la progression.';
        return;
      }

      this.project = await res.json() as ProjectDocumentDto;
      this.progressForm.title = '';
      this.progressForm.summary = '';
      this.progressForm.achievementsText = '';
      this.progressForm.hours_spent = 0;
      this.progressForm.next_step = '';
      this.progressForm.blockers = '';
      this.progressForm.completion_percent = Number(this.project.progress_percent || 0);
      this.progressForm.health = String(this.project.progress_health || 'on-track');
    } finally {
      this.progressSaving = false;
    }
  }
}
