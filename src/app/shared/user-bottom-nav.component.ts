import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { home, search, briefcase, chatbubbles, person } from 'ionicons/icons';
import { ConversationsListDto, NotificationsListDto } from './api.dto';
import { apiAuthHeaders, apiUrl } from './api-url';

// Add ionicons to the system
addIcons({ home, search, briefcase, chatbubbles, person });

type NavKey = 'home' | 'jobs' | 'services' | 'profile' | 'messages' | 'favorites' | 'notifications' | 'progress';

@Component({
  selector: 'app-user-bottom-nav',
  standalone: true,
  imports: [CommonModule, IonIcon],
  template: `
    <ng-container *ngIf="role">
      <nav class="bottom-nav">
        <button 
          type="button" 
          class="nav-item" 
          [class.active]="active === 'home'" 
          (click)="go('/home')" 
          aria-label="Home">
          <ion-icon class="nav-icon" name="home"></ion-icon>
          <span class="nav-label">Home</span>
        </button>
        
        <button 
          type="button" 
          class="nav-item" 
          [class.active]="active === 'services'" 
          (click)="go('/service-market/all')" 
          aria-label="Search Services">
          <ion-icon class="nav-icon" name="search"></ion-icon>
          <span class="nav-label">Search</span>
        </button>
        
        <button 
          type="button" 
          class="nav-item" 
          [class.active]="active === 'jobs'" 
          (click)="go('/my-jobs')" 
          aria-label="My Jobs">
          <ion-icon class="nav-icon" name="briefcase"></ion-icon>
          <span class="nav-label">Jobs</span>
          <span class="nav-badge jobs-badge" *ngIf="(jobsCount ?? 0) > 0">{{ (jobsCount ?? 0) > 99 ? '99+' : (jobsCount ?? 0) }}</span>
        </button>
        
        <button 
          type="button" 
          class="nav-item" 
          [class.active]="active === 'messages'" 
          (click)="go('/messages')" 
          aria-label="Messages">
          <ion-icon class="nav-icon" name="chatbubbles"></ion-icon>
          <span class="nav-label">Messages</span>
          <span class="nav-badge messages-badge" *ngIf="(unreadMessages ?? 0) > 0">{{ (unreadMessages ?? 0) > 99 ? '99+' : (unreadMessages ?? 0) }}</span>
        </button>
        
        <button 
          type="button" 
          class="nav-item" 
          [class.active]="active === 'profile'" 
          (click)="go('/edit-profile')" 
          aria-label="Profile">
          <ion-icon class="nav-icon" name="person"></ion-icon>
          <span class="nav-label">Profile</span>
        </button>
      </nav>
      <div class="bottom-nav-spacer"></div>
    </ng-container>
  `,
  styles: [`
    :host {
      --color-primary: #9a2f4f;
      --color-primary-light: #c44569;
      --color-text-primary: #2d2d2d;
      --color-text-secondary: #8a8a8a;
      --color-border: #f0f0f0;
      --color-success: #10b981;
      --color-warning: #f59e0b;
      --color-error: #ef4444;
    }

    /* Bottom Navigation Container */
    .bottom-nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      align-items: stretch;
      gap: 0;
      padding: 0;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(12px);
      border-top: 1px solid var(--color-border);
      box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.08);
      z-index: 40;
      padding-bottom: max(0px, env(safe-area-inset-bottom));
    }

    .bottom-nav-spacer {
      height: calc(70px + env(safe-area-inset-bottom, 0px));
    }

    /* Navigation Item */
    .nav-item {
      position: relative;
      border: none;
      background: transparent;
      min-height: 60px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 8px 0;
      cursor: pointer;
      color: var(--color-text-secondary);
      transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      overflow: hidden;
    }

    .nav-item:active {
      transform: scale(0.95);
    }

    .nav-icon {
      width: 24px;
      height: 24px;
      font-size: 24px;
      font-weight: 500;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.3s ease, color 0.3s ease;
    }

    .nav-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.3px;
      text-transform: capitalize;
      line-height: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 100%;
    }

    /* Active State */
    .nav-item.active {
      color: var(--color-primary);
    }

    .nav-item.active .nav-icon {
      transform: scale(1.1);
    }

    .nav-item.active::before {
      content: '';
      position: absolute;
      top: 0;
      left: 10%;
      right: 10%;
      height: 3px;
      background: linear-gradient(90deg, var(--color-primary), var(--color-primary-light));
      border-radius: 0 0 3px 3px;
      animation: slideDown 0.3s ease-out;
    }

    @keyframes slideDown {
      from {
        transform: scaleX(0);
        opacity: 0;
      }
      to {
        transform: scaleX(1);
        opacity: 1;
      }
    }

    /* Badges */
    .nav-badge {
      position: absolute;
      top: 4px;
      right: 8px;
      min-width: 18px;
      height: 18px;
      padding: 0 5px;
      border-radius: 9px;
      background: var(--color-error);
      color: white;
      font-size: 10px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(239, 68, 68, 0.3);
      animation: badgePop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      white-space: nowrap;
    }

    .messages-badge {
      background: linear-gradient(135deg, #ef4444, #dc2626);
    }

    .jobs-badge {
      background: linear-gradient(135deg, #f59e0b, #d97706);
    }

    @keyframes badgePop {
      0% {
        transform: scale(0);
      }
      50% {
        transform: scale(1.2);
      }
      100% {
        transform: scale(1);
      }
    }

    /* Hover Effects for Non-Active Items */
    .nav-item:not(.active):hover {
      color: var(--color-text-primary);
      background: rgba(154, 47, 79, 0.05);
    }

    /* Responsive Design for Smaller Screens */
    @media (max-width: 360px) {
      .nav-label {
        font-size: 10px;
      }
      
      .nav-item {
        min-height: 55px;
        gap: 2px;
      }
    }

    /* Touch-friendly padding */
    @media (hover: none) and (pointer: coarse) {
      .nav-item:active {
        background: rgba(154, 47, 79, 0.08);
      }
    }
  `],
})
export class UserBottomNavComponent implements OnInit, OnChanges {
  @Input() role: 'client' | 'freelancer' | null = null;
  @Input() active: NavKey = 'home';
  @Input() unreadMessages: number | null = null;
  @Input() unreadNotifications: number | null = null;
  
  jobsCount: number | null = null;
  private badgesLoaded = false;
  private loadingBadges = false;

  constructor(private router: Router) {}

  ngOnInit() {
    void this.ensureBadges();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['role'] || changes['unreadMessages'] || changes['unreadNotifications']) {
      void this.ensureBadges();
    }
  }

  go(target: string) {
    void this.router.navigateByUrl(target);
  }

  private async ensureBadges() {
    if (!this.role || this.loadingBadges || this.badgesLoaded) return;
    const tasks: Promise<void>[] = [];
    this.loadingBadges = true;

    if (this.unreadMessages === null) {
      tasks.push(this.loadUnreadMessages());
    }

    if (tasks.length) {
      await Promise.all(tasks);
    }
    this.badgesLoaded = true;
    this.loadingBadges = false;
  }

  private async loadUnreadMessages() {
    try {
      const res = await fetch(apiUrl('/api/messages'), { headers: apiAuthHeaders(false) });
      if (!res.ok) return;
      const data = await res.json() as ConversationsListDto;
      this.unreadMessages = (data.conversations || []).reduce((total, conv) => {
        return total + (conv.unread_count || 0);
      }, 0);
    } catch (error) {
      console.error('Failed to load unread messages:', error);
    }
  }
}
