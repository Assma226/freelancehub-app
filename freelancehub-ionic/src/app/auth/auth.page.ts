import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular/standalone';
import { apiUrl, clearSession, storeSession } from '../shared/api-url';
import { ApiErrorBody, AuthLoginResponse } from '../shared/api.dto';

@Component({
  selector: 'app-auth',
  standalone: true,
  imports: [CommonModule, FormsModule, IonContent, IonButton],
  templateUrl: './auth.page.html',
  styleUrl: './auth.page.scss',
})
export class AuthPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  mode: 'login' | 'register' = 'login';
  role: 'client' | 'freelancer' | null = null;
  registerStep: 'choice' | 'form' = 'choice';
  loading = false;
  error = '';

  form = {
    firstName: '',
    lastName: '',
    email: '',
    address: '',
    password: '',
    confirmPassword: '',
    title: '',
    location: '',
  };

  ngOnInit() {
    clearSession();
    const incoming = this.route.snapshot.queryParamMap.get('mode');
    if (incoming === 'register' || incoming === 'login') {
      this.mode = incoming;
    }
    if (this.mode === 'register') {
      this.registerStep = 'choice';
    }
  }

  switchMode(mode: 'login' | 'register') {
    this.mode = mode;
    this.error = '';
    if (mode === 'register') {
      this.registerStep = 'choice';
      this.role = null;
    }
  }

  chooseRole(role: 'client' | 'freelancer') {
    this.role = role;
    this.registerStep = 'form';
    this.error = '';
  }

  backToRoleChoice() {
    this.registerStep = 'choice';
    this.error = '';
  }

  get fullName() {
    return `${this.form.firstName} ${this.form.lastName}`.trim();
  }

  async submit() {
    this.loading = true;
    this.error = '';
    try {
      if (this.mode === 'register') {
        if (!this.role) {
          this.error = 'Choisissez un type de compte.';
          return;
        }
        if (this.form.password !== this.form.confirmPassword) {
          this.error = 'Les mots de passe ne correspondent pas.';
          return;
        }
      }

      const endpoint = this.mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const payload = this.mode === 'login'
        ? { email: this.form.email, password: this.form.password }
        : {
            name: this.fullName,
            email: this.form.email,
            password: this.form.password,
            role: this.role,
            title: this.role === 'freelancer' ? this.form.title : '',
            location: this.form.location,
            address: this.form.address,
          };

      const res = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json() as AuthLoginResponse | ApiErrorBody;
      if (!res.ok) {
        this.error = (data as ApiErrorBody).error || 'Une erreur est survenue.';
        return;
      }
      const auth = data as AuthLoginResponse;
      storeSession(auth.token || auth.access_token, auth.user);
      await this.router.navigate(['/home']);
    } catch {
      this.error = 'Impossible de joindre le backend. Verifiez que Flask tourne sur http://127.0.0.1:5000.';
    } finally {
      this.loading = false;
    }
  }
}
