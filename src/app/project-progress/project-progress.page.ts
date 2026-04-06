import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonContent, IonSpinner } from '@ionic/angular/standalone';
import { ProjectDocumentDto, ProjectsListDto } from '../shared/api.dto';
import { apiAuthHeaders, apiUrl, getSessionUser } from '../shared/api-url';
import { AccountMenuComponent } from '../shared/account-menu.component';
import { UserBottomNavComponent } from '../shared/user-bottom-nav.component';

@Component({
  selector: 'app-project-progress',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonSpinner, AccountMenuComponent, UserBottomNavComponent],
  templateUrl: './project-progress.page.html',
  styleUrl: './project-progress.page.scss',
})
export class ProjectProgressPage implements OnInit {
  user = getSessionUser();
  role = this.user?.role || null;
  loading = true;
  saving = false;
  error = '';
  projects: ProjectDocumentDto[] = [];
  selectedProjectId = '';
  form = {
    title: '',
    summary: '',
    achievementsText: '',
    hours_spent: 0,
    completion_percent: 0,
    next_step: '',
    blockers: '',
    health: 'on-track',
  };

  constructor(private router: Router) {}

  async ngOnInit() {
    await this.loadTracking();
  }

  get selectedProject() {
    return this.projects.find(project => project.id === this.selectedProjectId) || this.projects[0] || null;
  }

  get progressEntries() {
    return this.selectedProject?.progress_entries || [];
  }

  async loadTracking() {
    this.loading = true;
    this.error = '';
    try {
      const res = await fetch(apiUrl('/api/projects/tracking'), { headers: apiAuthHeaders(false) });
      if (!res.ok) {
        this.error = 'Impossible de charger le suivi des projets.';
        return;
      }
      const data = await res.json() as ProjectsListDto;
      this.projects = data.projects || [];
      if (!this.selectedProjectId && this.projects.length) {
        this.selectedProjectId = this.projects[0].id;
      }
      this.syncFormWithProject();
    } finally {
      this.loading = false;
    }
  }

  selectProject(id: string) {
    this.selectedProjectId = id;
    this.syncFormWithProject();
  }

  syncFormWithProject() {
    const project = this.selectedProject;
    this.form.completion_percent = Number(project?.progress_percent || 0);
    this.form.health = String(project?.progress_health || 'on-track');
  }

  async submitProgress() {
    if (!this.selectedProject?.id) return;
    this.saving = true;
    this.error = '';
    try {
      const achievements = this.form.achievementsText
        .split('\n')
        .map(item => item.trim())
        .filter(Boolean);

      const res = await fetch(apiUrl(`/api/projects/${this.selectedProject.id}/progress`), {
        method: 'POST',
        headers: apiAuthHeaders(),
        body: JSON.stringify({
          title: this.form.title,
          summary: this.form.summary,
          achievements,
          hours_spent: this.form.hours_spent,
          completion_percent: this.form.completion_percent,
          next_step: this.form.next_step,
          blockers: this.form.blockers,
          health: this.form.health,
        }),
      });
      if (!res.ok) {
        this.error = 'Impossible d enregistrer la mise a jour.';
        return;
      }

      const updated = await res.json() as ProjectDocumentDto;
      this.projects = this.projects.map(project => project.id === updated.id ? updated : project);
      this.form.title = '';
      this.form.summary = '';
      this.form.achievementsText = '';
      this.form.hours_spent = 0;
      this.form.next_step = '';
      this.form.blockers = '';
      this.form.completion_percent = Number(updated.progress_percent || 0);
      this.form.health = String(updated.progress_health || 'on-track');
    } finally {
      this.saving = false;
    }
  }

  openProject(projectId?: string) {
    if (!projectId) return;
    void this.router.navigate(['/project-detail', projectId]);
  }

  healthLabel(value?: string) {
    if (value === 'blocked') return 'Blocked';
    if (value === 'at-risk') return 'At risk';
    return 'On track';
  }
}
