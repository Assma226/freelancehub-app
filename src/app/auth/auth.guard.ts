import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { getStoredToken } from '../shared/api-url';

export const authGuard: CanActivateFn = () => {
  if (getStoredToken()) return true;
  return inject(Router).createUrlTree(['/auth']);
};
