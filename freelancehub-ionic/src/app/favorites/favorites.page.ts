import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { FavoriteItemDto, FavoritesListDto } from '../shared/api.dto';
import { apiAuthHeaders, apiUrl, getSessionUser } from '../shared/api-url';
import { AccountMenuComponent } from '../shared/account-menu.component';
import { UserBottomNavComponent } from '../shared/user-bottom-nav.component';

@Component({
  selector: 'app-favorites',
  standalone: true,
  imports: [CommonModule, IonContent, IonSpinner, AccountMenuComponent, UserBottomNavComponent],
  templateUrl: './favorites.page.html',
  styleUrl: './favorites.page.scss',
})
export class FavoritesPage implements OnInit {
  user = getSessionUser();
  loading = true;
  items: FavoriteItemDto[] = [];

  constructor(private router: Router) {}

  async ngOnInit() {
    await this.loadFavorites();
  }

  get favoriteProjects() {
    return this.items.filter(item => item.entity_type === 'project' && item.project);
  }

  get favoriteFreelancers() {
    return this.items.filter(item => item.entity_type === 'freelancer' && item.freelancer);
  }

  async loadFavorites() {
    this.loading = true;
    try {
      const res = await fetch(apiUrl('/api/users/favorites'), { headers: apiAuthHeaders(false) });
      if (!res.ok) return;
      const data = await res.json() as FavoritesListDto;
      this.items = data.favorites || [];
    } finally {
      this.loading = false;
    }
  }

  async removeFavorite(item: FavoriteItemDto) {
    const res = await fetch(apiUrl('/api/users/favorites/toggle'), {
      method: 'POST',
      headers: apiAuthHeaders(),
      body: JSON.stringify({
        entity_type: item.entity_type,
        entity_id: item.entity_id,
      }),
    });
    if (!res.ok) return;
    this.items = this.items.filter(entry => entry.id !== item.id);
  }

  openProject(id?: string) {
    if (!id) return;
    void this.router.navigate(['/project-detail', id]);
  }

  openFreelancer(id?: string) {
    if (!id) return;
    void this.router.navigate(['/freelancer-profile', id]);
  }
}
