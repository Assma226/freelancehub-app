import { Routes } from '@angular/router';
import { authGuard } from './auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./welcome/welcome.page').then(m => m.WelcomePage),
  },
  {
    path: 'welcome',
    loadComponent: () => import('./welcome/welcome.page').then(m => m.WelcomePage),
  },
  {
    path: 'auth',
    loadComponent: () => import('./auth/auth.page').then(m => m.AuthPage),
  },
  {
    path: 'edit-profile',
    loadComponent: () => import('./edit-profile/edit-profile.page').then(m => m.EditProfilePage),
    canActivate: [authGuard],
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then(m => m.HomePage),
    canActivate: [authGuard],
  },
  {
    path: 'client-request',
    loadComponent: () => import('./client-request/client-request.page').then(m => m.ClientRequestPage),
    canActivate: [authGuard],
  },
  {
    path: 'my-jobs',
    loadComponent: () => import('./my-jobs/my-jobs.page').then(m => m.MyJobsPage),
    canActivate: [authGuard],
  },
  {
    path: 'project-detail/:id',
    loadComponent: () => import('./project-detail/project-detail.page').then(m => m.ProjectDetailPage),
  },
  {
    path: 'freelancer-profile/:id',
    loadComponent: () => import('./freelancer-profile/freelancer-profile.page').then(m => m.FreelancerProfilePage),
  },
  {
    path: 'messages',
    loadComponent: () => import('./messages/messages.page').then(m => m.MessagesPage),
    canActivate: [authGuard],
  },
  {
    path: 'notifications',
    loadComponent: () => import('./notifications/notifications.page').then(m => m.NotificationsPage),
    canActivate: [authGuard],
  },
  {
    path: 'favorites',
    loadComponent: () => import('./favorites/favorites.page').then(m => m.FavoritesPage),
    canActivate: [authGuard],
  },
  {
    path: 'project-progress',
    loadComponent: () => import('./project-progress/project-progress.page').then(m => m.ProjectProgressPage),
    canActivate: [authGuard],
  },
  {
    path: 'service-market/:slug',
    loadComponent: () => import('./service-market/service-market.page').then(m => m.ServiceMarketPage),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
