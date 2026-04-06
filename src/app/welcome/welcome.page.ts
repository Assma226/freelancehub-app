import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonSpinner } from '@ionic/angular/standalone';
import { apiUrl, getStoredToken } from '../shared/api-url';
import { CategoriesListDto, CategoryDto, ProjectDocumentDto, ProjectsListDto } from '../shared/api.dto';
import { categorySymbol } from '../shared/service-ui';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton, IonSpinner],
  templateUrl: './welcome.page.html',
  styleUrl: './welcome.page.scss',
})
export class WelcomePage implements OnInit {
  loading = true;
  search = '';
  categories: CategoryDto[] = [];
  projects: ProjectDocumentDto[] = [];

  constructor(private router: Router) {
    if (getStoredToken()) {
      void this.router.navigate(['/home']);
    }
  }

  async ngOnInit() {
    try {
      const [categoriesRes, projectsRes] = await Promise.all([
        fetch(apiUrl('/api/categories?counts=true')),
        fetch(apiUrl('/api/projects?status=open&page_size=6')),
      ]);

      if (categoriesRes.ok) {
        const categoriesData = await categoriesRes.json() as CategoriesListDto;
        this.categories = (categoriesData.categories || []).slice(0, 8);
      }

      if (projectsRes.ok) {
        const projectsData = await projectsRes.json() as ProjectsListDto;
        this.projects = projectsData.projects || [];
      }
    } finally {
      this.loading = false;
    }
  }

  goAuth(mode: 'login' | 'register') {
    void this.router.navigate(['/auth'], { queryParams: { mode } });
  }

  openService(slug?: string) {
    if (!slug) return;
    void this.router.navigate(['/service-market', slug]);
  }

  get filteredProjects() {
    const query = this.search.trim().toLowerCase();
    if (!query) return this.projects;
    return this.projects.filter(project =>
      [
        project.title || '',
        project.category || '',
        project.category_name || '',
        project.description || '',
      ].join(' ').toLowerCase().includes(query),
    );
  }

  categorySymbol(category: CategoryDto): string {
    return categorySymbol(category);
  }
}
