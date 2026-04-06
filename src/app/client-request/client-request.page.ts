import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonSpinner } from '@ionic/angular/standalone';
import { apiAuthHeaders, apiUrl, getSessionUser } from '../shared/api-url';
import { CategoriesListDto, FreelancersListDto, FreelancerProfileDto, MyProjectsDto, ProjectDocumentDto, UserMeDto } from '../shared/api.dto';
import { AccountMenuComponent } from '../shared/account-menu.component';
import { UserBottomNavComponent } from '../shared/user-bottom-nav.component';

@Component({
  selector: 'app-client-request',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton, IonSpinner, UserBottomNavComponent, AccountMenuComponent],
  templateUrl: './client-request.page.html',
  styleUrl: './client-request.page.scss',
})
export class ClientRequestPage implements OnInit {
  user = getSessionUser();
  userRole = this.user?.role || null;
  loadingFreelancers = true;
  trialUsed = false;
  showForm = false;
  estimatedCommission = 0;
  freelancerQuery = '';
  requests: ProjectDocumentDto[] = [];
  freelancers: FreelancerProfileDto[] = [];
  filteredFreelancers: FreelancerProfileDto[] = [];
  categoryOptions: { slug: string; label: string }[] = [];

  form = {
    title: '',
    description: '',
    budgetMin: 0,
    budgetMax: 0,
    category: '',
    duration: '',
  };

  constructor(private router: Router) {}

  async ngOnInit() {
    await Promise.all([
      this.loadMe(),
      this.loadCategoryOptions(),
      this.loadRequests(),
      this.loadFreelancers(),
    ]);
  }

  async loadMe() {
    try {
      const res = await fetch(apiUrl('/api/users/me'), { headers: apiAuthHeaders(false) });
      if (!res.ok) return;
      const me = await res.json() as UserMeDto;
      this.trialUsed = Boolean(me.trial_used);
    } catch {}
  }

  async loadCategoryOptions() {
    try {
      const res = await fetch(apiUrl('/api/categories?counts=true'));
      if (!res.ok) return;
      const data = await res.json() as CategoriesListDto;
      this.categoryOptions = (data.categories || []).map(c => ({ slug: c.slug, label: c.name }));
    } catch {}
  }

  async loadRequests() {
    if (this.userRole !== 'client') return;
    try {
      const res = await fetch(apiUrl('/api/projects/my'), { headers: apiAuthHeaders(false) });
      if (!res.ok) return;
      const data = await res.json() as MyProjectsDto;
      this.requests = data.projects || [];
    } catch {}
  }

  async loadFreelancers() {
    this.loadingFreelancers = true;
    try {
      const res = await fetch(apiUrl('/api/users/freelancers?page_size=30&sort=rating&order=desc'));
      if (!res.ok) return;
      const data = await res.json() as FreelancersListDto;
      this.freelancers = data.freelancers || [];
      this.applyFilter();
    } finally {
      this.loadingFreelancers = false;
    }
  }

  applyFilter() {
    const query = this.freelancerQuery.trim().toLowerCase();
    if (!query) {
      this.filteredFreelancers = [...this.freelancers];
      return;
    }
    this.filteredFreelancers = this.freelancers.filter(fl => {
      return [
        fl.name || '',
        fl.title || '',
        (fl.skills || []).join(' '),
      ].join(' ').toLowerCase().includes(query);
    });
  }

  calcCommission() {
    this.estimatedCommission = Math.round(((this.form.budgetMin + this.form.budgetMax) / 2) * 0.05);
  }

  async submitRequest() {
    const res = await fetch(apiUrl('/api/projects'), {
      method: 'POST',
      headers: apiAuthHeaders(),
      body: JSON.stringify({
        title: this.form.title,
        description: this.form.description,
        budget_min: this.form.budgetMin,
        budget_max: this.form.budgetMax,
        category: this.form.category,
        duration: this.form.duration,
        is_remote: true,
      }),
    });
    if (!res.ok) return;
    const created = await res.json() as ProjectDocumentDto;
    this.requests.unshift(created);
    this.showForm = false;
    this.trialUsed = true;
    this.form = { title: '', description: '', budgetMin: 0, budgetMax: 0, category: '', duration: '' };
  }

  openProject(id: string) {
    void this.router.navigate(['/project-detail', id]);
  }

  viewFreelancer(id?: string) {
    if (!id) return;
    void this.router.navigate(['/freelancer-profile', id]);
  }

  contactFreelancer(userId?: string) {
    if (!userId) return;
    void this.router.navigate(['/messages'], { queryParams: { with: userId } });
  }

  openService(slug?: string) {
    if (!slug) return;
    void this.router.navigate(['/service-market', slug]);
  }
}
