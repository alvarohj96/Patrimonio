import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

type Theme = 'light' | 'dark';

@Injectable({ providedIn: 'root' })
export class ThemeService {

  private readonly KEY = 'app-theme';
  private themeSubject = new BehaviorSubject<Theme>('light');
  theme$ = this.themeSubject.asObservable();

  constructor() {
    const stored = localStorage.getItem(this.KEY) as Theme;
    const theme = stored || 'light';
    this.setTheme(theme);
  }

  toggle() {
    const next = this.themeSubject.value === 'light' ? 'dark' : 'light';
    this.setTheme(next);
  }

  setTheme(theme: Theme) {
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(`${theme}-theme`);

    localStorage.setItem(this.KEY, theme);
    this.themeSubject.next(theme);
  }

  isDark(): boolean {
    return this.themeSubject.value === 'dark';
  }
}
