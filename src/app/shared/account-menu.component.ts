import { CommonModule } from '@angular/common';
import { Component, HostListener } from '@angular/core';
import { Router } from '@angular/router';
import { IonIcon } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { heart, notifications, settings, personCircle, logOut } from 'ionicons/icons';
import { clearSession, getSessionUser } from './api-url';

// Add ionicons to the system
addIcons({ heart, notifications, settings, personCircle, logOut });

@Component({
  selector: 'app-account-menu',
  standalone: true,
  imports: [CommonModule, IonIcon],
  templateUrl: './account-menu.component.html',
  styleUrl: './account-menu.component.scss',
})
export class AccountMenuComponent {
  isOpen = false;
  user = getSessionUser();

  constructor(private router: Router) {}

  toggleMenu(event: Event) {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
  }

  closeMenu() {
    this.isOpen = false;
  }

  openSettings(event: Event) {
    event.stopPropagation();
    this.closeMenu();
    void this.router.navigate(['/edit-profile']);
  }

  openNotifications(event: Event) {
    event.stopPropagation();
    this.closeMenu();
    void this.router.navigate(['/notifications']);
  }

  openFavorites(event: Event) {
    event.stopPropagation();
    this.closeMenu();
    void this.router.navigate(['/favorites']);
  }

  openPortfolio(event: Event) {
    event.stopPropagation();
    this.closeMenu();
    if (this.user?.role === 'freelancer' && this.user.id) {
      void this.router.navigate(['/freelancer-profile', this.user.id]);
      return;
    }
    void this.router.navigate(['/edit-profile']);
  }

  logout(event: Event) {
    event.stopPropagation();
    clearSession();
    this.closeMenu();
    void this.router.navigate(['/welcome']);
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.closeMenu();
  }
}
