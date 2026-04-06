import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonSpinner } from '@ionic/angular/standalone';
import { NotificationsListDto, NotificationDto } from '../shared/api.dto';
import { apiAuthHeaders, apiUrl, getSessionUser } from '../shared/api-url';
import { AccountMenuComponent } from '../shared/account-menu.component';
import { UserBottomNavComponent } from '../shared/user-bottom-nav.component';

@Component({
  selector: 'app-notifications',
  standalone: true,
  imports: [CommonModule, IonButton, IonContent, IonSpinner, AccountMenuComponent, UserBottomNavComponent],
  templateUrl: './notifications.page.html',
  styleUrl: './notifications.page.scss',
})
export class NotificationsPage implements OnInit {
  user = getSessionUser();
  loading = true;
  notifications: NotificationDto[] = [];
  unreadCount = 0;

  constructor(private router: Router) {}

  async ngOnInit() {
    await this.loadNotifications();
  }

  async loadNotifications() {
    this.loading = true;
    try {
      const res = await fetch(apiUrl('/api/notifications?page_size=30'), { headers: apiAuthHeaders(false) });
      if (!res.ok) return;
      const data = await res.json() as NotificationsListDto;
      this.notifications = data.notifications || [];
      this.unreadCount = data.unread_count || 0;
    } finally {
      this.loading = false;
    }
  }

  async markAllRead() {
    const res = await fetch(apiUrl('/api/notifications/read-all'), {
      method: 'POST',
      headers: apiAuthHeaders(),
    });
    if (!res.ok) return;
    this.notifications = this.notifications.map(item => ({ ...item, is_read: true }));
    this.unreadCount = 0;
  }

  async openNotification(item: NotificationDto) {
    if (!item.is_read) {
      await fetch(apiUrl(`/api/notifications/${item.id}/read`), {
        method: 'PUT',
        headers: apiAuthHeaders(),
      });
      item.is_read = true;
      this.unreadCount = Math.max(0, this.unreadCount - 1);
    }

    if (item.entity_type === 'conversation') {
      void this.router.navigate(['/messages']);
      return;
    }

    const projectId = String(item.meta?.['project_id'] || item.entity_id || '');
    if (item.entity_type === 'project' && projectId) {
      void this.router.navigate(['/project-detail', projectId]);
      return;
    }

    void this.router.navigate(['/home']);
  }

  notificationIcon(item: NotificationDto) {
    if (item.type === 'message_received') return 'M';
    if (item.type === 'application_received') return 'A';
    if (item.type === 'application_reviewed') return 'R';
    return 'N';
  }

  notificationClass(item: NotificationDto) {
    if (item.type === 'message_received') return 'message';
    if (item.type === 'application_received') return 'application';
    if (item.type === 'application_reviewed') return 'review';
    return 'default';
  }
}
