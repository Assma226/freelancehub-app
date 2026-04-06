import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent, IonSpinner } from '@ionic/angular/standalone';
import {
  CategoriesListDto,
  CategoryDto,
  FreelancersListDto,
  FreelancerProfileDto,
  ProjectDocumentDto,
  ProjectsListDto,
} from '../shared/api.dto';
import { apiAuthHeaders, apiUrl, getSessionUser } from '../shared/api-url';
import { AccountMenuComponent } from '../shared/account-menu.component';
import { categorySymbol, matchesCategoryForFreelancer } from '../shared/service-ui';
import { UserBottomNavComponent } from '../shared/user-bottom-nav.component';

@Component({
  selector: 'app-service-market',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton, IonSpinner, UserBottomNavComponent, AccountMenuComponent],
  templateUrl: './service-market.page.html',
  styleUrl: './service-market.page.scss',
})
export class ServiceMarketPage implements OnInit {
  user = getSessionUser();
  loading = true;
  category: CategoryDto | null = null;
  projects: ProjectDocumentDto[] = [];
  freelancers: FreelancerProfileDto[] = [];
  filteredFreelancers: FreelancerProfileDto[] = [];
  filtersOpen = false;
  filters = {
    keyword: '',
    budgetMin: 0,
    budgetMax: 0,
    minRate: 0,
    maxRate: 0,
    minRating: 0,
    availableOnly: false,
  };
  projectIdea = {
    title: '',
    description: '',
    budgetMin: 0,
    budgetMax: 0,
    duration: '',
  };
  ideaOpen = false;

  constructor(private route: ActivatedRoute, private router: Router) {}

  async ngOnInit() {
    const slug = this.route.snapshot.paramMap.get('slug') || 'all';
    await this.loadMarket(slug);
  }

  get isClient() {
    return this.user?.role === 'client';
  }

  get pageTitle() {
    return this.category?.name || 'Services du marche';
  }

  get hasActiveFilters() {
    return Boolean(
      this.filters.keyword.trim()
      || this.filters.budgetMin
      || this.filters.budgetMax
      || this.filters.minRate
      || this.filters.maxRate
      || this.filters.minRating
      || this.filters.availableOnly
    );
  }

  async loadMarket(slug: string) {
    this.loading = true;
    try {
      const projectParams = new URLSearchParams({ status: 'open', page_size: '30' });
      const freelancerParams = new URLSearchParams({ page_size: '50', sort: 'rating', order: 'desc' });
      if (slug !== 'all') {
        projectParams.set('category', slug);
        freelancerParams.set('category', slug);
      }
      if (this.filters.keyword.trim()) {
        projectParams.set('q', this.filters.keyword.trim());
        freelancerParams.set('q', this.filters.keyword.trim());
      }
      if (this.filters.budgetMin > 0) projectParams.set('budget_min', String(this.filters.budgetMin));
      if (this.filters.budgetMax > 0) projectParams.set('budget_max', String(this.filters.budgetMax));
      if (this.filters.minRate > 0) freelancerParams.set('min_rate', String(this.filters.minRate));
      if (this.filters.maxRate > 0) freelancerParams.set('max_rate', String(this.filters.maxRate));
      if (this.filters.minRating > 0) freelancerParams.set('min_rating', String(this.filters.minRating));
      if (this.filters.availableOnly) freelancerParams.set('available', 'true');

      const [categoriesRes, projectsRes, freelancers] = await Promise.all([
        fetch(apiUrl('/api/categories?counts=true')),
        fetch(apiUrl(`/api/projects?${projectParams.toString()}`)),
        this.fetchAllFreelancers(freelancerParams),
      ]);

      let categories: CategoryDto[] = [];
      if (categoriesRes.ok) {
        const categoriesData = await categoriesRes.json() as CategoriesListDto;
        categories = categoriesData.categories || [];
      }

      this.category = categories.find(item => item.slug === slug) || categories[0] || {
        id: 'all',
        name: 'Services du marche',
        slug,
      };

      if (projectsRes.ok) {
        const projectsData = await projectsRes.json() as ProjectsListDto;
        this.projects = projectsData.projects || [];
      }

      this.freelancers = freelancers;

      this.filteredFreelancers = slug === 'all'
        ? [...this.freelancers]
        : this.freelancers.filter(freelancer =>
            matchesCategoryForFreelancer(freelancer, this.category?.slug || slug, this.category?.name || slug),
          );

      if (!this.filteredFreelancers.length && !this.hasActiveFilters) {
        this.filteredFreelancers = [...this.freelancers];
      }
    } finally {
      this.loading = false;
    }
  }

  async fetchAllFreelancers(baseParams: URLSearchParams) {
    const all: FreelancerProfileDto[] = [];
    let page = 1;
    let pages = 1;

    while (page <= pages) {
      const params = new URLSearchParams(baseParams);
      params.set('page', String(page));

      const res = await fetch(apiUrl(`/api/users/freelancers?${params.toString()}`));
      if (!res.ok) break;

      const data = await res.json() as FreelancersListDto;
      all.push(...(data.freelancers || []));
      pages = Math.max(1, Number(data.pages || 1));
      page += 1;
    }

    return all;
  }

  symbol() {
    return categorySymbol(this.category);
  }

  goHome() {
    void this.router.navigate(['/home']);
  }

  openProject(id: string) {
    void this.router.navigate(['/project-detail', id]);
  }

  openFreelancer(id?: string) {
    if (!id) return;
    void this.router.navigate(['/freelancer-profile', id]);
  }

  contactFreelancer(userId?: string) {
    if (!userId) return;
    void this.router.navigate(['/messages'], { queryParams: { with: userId } });
  }

  async createIdea() {
    if (!this.isClient || !this.category?.slug) return;
    const res = await fetch(apiUrl('/api/projects'), {
      method: 'POST',
      headers: apiAuthHeaders(),
      body: JSON.stringify({
        title: this.projectIdea.title,
        description: this.projectIdea.description,
        budget_min: this.projectIdea.budgetMin,
        budget_max: this.projectIdea.budgetMax,
        category: this.category.slug,
        duration: this.projectIdea.duration,
        is_remote: true,
      }),
    });
    if (!res.ok) return;
    const created = await res.json() as ProjectDocumentDto;
    this.projects.unshift(created);
    this.ideaOpen = false;
    this.projectIdea = { title: '', description: '', budgetMin: 0, budgetMax: 0, duration: '' };
  }

  goToCreateRequest() {
    void this.router.navigate(['/client-request']);
  }

  async applyFilters() {
    const slug = this.route.snapshot.paramMap.get('slug') || 'all';
    await this.loadMarket(slug);
  }

  async resetFilters() {
    this.filters = {
      keyword: '',
      budgetMin: 0,
      budgetMax: 0,
      minRate: 0,
      maxRate: 0,
      minRating: 0,
      availableOnly: false,
    };
    const slug = this.route.snapshot.paramMap.get('slug') || 'all';
    await this.loadMarket(slug);
  }
}
