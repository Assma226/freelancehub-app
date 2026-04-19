import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonSpinner } from '@ionic/angular/standalone';
import { apiAuthHeaders, apiUrl, getSessionUser } from '../shared/api-url';
import { CategoriesListDto, ProjectsListDto, ProjectDocumentDto, CategoryDto, NotificationsListDto, ConversationsListDto } from '../shared/api.dto';
import { AccountMenuComponent } from '../shared/account-menu.component';
import { categorySymbol, resolveProjectCategorySlug } from '../shared/service-ui';
import { UserBottomNavComponent } from '../shared/user-bottom-nav.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, IonContent, IonButton, IonSpinner, UserBottomNavComponent, AccountMenuComponent],
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

  constructor(private router: Router) {}

  get isClient() {
    return this.user?.role === 'client';
  }

  async ngOnInit() {
    try {
      const [categoriesRes, projectsRes] = await Promise.all([
        fetch(apiUrl('/api/categories?counts=true')),
        fetch(apiUrl('/api/projects?status=open&page_size=8')),
      ]);
      if (categoriesRes.ok) {
        const data = await categoriesRes.json() as CategoriesListDto;
        this.categories = data.categories || [];
      }
      if (projectsRes.ok) {
        const data = await projectsRes.json() as ProjectsListDto;
        this.projects = data.projects || [];
      }
      if (this.user) {
        await Promise.all([this.loadNotificationsCount(), this.loadUnreadMessagesCount()]);
      }
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

  projectCategorySlug(project: ProjectDocumentDto): string | null {
    return resolveProjectCategorySlug(project, this.categories);
  }
}
