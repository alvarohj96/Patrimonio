import { Routes } from '@angular/router';
import { PatrimonioGeneralComponent } from './pages/patrimonio-general/patrimonio-general.component';
import { PatrimonioMensualComponent } from './pages/patrimonio-mensual/patrimonio-mensual.component';

export const routes: Routes = [
  { path: '', redirectTo: 'general', pathMatch: 'full' },
  { path: 'general', component: PatrimonioGeneralComponent },
  { path: 'mensual', component: PatrimonioMensualComponent }
];
