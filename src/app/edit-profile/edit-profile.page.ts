import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonSpinner } from '@ionic/angular/standalone';
import { PortfolioItemDto, ProjectsListDto, ProjectDocumentDto, UserMeDto } from '../shared/api.dto';
import { apiAuthHeaders, apiUrl, getSessionUser, getStoredToken, storeSession } from '../shared/api-url';
import { AccountMenuComponent } from '../shared/account-menu.component';
import { UserBottomNavComponent } from '../shared/user-bottom-nav.component';

type ProfileEntry = Record<string, string>;
type ProfileSection = 'personal' | 'education' | 'work' | 'portfolio' | null;

@Component({
  selector: 'app-edit-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton, IonSpinner, AccountMenuComponent, UserBottomNavComponent],
  templateUrl: './edit-profile.page.html',
  styleUrl: './edit-profile.page.scss',
})
export class EditProfilePage implements OnInit {
  user = getSessionUser();
  loading = true;
  saving = false;
  message = '';
  activeSection: ProfileSection = null;

  form = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    avatar: '',
    gender: '',
    address: '',
    title: '',
    bio: '',
    skillsText: '',
    hourly_rate: 0,
    location: '',
    is_available: true,
    languagesText: '',
    degree: '',
    graduationYear: '',
    school: '',
    department: '',
    educationDescription: '',
    jobTitle: '',
    companyName: '',
    fromDate: '',
    toDate: '',
    experienceDescription: '',
  };
  portfolioItems: PortfolioItemDto[] = [];

  constructor(private router: Router) {}

  get isFreelancer() {
    return this.user?.role === 'freelancer';
  }

  get completion() {
    const fields = [
      this.form.firstName,
      this.form.lastName,
      this.form.email,
      this.form.phone,
      this.form.address,
      this.form.title,
      this.form.bio,
      this.form.location,
      this.form.degree,
      this.form.jobTitle,
    ];
    const completed = fields.filter(Boolean).length;
    return Math.round((completed / fields.length) * 100);
  }

  async ngOnInit() {
    try {
      const res = await fetch(apiUrl('/api/users/me'), { headers: apiAuthHeaders(false) });
      if (!res.ok) return;
      const me = await res.json() as UserMeDto & {
        phone?: string;
        gender?: string;
        address?: string;
      };

      const nameParts = (me.name || '').trim().split(' ');
      this.form.firstName = nameParts.shift() || '';
      this.form.lastName = nameParts.join(' ');
      this.form.email = me.email || '';
      this.form.phone = me.phone || '';
      this.form.avatar = me.avatar || '';
      this.form.gender = me.gender || '';
      this.form.address = me.address || '';
      this.form.title = me.freelancer?.title || '';
      this.form.bio = me.freelancer?.bio || '';
      this.form.skillsText = (me.freelancer?.skills || []).join(', ');
      this.form.hourly_rate = Number(me.freelancer?.hourly_rate || 0);
      this.form.location = me.freelancer?.location || '';
      this.form.is_available = me.freelancer?.is_available ?? true;
      this.form.languagesText = (me.freelancer?.languages || []).join(', ');

      const education = this.normalizeEntry((me.freelancer as { education?: unknown } | undefined)?.education);
      const experience = this.normalizeEntry((me.freelancer as { experience?: unknown } | undefined)?.experience);

      this.form.degree = education.degree || '';
      this.form.graduationYear = education.year || education.graduationYear || '';
      this.form.school = education.school || education.university || '';
      this.form.department = education.department || '';
      this.form.educationDescription = education.description || '';
      this.form.jobTitle = experience.jobTitle || experience.title || '';
      this.form.companyName = experience.companyName || experience.company || '';
      this.form.fromDate = experience.fromDate || '';
      this.form.toDate = experience.toDate || '';
      this.form.experienceDescription = experience.description || '';
      this.portfolioItems = this.normalizePortfolio(me.freelancer?.portfolio);
      if (!this.portfolioItems.length && this.isFreelancer) {
        this.portfolioItems = [this.emptyPortfolioItem()];
      }
      if (this.isFreelancer) {
        await this.syncPortfolioFromProjects();
      }
    } finally {
      this.loading = false;
    }
  }

  normalizeEntry(value: unknown): ProfileEntry {
    if (Array.isArray(value) && value[0] && typeof value[0] === 'object') {
      return value[0] as ProfileEntry;
    }
    if (value && typeof value === 'object') {
      return value as ProfileEntry;
    }
    return {};
  }

  normalizePortfolio(value: unknown): PortfolioItemDto[] {
    if (!Array.isArray(value)) return [];
    return value
      .filter(item => item && typeof item === 'object')
      .map(item => {
        const entry = item as PortfolioItemDto;
        return {
          title: entry.title || '',
          category: entry.category || '',
          summary: entry.summary || '',
          metrics: entry.metrics || '',
          accent: entry.accent || '',
          link: entry.link || '',
          cover_image: entry.cover_image || '',
          project_id: entry.project_id || '',
          source: entry.source || '',
        };
      });
  }

  emptyPortfolioItem(): PortfolioItemDto {
    return {
      title: '',
      category: '',
      summary: '',
      metrics: '',
      accent: '',
      link: '',
      cover_image: '',
      project_id: '',
      source: 'manual',
    };
  }

  async saveProfile() {
    this.saving = true;
    this.message = '';
    try {
      const payload = {
        name: `${this.form.firstName} ${this.form.lastName}`.trim(),
        phone: this.form.phone,
        avatar: this.form.avatar,
        gender: this.form.gender,
        address: this.form.address,
        title: this.form.title,
        bio: this.form.bio,
        skills: this.parseList(this.form.skillsText),
        hourly_rate: this.form.hourly_rate,
        location: this.form.location,
        is_available: this.form.is_available,
        languages: this.parseList(this.form.languagesText),
        education: this.form.degree || this.form.school || this.form.department || this.form.educationDescription
          ? [{
              degree: this.form.degree,
              year: this.form.graduationYear,
              school: this.form.school,
              department: this.form.department,
              description: this.form.educationDescription,
            }]
          : [],
        experience: this.form.jobTitle || this.form.companyName || this.form.experienceDescription
          ? [{
              jobTitle: this.form.jobTitle,
              companyName: this.form.companyName,
              fromDate: this.form.fromDate,
              toDate: this.form.toDate,
              description: this.form.experienceDescription,
            }]
          : [],
        portfolio: this.portfolioItems
          .map(item => ({
            title: (item.title || '').trim(),
            category: (item.category || '').trim(),
            summary: (item.summary || '').trim(),
            metrics: (item.metrics || '').trim(),
            accent: (item.accent || '').trim(),
            link: (item.link || '').trim(),
            cover_image: (item.cover_image || '').trim(),
            project_id: (item.project_id || '').trim(),
            source: (item.source || '').trim() || 'manual',
          }))
          .filter(item => item.title || item.category || item.summary || item.metrics || item.link || item.cover_image || item.project_id),
      };

      const res = await fetch(apiUrl('/api/users/me'), {
        method: 'PUT',
        headers: apiAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        this.message = 'Impossible de mettre a jour le profil.';
        return;
      }

      if (this.user) {
        storeSession(getStoredToken(), {
          ...this.user,
          name: `${this.form.firstName} ${this.form.lastName}`.trim(),
          avatar: this.form.avatar,
        });
        this.user = getSessionUser();
      }

      this.message = 'Profil mis a jour avec succes.';
    } finally {
      this.saving = false;
    }
  }

  parseList(value: string) {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  async syncPortfolioFromProjects() {
    const res = await fetch(apiUrl('/api/projects/freelancer?status=completed'), { headers: apiAuthHeaders(false) });
    if (!res.ok) return;
    const data = await res.json() as ProjectsListDto;
    const projects = data.projects || [];
    if (!projects.length) return;

    const existingIds = new Set(
      this.portfolioItems.map(item => (item.project_id || '').trim()).filter(Boolean),
    );
    const existingTitles = new Set(
      this.portfolioItems.map(item => (item.title || '').trim().toLowerCase()).filter(Boolean),
    );

    const additions = projects
      .filter(project => project?.id && !existingIds.has(project.id))
      .filter(project => !existingTitles.has((project.title || '').trim().toLowerCase()))
      .map(project => this.projectToPortfolioItem(project));

    if (additions.length) {
      this.portfolioItems = [...this.portfolioItems, ...additions];
    }
  }

  projectToPortfolioItem(project: ProjectDocumentDto): PortfolioItemDto {
    const budgetMin = Number(project.budgetMin ?? project.budget_min ?? 0);
    const budgetMax = Number(project.budgetMax ?? project.budget_max ?? 0);
    const agreed = Number(project.agreed_amount ?? 0);
    let metrics = 'Projet termine';
    if (agreed) {
      metrics = `Budget $${Math.round(agreed)}`;
    } else if (budgetMin || budgetMax) {
      metrics = `Budget $${Math.round(budgetMin)} - $${Math.round(budgetMax)}`;
    }

    return {
      title: project.title || '',
      category: project.category || project.category_name || project.category_slug || '',
      summary: project.description || project.progress_last_note || '',
      metrics,
      accent: '',
      link: '',
      cover_image: '',
      project_id: project.id || '',
      source: 'project',
    };
  }

  toggleSection(section: Exclude<ProfileSection, null>) {
    this.activeSection = this.activeSection === section ? null : section;
    this.message = '';
  }

  addPortfolioItem() {
    this.portfolioItems = [...this.portfolioItems, this.emptyPortfolioItem()];
  }

  removePortfolioItem(index: number) {
    this.portfolioItems = this.portfolioItems.filter((_, itemIndex) => itemIndex !== index);
    if (!this.portfolioItems.length) {
      this.portfolioItems = [this.emptyPortfolioItem()];
    }
  }

  goBack() {
    void this.router.navigate(['/home']);
  }
}
