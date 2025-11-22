import { Component } from '@angular/core';

// Formularios
import { ReactiveFormsModule } from '@angular/forms';

// Angular Material
import { MatTabsModule } from '@angular/material/tabs';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';

// Tus componentes standalone
import { PatrimonioGeneralComponent } from './pages/patrimonio-general/patrimonio-general.component';
import { PatrimonioMensualComponent } from './pages/patrimonio-mensual/patrimonio-mensual.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    // Angular Material
    MatTabsModule,
    MatInputModule,
    MatButtonModule,
    MatTableModule,
    MatIconModule,
    MatCardModule,
    MatFormFieldModule,
    MatSelectModule,

    // Formularios
    ReactiveFormsModule,

    // tus componentes
    PatrimonioGeneralComponent,
    PatrimonioMensualComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})

export class App {
}
