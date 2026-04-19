import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent, IonSpinner } from '@ionic/angular/standalone';
import { FreelancerProfileDto, PortfolioItemDto } from '../shared/api.dto';
import { apiAuthHeaders, apiUrl, getSessionUser } from '../shared/api-url';
import { AccountMenuComponent } from '../shared/account-menu.component';
import { UserBottomNavComponent } from '../shared/user-bottom-nav.component';

@Component({
  selector: 'app-freelancer-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton, IonSpinner, AccountMenuComponent, UserBottomNavComponent],
  templateUrl: './freelancer-profile.page.html',
  styleUrl: './freelancer-profile.page.scss',
})
export class FreelancerProfilePage implements OnInit {
  loading = true;
  userRole = getSessionUser()?.role || null;
  freelancer: FreelancerProfileDto | null = null;
  selectedRating = 0;
  reviewComment = '';
  reviewMessage = '';
  isFavorite = false;

  constructor(private route: ActivatedRoute, private router: Router) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    try {
      const res = await fetch(apiUrl(`/api/users/freelancers/${id}`));
      if (!res.ok) return;
      this.freelancer = await res.json() as FreelancerProfileDto;
      if (getSessionUser()) {
        await this.loadFavoriteState();
      }
    } finally {
      this.loading = false;
    }
  }

  get displayedRating() {
    const baseRating = Number(this.freelancer?.rating || 0);
    return Number(baseRating.toFixed(1));
  }

  get displayedReviewCount() {
    return Number(this.freelancer?.reviews || 0);
  }

  get roundedDisplayedRating() {
    return Math.round(this.displayedRating || 0);
  }

  get reviewItems() {
    return this.freelancer?.review_items || [];
  }

  get stats() {
    return [
      { label: 'Note moyenne', value: this.displayedRating ? `${this.displayedRating}/5` : 'Nouveau' },
      { label: 'Avis', value: `${this.displayedReviewCount}` },
      { label: 'Missions', value: `${this.freelancer?.completedJobs || this.freelancer?.completed_jobs || 0}` },
      { label: 'Reponse', value: this.freelancer?.response_time || 'Rapide' },
    ];
  }

  get portfolioItems(): Array<PortfolioItemDto & { accentClass: string; coverStyle: string | null }> {
    const items = this.freelancer?.portfolio || [];
    return items
      .filter(item => item && (item.title || item.category || item.summary || item.metrics || item.link || item.cover_image))
      .map((item, index) => ({
        ...item,
        accentClass: this.resolveAccent(item.accent, index),
        coverStyle: item.cover_image ? `url('${item.cover_image}')` : null,
      }));
  }

  stars(count: number) {
    return Array.from({ length: count }, (_, index) => index + 1);
  }

  selectRating(value: number) {
    this.selectedRating = value;
    this.reviewMessage = '';
  }

  async submitReview() {
    if (!this.freelancer?.id && !this.freelancer?.user_id) return;
    if (!this.selectedRating) {
      this.reviewMessage = 'Choisissez une note avant d envoyer votre avis.';
      return;
    }
    const comment = this.reviewComment.trim();
    if (!comment) {
      this.reviewMessage = 'Ajoutez un commentaire avant de publier.';
      return;
    }
    const targetId = this.freelancer.id || this.freelancer.user_id || '';
    const res = await fetch(apiUrl(`/api/users/freelancers/${targetId}/reviews`), {
      method: 'POST',
      headers: apiAuthHeaders(),
      body: JSON.stringify({
        rating: this.selectedRating,
        comment,
        project_title: 'Client review',
      }),
    });
    if (!res.ok) {
      this.reviewMessage = 'Impossible de publier l avis pour le moment.';
      return;
    }
    const reload = await fetch(apiUrl(`/api/users/freelancers/${targetId}`), { headers: apiAuthHeaders(false) });
    if (reload.ok) {
      this.freelancer = await reload.json() as FreelancerProfileDto;
    }
    this.selectedRating = 0;
    this.reviewComment = '';
    this.reviewMessage = 'Avis ajoute avec succes.';
  }

  openPortfolio() {
    const section = document.getElementById('freelancer-portfolio');
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  messageFreelancer() {
    if (!this.freelancer?.user_id) return;
    void this.router.navigate(['/messages'], { queryParams: { with: this.freelancer.user_id } });
  }

  async loadFavoriteState() {
    if (!this.freelancer?.id) return;
    const res = await fetch(
      apiUrl(`/api/users/favorites/check?entity_type=freelancer&entity_id=${this.freelancer.id}`),
      { headers: apiAuthHeaders(false) },
    );
    if (!res.ok) return;
    const data = await res.json() as { favorited?: boolean };
    this.isFavorite = Boolean(data.favorited);
  }

  async toggleFavorite() {
    if (!this.freelancer?.id) return;
    const res = await fetch(apiUrl('/api/users/favorites/toggle'), {
      method: 'POST',
      headers: apiAuthHeaders(),
      body: JSON.stringify({
        entity_type: 'freelancer',
        entity_id: this.freelancer.id,
      }),
    });
    if (!res.ok) return;
    const data = await res.json() as { favorited?: boolean };
    this.isFavorite = Boolean(data.favorited);
  }

  resolveAccent(accent: string | undefined, index: number) {
    const value = (accent || '').trim().toLowerCase();
    if (value === 'navy') return 'portfolio-card--navy';
    if (value === 'gold') return 'portfolio-card--gold';
    if (value === 'berry') return 'portfolio-card--berry';
    return ['portfolio-card--berry', 'portfolio-card--navy', 'portfolio-card--gold'][index % 3];
  }
}
